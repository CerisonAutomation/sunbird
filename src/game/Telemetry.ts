type Props = Record<string, string | number | boolean>;
type Entry = { name: string; props: Props; t: number };

/** Lightweight analytics bus. Forwards to window.dataLayer when present. */
export class Telemetry {
  private readonly buffer: Entry[] = [];
  private readonly debug =
    typeof location !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname);

  track(name: string, props: Props = {}): void {
    const entry: Entry = { name, props, t: Date.now() };
    this.buffer.push(entry);
    if (this.buffer.length > 100) this.buffer.shift();
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer?.push({ event: name, ...props });
    if (this.debug) console.debug("[telemetry]", name, props);
  }

  recent(): readonly Entry[] {
    return this.buffer;
  }
}
