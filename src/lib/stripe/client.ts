import Stripe from "stripe";
import { checkStripeKey } from "@/lib/billing/logic";

if (typeof window !== "undefined") {
  throw new Error("src/lib/stripe/client.ts must only be imported on the server.");
}

let cached: { key: string; client: Stripe } | null = null;

/**
 * Returns a Stripe client, or an explanation of why payments are unavailable.
 * Live keys are refused unless STRIPE_LIVE_MODE_APPROVED=true.
 */
export function getStripe(): { ok: true; stripe: Stripe; live: boolean } | { ok: false; reason: string } {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const check = checkStripeKey(key, process.env.STRIPE_LIVE_MODE_APPROVED === "true");
  if (!check.ok) return check;
  if (!cached || cached.key !== key) {
    // No apiVersion: the SDK uses the API version it was built and typed for.
    cached = { key: key!, client: new Stripe(key!, { appInfo: { name: "solar-cleaning-platform" } }) };
  }
  return { ok: true, stripe: cached.client, live: check.live };
}

/** True when a Stripe error means the object doesn't exist (e.g. created in the other mode). */
export function isMissing(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404;
}
