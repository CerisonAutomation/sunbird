// The "/pure" entrypoint is load-bearing: the default "@stripe/stripe-js"
// module injects js.stripe.com AT IMPORT TIME as a side effect — which makes
// every portal build phone an external payment provider on boot. Instant
// portal rejection. /pure only loads when loadStripe() is actually called.
import { loadStripe } from "@stripe/stripe-js/pure";
import { AD_DURATION, STRIPE_GOLD_LINK, STRIPE_PUBLISHABLE_KEY, STRIPE_RETURN_KEY, STRIPE_STARTER_LINK, STRIPE_VIP_LINK } from "./constants";

export type Sku = "sunbird_gold" | "sunbird_vip" | "sunbird_starter";
export type PurchaseResult = { ok: true; receipt: string } | { ok: false; error: string };

const LINKS: Record<Sku, string> = {
  sunbird_gold: STRIPE_GOLD_LINK,
  sunbird_vip: STRIPE_VIP_LINK,
  sunbird_starter: STRIPE_STARTER_LINK,
};

const RECEIPT_KEY = "sunbird.receipts";
let stripeReady: Promise<unknown> | null = null;

/** Loads Stripe.js once (used for key validation / future Embedded Checkout upgrades). */
export function ensureStripeJs(): Promise<unknown> | null {
  if (!STRIPE_PUBLISHABLE_KEY) return null;
  // Never load a payment provider inside a portal iframe.
  if ((import.meta.env.VITE_PORTAL_TARGET ?? "none") !== "none") return null;
  // Swallow network failures: portals/sandboxes block js.stripe.com and an
  // unhandled rejection here used to spray console errors at boot.
  if (!stripeReady) stripeReady = loadStripe(STRIPE_PUBLISHABLE_KEY).catch(() => null);
  return stripeReady;
}

export function stripeConfigured(sku: Sku): boolean {
  return Boolean(LINKS[sku]);
}

/**
 * Server-verified entitlements (Stripe webhook → backend → here). Returns the
 * SKUs the backend has confirmed as PAID for this device, or [] when no
 * backend is configured / reachable. This outranks every local receipt.
 */
export async function fetchServerEntitlements(deviceId: string): Promise<Sku[]> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const base = (env.VITE_LEADERBOARD_URL ?? (env.DEV ? "/mp" : "")).replace(/\/$/, "");
  if (!base) return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${base}/entitlements?device=${encodeURIComponent(deviceId)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { entitlements?: { sku?: unknown }[] };
    const valid: Sku[] = ["sunbird_gold", "sunbird_vip", "sunbird_starter"];
    return (data.entitlements ?? [])
      .map((e) => e.sku)
      .filter((s): s is Sku => typeof s === "string" && (valid as string[]).includes(s));
  } catch {
    return [];
  }
}



/** Builds a real, hosted Stripe Payment Link URL — no backend required. */
export function stripeLinkFor(sku: Sku, clientRef: string): string | null {
  const base = LINKS[sku];
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("client_reference_id", clientRef);
  return url.toString();
}

/** Reads & clears a Stripe confirmation-page redirect marker, e.g. ?sunbird_stripe=gold */
export function consumeStripeReturn(): Sku | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(STRIPE_RETURN_KEY);
    if (v !== "gold" && v !== "vip" && v !== "starter") return null;
    params.delete(STRIPE_RETURN_KEY);
    const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", clean);
    return v === "gold" ? "sunbird_gold" : v === "starter" ? "sunbird_starter" : "sunbird_vip";
  } catch {
    return null;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Sandbox checkout used whenever a real Stripe Payment Link hasn't been
 * configured for a SKU (see .env.example). Fully wired end-to-end so the
 * store is always demoable, and swapped transparently for the real thing
 * the moment env vars are supplied.
 */
export class MockPaymentProvider {
  async purchase(sku: string): Promise<PurchaseResult> {
    await wait(1300);
    if (!navigator.onLine) {
      return { ok: false, error: "You appear to be offline. Try again when connected." };
    }
    const receipt = `demo_${sku}_${Date.now().toString(36)}`;
    this.remember(sku);
    return { ok: true, receipt };
  }

  async restore(): Promise<string[]> {
    await wait(500);
    return this.read();
  }

  confirmManual(sku: string): PurchaseResult {
    const receipt = `manual_${sku}_${Date.now().toString(36)}`;
    this.remember(sku);
    return { ok: true, receipt };
  }

  private remember(sku: string): void {
    const list = this.read();
    if (!list.includes(sku)) list.push(sku);
    try {
      localStorage.setItem(RECEIPT_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  private read(): string[] {
    try {
      const raw = localStorage.getItem(RECEIPT_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
}

export interface AdProvider {
  readonly duration: number;
  isAvailable(): boolean;
}

export class MockAdProvider implements AdProvider {
  readonly duration = AD_DURATION;

  isAvailable(): boolean {
    return true;
  }
}
