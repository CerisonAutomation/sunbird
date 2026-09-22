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

export type Counter = { count: number; km: number };

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
      const e = raw as { k?: unknown; mode?: unknown; km?: unknown };
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
      accepted += 1;
    }

    if (accepted > 0) {
      this.totalEvents += accepted;
      if (this.devices.size < MAX_DEVICES) this.devices.add(b.deviceId);
    }
    return { accepted, keys: this.counters.size };
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
