/**
 * SaveService — cloud save sync with versioning and conflict detection.
 *
 * Strategy: last-write-wins by server version, with an explicit conflict
 * signal. The client sends `baseVersion` (the version it last synced); if
 * the server has moved on, the response is a 409 with the server's payload
 * so the player (or the client's auto-resolution policy) can choose. This
 * gives us BOTH "last-write-wins" (client omits baseVersion) and "manual
 * choice" (client sends baseVersion) without ambiguity.
 */
import type { Ctx } from "../core/ctx.js";
import { HttpError } from "../util/http.js";
import type { CloudSave } from "../types.js";

export class SaveService {
  constructor(private ctx: Ctx) {}

  load(playerId: string): CloudSave | null {
    this.ctx.identity.requireProfile(playerId);
    return this.ctx.db.state.saves[playerId] ?? null;
  }

  /**
   * Upsert a save.
   * @param baseVersion — when provided, the write fails with 409 if the
   *   server version differs (the caller then chooses local vs cloud).
   *   When omitted, the write always wins (last-write-wins).
   */
  put(
    playerId: string,
    input: { payload: unknown; baseVersion?: unknown; updatedAt?: unknown },
  ): { version: number; updatedAt: string } {
    this.ctx.identity.requireProfile(playerId);
    if (this.ctx.identity.isSuspended(playerId)) throw new HttpError(403, "account suspended", "suspended");
    if (typeof input.payload !== "string" || input.payload.length === 0) {
      throw new HttpError(400, "payload must be a JSON string", "invalidPayload");
    }
    if (Buffer.byteLength(input.payload, "utf8") > this.ctx.cfg.saveMaxBytes) {
      throw new HttpError(413, "save too large", "payloadTooLarge");
    }
    // Integrity: the payload must be parseable JSON with a deviceId — this is
    // the client's save state, and garbage here would silently corrupt a
    // player's progress on their next device.
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.payload);
    } catch {
      throw new HttpError(400, "save payload is not valid JSON", "invalidPayload");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("deviceId" in parsed)) {
      throw new HttpError(400, "save payload must contain deviceId", "invalidPayload");
    }

    const now = this.ctx.now();
    const existing = this.ctx.db.state.saves[playerId];
    if (typeof input.baseVersion === "number" && input.baseVersion >= 0) {
      if (existing && existing.version !== Math.floor(input.baseVersion)) {
        // Conflict: hand back the server copy so the client can reconcile.
        throw new HttpError(409, "save conflict — server has a newer version", "conflict", undefined);
      }
    }
    const version = (existing?.version ?? 0) + 1;
    const save: CloudSave = {
      playerId,
      version,
      updatedAt: new Date(now).toISOString(),
      sizeBytes: Buffer.byteLength(input.payload, "utf8"),
      payload: input.payload,
    };
    this.ctx.db.state.saves[playerId] = save;
    this.ctx.db.touch();
    return { version, updatedAt: save.updatedAt };
  }

  /** Conflict payload helper: the 409 body carries the server save. */
  conflictBody(playerId: string): { serverVersion: number; serverSave: CloudSave } {
    const existing = this.ctx.db.state.saves[playerId];
    if (!existing) throw new HttpError(404, "no server save", "notFound");
    return { serverVersion: existing.version, serverSave: existing };
  }

  count(): number {
    return Object.keys(this.ctx.db.state.saves).length;
  }
}
