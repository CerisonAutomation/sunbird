/**
 * Sunbird Multiplayer Relay Server
 * 
 * Minimal WebSocket server for online multiplayer rooms.
 * Handles room creation, joining, position sync, and race management.
 * 
 * Usage:
 *   npx tsx server/index.ts
 *   or
 *   node --import tsx server/index.ts
 * 
 * Default port: 3001 (set PORT env var to change)
 */

import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const MAX_PLAYERS_PER_ROOM = 30;
const SYNC_INTERVAL_MS = 50; // 20Hz sync
const COUNTDOWN_SECONDS = 3;

type Player = {
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
  ws: WebSocket;
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
  countdownTimer: ReturnType<typeof setInterval> | null;
  finishDistance: number;
};

const rooms = new Map<string, Room>();
const playerRooms = new Map<WebSocket, string>(); // ws -> roomCode

const PLAYER_COLORS = [
  0xff7a45, 0x4a9eff, 0x44dd88, 0xff44aa, 0xffaa22,
  0xaa66ff, 0x44ddff, 0xff6644, 0x88ff44, 0xff44ff,
  0x44aaff, 0xffaa88, 0x88ffaa, 0xaa88ff, 0xff88aa,
];

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateSeed(): string {
  return `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function broadcastRoom(room: Room): void {
  const playerList = Array.from(room.players.values()).map(p => ({
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
  }));

  const msg = JSON.stringify({
    type: "room_update",
    room: {
      code: room.code,
      host: room.host,
      mode: room.mode,
      state: room.state,
      players: playerList,
      maxPlayers: room.maxPlayers,
      seed: room.seed,
      countdown: room.countdown,
    },
  });

  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(msg);
    }
  }
}

function broadcastCountdown(room: Room): void {
  const msg = JSON.stringify({ type: "countdown", count: room.countdown });
  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(msg);
    }
  }
}

function broadcastResults(room: Room): void {
  const results = Array.from(room.players.values())
    .sort((a, b) => a.rank - b.rank)
    .map(p => ({
      id: p.id,
      name: p.name,
      distance: p.distance,
      score: Math.round(p.distance),
      finished: p.finished,
      finishTime: p.finishTime,
      rank: p.rank,
    }));

  const msg = JSON.stringify({ type: "race_end", results });
  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(msg);
    }
  }
}

function startCountdown(room: Room): void {
  if (room.countdownTimer) return;
  room.state = "countdown";
  room.countdown = COUNTDOWN_SECONDS;
  broadcastRoom(room);
  broadcastCountdown(room);

  room.countdownTimer = setInterval(() => {
    room.countdown--;
    if (room.countdown <= 0) {
      clearInterval(room.countdownTimer!);
      room.countdownTimer = null;
      room.state = "racing";
      broadcastRoom(room);
    } else {
      broadcastCountdown(room);
    }
  }, 1000);
}

function checkRaceEnd(room: Room): void {
  if (room.state !== "racing") return;
  const allFinished = Array.from(room.players.values()).every(p => p.finished || !p.alive);
  if (allFinished || room.players.size === 0) {
    // Assign ranks to unfinished players
    let rank = room.players.size;
    for (const player of room.players.values()) {
      if (!player.finished) {
        player.rank = rank--;
      }
    }
    room.state = "results";
    broadcastResults(room);
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws: WebSocket) => {
  let playerId = "";
  let playerName = "Player";

  ws.on("message", (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case "auth": {
          playerId = msg.playerId ?? Math.random().toString(36).slice(2, 10);
          playerName = (msg.playerName ?? "Player").slice(0, 16);
          ws.send(JSON.stringify({ type: "auth_ok", playerId }));
          break;
        }

        case "create_room": {
          const code = msg.roomId ?? generateRoomCode();
          if (rooms.has(code)) {
            ws.send(JSON.stringify({ type: "error", msg: "Room already exists" }));
            break;
          }
          const room: Room = {
            code,
            host: playerId,
            mode: msg.mode ?? "race",
            state: "lobby",
            players: new Map(),
            maxPlayers: Math.min(msg.maxPlayers ?? MAX_PLAYERS_PER_ROOM, MAX_PLAYERS_PER_ROOM),
            seed: generateSeed(),
            countdown: 0,
            countdownTimer: null,
            finishDistance: 3000,
          };
          const colorIdx = 0;
          room.players.set(playerId, {
            id: playerId,
            name: playerName,
            ready: true,
            color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
            x: 50, y: 30, vx: 11, vy: 0,
            distance: 0, alive: true, finished: false,
            finishTime: 0, rank: 0, ws,
          });
          rooms.set(code, room);
          playerRooms.set(ws, code);
          broadcastRoom(room);
          break;
        }

        case "join_room": {
          const code = (msg.roomId ?? "").toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            ws.send(JSON.stringify({ type: "error", msg: "Room not found" }));
            break;
          }
          if (room.players.size >= room.maxPlayers) {
            ws.send(JSON.stringify({ type: "error", msg: "Room is full" }));
            break;
          }
          if (room.state !== "lobby") {
            ws.send(JSON.stringify({ type: "error", msg: "Race already in progress" }));
            break;
          }
          const colorIdx = room.players.size;
          room.players.set(playerId, {
            id: playerId,
            name: playerName,
            ready: false,
            color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
            x: 50, y: 30, vx: 11, vy: 0,
            distance: 0, alive: true, finished: false,
            finishTime: 0, rank: 0, ws,
          });
          playerRooms.set(ws, code);
          broadcastRoom(room);
          break;
        }

        case "ready": {
          const code = playerRooms.get(ws);
          const room = code ? rooms.get(code) : null;
          if (!room) break;
          const player = room.players.get(playerId);
          if (player) {
            player.ready = msg.ready ?? true;
            broadcastRoom(room);
            // Auto-start if all ready and 2+ players
            const allReady = Array.from(room.players.values()).every(p => p.ready);
            if (allReady && room.players.size >= 2 && room.state === "lobby") {
              startCountdown(room);
            }
          }
          break;
        }

        case "start_race": {
          // Host-only manual start (the Start Race button). Works even solo.
          const code = playerRooms.get(ws);
          const room = code ? rooms.get(code) : null;
          if (!room) break;
          if (room.host !== playerId) {
            ws.send(JSON.stringify({ type: "error", msg: "Only the host can start the race" }));
            break;
          }
          if (room.state !== "lobby") break;
          room.seed = generateSeed();
          for (const p of room.players.values()) p.ready = true;
          startCountdown(room);
          break;
        }

        case "player_sync": {
          const code = playerRooms.get(ws);
          const room = code ? rooms.get(code) : null;
          if (!room || room.state !== "racing") break;
          const player = room.players.get(playerId);
          if (player) {
            player.x = msg.x ?? player.x;
            player.y = msg.y ?? player.y;
            player.vx = msg.vx ?? player.vx;
            player.vy = msg.vy ?? player.vy;
            player.distance = msg.distance ?? player.distance;
            player.alive = msg.alive ?? player.alive;
            // Broadcast to all other players
            const syncMsg = JSON.stringify({
              type: "player_sync",
              player: {
                id: playerId,
                name: player.name,
                x: player.x,
                y: player.y,
                vx: player.vx,
                vy: player.vy,
                distance: player.distance,
                alive: player.alive,
              },
            });
            for (const p of room.players.values()) {
              if (p.id !== playerId && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(syncMsg);
              }
            }
          }
          break;
        }

        case "finish_race": {
          const code = playerRooms.get(ws);
          const room = code ? rooms.get(code) : null;
          if (!room || room.state !== "racing") break;
          const player = room.players.get(playerId);
          if (player && !player.finished) {
            player.finished = true;
            player.finishTime = Date.now();
            player.distance = msg.distance ?? player.distance;
            // Assign rank
            const finished = Array.from(room.players.values()).filter(p => p.finished);
            player.rank = finished.length;
            checkRaceEnd(room);
          }
          break;
        }

        case "chat": {
          const code = playerRooms.get(ws);
          const room = code ? rooms.get(code) : null;
          if (!room) break;
          const chatMsg = JSON.stringify({
            type: "chat",
            playerName,
            msg: (msg.msg ?? "").slice(0, 200),
          });
          for (const p of room.players.values()) {
            if (p.ws.readyState === WebSocket.OPEN) {
              p.ws.send(chatMsg);
            }
          }
          break;
        }

        case "leave_room": {
          const code = playerRooms.get(ws);
          const room = code ? rooms.get(code) : null;
          if (room) {
            room.players.delete(playerId);
            playerRooms.delete(ws);
            if (room.players.size === 0) {
              if (room.countdownTimer) clearInterval(room.countdownTimer);
              rooms.delete(code);
            } else {
              // Transfer host if needed
              if (room.host === playerId) {
                room.host = room.players.keys().next().value!;
              }
              broadcastRoom(room);
            }
          }
          break;
        }
      }
    } catch (e) {
      console.error("Message parse error:", e);
    }
  });

  ws.on("close", () => {
    const code = playerRooms.get(ws);
    const room = code ? rooms.get(code) : null;
    if (room) {
      room.players.delete(playerId);
      playerRooms.delete(ws);
      if (room.players.size === 0) {
        if (room.countdownTimer) clearInterval(room.countdownTimer);
        rooms.delete(code);
      } else {
        if (room.host === playerId) {
          room.host = room.players.keys().next().value!;
        }
        broadcastRoom(room);
      }
    }
  });
});

console.log(`🐦 Sunbird Multiplayer Relay running on ws://localhost:${PORT}`);
console.log(`   Rooms: ${rooms.size}, Players: ${playerRooms.size}`);
