/**
 * Aggregate client telemetry sink — privacy by construction.
 *
 * The client (src/game/Telemetry.ts) beacons whitelisted counter names plus
 * coarse mode/km numbers on tab-hide. No PII ever arrives by design, so this
 * service stores only what it is given after validation:
 *
 *   counters  → per `{event}#{mode}`: event count + summed coarse km
 *   devices   → distinct anonymous device ids (used ONLY as a denominator)
 *   rejected  → posts that failed validation (signal the client is broken)
 *
 * Counters are in-memory and per-process: they are trend signals for ops,
 * not durable records. A restart resets them by design — persisting
 * player-behaviour data would turn an anonymous counter into a tracking
 * system, which is exactly what this service must not become.
 *
 * Caps everywhere: a misbehaving client (or an attacker) can grow a post to
 * 64 events, the counter map to 512 keys, and the device set to 10k — then
 * extra input is counted as rejected instead of consuming memory.
 */

const KEY_RE = /^[a-z0-9_.-]{1,48}$/;
const MODE_MAX = 24;
const DEVICE_MAX = 64;
const MAX_EVENTS_PER_POST = 64;
const MAX_KM_PER_EVENT = 100_000;
const MAX_KEYS = 512;
const MAX_DEVICES = 10_000;

/** Funnel stage ids: a lowercase word, optionally with digits and underscores
 * (the shipped path has neither, but a future stage should not be dropped
 * silently by a regex). Anything else is refused, not stored. */
const STAGE_RE = /^[a-z][a-z0-9_]{0,23}$/;
/** The path is 8 stages; the client clamps its index to 0..31 and so do we. */
const MAX_STEP = 31;
/** Cap on distinct stage rows — the real list is 8, so this is abuse headroom. */
const MAX_STAGE_ROWS = 48;
/** Below this many sessions at the previous stage, a conversion rate is noise
 * and is reported as `null` instead of a number someone would quote. */
const MIN_SAMPLE = 5;

export type Counter = { count: number; km: number };

/** One row of the funnel: how far sessions got, and where they stopped. */
export type FunnelStepReport = {
  stage: string;
  /** Position in the fixed path, as reported by the client. */
  step: number;
  /** Sessions that reached this stage (one `funnel_stage` event each). */
  reached: number;
  /** reached / previous reached — `null` for the first stage and whenever the
   * previous stage has fewer than `MIN_SAMPLE` sessions. */
  conversion: number | null;
  /** 1 - conversion, on the same conditions. */
  dropOff: number | null;
  /** Sessions whose summary said this is as far as they got. */
  stalled: number;
};

export type FunnelReport = {
  /** Anonymous device ids seen — the denominator, never an identity. */
  devices: number;
  /** Sessions that reached the first stage of the path. */
  entered: number;
  steps: FunnelStepReport[];
  /** The single worst step, or null while everything is below `MIN_SAMPLE`.
   * This is the field that answers "where do players drop off". */
  worst: { stage: string; dropOff: number; reached: number; of: number } | null;
  /** Sessions that reported a stall anywhere on the path. */
  stalled: number;
};

export interface TelemetrySummary {
  devices: number;
  keys: { key: string; count: number; km: number }[];
  totalEvents: number;
  rejectedPosts: number;
}

export class TelemetryService {
  private counters = new Map<string, Counter>();
  private readonly devices = new Set<string>();
  private totalEvents = 0;
  private rejectedPosts = 0;
  /**
   * The first-run funnel, folded from anonymous counters only: how many
   * sessions reached each stage (`funnel_stage`) and how many said that stage
   * was as far as they got (`funnel_summary`). No session ids, no timestamps,
   * no ordering information beyond the stage's own index — which is the whole
   * reason a funnel can be reported here at all without turning this service
   * into a tracking system.
   */
  private readonly stages = new Map<string, { step: number; reached: number; stalled: number }>();

  /**
   * Validate + fold one beacon body. Never throws — a bad post is counted
   * (rejectedPosts) and answered with `accepted: 0`, because a telemetry
   * endpoint that errors is just noise for a client that cannot retry.
   */
  ingest(body: unknown): { accepted: number; keys: number } {
    if (typeof body !== "object" || body === null) {
      this.rejectedPosts += 1;
      return { accepted: 0, keys: this.counters.size };
    }
    const b = body as { deviceId?: unknown; events?: unknown };
    if (typeof b.deviceId !== "string" || b.deviceId.length === 0 || b.deviceId.length > DEVICE_MAX) {
      this.rejectedPosts += 1;
      return { accepted: 0, keys: this.counters.size };
    }
    if (!Array.isArray(b.events)) {
      this.rejectedPosts += 1;
      return { accepted: 0, keys: this.counters.size };
    }

    let accepted = 0;
    for (const raw of b.events.slice(0, MAX_EVENTS_PER_POST)) {
      if (typeof raw !== "object" || raw === null) continue;
      const e = raw as { k?: unknown; mode?: unknown; km?: unknown; st?: unknown; si?: unknown };
      const k = typeof e.k === "string" ? e.k : "";
      if (!KEY_RE.test(k)) continue; // malformed name — drop silently
      const mode = typeof e.mode === "string" ? e.mode.slice(0, MODE_MAX) : "";
      const km =
        typeof e.km === "number" && Number.isFinite(e.km) ? Math.max(0, Math.min(e.km, MAX_KM_PER_EVENT)) : 0;
      const key = mode ? `${k}#${mode}` : k;
      const c = this.counters.get(key) ?? { count: 0, km: 0 };
      c.count += 1;
      c.km += km;
      this.counters.set(key, c);
      // Hard cap with insertion-order eviction: the oldest key dies when the
      // map is full (it has the least-recent evidence value).
      if (this.counters.size > MAX_KEYS) {
        for (const existing of this.counters.keys()) {
          if (existing !== key) {
            this.counters.delete(existing);
            break;
          }
        }
      }
      this.foldFunnel(k, e.st, e.si);
      accepted += 1;
    }

    if (accepted > 0) {
      this.totalEvents += accepted;
      if (this.devices.size < MAX_DEVICES) this.devices.add(b.deviceId);
    }
    return { accepted, keys: this.counters.size };
  }

  /**
   * Fold one event's funnel position into the stage rows. Only the two funnel
   * events carry one; anything else (or a malformed stage id) is ignored, so a
   * client bug cannot invent stages.
   */
  private foldFunnel(k: string, st: unknown, si: unknown): void {
    if (k !== "funnel_stage" && k !== "funnel_summary") return;
    if (typeof st !== "string" || !STAGE_RE.test(st)) return;
    const row = this.stages.get(st) ?? { step: MAX_STEP, reached: 0, stalled: 0 };
    if (typeof si === "number" && Number.isFinite(si)) {
      row.step = Math.min(row.step, Math.max(0, Math.min(MAX_STEP, Math.round(si))));
    }
    if (k === "funnel_stage") row.reached += 1;
    else row.stalled += 1;
    if (!this.stages.has(st) && this.stages.size >= MAX_STAGE_ROWS) return; // refuse new rows past the cap
    this.stages.set(st, row);
  }

  /**
   * The funnel report: stage order, step-to-step conversion, and the worst step.
   *
   * Ordered by the index the client sends (with unknown-index rows last, by
   * volume) rather than by a copy of the stage list kept here — one source of
   * truth, and a reordered path cannot silently produce a wrong report.
   */
  funnel(): FunnelReport {
    const rows = [...this.stages.entries()]
      .map(([stage, r]) => ({ stage, ...r }))
      .sort((a, b) => a.step - b.step || b.reached - a.reached || (a.stage < b.stage ? -1 : 1));

    const steps: FunnelStepReport[] = rows.map((row, i) => {
      const prev = i > 0 ? rows[i - 1] : undefined;
      const ok = prev !== undefined && prev.reached >= MIN_SAMPLE;
      const conversion = ok ? row.reached / prev!.reached : null;
      return {
        stage: row.stage,
        step: row.step,
        reached: row.reached,
        conversion: conversion === null ? null : Math.round(conversion * 1000) / 1000,
        dropOff: conversion === null ? null : Math.round((1 - conversion) * 1000) / 1000,
        stalled: row.stalled,
      };
    });

    let worst: FunnelReport["worst"] = null;
    for (let i = 1; i < steps.length; i += 1) {
      const step = steps[i]!;
      const prev = steps[i - 1]!;
      if (step.dropOff === null) continue;
      if (worst === null || step.dropOff > worst.dropOff) {
        worst = { stage: `${prev.stage}->${step.stage}`, dropOff: step.dropOff, reached: step.reached, of: prev.reached };
      }
    }

    return {
      devices: this.devices.size,
      entered: steps.length > 0 ? steps[0]!.reached : 0,
      steps,
      worst,
      stalled: rows.reduce((sum, r) => sum + r.stalled, 0),
    };
  }

  /** Ops view: top counters by volume. Snapshot-sliced, cheap to call. */
  snapshot(): TelemetrySummary {
    const keys = [...this.counters.entries()]
      .map(([key, c]) => ({ key, count: c.count, km: c.km }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 64);
    return { devices: this.devices.size, keys, totalEvents: this.totalEvents, rejectedPosts: this.rejectedPosts };
  }
}
