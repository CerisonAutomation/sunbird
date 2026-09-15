/**
 * GhostService — deterministic replay publishing, validation, and retrieval.
 *
 * Replay format v2: `{ v: 2, seed, track, durationMs, distance, samples }`
 * where samples are `[t, x, y, rot]` quads at a fixed cadence. The blob is
 * zlib-deflated and stored in the object store (quota-managed); metadata
 * lives in the DB. A 16-hex fingerprint over (seed, samples) lets the server
 * verify a client-claimed hash and lets replays be deduplicated.
 */
import { deflateSync, inflateSync } from "node:zlib";

import type { Ctx } from "../core/ctx.js";
import { HttpError, cleanText } from "../util/http.js";
import { randomId } from "../util/id.js";
import { replayHash } from "../util/crypto.js";
import { ObjectStore } from "../store/object-store.js";
import type { GhostMeta, GhostRecord } from "../types.js";

const MAX_SAMPLES = 1500;
const MIN_SAMPLES = 5;
const MAX_DURATION_MS = 15 * 60_000;
/** Samples are ~10 Hz, so a gap above 0.25 s is a broken or faked replay. */
const MAX_SAMPLE_GAP_S = 0.25;
const X_ABS = 1_000_000;
const Y_ABS = 100_000;
const ROT_ABS = 12.5664;
const REPORT_TAKEDOWN_THRESHOLD = 3;
const FEATURED_TTL_DAYS = 365;

export type PublishInput = {
  seed?: unknown;
  track?: unknown;
  distance?: unknown;
  durationMs?: unknown;
  samples?: unknown;
  /** base64-deflate of the samples JSON array — the network-efficient form. */
  compressed?: unknown;
  hash?: unknown;
};

export class GhostService {
  constructor(private ctx: Ctx) {}

  /* ----------------------------------------------------------- publishing */

  publish(playerId: string, input: PublishInput): { id: string; url: string } {
    if (this.ctx.identity.isSuspended(playerId)) throw new HttpError(403, "account suspended", "suspended");
    const now = this.ctx.now();
    const seed = cleanText(input.seed, 64);
    if (!seed) throw new HttpError(400, "seed is required", "invalidSeed");
    const track = cleanText(input.track, 64) || "public";
    const distance = Math.round(Number(input.distance) || 0);
    const durationMs = Math.round(Number(input.durationMs) || 0);
    if (distance <= 0) throw new HttpError(400, "distance must be positive", "invalidDistance");
    if (durationMs <= 0 || durationMs > MAX_DURATION_MS) {
      throw new HttpError(400, "duration out of range (0..15 min)", "invalidDuration");
    }

    const samples = this.decodeSamples(input);
    this.validateSamples(samples, durationMs, distance);

    // Quota: per-player ghost count (object store also enforces LRU eviction,
    // but we cap explicitly so a spamer cannot churn the store).
    const mine = this.ctx.db.state.ghosts.filter((g) => g.playerId === playerId && g.status !== "taken_down");
    if (mine.length >= this.ctx.cfg.ghostMaxPerPlayer) {
      const oldest = [...mine].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!;
      this.takedown(oldest.id, "player", "quota-evicted", true);
    }

    const id = randomId("ghost");
    const hash = replayHash(seed, samples);
    const canonical = JSON.stringify({ v: 2, seed, track, durationMs, distance, samples });
    const blob = deflateSync(Buffer.from(canonical, "utf8"));
    if (blob.length > this.ctx.cfg.ghostMaxCompressedBytes) {
      throw new HttpError(413, "replay too large after compression", "payloadTooLarge");
    }

    // Client-claimed hash must match the recomputed fingerprint.
    if (typeof input.hash === "string" && input.hash.length === 16 && input.hash !== hash) {
      this.ctx.audit.log(playerId, "ghost.hash_mismatch", id, { claimed: input.hash, actual: hash });
      throw new HttpError(400, "replay hash mismatch", "hashMismatch");
    }

    const objectKey = ObjectStore.keyFor(playerId, id);
    void this.ctx.objects.put(playerId, objectKey, blob);

    const profile = this.ctx.identity.requireProfile(playerId);
    const meta: GhostMeta = {
      id,
      playerId,
      name: profile.displayName,
      seed,
      track,
      distance,
      durationMs,
      sampleCount: samples.length,
      hash,
      status: "active",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ctx.cfg.ghostTtlDays * 86_400_000).toISOString(),
      objectKey,
      sizeBytes: blob.length,
      reports: [],
    };
    const idx = this.ctx.db.state.ghosts.length;
    this.ctx.db.state.ghosts.push(meta);
    this.ctx.db.state.ghostIndex[id] = idx;
    this.ctx.db.touch();
    this.ctx.audit.log(playerId, "ghost.published", id, { seed, distance, samples: samples.length });
    return { id, url: this.challengeUrl(id) };
  }

  /**
   * Legacy /ghost publish (GhostNet contract): deviceId-keyed, samples inline.
   */
  publishLegacy(input: {
    seed?: unknown;
    deviceId?: unknown;
    name?: unknown;
    distance?: unknown;
    samples?: unknown;
  }): { ok: boolean } {
    const deviceId = typeof input.deviceId === "string" ? input.deviceId.slice(0, 64) : "";
    if (!deviceId) throw new HttpError(400, "missing deviceId", "invalidDevice");
    const existing = this.ctx.db.state.guestLinks[deviceId];
    const linked = existing ?? this.ctx.identity.createGuest({ deviceId, name: input.name }).playerId;
    const samplesRaw = input.samples;
    const lastSample = Array.isArray(samplesRaw) && samplesRaw.length > 0 ? (samplesRaw[samplesRaw.length - 1] as number[] | null) : null;
    const durationMs = lastSample ? Math.round((lastSample[0] ?? 0) * 1000) : 0;
    this.publish(linked, {
      seed: input.seed,
      track: `daily:${cleanText(input.seed, 64)}`,
      distance: input.distance,
      durationMs,
      samples: samplesRaw,
    });
    return { ok: true };
  }

  /* ------------------------------------------------------------ retrieval */

  /** Fetch a ghost record, honoring the owner's replay privacy. */
  async fetch(ghostId: string, viewerId?: string): Promise<GhostRecord> {
    const meta = this.meta(ghostId);
    if (meta.status === "taken_down") throw new HttpError(404, "replay unavailable", "notFound");
    if (this.isExpired(meta)) throw new HttpError(410, "replay expired", "expired");
    if (viewerId !== meta.playerId) {
      const profile = this.ctx.db.state.profiles[meta.playerId];
      const mode = profile?.privacy.replays ?? "private";
      if (mode === "private") throw new HttpError(404, "replay unavailable", "notFound");
      if (mode === "friends" && (!viewerId || !this.ctx.friends.areFriends(viewerId, meta.playerId))) {
        throw new HttpError(404, "replay unavailable", "notFound");
      }
      if (!profile || profile.moderation.status === "suspended") throw new HttpError(404, "replay unavailable", "notFound");
    }
    const buf = await this.ctx.objects.get(meta.objectKey);
    if (buf === null) throw new HttpError(410, "replay blob missing", "expired");
    const parsed = JSON.parse(inflateSync(buf).toString("utf8")) as {
      v: number;
      seed: string;
      track: string;
      distance: number;
      durationMs: number;
      samples: number[][];
    };
    if (parsed.v !== 2) throw new HttpError(410, "unsupported replay version", "expired");
    return {
      id: meta.id,
      name: meta.name,
      seed: parsed.seed,
      track: parsed.track,
      distance: parsed.distance,
      durationMs: parsed.durationMs,
      hash: meta.hash,
      samples: parsed.samples,
      url: this.challengeUrl(meta.id),
    };
  }

  /**
   * Rematch: the best REAL rival ghost near `near` on `seed` — never the
   * viewer's own flight, privacy-respecting, featured ghosts preferred.
   */
  async rival(seed: string, viewerId: string, near: number): Promise<GhostRecord | null> {
    let best: GhostMeta | null = null;
    let bestScore = -Infinity;
    for (const meta of this.ctx.db.state.ghosts) {
      if (meta.seed !== seed) continue;
      if (meta.track !== `daily:${seed}` && meta.track !== "public") continue;
      if (meta.playerId === viewerId) continue;
      if (meta.status === "taken_down" || this.isExpired(meta)) continue;
      const profile = this.ctx.db.state.profiles[meta.playerId];
      if (!profile || profile.moderation.status === "suspended") continue;
      if (profile.privacy.replays === "private") continue;
      if (profile.privacy.replays === "friends" && !this.ctx.friends.areFriends(viewerId, meta.playerId)) continue;
      // Within a ±25–45% band of the viewer's best, closest-above wins.
      if (near > 0) {
        const ratio = meta.distance / near;
        if (ratio < 0.75 || ratio > 1.45) continue;
      }
      const score = meta.status === "featured" ? 1e9 : -Math.abs(meta.distance - near);
      if (score > bestScore) {
        bestScore = score;
        best = meta;
      }
    }
    return best ? this.fetch(best.id, viewerId) : null;
  }

  /** Legacy /ghost fetch (GhostNet contract). */
  rivalLegacy(seed: string, deviceId: string, near: number): Promise<GhostRecord | null> {
    const viewerId = this.ctx.db.state.guestLinks[deviceId] ?? "";
    return this.rival(seed, viewerId, near);
  }

  /** Public list for a seed (privacy-filtered, best first). */
  list(seed: string, limit = 20): { id: string; name: string; distance: number; featured: boolean }[] {
    const out: { id: string; name: string; distance: number; featured: boolean }[] = [];
    for (const meta of this.ctx.db.state.ghosts) {
      if (seed && meta.seed !== seed) continue;
      if (meta.status === "taken_down" || this.isExpired(meta)) continue;
      const profile = this.ctx.db.state.profiles[meta.playerId];
      if (!profile || profile.moderation.status === "suspended" || profile.privacy.replays === "private") continue;
      out.push({ id: meta.id, name: meta.name, distance: meta.distance, featured: meta.status === "featured" });
    }
    out.sort((a, b) => b.distance - a.distance);
    return out.slice(0, Math.min(100, Math.max(1, limit)));
  }

  /** Curated (moderation-approved) ghosts for a seed. */
  featured(seed: string, limit = 10): { id: string; name: string; distance: number }[] {
    return this.list(seed, 50)
      .filter((g) => g.featured)
      .slice(0, Math.min(50, Math.max(1, limit)))
      .map(({ id, name, distance }) => ({ id, name, distance }));
  }

  /* ------------------------------------------------------------ moderation */

  /**
   * Player report. Three distinct reporters take the replay down
   * automatically; earlier reports are queued for the review UI.
   */
  report(ghostId: string, viewerId: string, reason: string): { reports: number; takenDown: boolean } {
    const meta = this.meta(ghostId);
    if (meta.status === "taken_down") throw new HttpError(409, "already taken down", "alreadyDown");
    if (meta.playerId === viewerId) throw new HttpError(400, "cannot report your own replay", "self");
    if (!meta.reports.some((r) => r.byId === viewerId)) {
      meta.reports.push({
        byId: viewerId,
        reason: cleanText(reason, 80) || "unspecified",
        at: new Date(this.ctx.now()).toISOString(),
      });
      this.ctx.db.touch();
    }
    const distinct = new Set(meta.reports.map((r) => r.byId)).size;
    if (distinct >= REPORT_TAKEDOWN_THRESHOLD) {
      this.takedown(ghostId, "auto", "reported by players", true);
      this.openCase("ghostReport", ghostId, viewerId, `auto-takedown: ${meta.reports.length} distinct reports`);
      return { reports: meta.reports.length, takenDown: true };
    }
    this.openCase("ghostReport", ghostId, viewerId, cleanText(reason, 80) || "reported");
    return { reports: meta.reports.length, takenDown: false };
  }

  /** Moderation takedown. */
  takedown(ghostId: string, byId: string, reason: string, silent = false): void {
    const meta = this.meta(ghostId);
    meta.status = "taken_down";
    meta.takedownReason = cleanText(reason, 80) || "moderation";
    this.ctx.db.touch();
    void this.ctx.objects.delete(meta.objectKey);
    if (!silent) this.ctx.audit.log(byId, "ghost.takedown", ghostId, { reason: meta.takedownReason });
  }

  feature(ghostId: string, byId: string): void {
    const meta = this.meta(ghostId);
    const profile = this.ctx.db.state.profiles[meta.playerId];
    if (!profile || profile.moderation.status !== "clear") {
      throw new HttpError(403, "owner is not in good standing", "ownerSuspended");
    }
    meta.status = "featured";
    meta.expiresAt = new Date(this.ctx.now() + FEATURED_TTL_DAYS * 86_400_000).toISOString();
    this.ctx.db.touch();
    this.ctx.audit.log(byId, "ghost.featured", ghostId);
  }

  unfeature(ghostId: string, byId: string): void {
    const meta = this.meta(ghostId);
    if (meta.status !== "featured") throw new HttpError(409, "not featured", "notFeatured");
    meta.status = "active";
    meta.expiresAt = new Date(this.ctx.now() + this.ctx.cfg.ghostTtlDays * 86_400_000).toISOString();
    this.ctx.db.touch();
    this.ctx.audit.log(byId, "ghost.unfeatured", ghostId);
  }

  /** Delete one of your own replays. */
  remove(ghostId: string, ownerId: string): void {
    const meta = this.meta(ghostId);
    if (meta.playerId !== ownerId) throw new HttpError(403, "not your replay", "forbidden");
    this.takedown(ghostId, ownerId, "owner deleted", true);
  }

  /** Shareable challenge link: `<base>/join?ghost=<id>`. */
  challengeUrl(ghostId: string): string {
    return `${this.ctx.cfg.publicBaseUrl}/join?ghost=${ghostId}`;
  }

  /** Expiry sweep (periodic + on reads). */
  sweep(): number {
    let n = 0;
    for (const meta of this.ctx.db.state.ghosts) {
      if (meta.status !== "taken_down" && this.isExpired(meta)) {
        this.takedown(meta.id, "system", "expired", true);
        n++;
      }
    }
    return n;
  }

  count(): number {
    return this.ctx.db.state.ghosts.filter((g) => g.status !== "taken_down").length;
  }

  /* --------------------------------------------------------------- internal */

  private meta(ghostId: string): GhostMeta {
    const idx = this.ctx.db.state.ghostIndex[ghostId];
    const meta = idx === undefined ? undefined : this.ctx.db.state.ghosts[idx];
    if (!meta) throw new HttpError(404, "replay not found", "notFound");
    return meta;
  }

  private isExpired(meta: GhostMeta): boolean {
    return this.ctx.now() > Date.parse(meta.expiresAt);
  }

  private openCase(kind: "ghostReport", targetId: string, byId: string, reason: string): void {
    const s = this.ctx.db.state;
    const open = s.moderationCases.some((c) => c.kind === kind && c.targetId === targetId && c.status === "open");
    if (open) return;
    s.moderationCases.push({
      id: `mc_${s.moderationCases.length.toString(36)}_${Math.floor(this.ctx.now()).toString(36)}`,
      kind,
      targetId,
      byId,
      reason,
      createdAt: new Date(this.ctx.now()).toISOString(),
      status: "open",
    });
    this.ctx.db.touch();
  }

  private decodeSamples(input: PublishInput): number[][] {
    let raw: unknown = input.samples;
    if (raw == null && typeof input.compressed === "string" && input.compressed.length > 0) {
      try {
        raw = JSON.parse(inflateSync(Buffer.from(input.compressed, "base64")).toString("utf8"));
      } catch {
        throw new HttpError(400, "invalid compressed samples", "invalidReplay");
      }
    }
    if (!Array.isArray(raw)) throw new HttpError(400, "samples must be an array", "invalidReplay");
    const out: number[][] = [];
    for (const s of raw) {
      if (!Array.isArray(s) || s.length < 4) throw new HttpError(400, "each sample needs [t,x,y,rot]", "invalidReplay");
      const q = (s as number[]).slice(0, 4).map(Number);
      if (q.some((n) => !Number.isFinite(n))) throw new HttpError(400, "sample has non-finite values", "invalidReplay");
      out.push(q);
    }
    return out;
  }

  private validateSamples(samples: number[][], durationMs: number, distance: number): void {
    if (samples.length < MIN_SAMPLES) throw new HttpError(400, `replay needs at least ${MIN_SAMPLES} samples`, "invalidReplay");
    if (samples.length > MAX_SAMPLES) throw new HttpError(400, `replay exceeds ${MAX_SAMPLES} samples`, "payloadTooLarge");
    let lastT = -1;
    for (let i = 0; i < samples.length; i++) {
      const [t, x, y, rot] = samples[i] as [number, number, number, number];
      if (t < lastT) throw new HttpError(400, "sample times must be monotonic", "invalidReplay");
      if (i > 0 && t - lastT > MAX_SAMPLE_GAP_S) {
        throw new HttpError(400, "sample gap too large (replay edited?)", "invalidReplay");
      }
      if (Math.abs(x) > X_ABS || Math.abs(y) > Y_ABS || Math.abs(rot) > ROT_ABS) {
        throw new HttpError(400, "sample coordinates out of bounds", "invalidReplay");
      }
      lastT = t;
    }
    // The replay's own timeline must agree with the claimed duration.
    const spanMs = (samples[samples.length - 1]![0]! - samples[0]![0]!) * 1000;
    if (Math.abs(spanMs - durationMs) > Math.max(1000, durationMs * 0.1)) {
      throw new HttpError(400, "duration does not match sample timeline", "invalidReplay");
    }
    // The furthest x must roughly cover the claimed distance.
    const maxX = Math.max(...samples.map((s) => s[1]!));
    if (distance > maxX * 1.5 + 100) {
      throw new HttpError(400, "claimed distance exceeds replay coverage", "invalidReplay");
    }
  }
}
