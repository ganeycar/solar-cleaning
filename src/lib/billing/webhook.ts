import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyMembershipStarted, notifyOneTimePurchase, notifyPaymentFailed } from "@/lib/email/notify";
import { localDate } from "@/lib/scheduling/slots";
import { cleaningsEarned, membershipYear } from "./entitlements";
import { idOf, invoiceSubscriptionId, subscriptionEnding, subscriptionPeriod, subscriptionPriceId, unixToIso } from "./logic";

/**
 * Applies a VERIFIED Stripe event to the database. Every handler is idempotent
 * (keyed on Stripe ids), so replays and out-of-order delivery are safe.
 * `db` must be the service-role client.
 */

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function handleStripeEvent(stripe: Stripe, db: SupabaseClient, event: Stripe.Event): Promise<void> {
  const obj = event.data.object as unknown as Loose;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return onCheckoutCompleted(stripe, db, obj);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(stripe, db, obj.id);
      return;
    case "invoice.paid":
      return onInvoice(stripe, db, obj, "succeeded");
    case "invoice.payment_failed":
      return onInvoice(stripe, db, obj, "failed");
    case "charge.refunded":
      return onChargeRefunded(db, obj);
    default:
      return; // Not used by this app.
  }
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function profileIdForCustomer(db: SupabaseClient, stripeCustomerId: string | null, hint?: string | null): Promise<string | null> {
  if (hint) return hint;
  if (!stripeCustomerId) return null;
  const data = must(await db.from("profiles").select("id").eq("stripe_customer_id", stripeCustomerId).maybeSingle(), "profile lookup");
  return (data as Loose | null)?.id ?? null;
}

async function ensureProperty(db: SupabaseClient, quoteId: string): Promise<string> {
  return must(await db.rpc("ensure_property_for_quote", { p_quote_id: quoteId }), "ensure property") as string;
}

async function markQuoteConverted(db: SupabaseClient, quoteId: string) {
  must(await db.from("quote_requests").update({ status: "converted" }).eq("id", quoteId), "mark quote converted");
}

async function onCheckoutCompleted(stripe: Stripe, db: SupabaseClient, session: Loose) {
  const meta: Loose = session.metadata ?? {};
  const quoteId: string | undefined = meta.quote_id;
  if (!quoteId) return; // Not created by this app.

  if (session.mode === "payment") {
    if (session.payment_status !== "paid") return; // Wait for async_payment_succeeded.
    const paymentIntentId = idOf(session.payment_intent);
    const customerId = await profileIdForCustomer(db, idOf(session.customer), meta.profile_id);
    if (!paymentIntentId || !customerId) throw new Error("Paid checkout is missing payment intent or customer.");

    await ensureProperty(db, quoteId);
    must(
      await db.from("payments").upsert(
        { customer_id: customerId, stripe_payment_intent_id: paymentIntentId, amount_cents: session.amount_total ?? 0, currency: session.currency ?? "usd", status: "succeeded", description: "One-time cleaning" },
        { onConflict: "stripe_payment_intent_id" },
      ),
      "record payment",
    );

    // One paid cleaning, usable for 12 months. Issued once per payment.
    const today = new Date();
    const until = new Date(today);
    until.setFullYear(until.getFullYear() + 1);
    must(
      await db.from("service_entitlements").upsert(
        { customer_id: customerId, source: "one_time_purchase", status: "available", valid_from: today.toISOString().slice(0, 10), valid_until: until.toISOString().slice(0, 10), source_ref: paymentIntentId, note: `Paid one-time cleaning (quote ${quoteId.slice(0, 8).toUpperCase()})` },
        { onConflict: "source_ref", ignoreDuplicates: true },
      ),
      "issue cleaning",
    );
    await markQuoteConverted(db, quoteId);
    await notifyOneTimePurchase(db, { customerId, paymentIntentId, amountCents: session.amount_total ?? 0, validUntil: until.toISOString().slice(0, 10) });
    return;
  }

  if (session.mode === "subscription") {
    const subId = idOf(session.subscription);
    if (!subId) throw new Error("Subscription checkout has no subscription id.");
    const synced = await syncSubscription(stripe, db, subId);
    await markQuoteConverted(db, quoteId);
    // California automatic renewal law: written acknowledgment of the terms.
    if (synced) await notifyMembershipStarted(db, synced.id);
  }
}

/** Fetches the latest subscription from Stripe (avoids applying stale, out-of-order events) and upserts it. */
export async function syncSubscription(stripe: Stripe, db: SupabaseClient, subscriptionId: string): Promise<{ id: string; periodStart: string | null } | null> {
  const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as unknown as Loose;
  const meta: Loose = sub.metadata ?? {};
  if (!meta.quote_id) return null; // Not created by this app.

  const stripePriceId = subscriptionPriceId(sub);
  const price = must(await db.from("plan_prices").select("id, plan_id").eq("stripe_price_id", stripePriceId ?? "").maybeSingle(), "price lookup") as Loose | null;
  if (!price) throw new Error(`Stripe price ${stripePriceId} doesn't match any plan price.`);

  const customerId = await profileIdForCustomer(db, idOf(sub.customer), meta.profile_id);
  if (!customerId) throw new Error("Subscription customer not found.");
  const propertyId = await ensureProperty(db, meta.quote_id);
  const period = subscriptionPeriod(sub);
  const termsVersion = Number(meta.terms_version);

  const row = must(
    await db
      .from("subscriptions")
      .upsert(
        {
          stripe_subscription_id: sub.id,
          stripe_customer_id: idOf(sub.customer),
          customer_id: customerId,
          property_id: propertyId,
          quote_request_id: meta.quote_id,
          plan_id: price.plan_id,
          plan_price_id: price.id,
          status: sub.status,
          current_period_start: period.start,
          current_period_end: period.end,
          cancel_at_period_end: subscriptionEnding(sub),
          canceled_at: unixToIso(sub.canceled_at ?? sub.ended_at),
          started_at: unixToIso(sub.start_date) ?? period.start,
          auto_renew_consent_at: meta.consent_at || null,
          consent_terms_version: Number.isFinite(termsVersion) ? termsVersion : null,
          consent_disclosure: meta.disclosure || null,
        },
        { onConflict: "stripe_subscription_id" },
      )
      .select("id")
      .single(),
    "save subscription",
  ) as Loose;
  return { id: row.id, periodStart: period.start };
}

const TZ = "America/Los_Angeles";

/**
 * Issues the cleanings a member has earned so far this membership year
 * (spread through the year for monthly billing; all at once for annual).
 * Each cleaning has a unique reference, so re-running never duplicates.
 */
async function issueMembershipCleanings(db: SupabaseClient, subscriptionRowId: string, stripeSubId: string, periodStart: string) {
  const sub = must(
    await db.from("subscriptions").select("customer_id, started_at, plans(name, cleanings_per_year), plan_prices(billing_interval)").eq("id", subscriptionRowId).single(),
    "load subscription for cleanings",
  ) as Loose;
  const plan = (Array.isArray(sub.plans) ? sub.plans[0] : sub.plans) as Loose | null;
  const price = (Array.isArray(sub.plan_prices) ? sub.plan_prices[0] : sub.plan_prices) as Loose | null;
  if (!plan || !price || !sub.started_at) return;

  const year = membershipYear(sub.started_at, periodStart);
  const earned = cleaningsEarned(plan.cleanings_per_year, price.billing_interval, year.monthInYear);
  if (earned === 0) return;

  const validFrom = localDate(new Date(year.yearStart), TZ);
  const validUntil = localDate(new Date(new Date(year.yearEnd).getTime() - 24 * 3600_000), TZ);
  const rows = Array.from({ length: earned }, (_, i) => ({
    customer_id: sub.customer_id,
    subscription_id: subscriptionRowId,
    source: "plan",
    status: "available",
    valid_from: validFrom,
    valid_until: validUntil,
    source_ref: `${stripeSubId}:y${year.yearIndex}:c${i + 1}`,
    note: `${plan.name}: cleaning ${i + 1} of membership year ${year.yearIndex + 1}`,
  }));
  must(await db.from("service_entitlements").upsert(rows, { onConflict: "source_ref", ignoreDuplicates: true }), "issue membership cleanings");
}

async function invoicePaymentIntentId(stripe: Stripe, invoiceId: string, inv: Loose): Promise<string | null> {
  const direct = idOf(inv.payment_intent);
  if (direct) return direct;
  try {
    // Current API: payments are listed separately from the invoice.
    const list = await (stripe as unknown as Loose).invoicePayments?.list({ invoice: invoiceId, limit: 1 });
    return idOf(list?.data?.[0]?.payment?.payment_intent);
  } catch {
    return null;
  }
}

async function onInvoice(stripe: Stripe, db: SupabaseClient, inv: Loose, status: "succeeded" | "failed") {
  const subId = invoiceSubscriptionId(inv);
  let subscriptionRowId: string | null = null;
  let customerId: string | null = null;

  let periodStart: string | null = null;
  if (subId) {
    const synced = await syncSubscription(stripe, db, subId);
    if (!synced) return; // Not one of ours.
    subscriptionRowId = synced.id;
    // Prefer the invoice's own billing period (correct even if the event arrives late).
    periodStart = unixToIso(inv.lines?.data?.[0]?.period?.start) ?? synced.periodStart;
    const sub = must(await db.from("subscriptions").select("customer_id").eq("id", subscriptionRowId).single(), "subscription lookup") as Loose;
    customerId = sub.customer_id;
  } else {
    return; // One-time payments are recorded from checkout.session.completed.
  }

  const amount = status === "succeeded" ? inv.amount_paid : inv.amount_due;
  // $0 invoices (e.g. fully discounted) aren't recorded as payments, but still earn cleanings below.
  if (amount) must(
    await db.from("payments").upsert(
      {
        customer_id: customerId,
        subscription_id: subscriptionRowId,
        stripe_invoice_id: inv.id,
        stripe_payment_intent_id: status === "succeeded" ? await invoicePaymentIntentId(stripe, inv.id, inv) : null,
        amount_cents: amount,
        currency: inv.currency ?? "usd",
        status,
        description: "Membership payment",
      },
      { onConflict: "stripe_invoice_id" },
    ),
    "record invoice payment",
  );

  if (status === "failed" && amount && subscriptionRowId && customerId) {
    await notifyPaymentFailed(db, { invoiceId: inv.id, subscriptionRowId, customerId, amountCents: amount });
  }

  // Paying for a period earns cleanings; a failed payment never does.
  if (status === "succeeded" && subscriptionRowId && subId && periodStart) {
    await issueMembershipCleanings(db, subscriptionRowId, subId, periodStart);
  }
}

async function onChargeRefunded(db: SupabaseClient, charge: Loose) {
  const paymentIntentId = idOf(charge.payment_intent);
  const refunded: number = charge.amount_refunded ?? 0;
  const status = refunded >= (charge.amount ?? 0) ? "refunded" : "partially_refunded";

  let query = db.from("payments").update({ refunded_cents: refunded, status, stripe_charge_id: charge.id });
  query = paymentIntentId ? query.eq("stripe_payment_intent_id", paymentIntentId) : query.eq("stripe_charge_id", charge.id);
  const updated = must(await query.select("id"), "record refund") as Loose[];
  if (!updated?.length) console.warn(`Refund for charge ${charge.id} didn't match a recorded payment.`);
}
