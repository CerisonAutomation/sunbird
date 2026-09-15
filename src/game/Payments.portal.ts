/** Portal payment adapter.
 *
 * Portal editions use an in-game coin economy and rewarded flights. Keeping a
 * separate build-time adapter means payment-provider code and URLs never ship
 * in Poki/CrazyGames bundles at all.
 */
export type Sku = "sunbird_gold" | "sunbird_vip" | "sunbird_starter";
export type PurchaseResult = { ok: true; receipt: string } | { ok: false; error: string };

export function ensureStripeJs(): Promise<unknown> | null {
  return null;
}

export function stripeConfigured(_sku: Sku): boolean {
  return false;
}

export async function fetchServerEntitlements(_deviceId: string): Promise<Sku[]> {
  return [];
}

export function stripeLinkFor(_sku: Sku, _clientRef: string): string | null {
  return null;
}

export function consumeStripeReturn(): Sku | null {
  return null;
}

export class MockPaymentProvider {
  async purchase(_sku: string): Promise<PurchaseResult> {
    return { ok: false, error: "Portal purchases use coins earned in flight." };
  }

  async restore(): Promise<string[]> {
    return [];
  }

  confirmManual(_sku: string): PurchaseResult {
    return { ok: false, error: "Portal purchases use coins earned in flight." };
  }
}

export class MockAdProvider {
  readonly duration = 4;

  isAvailable(): boolean {
    return true;
  }
}
