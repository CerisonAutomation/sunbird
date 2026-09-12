import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Network-boundary validation on the WebSocket layer: a frame that parses but
 * is structurally malformed (missing a field the dispatcher trusts) must be
 * dropped — never allowed to throw inside the socket handler, and a non-finite
 * pilot coordinate must never leak into the interpolation buffer.
 */

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  readyState = FakeWebSocket.OPEN;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }
  send(d: string): void {
    this.sent.push(d);
  }
  close(): void {
    this.readyState = 3;
  }
}

const instances: FakeWebSocket[] = [];

async function loadClient() {
  vi.stubEnv("VITE_MULTIPLAYER_URL", "/mp");
  const mod = await import("../Realtime");
  const client = new mod.RealtimeClient("d-test", "Bird", "sunbird", 0.5);
  client.connect("ROOM", "seed");
  return client;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  instances.length = 0;
});

describe("realtime network boundary", () => {
  it("drops a parseable-but-malformed frame without throwing", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const client = await loadClient();

    // `{ type: "peers" }` with no `peers` array would make `for..of` throw.
    const bad = () => instances[0]!.onmessage!({ data: JSON.stringify({ type: "peers" }) });
    expect(bad).not.toThrow();
    expect(client.connected).toBe(true);
  });

  it("rejects non-finite pilot coordinates at the boundary", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const client = await loadClient();

    instances[0]!.onmessage!({
      data: JSON.stringify({
        type: "state",
        t: 1,
        pilots: [
          ["hacker", NaN, NaN, NaN, 999],
          ["clean", 10, 20, 0, 50],
        ],
      }),
    });

    // The NaN pilot must be dropped; only the finite pilot is interpolated.
    const snaps = client.poll();
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.id).toBe("clean");
    expect(Number.isFinite(snaps[0]!.x)).toBe(true);
    expect(Number.isFinite(snaps[0]!.y)).toBe(true);
  });
});
