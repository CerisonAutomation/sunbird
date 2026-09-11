import { loadStripe } from "@stripe/stripe-js";
import { AD_DURATION, STRIPE_GOLD_LINK, STRIPE_PUBLISHABLE_KEY, STRIPE_RETURN_KEY, STRIPE_VIP_LINK } from "./constants";

export type Sku = "sunbird_gold" | "sunbird_vip";
export type PurchaseResult = { ok: true; receipt: string } | { ok: false; error: string };

const LINKS: Record<Sku, string> = {
  sunbird_gold: STRIPE_GOLD_LINK,
  sunbird_vip: STRIPE_VIP_LINK,
};

const RECEIPT_KEY = "sunbird.receipts";
let stripeReady: Promise<unknown> | null = null;

/** Loads Stripe.js once (used for key validation / future Embedded Checkout upgrades). */
export function ensureStripeJs(): Promise<unknown> | null {
  if (!STRIPE_PUBLISHABLE_KEY) return null;
  // Swallow network failures: portals/sandboxes block js.stripe.com and an
  // unhandled rejection here used to spray console errors at boot.
  if (!stripeReady) stripeReady = loadStripe(STRIPE_PUBLISHABLE_KEY).catch(() => null);
  return stripeReady;
}

export function stripeConfigured(sku: Sku): boolean {
  return Boolean(LINKS[sku]);
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
    if (v !== "gold" && v !== "vip") return null;
    params.delete(STRIPE_RETURN_KEY);
    const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", clean);
    return v === "gold" ? "sunbird_gold" : "sunbird_vip";
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
