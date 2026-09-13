import { WebSocketServer, WebSocket } from "ws";

type Player = {
  id: string;
  name: string;
  ws: WebSocket;
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

type Room = {
  code: string;
  host: string;
  mode: "race" | "distance" | "freefly";
  state: "lobby" | "countdown" | "racing" | "results";
  players: Map<string, Player>;
  maxPlayers: number;
  seed: string;
  countdown: number;
  createdAt: number;
};

const COLORS = [
  0xff7a45, 0x4aa8f0, 0x7fe0c8, 0xff6b4a, 0xffc14a,
  0x8a6cff, 0x5ad8ff, 0xffa8e0, 0x7fe8c8, 0xc8e8ff,
  0xffe08a, 0x9ae8ff, 0xdd6030, 0x3a8a58, 0xd98ac0,
  0xf2cf7a, 0x3f5a8a, 0xe6f7ff, 0xff9a62, 0x2c3f68,
  0x9fd0ee, 0xdc9a4a, 0x5a7fc0, 0x4a68a0, 0xb46a4a,
  0x2f7d5b, 0x8a4a80, 0x1d2848, 0x5a3e2a, 0x6b4a2e,
];

const rooms = new Map<string, Room>();
const playerToRoom = new Map<string, string>();

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateSeed(): string {
  return `mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function broadcast(room: Room, msg: Record<string, unknown>, exclude?: string): void {
  const data = JSON.stringify(msg);
  for (const [id, p] of room.players) {
    if (id !== exclude && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(data);
    }
  }
}

function sendTo(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function roomToInfo(room: Room): Record<string, unknown> {
  const players: Record<string, unknown>[] = [];
  for (const [, p] of room.players) {
    players.push({
      id: p.id,
      name: p.name,
      ready: p.ready,
      color: p.color,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      distance: p.distance,
      alive: p.alive,
      finished: p.finished,
      finishTime: p.finishTime,
      rank: p.rank,
    });
  }
  return {
    code: room.code,
    host: room.host,
    mode: room.mode,
    state: room.state,
    players,
    maxPlayers: room.maxPlayers,
    seed: room.seed,
    countdown: room.countdown,
  };
}

function cleanupRoom(room: Room): void {
  for (const [id] of room.players) playerToRoom.delete(id);
  rooms.delete(room.code);
  console.log(`[room] ${room.code} destroyed (${room.players.size} players)`);
}

// Cleanup empty rooms every 30s
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.players.size === 0 && now - room.createdAt > 60000) {
      cleanupRoom(room);
    }
  }
}, 30000);

const wss = new WebSocketServer({ port: 8080 });
console.log("[server] Multiplayer server on ws://localhost:8080");

wss.on("connection", (ws: WebSocket) => {
  let playerId = "";
  let playerName = "";

  ws.on("message", (raw: Buffer) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "auth": {
        playerId = String(msg.playerId || "");
        playerName = String(msg.playerName || "Player").slice(0, 16);
        sendTo(ws, { type: "auth_ok", playerId });
        break;
      }

      case "create_room": {
        const code = generateRoomCode();
        const room: Room = {
          code,
          host: playerId,
          mode: (msg.mode as Room["mode"]) || "race",
          state: "lobby",
          players: new Map(),
          maxPlayers: Math.min(Number(msg.maxPlayers) || 30, 30),
          seed: generateSeed(),
          countdown: 0,
          createdAt: Date.now(),
        };
        const color = COLORS[room.players.size % COLORS.length]!;
        room.players.set(playerId, {
          id: playerId,
          name: playerName,
          ws,
          ready: true,
          color,
          x: 50,
          y: 30,
          vx: 11,
          vy: 0,
          distance: 0,
          alive: true,
          finished: false,
          finishTime: 0,
          rank: 0,
        });
        rooms.set(code, room);
        playerToRoom.set(playerId, code);
        sendTo(ws, { type: "room_update", room: roomToInfo(room) });
        console.log(`[room] ${code} created by ${playerName}`);
        break;
      }

      case "join_room": {
        const code = String(msg.roomId || "").toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendTo(ws, { type: "error", msg: "Room not found" });
          break;
        }
        if (room.state !== "lobby") {
          sendTo(ws, { type: "error", msg: "Race already started" });
          break;
        }
        if (room.players.size >= room.maxPlayers) {
          sendTo(ws, { type: "error", msg: "Room is full" });
          break;
        }
        if (playerToRoom.has(playerId)) {
          sendTo(ws, { type: "error", msg: "Already in a room" });
          break;
        }

        const color = COLORS[room.players.size % COLORS.length]!;
        room.players.set(playerId, {
          id: playerId,
          name: playerName,
          ws,
          ready: false,
          color,
          x: 50,
          y: 30,
          vx: 11,
          vy: 0,
          distance: 0,
          alive: true,
          finished: false,
          finishTime: 0,
          rank: 0,
        });
        playerToRoom.set(playerId, code);
        broadcast(room, { type: "room_update", room: roomToInfo(room) });
        broadcast(room, { type: "chat", playerName: "📢", msg: `${playerName} joined` }, playerId);
        console.log(`[room] ${playerName} joined ${code} (${room.players.size} players)`);
        break;
      }

      case "leave_room": {
        const code = playerToRoom.get(playerId);
        if (!code) break;
        const room = rooms.get(code);
        if (!room) break;
        room.players.delete(playerId);
        playerToRoom.delete(playerId);
        if (room.players.size === 0) {
          cleanupRoom(room);
        } else {
          if (room.host === playerId) {
            room.host = room.players.keys().next().value!;
            broadcast(room, {
              type: "chat",
              playerName: "📢",
              msg: `${room.players.get(room.host)?.name} is now host`,
            });
          }
          broadcast(room, { type: "room_update", room: roomToInfo(room) });
          broadcast(room, { type: "chat", playerName: "📢", msg: `${playerName} left` });
        }
        break;
      }

      case "ready": {
        const code = playerToRoom.get(playerId);
        if (!code) break;
        const room = rooms.get(code);
        if (!room) break;
        const p = room.players.get(playerId);
        if (p) p.ready = Boolean(msg.ready);
        broadcast(room, { type: "room_update", room: roomToInfo(room) });
        break;
      }

      case "start_race": {
        const code = playerToRoom.get(playerId);
        if (!code) break;
        const room = rooms.get(code);
        if (!room || room.host !== playerId) break;
        if (room.state !== "lobby") break;

        const allReady = Array.from(room.players.values()).every((p) => p.ready);
        if (!allReady) {
          sendTo(ws, { type: "error", msg: "Not everyone is ready" });
          break;
        }

        room.state = "countdown";
        room.seed = generateSeed();
        room.countdown = 3;
        broadcast(room, { type: "room_update", room: roomToInfo(room) });

        // Countdown 3, 2, 1, GO
        const tick = () => {
          room.countdown--;
          broadcast(room, { type: "countdown", count: room.countdown });
          if (room.countdown > 0) {
            setTimeout(tick, 1000);
          } else {
            room.state = "racing";
            for (const p of room.players.values()) {
              p.distance = 0;
              p.alive = true;
              p.finished = false;
              p.finishTime = 0;
              p.rank = 0;
            }
            broadcast(room, { type: "room_update", room: roomToInfo(room) });
            console.log(`[room] Race started in ${code}`);
          }
        };
        setTimeout(tick, 1000);
        break;
      }

      case "sync": {
        const code = playerToRoom.get(playerId);
        if (!code) break;
        const room = rooms.get(code);
        if (!room || room.state !== "racing") break;
        const p = room.players.get(playerId);
        if (!p) break;
        p.x = Number(msg.x) || 0;
        p.y = Number(msg.y) || 0;
        p.vx = Number(msg.vx) || 0;
        p.vy = Number(msg.vy) || 0;
        p.distance = Number(msg.distance) || 0;
        p.alive = Boolean(msg.alive);
        // Relay to all other players
        broadcast(
          room,
          {
            type: "player_sync",
            playerId,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            distance: p.distance,
            alive: p.alive,
          },
          playerId
        );
        break;
      }

      case "finish": {
        const code = playerToRoom.get(playerId);
        if (!code) break;
        const room = rooms.get(code);
        if (!room || room.state !== "racing") break;
        const p = room.players.get(playerId);
        if (!p || p.finished) break;
        p.finished = true;
        p.finishTime = Date.now();
        p.distance = Number(msg.distance) || 0;
        const finished = Array.from(room.players.values()).filter((pl) => pl.finished);
        p.rank = finished.length;
        broadcast(room, {
          type: "player_finished",
          playerId,
          rank: p.rank,
          distance: p.distance,
        });

        // Check if all finished
        if (finished.length === room.players.size) {
          room.state = "results";
          const results = Array.from(room.players.values())
            .sort((a, b) => a.finishTime - b.finishTime || b.distance - a.distance)
            .map((pl, i) => ({ ...pl, rank: i + 1 }));
          broadcast(room, { type: "race_end", results });
          console.log(`[room] Race ended in ${code}, winner: ${results[0]?.name}`);
          // Auto-transition back to lobby after 10s
          setTimeout(() => {
            if (room.state === "results") {
              room.state = "lobby";
              for (const pl of room.players.values()) pl.ready = false;
              broadcast(room, { type: "room_update", room: roomToInfo(room) });
            }
          }, 10000);
        }
        break;
      }

      case "chat": {
        const code = playerToRoom.get(playerId);
        if (!code) break;
        const room = rooms.get(code);
        if (!room) break;
        const msgText = String(msg.msg || "").slice(0, 200);
        if (!msgText) break;
        broadcast(room, { type: "chat", playerName, msg: msgText });
        break;
      }

      case "request_state": {
        const code = playerToRoom.get(playerId);
        if (!code) break;
        const room = rooms.get(code);
        if (!room) break;
        sendTo(ws, { type: "room_update", room: roomToInfo(room) });
        break;
      }
    }
  });

  ws.on("close", () => {
    if (!playerId) return;
    const code = playerToRoom.get(playerId);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.players.delete(playerId);
    playerToRoom.delete(playerId);
    if (room.players.size === 0) {
      cleanupRoom(room);
    } else {
      if (room.host === playerId) {
        room.host = room.players.keys().next().value!;
      }
      broadcast(room, { type: "room_update", room: roomToInfo(room) });
      broadcast(room, { type: "chat", playerName: "📢", msg: `${playerName} disconnected` });
    }
  });

  ws.on("error", () => {});
});
