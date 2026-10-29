import { getPublicClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { membershipEligibility, oneTimeEligibility, type BillingInterval, type CheckoutPlan, type CheckoutPrice, type CheckoutQuote, type Eligibility } from "./logic";

export interface CheckoutQuoteRow extends CheckoutQuote {
  id: string;
  addressLine1: string;
  city: string;
  cleaningRequest: string;
}

export interface MembershipOption {
  planId: string;
  planSlug: string;
  planName: string;
  summary: string;
  priceId: string;
  interval: "month" | "year";
  amountCents: number;
  stripePriceId: string;
  eligibility: Eligibility;
}

export interface CheckoutContext {
  userId: string;
  email: string;
  quote: CheckoutQuoteRow;
  oneTime: Eligibility;
  memberships: MembershipOption[];
  /** Membership plans that exist but can't be bought for this quote, with the reason. */
  unavailable: { planName: string; reason: string }[];
}

/**
 * Loads everything checkout needs. The quote is read as the signed-in customer,
 * so Row Level Security guarantees it's theirs. Plans and prices are read with
 * the public client, which only ever returns PUBLISHED prices.
 */
export async function loadCheckoutContext(quoteId: string): Promise<CheckoutContext | null> {
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return null;
  const session = await getCurrentUser();
  if (!session) return null;

  const { data: q } = await session.supabase
    .from("quote_requests")
    .select("id,status,approved_price_cents,panel_count,address_line1,city,cleaning_request")
    .eq("id", quoteId)
    .maybeSingle();
  if (!q) return null;

  const quote: CheckoutQuoteRow = {
    id: q.id,
    status: q.status,
    approvedPriceCents: q.approved_price_cents,
    panelCount: q.panel_count,
    addressLine1: q.address_line1,
    city: q.city,
    cleaningRequest: q.cleaning_request,
  };

  const db = getPublicClient();
  const { data: plans } = db
    ? await db
        .from("plans")
        .select("id,slug,name,kind,summary,is_active,max_panels_included,display_order,plan_prices(id,billing_interval,amount_cents,status,stripe_price_id)")
        .eq("kind", "subscription")
        .order("display_order")
    : { data: [] as never[] };

  const memberships: MembershipOption[] = [];
  const unavailable: CheckoutContext["unavailable"] = [];
  for (const p of plans ?? []) {
    const plan: CheckoutPlan = { kind: p.kind, isActive: p.is_active, maxPanelsIncluded: p.max_panels_included };
    const prices = (p.plan_prices ?? []) as Array<{ id: string; billing_interval: BillingInterval; amount_cents: number | null; status: string; stripe_price_id: string | null }>;
    let offered = false;
    for (const interval of ["month", "year"] as const) {
      const row = prices.find((x) => x.billing_interval === interval && x.status === "published");
      if (!row) continue;
      const price: CheckoutPrice = { interval, amountCents: row.amount_cents, status: row.status, stripePriceId: row.stripe_price_id };
      const eligibility = membershipEligibility(quote, plan, price);
      if (eligibility.ok && row.amount_cents != null && row.stripe_price_id) {
        memberships.push({ planId: p.id, planSlug: p.slug, planName: p.name, summary: p.summary ?? "", priceId: row.id, interval, amountCents: row.amount_cents, stripePriceId: row.stripe_price_id, eligibility });
        offered = true;
      } else if (!eligibility.ok && !offered) {
        unavailable.push({ planName: p.name, reason: eligibility.reason });
        offered = true; // one reason per plan is enough
      }
    }
  }

  return { userId: session.user.id, email: session.user.email ?? "", quote, oneTime: oneTimeEligibility(quote), memberships, unavailable };
}
