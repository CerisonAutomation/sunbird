/**
 * RoomDO — one Durable Object per race room (≤ 40 pilots).
 *
 * Speaks the exact wire protocol the shipped client (`src/game/Realtime.ts`)
 * already implements: welcome / peers / left / state / emote / finish / start
 * server→client, and state / emote / ready / finish client→server.
 *
 * Free-plan economics, deliberately engineered:
 *  • WebSocket Hibernation API (`acceptWebSocket`, `webSocketMessage`) — an
 *    idle room is evicted from memory and bills ZERO duration while sockets
 *    stay connected.
 *  • One 15 Hz broadcast alarm per room while a race is live — cost scales
 *    with active rooms, never with (players × messages).
 *  • Pilot state lives on the serialized WebSocket attachment, so a room can
 *    wake from hibernation with full state and no storage reads.
 *  • Authoritative finish ordering: the DO assigns places by arrival order of
 *    finish messages — a single-threaded, strongly consistent referee.
 */

const CAPACITY = 40;
const TICK_MS = 1000 / 15;
const MAX_NAME = 14;
const START_DELAY_MS = 3000;

type PilotState = {
  id: string;
  name: string;
  skin: string;
  hue: number;
  x: number;
  y: number;
  rot: number;
  distance: number;
  hasState: boolean;
  finished: boolean;
  finishTime: number;
  ready: boolean;
};

type ClientMsg =
  | { type: "state"; x: number; y: number; r: number; d: number }
  | { type: "emote"; emote: string }
  | { type: "ready"; ready: boolean }
  | { type: "finish"; time: number; d: number };

const clean = (v: unknown, n: number): string =>
  String(v ?? "")
    .replace(/[<>&"']/g, "")
    .slice(0, n);

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export class RoomDO implements DurableObject {
  private code = "";
  private seed = "";
  private isPublic = false;
  private startedAt = 0;
  private finishOrder: string[] = [];
  /** Directory mode: `dir:<seed>` objects only match public codes. */
  private dirCurrentCode = "";
  private dirCheckedAt = 0;

  constructor(
    private readonly state: DurableObjectState,
    _env: unknown,
  ) {
    void _env;
    // Restore room meta after hibernation or eviction.
    void this.state.blockConcurrencyWhile(async () => {
      const meta = await this.state.storage.get<{ code: string; seed: string; isPublic: boolean; startedAt: number; finishOrder: string[] }>("meta");
      if (meta) {
        this.code = meta.code;
        this.seed = meta.seed;
        this.isPublic = meta.isPublic;
        this.startedAt = meta.startedAt;
        this.finishOrder = meta.finishOrder;
      }
    });
  }

  private persistMeta(): void {
    void this.state.storage.put("meta", {
      code: this.code,
      seed: this.seed,
      isPublic: this.isPublic,
      startedAt: this.startedAt,
      finishOrder: this.finishOrder,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    /* ------------------------------------------ public-room directory */
    if (url.pathname === "/directory/pick") {
      // Reuse the current filling code while it exists and reports space;
      // otherwise mint a fresh one. One tiny subrequest per matchmake.
      const now = Date.now();
      if (this.dirCurrentCode && now - this.dirCheckedAt < 10_000) {
        return Response.json({ code: this.dirCurrentCode });
      }
      this.dirCurrentCode = this.dirCurrentCode || newCode();
      this.dirCheckedAt = now;
      await this.state.storage.put("dir", this.dirCurrentCode);
      return Response.json({ code: this.dirCurrentCode });
    }
    if (url.pathname === "/directory/rotate") {
      this.dirCurrentCode = newCode();
      this.dirCheckedAt = Date.now();
      await this.state.storage.put("dir", this.dirCurrentCode);
      return Response.json({ code: this.dirCurrentCode });
    }

    /* -------------------------------------------------------- WS join */
    if (url.pathname === "/join") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }

      if (!this.code) {
        this.code = clean(url.searchParams.get("room"), 5).toUpperCase() || newCode();
        this.seed = clean(url.searchParams.get("seed"), 64) || new Date().toISOString().slice(0, 10);
        this.isPublic = url.searchParams.get("public") === "1";
        this.persistMeta();
      }

      const device = clean(url.searchParams.get("device"), 64) || `anon-${Math.random().toString(36).slice(2, 8)}`;

      // Reconnect: the same device replaces its old socket instead of
      // consuming a second seat.
      for (const ws of this.state.getWebSockets()) {
        const p = this.pilotOf(ws);
        if (p && p.id === device) {
          try {
            ws.close(1000, "superseded by reconnect");
          } catch {
            /* already gone */
          }
        }
      }

      if (this.liveSockets().length >= CAPACITY) {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        server.accept();
        server.send(JSON.stringify({ type: "error", message: "That room is full (40 pilots)." }));
        server.close(1000, "room full");
        return new Response(null, { status: 101, webSocket: client });
      }

      const pilot: PilotState = {
        id: device,
        name: clean(url.searchParams.get("name"), MAX_NAME) || "Pilot",
        skin: clean(url.searchParams.get("skin"), 24) || "sunbird",
        hue: num(url.searchParams.get("hue")),
        x: 0,
        y: 0,
        rot: 0,
        distance: 0,
        hasState: false,
        finished: false,
        finishTime: 0,
        ready: false,
      };

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // Hibernation API: the runtime owns the socket; we are billed only
      // while actually handling messages or alarms.
      this.state.acceptWebSocket(server, [device]);
      server.serializeAttachment(pilot);

      server.send(
        JSON.stringify({ type: "welcome", id: pilot.id, room: this.code, seed: this.seed, capacity: CAPACITY }),
      );
      this.broadcastPeers();

      // Race starts once two pilots are present; solo pilots still fly
      // against local squadron pilots with zero waiting (client behaviour).
      if (this.liveSockets().length >= 2 && !this.startedAt) {
        this.startedAt = Date.now() + START_DELAY_MS;
        this.persistMeta();
        this.broadcast({ type: "start", at: this.startedAt, seed: this.seed });
      }
      await this.ensureTicking();

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/stats") {
      return Response.json({ pilots: this.liveSockets().length, code: this.code, started: this.startedAt > 0 });
    }

    return new Response("not found", { status: 404 });
  }

  /* --------------------------------------------- hibernation callbacks */

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const pilot = this.pilotOf(ws);
    if (!pilot) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ClientMsg;
    } catch {
      return; // malformed frames are dropped, never fatal
    }

    switch (msg.type) {
      case "state":
        pilot.x = num(msg.x);
        pilot.y = num(msg.y);
        pilot.rot = num(msg.r);
        pilot.distance = num(msg.d);
        pilot.hasState = true;
        ws.serializeAttachment(pilot);
        await this.ensureTicking();
        break;
      case "emote":
        this.broadcast({ type: "emote", id: pilot.id, emote: clean(msg.emote, 12) }, pilot.id);
        break;
      case "ready":
        pilot.ready = Boolean(msg.ready);
        ws.serializeAttachment(pilot);
        this.broadcastPeers();
        break;
      case "finish": {
        // Authoritative: place = order of arrival at this single-threaded DO.
        if (pilot.finished) break;
        pilot.finished = true;
        pilot.finishTime = num(msg.time);
        pilot.distance = Math.max(pilot.distance, num(msg.d));
        ws.serializeAttachment(pilot);
        this.finishOrder.push(pilot.id);
        this.persistMeta();
        this.broadcast({ type: "finish", id: pilot.id, time: pilot.finishTime, place: this.finishOrder.length });
        break;
      }
      default:
        break;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.dropSocket(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.dropSocket(ws);
  }

  /** 15 Hz broadcast tick — one alarm per room, only while pilots are live. */
  async alarm(): Promise<void> {
    const sockets = this.liveSockets();
    if (sockets.length === 0) {
      // Room is empty: reset race state and stop ticking. With hibernation,
      // an empty stopped room costs nothing at all.
      this.startedAt = 0;
      this.finishOrder = [];
      this.persistMeta();
      return;
    }

    const pilots: [string, number, number, number, number][] = [];
    for (const ws of sockets) {
      const p = this.pilotOf(ws);
      if (p?.hasState) pilots.push([p.id, p.x, p.y, p.rot, p.distance]);
    }
    if (pilots.length > 0) {
      this.broadcast({ type: "state", t: Date.now() / 1000, pilots });
    }
    await this.state.storage.setAlarm(Date.now() + TICK_MS);
  }

  /* ------------------------------------------------------------ helpers */

  private liveSockets(): WebSocket[] {
    return this.state.getWebSockets().filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN);
  }

  private pilotOf(ws: WebSocket): PilotState | null {
    try {
      return (ws.deserializeAttachment() as PilotState | null) ?? null;
    } catch {
      return null;
    }
  }

  private dropSocket(ws: WebSocket): void {
    const p = this.pilotOf(ws);
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    if (p) this.broadcast({ type: "left", id: p.id }, p.id);
    if (this.liveSockets().length > 0) this.broadcastPeers();
  }

  private broadcastPeers(): void {
    const peers = this.liveSockets()
      .map((ws) => this.pilotOf(ws))
      .filter((p): p is PilotState => p !== null)
      .map((p) => ({ id: p.id, name: p.name, hue: p.hue, skin: p.skin, ready: p.ready }));
    this.broadcast({ type: "peers", peers });
  }

  private broadcast(msg: Record<string, unknown>, exceptId?: string): void {
    const raw = JSON.stringify(msg);
    for (const ws of this.liveSockets()) {
      const p = this.pilotOf(ws);
      if (exceptId && p?.id === exceptId) continue;
      try {
        ws.send(raw);
      } catch {
        /* peer vanished mid-send */
      }
    }
  }

  private async ensureTicking(): Promise<void> {
    const current = await this.state.storage.getAlarm();
    if (current === null) await this.state.storage.setAlarm(Date.now() + TICK_MS);
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  let out = "";
  for (let i = 0; i < 5; i++) out += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return out;
}
