"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { getSiteSettings, siteUrl } from "@/lib/site";
import { getStripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customers";
import { ensurePortalConfiguration } from "@/lib/stripe/portal";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadCheckoutContext } from "./checkout-data";
import { MEMBERSHIP_TERMS_VERSION, renewalDisclosure } from "./logic";

function back(quoteId: string, error: string): never {
  redirect(`/checkout/${quoteId}?error=${encodeURIComponent(error)}`);
}

type CustomerResult = { error: "payments-unavailable" | "account" } | { stripe: Stripe; customerId: string };

async function stripeCustomerFor(userId: string, email: string): Promise<CustomerResult> {
  const stripeRes = getStripe();
  const admin = getAdminClient();
  if (!stripeRes.ok || !admin) return { error: "payments-unavailable" };
  const { data: profile } = await admin.from("profiles").select("id,email,first_name,last_name,phone,stripe_customer_id").eq("id", userId).single();
  if (!profile) return { error: "account" };
  const customerId = await getOrCreateStripeCustomer(stripeRes.stripe, admin, profile, email);
  return { stripe: stripeRes.stripe, customerId };
}

/** Starts Stripe Checkout for a one-time cleaning at the quote's confirmed price. */
export async function startOneTimeCheckout(quoteId: string): Promise<void> {
  const ctx = await loadCheckoutContext(quoteId);
  if (!ctx) redirect("/login");
  if (!ctx.oneTime.ok) back(quoteId, "not-eligible");

  let url: string | null = null;
  try {
    const s = await stripeCustomerFor(ctx.userId, ctx.email);
    if ("error" in s) back(quoteId, s.error);
    const metadata = { quote_id: ctx.quote.id, profile_id: ctx.userId, kind: "one_time" };
    const session = await s.stripe.checkout.sessions.create({
      mode: "payment",
      customer: s.customerId,
      client_reference_id: ctx.quote.id,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ctx.quote.approvedPriceCents!,
            product_data: { name: "Solar panel cleaning", description: `${ctx.quote.addressLine1}, ${ctx.quote.city} · ${ctx.quote.panelCount} panels` },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata, description: `Solar panel cleaning, quote ${ctx.quote.id.slice(0, 8).toUpperCase()}` },
      success_url: `${siteUrl()}/dashboard?checkout=success`,
      cancel_url: `${siteUrl()}/checkout/${ctx.quote.id}?canceled=1`,
    });
    url = session.url;
  } catch (err) {
    if (isRedirect(err)) throw err;
    console.error("one-time checkout failed", (err as Error).message);
  }
  if (!url) back(quoteId, "stripe");
  redirect(url);
}

/** Starts Stripe Checkout for a membership. Requires the customer's express consent to automatic renewal. */
export async function startMembershipCheckout(quoteId: string, form: FormData): Promise<void> {
  const ctx = await loadCheckoutContext(quoteId);
  if (!ctx) redirect("/login");

  const priceId = String(form.get("priceId") ?? "");
  const option = ctx.memberships.find((m) => m.priceId === priceId);
  if (!option) back(quoteId, "choose-plan");
  if (form.get("consent") !== "on") back(quoteId, "consent");

  const disclosure = renewalDisclosure(option.planName, option.amountCents, option.interval);
  const metadata = {
    quote_id: ctx.quote.id,
    profile_id: ctx.userId,
    kind: "membership",
    plan_price_id: option.priceId,
    consent_at: new Date().toISOString(),
    terms_version: String(MEMBERSHIP_TERMS_VERSION),
    disclosure,
  };

  let url: string | null = null;
  try {
    const s = await stripeCustomerFor(ctx.userId, ctx.email);
    if ("error" in s) back(quoteId, s.error);
    const session = await s.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: s.customerId,
      client_reference_id: ctx.quote.id,
      payment_method_types: ["card"],
      line_items: [{ price: option.stripePriceId, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      // Repeats the renewal terms right next to Stripe's pay button.
      custom_text: { submit: { message: disclosure } },
      success_url: `${siteUrl()}/dashboard?checkout=success`,
      cancel_url: `${siteUrl()}/checkout/${ctx.quote.id}?canceled=1`,
    });
    url = session.url;
  } catch (err) {
    if (isRedirect(err)) throw err;
    console.error("membership checkout failed", (err as Error).message);
  }
  if (!url) back(quoteId, "stripe");
  redirect(url);
}

/** Opens Stripe's billing portal: update card, view invoices, switch plans, cancel online. */
export async function openBillingPortal(): Promise<void> {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  let url: string | null = null;
  try {
    const stripeRes = getStripe();
    const admin = getAdminClient();
    if (!stripeRes.ok || !admin) redirect("/dashboard?billing=unavailable");
    const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", session.user.id).single();
    if (!profile?.stripe_customer_id) redirect("/dashboard?billing=none");
    const settings = await getSiteSettings();
    const configuration = await ensurePortalConfiguration(stripeRes.stripe, admin, settings.businessName);
    const portal = await stripeRes.stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      configuration,
      return_url: `${siteUrl()}/dashboard`,
    });
    url = portal.url;
  } catch (err) {
    if (isRedirect(err)) throw err;
    console.error("billing portal failed", (err as Error).message);
  }
  if (!url) redirect("/dashboard?billing=error");
  redirect(url);
}

function isRedirect(err: unknown): boolean {
  return typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}
