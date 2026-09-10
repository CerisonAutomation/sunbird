import type { NetTransport, RemoteSnapshot } from "./MassRace";
import { PROTOCOL_VERSION } from "./protocol/v1";

/**
 * Realtime multiplayer client for up to 40 concurrent pilots.
 *
 * Design notes that matter:
 *  • We send at a fixed 15 Hz, never per-frame — a 41-player room at 60 Hz
 *    would be ~2.4k msgs/sec of pure waste.
 *  • Remote birds are rendered from a 2-sample interpolation buffer held
 *    `INTERP_DELAY` behind server time. That is what makes other players look
 *    smooth instead of teleporting between packets.
 *  • Reconnection uses capped exponential backoff and preserves your seat via
 *    the persistent device id, so a dropped tunnel does not cost you the race.
 *  • Everything degrades: if the socket never opens, `connected` stays false
 *    and MassRace keeps flying local squadron pilots. The UI always states
 *    which one you are in.
 */

const URL_BASE = (import.meta.env.VITE_MULTIPLAYER_URL ?? "").trim();

/** Outbound state rate. 15 Hz is plenty given client-side interpolation. */
const SEND_HZ = 15;
const SEND_DT = 1 / SEND_HZ;
/** Render remote pilots this far in the past so we always interpolate. */
const INTERP_DELAY = 0.12;
const STALE_AFTER = 6;
const MAX_BACKOFF = 15000;

export type PresenceState = "offline" | "connecting" | "lobby" | "racing" | "error";

export type RoomPeer = {
  id: string;
  name: string;
  hue: number;
  skin: string;
  distance: number;
  place: number;
  finished: boolean;
  finishTime: number;
  emote: string;
  emoteAt: number;
  ready: boolean;
  you: boolean;
};

export type RoomInfo = {
  code: string;
  seed: string;
  count: number;
  capacity: number;
  state: PresenceState;
  startsInMs: number;
  error: string;
};

type Keyframe = { t: number; x: number; y: number; rot: number };

type Track = {
  id: string;
  name: string;
  hue: number;
  skin: string;
  buffer: Keyframe[];
  distance: number;
  finished: boolean;
  finishTime: number;
  emote: string;
  emoteAt: number;
  ready: boolean;
  lastSeen: number;
};

type ServerMsg =
  | { type: "welcome"; id: string; room: string; seed: string; capacity: number }
  | { type: "peers"; peers: { id: string; name: string; hue: number; skin: string; ready?: boolean }[] }
  | { type: "left"; id: string }
  | { type: "state"; t: number; pilots: [string, number, number, number, number][] }
  | { type: "emote"; id: string; emote: string }
  | { type: "finish"; id: string; time: number; place: number }
  | { type: "start"; at: number; seed: string }
  | { type: "error"; message: string };

/** Protocol-v1 gateway: exists now, but no production room may be opened until
 * the Rust authoritative service reaches Phase 3. */
export type ProtocolGatewayInfo = {
  supportedVersion: number;
  enabled: boolean;
  reason: string;
};

export function protocolGatewayInfo(): ProtocolGatewayInfo {
  return {
    supportedVersion: PROTOCOL_VERSION,
    enabled: false,
    reason: "authoritative-rooms-pending-phase-3",
  };
}

export function isMultiplayerConfigured(): boolean {
  return URL_BASE.length > 0;
}

/** Short, unambiguous room codes — no 0/O or 1/I confusion when read aloud. */
export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export class RealtimeClient implements NetTransport {
  state: PresenceState = "offline";
  roomCode = "";
  seed = "";
  capacity = 40;
  errorText = "";
  startsAt = 0;

  private ws: WebSocket | null = null;
  private readonly tracks = new Map<string, Track>();
  private selfId = "";
  private sendAcc = 0;
  private clock = 0;
  private serverClock = 0;
  private backoff = 500;
  private retryTimer: number | null = null;
  private closedByUs = false;
  private pendingEmotes: { id: string; emote: string }[] = [];
  private lastSent = { x: 0, y: 0, rot: 0, d: 0 };

  constructor(
    private readonly deviceId: string,
    private name: string,
    private skin: string,
    private hue: number,
  ) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.state !== "error";
  }

  get id(): string {
    return this.selfId || this.deviceId;
  }

  /** Joins (or creates) a room. `code` empty = matchmake into a public room. */
  connect(code: string, seed: string): void {
    if (!URL_BASE) {
      this.state = "offline";
      this.errorText = "No multiplayer server configured";
      return;
    }
    this.disconnect();
    this.closedByUs = false;
    this.roomCode = code.toUpperCase();
    this.seed = seed;
    this.state = "connecting";
    this.errorText = "";
    this.open();
  }

  private open(): void {
    const url = new URL(URL_BASE);
    url.searchParams.set("device", this.deviceId);
    url.searchParams.set("name", this.name);
    url.searchParams.set("skin", this.skin);
    url.searchParams.set("hue", this.hue.toFixed(3));
    if (this.roomCode) url.searchParams.set("room", this.roomCode);
    if (this.seed) url.searchParams.set("seed", this.seed);

    let socket: WebSocket;
    try {
      socket = new WebSocket(url.toString());
    } catch {
      this.fail("Could not reach the race server");
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.backoff = 500;
      this.state = "lobby";
    };
    socket.onmessage = (ev) => this.onMessage(ev);
    socket.onerror = () => {
      // `onclose` always follows; keep the retry logic in one place.
      this.errorText = "Connection problem";
    };
    socket.onclose = () => {
      this.ws = null;
      this.tracks.clear();
      if (this.closedByUs) {
        this.state = "offline";
        return;
      }
      this.state = "connecting";
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    const wait = this.backoff;
    this.backoff = Math.min(MAX_BACKOFF, Math.round(this.backoff * 1.8));
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (!this.closedByUs) this.open();
    }, wait);
  }

  private fail(message: string): void {
    this.state = "error";
    this.errorText = message;
  }

  disconnect(): void {
    this.closedByUs = true;
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        /* already closing */
      }
      this.ws = null;
    }
    this.tracks.clear();
    this.state = "offline";
  }

  setIdentity(name: string, skin: string, hue: number): void {
    this.name = name;
    this.skin = skin;
    this.hue = hue;
  }

  private onMessage(ev: MessageEvent): void {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMsg;
    } catch {
      return; // Malformed frames are ignored rather than killing the session.
    }

    switch (msg.type) {
      case "welcome":
        this.selfId = msg.id;
        this.roomCode = msg.room;
        this.seed = msg.seed;
        this.capacity = msg.capacity || 40;
        this.state = "lobby";
        break;
      case "peers":
        for (const p of msg.peers) {
          if (p.id === this.selfId) continue;
          const t = this.track(p.id);
          t.name = p.name.slice(0, 14);
          t.hue = Number.isFinite(p.hue) ? p.hue : t.hue;
          t.skin = p.skin || t.skin;
          t.ready = Boolean(p.ready);
          t.lastSeen = this.clock;
        }
        break;
      case "left":
        this.tracks.delete(msg.id);
        break;
      case "state": {
        this.serverClock = msg.t;
        for (const [id, x, y, rot, dist] of msg.pilots) {
          if (id === this.selfId) continue;
          const t = this.track(id);
          t.distance = dist;
          t.lastSeen = this.clock;
          t.buffer.push({ t: msg.t, x, y, rot });
          // Two keyframes are enough to interpolate; drop anything older.
          while (t.buffer.length > 4) t.buffer.shift();
        }
        break;
      }
      case "emote": {
        if (msg.id === this.selfId) break;
        const t = this.track(msg.id);
        t.emote = msg.emote;
        t.emoteAt = this.clock;
        this.pendingEmotes.push({ id: msg.id, emote: msg.emote });
        break;
      }
      case "finish": {
        const t = this.track(msg.id);
        t.finished = true;
        t.finishTime = msg.time;
        break;
      }
      case "start":
        this.startsAt = msg.at;
        this.seed = msg.seed || this.seed;
        this.state = "racing";
        break;
      case "error":
        this.fail(msg.message || "Server refused the connection");
        break;
      default:
        break;
    }
  }

  private track(id: string): Track {
    let t = this.tracks.get(id);
    if (!t) {
      t = {
        id,
        name: "Pilot",
        hue: Math.random(),
        skin: "sunbird",
        buffer: [],
        distance: 0,
        finished: false,
        finishTime: 0,
        emote: "",
        emoteAt: -99,
        ready: false,
        lastSeen: this.clock,
      };
      this.tracks.set(id, t);
    }
    return t;
  }

  /** Drives the send cadence and ages out silent peers. Call every frame. */
  tick(dt: number): void {
    this.clock += dt;
    this.sendAcc += dt;
    for (const [id, t] of this.tracks) {
      if (this.clock - t.lastSeen > STALE_AFTER) this.tracks.delete(id);
    }
  }

  send(x: number, y: number, rotation: number, distance: number): void {
    if (!this.connected) return;
    if (this.sendAcc < SEND_DT) return;
    this.sendAcc = 0;
    // Skip perfectly redundant frames (sitting in a menu, finished, etc).
    const moved =
      Math.abs(x - this.lastSent.x) > 0.05 ||
      Math.abs(y - this.lastSent.y) > 0.05 ||
      Math.abs(rotation - this.lastSent.rot) > 0.01;
    if (!moved) return;
    this.lastSent = { x, y, rot: rotation, d: distance };
    this.push({
      type: "state",
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      r: Math.round(rotation * 100) / 100,
      d: Math.round(distance),
    });
  }

  sendEmote(emote: string): void {
    this.push({ type: "emote", emote });
  }

  sendFinish(time: number, distance: number): void {
    this.push({ type: "finish", time: Math.round(time * 100) / 100, d: Math.round(distance) });
  }

  sendReady(ready: boolean): void {
    this.push({ type: "ready", ready });
  }

  private push(payload: Record<string, unknown>): void {
    if (!this.connected) return;
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch {
      /* socket died mid-send; onclose will handle the retry */
    }
  }

  /**
   * Interpolated snapshots for the renderer. We sample `INTERP_DELAY` behind
   * the newest packet, which converts jittery 15 Hz network data into smooth
   * 60 Hz motion.
   */
  poll(): RemoteSnapshot[] {
    const out: RemoteSnapshot[] = [];
    const renderAt = this.serverClock - INTERP_DELAY;
    for (const t of this.tracks.values()) {
      const b = t.buffer;
      if (b.length === 0) continue;

      let a = b[0]!;
      let c = b[b.length - 1]!;
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i]!.t <= renderAt && b[i + 1]!.t >= renderAt) {
          a = b[i]!;
          c = b[i + 1]!;
          break;
        }
      }
      const span = Math.max(1e-4, c.t - a.t);
      const u = Math.max(0, Math.min(1, (renderAt - a.t) / span));
      out.push({
        id: t.id,
        name: t.name,
        x: a.x + (c.x - a.x) * u,
        y: a.y + (c.y - a.y) * u,
        rotation: a.rot + (c.rot - a.rot) * u,
        finished: t.finished,
      });
    }
    return out;
  }

  /** Emotes received since the last call (drained). */
  drainEmotes(): { id: string; emote: string }[] {
    const out = this.pendingEmotes;
    this.pendingEmotes = [];
    return out;
  }

  roster(): RoomPeer[] {
    const peers: RoomPeer[] = [];
    for (const t of this.tracks.values()) {
      peers.push({
        id: t.id,
        name: t.name,
        hue: t.hue,
        skin: t.skin,
        distance: t.distance,
        place: 0,
        finished: t.finished,
        finishTime: t.finishTime,
        emote: this.clock - t.emoteAt < 2.5 ? t.emote : "",
        emoteAt: t.emoteAt,
        ready: t.ready,
        you: false,
      });
    }
    return peers;
  }

  info(): RoomInfo {
    return {
      code: this.roomCode,
      seed: this.seed,
      count: this.tracks.size + (this.connected ? 1 : 0),
      capacity: this.capacity,
      state: this.state,
      startsInMs: this.startsAt > 0 ? Math.max(0, this.startsAt - Date.now()) : 0,
      error: this.errorText,
    };
  }
}
