import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissing } from "./client";

interface ProfileForStripe {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  stripe_customer_id: string | null;
}

/**
 * Returns the customer's Stripe customer id, creating one if needed. A stored
 * id from the other mode (test vs live) or a deleted customer is replaced.
 * `admin` must be the service-role client: customers can't write this column.
 */
export async function getOrCreateStripeCustomer(stripe: Stripe, admin: SupabaseClient, profile: ProfileForStripe, fallbackEmail: string): Promise<string> {
  if (profile.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(profile.stripe_customer_id);
      if (!("deleted" in existing && existing.deleted)) return existing.id;
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || undefined;
  const customer = await stripe.customers.create({
    email: profile.email ?? fallbackEmail,
    name,
    phone: profile.phone ?? undefined,
    metadata: { profile_id: profile.id },
  });

  const { error } = await admin.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profile.id);
  if (error) throw new Error(`Could not save Stripe customer id: ${error.message}`);
  return customer.id;
}
