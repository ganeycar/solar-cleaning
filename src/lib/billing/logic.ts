/**
 * Pure billing rules: no network, no database. Unit-tested.
 */

/** Bump when the Membership Terms page changes materially. Stored with each consent. */
export const MEMBERSHIP_TERMS_VERSION = 1;

export type BillingInterval = "one_time" | "month" | "year";

export interface CheckoutQuote {
  status: string;
  approvedPriceCents: number | null;
  panelCount: number;
}

export interface CheckoutPlan {
  kind: "one_time" | "subscription" | "commercial";
  isActive: boolean;
  maxPanelsIncluded: number | null;
}

export interface CheckoutPrice {
  interval: BillingInterval;
  amountCents: number | null;
  status: string;
  stripePriceId: string | null;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

function quoteReady(quote: CheckoutQuote): Eligibility {
  switch (quote.status) {
    case "quoted":
      return { ok: true };
    case "converted":
      return { ok: false, reason: "This quote has already been booked." };
    case "needs_review":
      return { ok: false, reason: "We're still reviewing your property. We'll confirm your price soon." };
    case "new":
      return { ok: false, reason: "We'll confirm your price soon." };
    case "waitlist":
      return { ok: false, reason: "Your area is on our waitlist. We'll contact you when we can serve you." };
    case "out_of_area":
      return { ok: false, reason: "This address is outside our service area." };
    default:
      return { ok: false, reason: "This quote is no longer available. Please request a new quote." };
  }
}

/** One-time cleaning: needs a confirmed (auto-priced or owner-approved) quote price. */
export function oneTimeEligibility(quote: CheckoutQuote): Eligibility {
  const ready = quoteReady(quote);
  if (!ready.ok) return ready;
  if (quote.approvedPriceCents == null || quote.approvedPriceCents <= 0) {
    return { ok: false, reason: "This quote doesn't have a confirmed price yet." };
  }
  return { ok: true };
}

/** Membership: needs a confirmed quote, a published plan price that's set up in Stripe, and a system within the plan's panel limit. */
export function membershipEligibility(quote: CheckoutQuote, plan: CheckoutPlan, price: CheckoutPrice | undefined): Eligibility {
  if (plan.kind !== "subscription" || !plan.isActive) return { ok: false, reason: "This plan isn't available." };
  const ready = quoteReady(quote);
  if (!ready.ok) return ready;
  if (!price || price.status !== "published" || price.amountCents == null) {
    return { ok: false, reason: "Pricing for this plan isn't available yet." };
  }
  if (!price.stripePriceId) return { ok: false, reason: "This plan isn't ready for online checkout yet." };
  if (plan.maxPanelsIncluded != null && quote.panelCount > plan.maxPanelsIncluded) {
    return { ok: false, reason: `This plan covers up to ${plan.maxPanelsIncluded} panels. Contact us about a custom membership.` };
  }
  return { ok: true };
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * The automatic-renewal disclosure shown next to the consent checkbox and on
 * Stripe's payment page, and stored with the subscription as proof of consent.
 * Kept under 500 characters so it fits in Stripe metadata.
 */
export function renewalDisclosure(planName: string, amountCents: number, interval: "month" | "year"): string {
  const period = interval === "month" ? "month" : "year";
  return (
    `Your ${planName} membership renews automatically and you will be charged ${money(amountCents)} every ${period} until you cancel. ` +
    `There is no minimum commitment. You can cancel anytime online from your account; cancellation takes effect at the end of the current billing ${period}.`
  );
}

export type KeyCheck = { ok: true; live: boolean } | { ok: false; reason: string };

/** Refuses live Stripe keys unless the owner has explicitly approved going live. */
export function checkStripeKey(key: string | undefined, liveApproved: boolean): KeyCheck {
  const k = key?.trim();
  if (!k) return { ok: false, reason: "Stripe isn't connected yet (STRIPE_SECRET_KEY is missing)." };
  if (/^(sk|rk)_test_/.test(k)) return { ok: true, live: false };
  if (/^(sk|rk)_live_/.test(k)) {
    return liveApproved
      ? { ok: true, live: true }
      : { ok: false, reason: "A live Stripe key is configured but live payments haven't been approved (STRIPE_LIVE_MODE_APPROVED is not true)." };
  }
  return { ok: false, reason: "STRIPE_SECRET_KEY doesn't look like a Stripe secret key." };
}

// ---------- Helpers for reading Stripe objects across API versions ----------
// Stripe moved some fields in 2025 (e.g. billing periods moved onto
// subscription items). These read the current location and fall back to the old one.

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function idOf(x: unknown): string | null {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && typeof (x as Loose).id === "string") return (x as Loose).id;
  return null;
}

export function unixToIso(n: unknown): string | null {
  return typeof n === "number" && Number.isFinite(n) ? new Date(n * 1000).toISOString() : null;
}

export function subscriptionPeriod(sub: Loose): { start: string | null; end: string | null } {
  const item = sub?.items?.data?.[0] ?? {};
  return {
    start: unixToIso(item.current_period_start ?? sub?.current_period_start),
    end: unixToIso(item.current_period_end ?? sub?.current_period_end),
  };
}

export function subscriptionPriceId(sub: Loose): string | null {
  return idOf(sub?.items?.data?.[0]?.price);
}

/** True when the subscription will end at the close of the current period. */
export function subscriptionEnding(sub: Loose): boolean {
  return Boolean(sub?.cancel_at_period_end) || sub?.cancel_at != null;
}

export function invoiceSubscriptionId(inv: Loose): string | null {
  return idOf(inv?.parent?.subscription_details?.subscription) ?? idOf(inv?.subscription);
}
