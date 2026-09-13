/**
 * Sunbird wire protocol v1 — TypeScript client side.
 *
 * Canonical limits, types, and message parsers. Values here are asserted
 * against `protocol/contract.json` by `protocol-contract.test.ts`; the Rust
 * mirror runs the same suite against the same contract file.
 */

export const PROTOCOL_VERSION = 1;
export const PROTOCOL_MIN_VERSION = 1;
export const MAX_JSON_PAYLOAD_BYTES = 8 * 1024;
export const ROOM_CODE_MAX = 5;
export const NAME_MAX = 14;
export const SEED_MAX = 64;
export const SKIN_MAX = 32;
export const IDEMPOTENCY_MAX = 80;
export const ERROR_MESSAGE_MAX = 256;
export const TOKEN_MIN = 16;
export const TOKEN_MAX = 512;

export type PilotPublic = {
  seatId: string;
  name: string;
  skin: string;
  finished: boolean;
  disconnected: boolean;
};

export type RoomPublic = {
  roomId: string;
  roomCode: string;
  capacity: number;
  hostSeatId: string;
  pilots: PilotPublic[];
};

export type SeatGrant = {
  seatId: string;
  reconnectToken: string;
};

export type SnapshotPilot = {
  seatId: string;
  x: number;
  y: number;
  rotation: number;
  distance: number;
  finished: boolean;
};

export type ServerSnapshot = {
  serverTime: string;
  tick: number;
  pilots: SnapshotPilot[];
};

export type ProtocolLimits = {
  version: number;
  maxJsonPayloadBytes: number;
  maxNameChars: number;
  maxRoomCodeChars: number;
  maxSeedChars: number;
  maxSkinChars: number;
  maxIdempotencyChars: number;
  maxErrorMessageChars: number;
  sessionMinTokenChars: number;
  sessionMaxTokenChars: number;
};

export type ServerError = {
  code: string;
  message?: string;
};

export type ClientMessage =
  | { type: "join"; version: number; intentId: string; seed: string; name: string; skin: string; roomCode?: string | null; reconnectToken?: string | null }
  | { type: "leave"; version: number }
  | { type: "ready"; version: number }
  | { type: "heartbeat"; version: number }
  | { type: "reconnect"; version: number; reconnectToken: string };

export type ServerMessage =
  | { type: "hello"; version: number; serverName: string; limits: ProtocolLimits }
  | { type: "welcome"; version: number; grant: SeatGrant; room: RoomPublic }
  | { type: "rosterUpdate"; version: number; room: RoomPublic }
  | { type: "started"; version: number; roomId: string; startAt: string; seed: string }
  | { type: "snapshot"; version: number; snapshot: ServerSnapshot }
  | { type: "error"; version: number; error: ServerError };

/**
 * Runtime variant tables. TypeScript types are erased at runtime, so without
 * these arrays there is nothing to compare against `protocol/contract.json` —
 * which is exactly how the Rust `ServerMessage::Snapshot` variant went missing
 * from this file unnoticed. `protocol-contract.test.ts` asserts these match the
 * contract, so a variant added on one side and not the other fails CI.
 */
export const CLIENT_MESSAGE_TYPES = ["join", "leave", "ready", "heartbeat", "reconnect"] as const;
export const SERVER_MESSAGE_TYPES = [
  "hello",
  "welcome",
  "rosterUpdate",
  "started",
  "snapshot",
  "error",
] as const;
export const SERVER_ERROR_CODES = [
  "unsupportedVersion",
  "invalidMessage",
  "payloadTooLarge",
  "rateLimited",
  "roomFull",
  "roomNotFound",
  "seatNotFound",
  "invalidReconnectToken",
  "rejected",
] as const;

/**
 * Server-authoritative movement envelope. The Rust room server rejects `state`
 * frames outside these bounds; the client mirrors them so a rejected frame is
 * diagnosable instead of looking like packet loss. Values are mirrored from
 * `protocol/contract.json` and pinned by `protocol-contract.test.ts`.
 *
 * Ceiling derivation: MAX_SPEED_FEVER (128) × wingboost speedMult (1.5)
 * + BOOST_EXTRA_SPEED (42) = 234 units/sec (`Bird.ts` / `PowerUps.ts`),
 * divided by the 15 Hz send rate and doubled for headroom.
 */
export const MOVEMENT_LIMITS = {
  tickHz: 15,
  maxSpeedUnitsPerSec: 234,
  speedHeadroomFactor: 2,
  /** Floor on the elapsed-time estimate so a fast sender is not over-penalised. */
  minSampleIntervalSec: 0.0167,
  /** Ceiling on it so a long reconnect gap cannot authorise an unlimited jump. */
  maxSampleIntervalSec: 2,
  maxStateDeltaXPerTick: 31,
  maxStateDeltaYPerTick: 31,
  maxCoordinateAbs: 1_000_000,
  maxAltitudeAbs: 100_000,
  maxRotationAbs: 12.5664,
  maxDistance: 500_000,
  distanceRegressionTolerance: 0.5,
  positionDecimalPlaces: 2,
  rotationDecimalPlaces: 2,
} as const;

export class ProtocolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function encodeClientMessage(msg: ClientMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function parseServerMessage(data: unknown, maxBytes?: number): ServerMessage {
  let obj: unknown;
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    if (maxBytes !== undefined && bytes.byteLength > maxBytes) {
      throw new ProtocolError("payload too large", "payloadTooLarge");
    }
    const text = new TextDecoder().decode(bytes);
    try {
      obj = JSON.parse(text);
    } catch {
      throw new ProtocolError("invalid JSON", "invalidMessage");
    }
  } else if (typeof data === "string") {
    try {
      obj = JSON.parse(data);
    } catch {
      throw new ProtocolError("invalid JSON", "invalidMessage");
    }
  } else {
    obj = data;
  }

  if (!isRecord(obj)) throw new ProtocolError("message is not an object", "invalidMessage");
  const type = requireString(obj.type, "type");
  const version = requireNumber(obj.version, "version");
  assertVersion(version);

  if (type === "hello") {
    return {
      type,
      version,
      serverName: requireString(obj.serverName, "serverName"),
      limits: parseLimits(obj.limits),
    };
  }
  if (type === "welcome") {
    return {
      type,
      version,
      grant: parseSeatGrant(obj.grant),
      room: parseRoomPublic(obj.room),
    };
  }
  if (type === "rosterUpdate") {
    return { type, version, room: parseRoomPublic(obj.room) };
  }
  if (type === "started") {
    return {
      type,
      version,
      roomId: requireString(obj.roomId, "roomId"),
      startAt: requireString(obj.startAt, "startAt"),
      seed: assertText(requireString(obj.seed, "seed"), SEED_MAX, "seed"),
    };
  }
  if (type === "snapshot") {
    return { type, version, snapshot: parseSnapshot(obj.snapshot) };
  }
  if (type === "error") {
    return { type, version, error: typedError(obj.error) };
  }
  throw new ProtocolError(`unknown server message type ${type}`, "invalidMessage");
}

function parseLimits(data: unknown): ProtocolLimits {
  if (!isRecord(data)) throw new ProtocolError("limits is not an object", "invalidMessage");
  return {
    version: requireNumber(data.version, "limits.version"),
    maxJsonPayloadBytes: requireNumber(data.maxJsonPayloadBytes, "limits.maxJsonPayloadBytes"),
    maxNameChars: requireNumber(data.maxNameChars, "limits.maxNameChars"),
    maxRoomCodeChars: requireNumber(data.maxRoomCodeChars, "limits.maxRoomCodeChars"),
    maxSeedChars: requireNumber(data.maxSeedChars, "limits.maxSeedChars"),
    maxSkinChars: requireNumber(data.maxSkinChars, "limits.maxSkinChars"),
    maxIdempotencyChars: requireNumber(data.maxIdempotencyChars, "limits.maxIdempotencyChars"),
    maxErrorMessageChars: requireNumber(data.maxErrorMessageChars, "limits.maxErrorMessageChars"),
    sessionMinTokenChars: requireNumber(data.sessionMinTokenChars, "limits.sessionMinTokenChars"),
    sessionMaxTokenChars: requireNumber(data.sessionMaxTokenChars, "limits.sessionMaxTokenChars"),
  };
}

function parseRoomPublic(data: unknown): RoomPublic {
  if (!isRecord(data)) throw new ProtocolError("room is not an object", "invalidMessage");
  return {
    roomId: requireString(data.roomId, "room.roomId"),
    roomCode: requireString(data.roomCode, "room.roomCode"),
    capacity: requireNumber(data.capacity, "room.capacity"),
    hostSeatId: requireString(data.hostSeatId, "room.hostSeatId"),
    pilots: Array.isArray(data.pilots) ? data.pilots.map((p) => parsePilotPublic(p)) : [],
  };
}

function parsePilotPublic(data: unknown): PilotPublic {
  if (!isRecord(data)) throw new ProtocolError("pilot is not an object", "invalidMessage");
  return {
    seatId: requireString(data.seatId, "pilot.seatId"),
    name: requireString(data.name, "pilot.name"),
    skin: requireString(data.skin, "pilot.skin"),
    finished: Boolean(data.finished),
    disconnected: Boolean(data.disconnected),
  };
}

function parseSeatGrant(data: unknown): SeatGrant {
  if (!isRecord(data)) throw new ProtocolError("grant is not an object", "invalidMessage");
  return {
    seatId: requireString(data.seatId, "grant.seatId"),
    reconnectToken: requireString(data.reconnectToken, "grant.reconnectToken"),
  };
}

function parseSnapshot(data: unknown): ServerSnapshot {
  if (!isRecord(data)) throw new ProtocolError("snapshot is not an object", "invalidMessage");
  return {
    serverTime: requireString(data.serverTime, "snapshot.serverTime"),
    tick: requireNumber(data.tick, "snapshot.tick"),
    pilots: Array.isArray(data.pilots) ? data.pilots.map((pilot) => parseSnapshotPilot(pilot)) : [],
  };
}

function parseSnapshotPilot(data: unknown): SnapshotPilot {
  if (!isRecord(data)) throw new ProtocolError("snapshot pilot is not an object", "invalidMessage");
  return {
    seatId: requireString(data.seatId, "pilot.seatId"),
    x: requireNumber(data.x, "pilot.x"),
    y: requireNumber(data.y, "pilot.y"),
    rotation: requireNumber(data.rotation, "pilot.rotation"),
    distance: requireNumber(data.distance, "pilot.distance"),
    finished: Boolean(data.finished),
  };
}

function typedError(data: unknown): ServerError {
  if (!isRecord(data)) throw new ProtocolError("error is not an object", "invalidMessage");
  return {
    code: requireString(data.code, "error.code"),
    message: typeof data.message === "string" ? data.message : undefined,
  };
}

function assertVersion(version: unknown): void {
  if (version !== PROTOCOL_VERSION) {
    throw new ProtocolError(`client cannot emit protocol version ${String(version)}`, "unsupportedVersion");
  }
}

function assertText(s: string, max: number, field: string): string {
  if (s.length > max) throw new ProtocolError(`${field} exceeds ${max} chars`, "payloadTooLarge");
  return s;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new ProtocolError(`${field} is not a string`, "invalidMessage");
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new ProtocolError(`${field} is not a number`, "invalidMessage");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
