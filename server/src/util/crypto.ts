import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Token layout: `<kind>.<base64url(json payload)>.<hmac hex>`. */
export type SignedToken = {
  kind: string;
  payload: Record<string, unknown>;
  sig: string;
};

export function signToken(kind: string, secret: string, payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload));
  const sig = hmacSha256Hex(secret, `${kind}.${body}`);
  return `${kind}.${body}.${sig}`;
}

export function verifyToken(
  kind: string,
  secret: string,
  token: string,
  maxLifetimeMs: number,
  skewMs = 5 * 60_000,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [k, body, sig] = parts as [string, string, string];
  if (k !== kind) return null;
  const expected = hmacSha256Hex(secret, `${kind}.${body}`);
  if (!safeEqual(sig, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  const exp = typeof p.exp === "number" ? p.exp : null;
  const iat = typeof p.iat === "number" ? p.iat : null;
  const now = Date.now();
  // Expired (a little skew is tolerated for clock differences).
  if (exp !== null && now > exp + skewMs) return null;
  // A token that "lives" far longer than its kind allows has a tampered clock.
  if (exp !== null && iat !== null && exp - iat > maxLifetimeMs + skewMs) return null;
  return p;
}

/**
 * Constant-time comparison of the client-side score HMAC (the `sig` field of
 * LEADERBOARD_API.md v1.1) against the expected digest.
 */
export function hmacMatches(expectedHex: string, providedHex: string): boolean {
  if (expectedHex.length !== providedHex.length || providedHex.length === 0) return false;
  if (!/^[a-f0-9]+$/i.test(providedHex)) return false;
  return safeEqual(providedHex.toLowerCase(), expectedHex.toLowerCase());
}

/** Deterministic 16-hex-char fingerprint of a replay sample array + seed. */
export function replayHash(seed: string, samples: readonly (readonly number[])[]): string {
  const canonical = `${seed}\u0000${JSON.stringify(samples)}`;
  return sha256Hex(canonical).slice(0, 16);
}
