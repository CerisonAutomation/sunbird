/**
 * Minimal dependency-free HTTP helpers for the REST API. Everything the
 * services need: JSON parsing with a hard size cap, CORS, and a typed
 * error envelope that maps cleanly onto HTTP status codes.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export type ApiErrorBody = { error: string; code?: string; retryAfterMs?: number };

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-moderator-key,x-client-build",
    "access-control-max-age": "86400",
  };
}

/** Reads and JSON-parses a request body, enforcing a hard byte cap. */
export async function readJson<T = Record<string, unknown>>(req: IncomingMessage, maxBytes = 16_384): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      req.destroy();
      throw new HttpError(413, "payload too large", "payloadTooLarge");
    }
    chunks.push(buf);
  }
  if (total === 0) return {} as T;
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "invalid json body", "invalidJson");
  }
}

export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(raw),
    "cache-control": "no-store",
  });
  res.end(raw);
}

export function writeError(res: ServerResponse, err: unknown): void {
  if (err instanceof HttpError) {
    const body: ApiErrorBody = { error: err.message, code: err.code };
    if (err.retryAfterMs !== undefined) body.retryAfterMs = err.retryAfterMs;
    writeJson(res, err.status, body);
    return;
  }
  // Never leak internals; the caller logs before forwarding.
  writeJson(res, 500, { error: "internal server error", code: "internal" });
}

export function query(req: IncomingMessage): { path: string; params: URLSearchParams } {
  const url = new URL(req.url ?? "/", "http://internal");
  return { path: url.pathname, params: url.searchParams };
}

/** Sanitizes a free-text field: strips control chars and caps length. */
export function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>&"]/g, "")
    .slice(0, max)
    .trim();
}

/** Bounded, non-negative finite number with a cap. */
export function boundedNum(value: unknown, cap: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, cap);
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function clientAddress(req: IncomingMessage): string {
  return (
    req.socket.remoteAddress ??
    "unknown"
  );
}
