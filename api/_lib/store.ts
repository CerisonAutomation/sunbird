// Leaderboard storage for the Vercel Functions in this directory.
//
// Persistent when Vercel KV is configured (KV_REST_API_URL + KV_REST_API_TOKEN,
// the standard @vercel/kv env pair); otherwise an in-memory Map so the
// functions still run locally / in preview without any setup. The in-memory
// path is deliberately non-persistent and resets on cold start — it exists so
// `vercel dev` and plain previews work, not as a production store.
import { createClient } from "@vercel/kv";

export type BoardRow = {
  deviceId: string;
  name: string;
  skin: string;
  distance: number;
  altitude: number;
  perfects: number;
  coins: number;
  score: number;
  date: string;
};

const KEY_PREFIX = "sunbird:board:v1:";

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const kv =
  KV_URL && KV_TOKEN ? createClient({ url: KV_URL, token: KV_TOKEN }) : null;

/** True when scores are backed by Vercel KV (survive redeploys). */
export function isPersistent(): boolean {
  return kv !== null;
}

const mem = new Map<string, BoardRow>();

function keyOf(deviceId: string): string {
  return `${KEY_PREFIX}${deviceId}`;
}

export async function allRows(): Promise<BoardRow[]> {
  if (kv) {
    const keys = await kv.keys(`${KEY_PREFIX}*`);
    if (keys.length === 0) return [];
    const values = (await kv.mget(...keys)) as (BoardRow | null)[];
    return values.filter((v): v is BoardRow => v !== null);
  }
  return [...mem.values()];
}

export async function getRow(deviceId: string): Promise<BoardRow | null> {
  if (kv) {
    return (await kv.get<BoardRow>(keyOf(deviceId))) ?? null;
  }
  return mem.get(deviceId) ?? null;
}

export async function putRow(row: BoardRow): Promise<void> {
  if (kv) {
    await kv.set(keyOf(row.deviceId), row);
  } else {
    mem.set(row.deviceId, row);
  }
}
