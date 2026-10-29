import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Derived from the SDK method itself, so it stays correct across SDK versions.
type PortalFeatures = NonNullable<NonNullable<Parameters<Stripe["billingPortal"]["configurations"]["create"]>[0]>["features"]>;

/**
 * Keeps a Stripe Customer Portal configuration in sync with the published
 * membership prices, so the owner never has to configure the portal by hand.
 *
 * Members can: update their card, see invoices, switch between published
 * membership plans, and cancel online (California requires online cancellation
 * when the customer signed up online). Cancellation takes effect at the end of
 * the current billing period, matching the Membership Terms.
 */
export async function ensurePortalConfiguration(stripe: Stripe, admin: SupabaseClient, businessName: string): Promise<string> {
  const { data: rows, error } = await admin
    .from("plan_prices")
    .select("stripe_price_id, plans!inner(stripe_product_id, kind, is_active)")
    .eq("status", "published")
    .not("stripe_price_id", "is", null);
  if (error) throw new Error(`Could not load membership prices: ${error.message}`);

  const byProduct = new Map<string, string[]>();
  for (const r of (rows ?? []) as Array<{ stripe_price_id: string; plans: { stripe_product_id: string | null; kind: string; is_active: boolean } }>) {
    const plan = Array.isArray(r.plans) ? r.plans[0] : r.plans;
    if (!plan || plan.kind !== "subscription" || !plan.is_active || !plan.stripe_product_id) continue;
    byProduct.set(plan.stripe_product_id, [...(byProduct.get(plan.stripe_product_id) ?? []), r.stripe_price_id]);
  }
  const products = [...byProduct.entries()].map(([product, prices]) => ({ product, prices }));

  const features: PortalFeatures = {
    customer_update: { enabled: false },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
      cancellation_reason: {
        enabled: true,
        options: ["too_expensive", "unused", "switched_service", "customer_service", "low_quality", "other"],
      },
    },
    subscription_update:
      products.length > 0
        ? { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products }
        : { enabled: false },
  };
  const businessProfile = { headline: `${businessName} membership and billing` };

  const { data: settings } = await admin.from("business_settings").select("stripe_portal_config_id").eq("id", 1).maybeSingle();
  const existingId: string | null = settings?.stripe_portal_config_id ?? null;

  if (existingId) {
    try {
      await stripe.billingPortal.configurations.update(existingId, { features, business_profile: businessProfile });
      return existingId;
    } catch (err) {
      // Stored id is from the other mode or was removed: create a fresh one below.
      console.warn("portal configuration update failed; creating a new one", (err as Error).message);
    }
  }

  const created = await stripe.billingPortal.configurations.create({ features, business_profile: businessProfile });
  await admin.from("business_settings").update({ stripe_portal_config_id: created.id }).eq("id", 1);
  return created.id;
}
