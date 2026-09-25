/**
 * Stripe webhook → server-owned entitlements.
 *
 * Closes the last audit gap (REPO_TRUTH_AUDIT #12: "Stripe entitlements are
 * not webhook-authoritative"). Flow:
 *
 *   1. Player opens a Stripe Payment Link; the client appends
 *      `client_reference_id=<deviceId>` (already shipped in Payments.ts).
 *   2. Stripe calls POST /stripe/webhook on checkout.session.completed.
 *      We verify the `Stripe-Signature` header (HMAC-SHA256 of
 *      `${t}.${rawBody}` with STRIPE_WEBHOOK_SECRET, 5-minute tolerance)
 *      — no Stripe SDK needed, Workers crypto.subtle is enough.
 *   3. The session's amount_total maps to a SKU (299→gold, 199→vip,
 *      99→starter — documented in DEPLOY.md) and is stored keyed by the
 *      deviceId from client_reference_id.
 *   4. The game calls GET /entitlements?device=… after payment and on
 *      restore; server-verified SKUs are granted with source
 *      "stripe_webhook". The local manual-confirm path survives only as a
 *      labelled fallback when no backend is configured.
 *
 * Honest scope: without STRIPE_WEBHOOK_SECRET set, the webhook rejects
 * everything (503) and the game behaves exactly as before.
 */

export type EntitlementEnv = { STRIPE_WEBHOOK_SECRET?: string };

const AMOUNT_TO_SKU: Record<number, string> = {
  299: "sunbird_gold",
  199: "sunbird_vip",
  99: "sunbird_starter",
};

const TOLERANCE_SECONDS = 300;

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish hex comparison (length leak is fine, contents are not). */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Parses `Stripe-Signature: t=1699999999,v1=abc…,v1=def…`. */
export function parseStripeSignature(header: string): { t: number; v1: string[] } {
  const out = { t: 0, v1: [] as string[] };
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k?.trim() === "t") out.t = Number(v) || 0;
    if (k?.trim() === "v1" && v) out.v1.push(v.trim());
  }
  return out;
}

export async function verifyStripeSignature(
  secret: string,
  header: string | null,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header) return false;
  const { t, v1 } = parseStripeSignature(header);
  if (!t || v1.length === 0) return false;
  if (Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1.some((sig) => hexEqual(sig, expected));
}

type CheckoutSession = {
  id?: string;
  client_reference_id?: string | null;
  amount_total?: number | null;
  payment_status?: string;
};

type StripeEvent = {
  type?: string;
  data?: { object?: CheckoutSession };
};

/** Maps a completed checkout session to (deviceId, sku), or null. */
export function entitlementFromEvent(evt: StripeEvent): { deviceId: string; sku: string; sessionId: string } | null {
  if (evt.type !== "checkout.session.completed") return null;
  const s = evt.data?.object;
  if (!s) return null;
  if (s.payment_status && s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return null;
  const deviceId = (s.client_reference_id ?? "").slice(0, 64);
  if (!deviceId) return null;
  const sku = AMOUNT_TO_SKU[s.amount_total ?? -1];
  if (!sku) return null;
  return { deviceId, sku, sessionId: (s.id ?? "").slice(0, 128) };
}
