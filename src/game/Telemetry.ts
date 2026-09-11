type Props = Record<string, string | number | boolean>;
type Entry = { name: string; props: Props; t: number };

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** Backend telemetry endpoint, derived from the multiplayer base URL.
 * Empty string = no backend configured = network telemetry is a no-op. */
function endpoint(): string {
  const base = ENV.VITE_MP_URL ?? "";
  if (!base) return "";
  return `${base.replace(/\/$/, "").replace(/^ws/, "http")}/telemetry`;
}

/**
 * Lightweight analytics bus. Forwards to window.dataLayer when present, and —
 * when a backend is configured — mails anonymous aggregate counters home on
 * tab-hide via sendBeacon (the one API built for "the tab is dying").
 *
 * Privacy promises, not aspirations:
 *   - No PII. Only whitelisted counter names + coarse mode/km numbers travel.
 *   - Fire-and-forget: no retries, a dead endpoint costs one dropped beacon.
 */
export class Telemetry {
  private readonly buffer: Entry[] = [];
  private readonly outbox: { k: string; mode?: string; km?: number }[] = [];
  private deviceId = "";
  private hookInstalled = false;
  private readonly debug =
    typeof location !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname);

  /** Bind the random local device id used only for server-side dedup rates. */
  bindDevice(deviceId: string): void {
    this.deviceId = deviceId;
    this.installFlushHook();
  }

  track(name: string, props: Props = {}): void {
    const entry: Entry = { name, props, t: Date.now() };
    this.buffer.push(entry);
    if (this.buffer.length > 100) this.buffer.shift();
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer?.push({ event: name, ...props });
    if (this.debug) console.debug("[telemetry]", name, props);
    // Queue a coarse copy for the aggregate backend counter (hard-capped).
    if (endpoint() && this.outbox.length < 64) {
      const out: { k: string; mode?: string; km?: number } = { k: name };
      if (typeof props.mode === "string") out.mode = props.mode;
      if (typeof props.distance === "number") out.km = Math.floor(props.distance / 1000);
      this.outbox.push(out);
    }
  }

  recent(): readonly Entry[] {
    return this.buffer;
  }

  /** Drain the outbox to the backend. Never throws, never retries. */
  flush(): void {
    const url = endpoint();
    if (!url || this.outbox.length === 0 || !this.deviceId) return;
    const body = JSON.stringify({ deviceId: this.deviceId, events: this.outbox.splice(0) });
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(url, body);
      } else if (typeof fetch === "function") {
        void fetch(url, { method: "POST", body, keepalive: true }).catch(() => undefined);
      }
    } catch {
      // Telemetry failing is, by design, invisible.
    }
  }

  private installFlushHook(): void {
    if (this.hookInstalled || typeof document === "undefined") return;
    this.hookInstalled = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flush();
    });
  }
}
