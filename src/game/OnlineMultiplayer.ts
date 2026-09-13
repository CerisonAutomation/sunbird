/**
 * Online multiplayer room system using WebSockets.
 *
 * Architecture:
 * - Room creation with unique 6-char codes
 * - Lobby with player list, ready states, chat
 * - Race mode: sync bird positions at 20Hz
 * - Spectating: watch ongoing races
 * - Max 30 players per room
 * - Auto-reconnect on connection drop (2s interval, up to 10 attempts)
 * - Interpolated remote player positions between sync updates
 * - Round-trip latency measurement via ping/pong every 5s
 * - Room browser via list_active_rooms message
 */

export type RoomPlayer = {
  id: string;
  name: string;
  ready: boolean;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  distance: number;
  alive: boolean;
  finished: boolean;
  finishTime: number;
  rank: number;
};

export type RoomState = "lobby" | "countdown" | "racing" | "results";
export type RoomMode = "race" | "distance" | "freefly";

export type RoomInfo = {
  code: string;
  host: string;
  mode: RoomMode;
  state: RoomState;
  players: RoomPlayer[];
  maxPlayers: number;
  seed: string;
  countdown: number;
};

export type ActiveRoom = {
  code: string;
  host: string;
  mode: RoomMode;
  state: RoomState;
  playerCount: number;
  maxPlayers: number;
};

type InterpolationEntry = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  distance: number;
  time: number;
};

export class OnlineMultiplayer {
  private ws: WebSocket | null = null;
  private roomId = "";
  private playerId = "";
  private playerName = "";
  private room: RoomInfo | null = null;
  private spectators: RoomPlayer[] = [];
  private onStateChange: ((room: RoomInfo) => void) | null = null;
  private onPlayerUpdate: ((player: RoomPlayer) => void) | null = null;
  private onRaceEnd: ((results: RoomPlayer[]) => void) | null = null;
  private onChat: ((from: string, msg: string) => void) | null = null;
  private onDisconnect: (() => void) | null = null;
  private onRoomList: ((rooms: ActiveRoom[]) => void) | null = null;
  private onError: ((msg: string) => void) | null = null;
  private isConnected = false;
  private isHost = false;
  private syncInterval = 0;
  private lastSync = 0;
  private readonly SYNC_RATE = 50; // 20Hz sync
  private readonly MAX_PLAYERS = 30;

  // --- Auto-reconnect ---
  private reconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer = 0;
  private reconnectUrl = "";

  // --- Latency ---
  private latency = 0;
  private lastPing = 0;
  private pingInterval = 0;
  private readonly PING_INTERVAL = 5000; // 5 seconds

  // --- Interpolation ---
  private interpolationBuffer = new Map<string, InterpolationEntry>();

  constructor(serverUrl?: string) {
    this.playerId = this.generateId();
    if (serverUrl) void this.connect(serverUrl);
  }

  /** Connect to the WebSocket server */
  async connect(url: string): Promise<boolean> {
    this.reconnectUrl = url;
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(url);
        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          this.send({ type: "auth", playerId: this.playerId, playerName: this.playerName });
          // Flush control messages queued while the socket was connecting
          // (create_room / join_room are often fired before the handshake finishes)
          if (this.ws) {
            const queued = this.outbox.splice(0);
            for (const payload of queued) this.ws.send(payload);
          }
          this.startPing();
          resolve(true);
        };
        this.ws.onmessage = (e: MessageEvent) => {
          try {
            this.handleMessage(JSON.parse(String(e.data)));
          } catch (err) {
            console.warn("[mp] Failed to parse message:", err);
          }
        };
        this.ws.onclose = () => {
          this.isConnected = false;
          this.stopPing();
          // Drop unsent messages — replaying a stale create/join after reconnect
          // would be wrong; the user can simply press the button again.
          this.outbox.length = 0;
          if (!this.reconnecting) {
            this.onDisconnect?.();
          }
          this.tryReconnect();
        };
        this.ws.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /** Create a new room */
  createRoom(mode: RoomMode = "race"): void {
    this.roomId = this.generateRoomCode();
    this.isHost = true;
    this.send({
      type: "create_room",
      roomId: this.roomId,
      mode,
      host: this.playerId,
      maxPlayers: this.MAX_PLAYERS,
    });
  }

  /** Join an existing room */
  joinRoom(code: string): void {
    this.roomId = code.toUpperCase();
    this.send({
      type: "join_room",
      roomId: this.roomId,
      playerId: this.playerId,
      playerName: this.playerName,
    });
  }

  /** Leave the current room */
  leaveRoom(): void {
    this.send({ type: "leave_room", roomId: this.roomId, playerId: this.playerId });
    this.room = null;
    this.stopSync();
    this.interpolationBuffer.clear();
  }

  /** Set ready state */
  setReady(ready: boolean): void {
    this.send({ type: "ready", roomId: this.roomId, playerId: this.playerId, ready });
  }

  /** Start the race (host only) */
  startRace(): void {
    if (!this.isHost) return;
    this.send({ type: "start_race", roomId: this.roomId, seed: this.room?.seed ?? "" });
  }

  /** Send chat message */
  sendChat(msg: string): void {
    this.send({
      type: "chat",
      roomId: this.roomId,
      playerId: this.playerId,
      playerName: this.playerName,
      msg: msg.slice(0, 200),
    });
  }

  /** Sync bird position during race */
  syncPosition(
    x: number,
    y: number,
    vx: number,
    vy: number,
    distance: number,
    alive: boolean,
  ): void {
    const now = performance.now();
    if (now - this.lastSync < this.SYNC_RATE) return;
    this.lastSync = now;
    this.send({
      type: "player_sync",
      roomId: this.roomId,
      playerId: this.playerId,
      x,
      y,
      vx,
      vy,
      distance,
      alive,
    });
  }

  /** Report race finish */
  reportFinish(distance: number, score: number): void {
    this.send({
      type: "finish_race",
      roomId: this.roomId,
      playerId: this.playerId,
      distance,
      score,
    });
  }

  /** Request list of active rooms from the server */
  listRooms(): void {
    this.send({ type: "list_active_rooms" });
  }

  /** Get current room info */
  getRoom(): RoomInfo | null {
    return this.room;
  }
  getPlayers(): RoomPlayer[] {
    return this.room?.players ?? [];
  }
  getSpectators(): RoomPlayer[] {
    return this.spectators;
  }
  getMyId(): string {
    return this.playerId;
  }
  getIsHost(): boolean {
    return this.isHost;
  }
  getIsConnected(): boolean {
    return this.isConnected;
  }
  getRoomCode(): string {
    return this.roomId;
  }
  getLatency(): number {
    return this.latency;
  }
  isReconnecting(): boolean {
    return this.reconnecting;
  }
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /** Set callbacks */
  onRoomUpdate(cb: (room: RoomInfo) => void) {
    this.onStateChange = cb;
  }
  onPlayerMove(cb: (player: RoomPlayer) => void) {
    this.onPlayerUpdate = cb;
  }
  onRaceFinished(cb: (results: RoomPlayer[]) => void) {
    this.onRaceEnd = cb;
  }
  onChatMessage(cb: (from: string, msg: string) => void) {
    this.onChat = cb;
  }
  onDisconnected(cb: () => void) {
    this.onDisconnect = cb;
  }
  onRoomListUpdate(cb: (rooms: ActiveRoom[]) => void) {
    this.onRoomList = cb;
  }

  setPlayerName(name: string) {
    this.playerName = name.slice(0, 16);
    // Re-auth so an already-open connection picks up the new name
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "auth", playerId: this.playerId, playerName: this.playerName });
    }
  }

  onErrorMessage(cb: (msg: string) => void) {
    this.onError = cb;
  }

  dispose(): void {
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = 0;
    }
    this.stopPing();
    this.stopSync();
    this.leaveRoom();
    this.ws?.close();
    this.ws = null;
  }

  /* --- Interpolation --- */

  /**
   * Interpolates a remote player's position between sync updates.
   * Call this each frame with the current time (from performance.now()) to get
   * a smoothly blended position for rendering.
   *
   * Returns the interpolated {x, y, vx, vy, distance} or null if no data exists.
   */
  interpolate(
    playerId: string,
    currentTime: number,
  ): { x: number; y: number; vx: number; vy: number; distance: number } | null {
    const entry = this.interpolationBuffer.get(playerId);
    if (!entry) return null;

    const age = currentTime - entry.time;

    // If the data is very fresh (< 50ms), use it directly
    if (age < 50) {
      return {
        x: entry.x,
        y: entry.y,
        vx: entry.vx,
        vy: entry.vy,
        distance: entry.distance,
      };
    }

    // Extrapolate using velocity for data that is 50ms-2s old.
    // Beyond 2s, snap to the last known position.
    const extrapolationSeconds = Math.min(age / 1000, 2);
    const extrapolatedX = entry.x + entry.vx * extrapolationSeconds;
    const extrapolatedY = entry.y + entry.vy * extrapolationSeconds;
    const extrapolatedDistance =
      entry.distance + Math.max(0, entry.vx) * extrapolationSeconds;

    return {
      x: extrapolatedX,
      y: extrapolatedY,
      vx: entry.vx,
      vy: entry.vy,
      distance: extrapolatedDistance,
    };
  }

  /* --- private --- */

  // --- Outbox: messages queued while the socket is still connecting ---
  private outbox: string[] = [];

  private send(data: Record<string, unknown>): void {
    const payload = JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else if (this.ws?.readyState === WebSocket.CONNECTING) {
      // Queue instead of silently dropping — this is why the room creator
      // used to never appear in their own lobby.
      this.outbox.push(payload);
    }
    // CLOSED / no socket: drop; reconnect logic handles recovery.
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case "room_update":
        this.room = msg.room as RoomInfo;
        this.onStateChange?.(this.room);
        break;
      case "player_sync": {
        const p = msg.player as RoomPlayer;
        const existing = this.room?.players.find((pl) => pl.id === p.id);
        if (existing) Object.assign(existing, p);

        // Feed the interpolation buffer for remote players
        if (p.id !== this.playerId) {
          this.interpolationBuffer.set(p.id, {
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            distance: p.distance,
            time: performance.now(),
          });
        }

        this.onPlayerUpdate?.(p);
        break;
      }
      case "player_disconnect": {
        const disconnectedId = msg.playerId as string;
        if (this.room) {
          const player = this.room.players.find(
            (pl) => pl.id === disconnectedId,
          );
          if (player) {
            player.alive = false;
            player.finished = true;
            player.finishTime = 0;
          }
          this.onStateChange?.(this.room);
        }
        this.interpolationBuffer.delete(disconnectedId);
        break;
      }
      case "race_end":
        this.onRaceEnd?.(msg.results as RoomPlayer[]);
        this.stopSync();
        break;
      case "chat":
        this.onChat?.(msg.playerName as string, msg.msg as string);
        break;
      case "countdown":
        if (this.room) this.room.countdown = msg.count as number;
        this.onStateChange?.(this.room!);
        if ((msg.count as number) <= 0) this.startSync();
        break;
      case "pong": {
        const now = performance.now();
        this.latency = now - this.lastPing;
        break;
      }
      case "room_list":
        this.onRoomList?.(msg.rooms as ActiveRoom[]);
        break;
      case "error":
        console.warn("[mp]", msg.msg);
        this.onError?.(String(msg.msg ?? "Multiplayer error"));
        break;
    }
  }

  /* --- Latency measurement --- */

  private startPing(): void {
    this.stopPing();
    this.pingInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPing = performance.now();
        this.send({ type: "ping" });
      }
    }, this.PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = 0;
    }
  }

  /* --- Auto-reconnect --- */

  private tryReconnect(): void {
    if (
      !this.reconnectUrl ||
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;

    console.log(
      `[mp] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
    );

    this.reconnectTimer = window.setTimeout(async () => {
      const success = await this.connect(this.reconnectUrl);
      if (!success) {
        this.tryReconnect();
      }
    }, 2000);
  }

  /* --- Sync --- */

  private startSync(): void {
    // The server pushes room/race state proactively (broadcastRoom on every
    // mutation), so no client polling is needed. Kept as a stub for callers.
  }

  private stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = 0;
    }
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  private generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++)
      code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
}
