"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { dollarsToCents } from "@/lib/money";
import { parsePricingForm } from "@/lib/pricing/config-form";
import { getStripe, isMissing } from "@/lib/stripe/client";

/*
 * Owner actions. Every action re-checks staff access, then writes through the
 * owner's own session, so Row Level Security and the database's price rules
 * still apply. Feedback is passed back in the URL (?msg= / ?error=).
 */

function done(path: string, msg: string): never {
  revalidatePath(path);
  revalidatePath("/", "layout"); // public pages show prices and plans
  redirect(`${path}?msg=${encodeURIComponent(msg)}`);
}
function fail(path: string, error: string): never {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}
function text(form: FormData, name: string, max = 500): string {
  const v = form.get(name);
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}
function optionalInt(form: FormData, name: string, min: number, max: number): number | null | "invalid" {
  const raw = text(form, name, 10);
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : "invalid";
}
function lines(form: FormData, name: string): string[] {
  return text(form, name, 4000).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);
}
const UUID = /^[0-9a-f-]{36}$/i;

// ---------------- Quotes ----------------

export async function approveQuote(quoteId: string, form: FormData) {
  const { supabase } = await requireStaff();
  const path = "/admin/quotes";
  if (!UUID.test(quoteId)) fail(path, "Unknown quote.");
  const cents = dollarsToCents(text(form, "price", 20));
  if (cents == null) fail(path, "Enter the price for this job, like 149 or 149.50.");
  const { data, error } = await supabase
    .from("quote_requests")
    .update({ status: "quoted", approved_price_cents: cents })
    .eq("id", quoteId)
    .neq("status", "converted")
    .select("id");
  if (error || !data?.length) fail(path, "Couldn't approve that quote. It may already be booked.");
  done(path, "Quote approved. The customer can now book it from their dashboard.");
}

export async function declineQuote(quoteId: string) {
  const { supabase } = await requireStaff();
  const path = "/admin/quotes";
  if (!UUID.test(quoteId)) fail(path, "Unknown quote.");
  const { error } = await supabase.from("quote_requests").update({ status: "declined" }).eq("id", quoteId).neq("status", "converted");
  if (error) fail(path, "Couldn't decline that quote.");
  done(path, "Quote marked as declined.");
}

// ---------------- Plans and prices ----------------

export async function savePlanDetails(planId: string, form: FormData) {
  const { supabase } = await requireStaff();
  const path = "/admin/pricing";
  if (!UUID.test(planId)) fail(path, "Unknown plan.");
  const name = text(form, "name", 80);
  if (!name) fail(path, "Plan name can't be empty.");
  const cleanings = optionalInt(form, "cleaningsPerYear", 0, 52);
  const minDays = optionalInt(form, "minDaysBetween", 0, 365);
  const maxPanels = optionalInt(form, "maxPanelsIncluded", 1, 10_000);
  if (cleanings === "invalid" || minDays === "invalid" || maxPanels === "invalid") fail(path, "Cleanings, days, and panel limits must be whole numbers.");

  const { error } = await supabase
    .from("plans")
    .update({
      name,
      summary: text(form, "summary", 300),
      cleanings_per_year: cleanings,
      min_days_between_cleanings: minDays,
      max_panels_included: maxPanels,
      priority_scheduling: form.get("priorityScheduling") === "on",
      is_active: form.get("isActive") === "on",
      benefits: lines(form, "benefits"),
      limitations: lines(form, "limitations"),
    })
    .eq("id", planId);
  if (error) fail(path, `Couldn't save the plan: ${error.message}`);
  done(path, `Saved ${name}.`);
}

export async function saveDraftAmount(priceId: string, form: FormData) {
  const { supabase } = await requireStaff();
  const path = "/admin/pricing";
  if (!UUID.test(priceId)) fail(path, "Unknown price.");
  const cents = dollarsToCents(text(form, "amount", 20));
  if (cents == null) fail(path, "Enter a price like 29 or 29.99.");
  const { data, error } = await supabase.from("plan_prices").update({ amount_cents: cents }).eq("id", priceId).eq("status", "draft").select("id");
  if (error || !data?.length) fail(path, "Only draft prices can be edited. Create a new price version to change a published price.");
  done(path, "Draft price saved. It isn't visible to customers until you publish it.");
}

export async function addPriceVersion(planId: string, interval: "one_time" | "month" | "year") {
  const { supabase } = await requireStaff();
  const path = "/admin/pricing";
  if (!UUID.test(planId) || !["one_time", "month", "year"].includes(interval)) fail(path, "Unknown plan.");
  const { data: existing } = await supabase.from("plan_prices").select("id").eq("plan_id", planId).eq("billing_interval", interval).eq("status", "draft");
  if (existing?.length) fail(path, "There's already a draft price for that billing option. Edit it below.");
  const { error } = await supabase.from("plan_prices").insert({ plan_id: planId, billing_interval: interval, status: "draft" });
  if (error) fail(path, `Couldn't create a draft: ${error.message}`);
  done(path, "New draft price created. Enter an amount, then publish it.");
}

/**
 * Publishes a draft price. For memberships this first creates the matching
 * Product/Price in Stripe (test mode unless live is approved), so checkout can
 * use it. Existing members stay on the price they agreed to.
 */
export async function publishPrice(priceId: string) {
  const { supabase } = await requireStaff();
  const path = "/admin/pricing";
  if (!UUID.test(priceId)) fail(path, "Unknown price.");

  const { data: price } = await supabase
    .from("plan_prices")
    .select("id,plan_id,billing_interval,amount_cents,status,stripe_price_id,plans(id,name,kind,stripe_product_id)")
    .eq("id", priceId)
    .single();
  if (!price || price.status !== "draft") fail(path, "Only draft prices can be published.");
  if (price.amount_cents == null) fail(path, "Enter an amount before publishing.");
  const plan = (Array.isArray(price.plans) ? price.plans[0] : price.plans) as unknown as { id: string; name: string; kind: string; stripe_product_id: string | null };

  let previousStripePrice: string | null = null;
  if (plan.kind === "subscription") {
    const stripeRes = getStripe();
    if (!stripeRes.ok) fail(path, `Can't publish membership prices yet: ${stripeRes.reason}`);
    const { stripe } = stripeRes;
    try {
      // Product per plan (re-created if the stored one is from the other Stripe mode).
      let productId = plan.stripe_product_id;
      if (productId) {
        try { await stripe.products.retrieve(productId); } catch (err) { if (isMissing(err)) productId = null; else throw err; }
      }
      if (!productId) {
        const product = await stripe.products.create({ name: plan.name, metadata: { plan_id: plan.id } });
        productId = product.id;
        await supabase.from("plans").update({ stripe_product_id: productId }).eq("id", plan.id);
      }
      const interval = price.billing_interval as "month" | "year";
      const stripePrice = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: price.amount_cents,
        recurring: { interval },
        nickname: `${plan.name} (${interval === "month" ? "monthly" : "yearly"})`,
        metadata: { plan_price_id: price.id },
      });
      const { error } = await supabase.from("plan_prices").update({ stripe_price_id: stripePrice.id }).eq("id", price.id);
      if (error) throw new Error(error.message);

      const { data: current } = await supabase.from("plan_prices").select("stripe_price_id").eq("plan_id", price.plan_id).eq("billing_interval", price.billing_interval).eq("status", "published").maybeSingle();
      previousStripePrice = current?.stripe_price_id ?? null;
    } catch (err) {
      console.error("Stripe price setup failed", (err as Error).message);
      fail(path, `Stripe couldn't set up this price: ${(err as Error).message}`);
    }
  }

  const { error } = await supabase.rpc("publish_plan_price", { p_price_id: price.id });
  if (error) fail(path, `Couldn't publish: ${error.message}`);

  // New customers can no longer pick the old Stripe price; existing members keep being billed on it.
  if (previousStripePrice) {
    const stripeRes = getStripe();
    if (stripeRes.ok) await stripeRes.stripe.prices.update(previousStripePrice, { active: false }).catch((e: Error) => console.warn("Couldn't deactivate old Stripe price", e.message));
  }
  done(path, `${plan.name} price published. It's now live on the website.`);
}

export async function unpublishPrice(priceId: string) {
  const { supabase } = await requireStaff();
  const path = "/admin/pricing";
  if (!UUID.test(priceId)) fail(path, "Unknown price.");
  const { error } = await supabase.rpc("unpublish_plan_price", { p_price_id: priceId });
  if (error) fail(path, `Couldn't unpublish: ${error.message}`);
  done(path, "Price removed from the website. Existing members are not affected.");
}

// ---------------- Quote pricing rules and territories ----------------

export async function savePricingRules(form: FormData) {
  const { supabase, user } = await requireStaff();
  const path = "/admin/settings";
  const parsed = parsePricingForm(
    (k) => { const v = form.get(k); return typeof v === "string" ? v : null; },
    (k) => form.getAll(k).filter((v): v is string => typeof v === "string"),
  );
  if (!parsed.ok) fail(path, parsed.errors.join(" "));

  const { data: latest } = await supabase.from("pricing_rules").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (latest?.version ?? 0) + 1;
  const notes = text(form, "notes", 300) || null;
  const { data: row, error } = await supabase.from("pricing_rules").insert({ version, config: parsed.config, status: "draft", notes, created_by: user.id }).select("id").single();
  if (error || !row) fail(path, `Couldn't save pricing: ${error?.message ?? "unknown error"}`);

  if (form.get("publish") === "1") {
    const { error: pubError } = await supabase.rpc("publish_pricing_rules", { p_rules_id: row.id });
    if (pubError) fail(path, `Saved as draft version ${version}, but publishing failed: ${pubError.message}`);
    done(path, `Version ${version} is live. New quotes will show prices automatically.`);
  }
  done(path, `Saved as draft version ${version}. Customers won't see prices until you publish.`);
}

export async function unpublishPricingRules() {
  const { supabase } = await requireStaff();
  const { error } = await supabase.rpc("unpublish_pricing_rules");
  if (error) fail("/admin/settings", `Couldn't turn off instant prices: ${error.message}`);
  done("/admin/settings", "Instant prices are off. New quotes will be reviewed by you before customers see a price.");
}

export async function saveTerritory(territoryId: string, form: FormData) {
  const { supabase } = await requireStaff();
  const path = "/admin/settings";
  if (!UUID.test(territoryId)) fail(path, "Unknown service area.");
  const fee = dollarsToCents(text(form, "travelFee", 20) || "0", { allowZero: true, max: 1000 });
  if (fee == null) fail(path, "Travel fee must be a dollar amount (0 for none).");
  const { error } = await supabase
    .from("service_territories")
    .update({ travel_fee_cents: fee, is_active: form.get("isActive") === "on", accepting_new: form.get("acceptingNew") === "on" })
    .eq("id", territoryId);
  if (error) fail(path, `Couldn't save: ${error.message}`);
  done(path, "Service area saved.");
}
