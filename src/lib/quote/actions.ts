"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getAdminClient } from "@/lib/supabase/admin";
import { calculateQuote, formatCents, type QuoteStatus } from "@/lib/pricing/engine";
import { loadPricingConfig } from "@/lib/pricing/load";
import { clientIp, hashIp, isRateLimited } from "@/lib/rate-limit";
import { IMAGE_EXT, MAX_PHOTOS, MAX_PHOTO_BYTES, sniffImageType, validateQuoteRequest, type FieldErrors } from "./validate";

export type QuoteFormState =
  | { kind: "idle" }
  | { kind: "error"; message: string; fieldErrors?: FieldErrors; values?: Record<string, string>; attempt?: number }
  | { kind: "submitted"; status: QuoteStatus; priceLabel: string | null; reference: string; reviewReasons: string[] };

const DB_STATUS: Record<QuoteStatus, string> = {
  priced: "quoted",
  needs_review: "needs_review",
  pricing_unpublished: "new",
  out_of_area: "out_of_area",
  waitlist: "waitlist",
};

/** Text the customer entered (no files, no honeypot), so the form can be refilled after an error. */
function enteredValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && k !== "company_website" && !k.startsWith("$")) out[k] = v.slice(0, 2000);
  }
  return out;
}

export async function submitQuote(_prev: QuoteFormState, form: FormData): Promise<QuoteFormState> {
  const result = await processQuote(form);
  return result.kind === "error" ? { ...result, values: enteredValues(form), attempt: Date.now() } : result;
}

async function processQuote(form: FormData): Promise<QuoteFormState> {
  const db = getAdminClient();
  if (!db) {
    return { kind: "error", message: "Online quotes aren't connected yet. Please use the contact page and we'll follow up." };
  }

  const validation = validateQuoteRequest((name) => {
    const v = form.get(name);
    return typeof v === "string" ? v : null;
  });
  if (!validation.ok) {
    return { kind: "error", message: validation.errors.form ?? "Please fix the highlighted fields.", fieldErrors: validation.errors };
  }
  const data = validation.data;

  const h = await headers();
  const ipHash = hashIp(clientIp(h));
  if (await isRateLimited(db, "quote_requests", ipHash, 5, 60)) {
    return { kind: "error", message: "We've received several requests from this connection. Please try again in an hour or contact us directly." };
  }

  // Photos: optional, max 5, real image bytes only, renamed to random ids.
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS) return { kind: "error", message: `Please attach at most ${MAX_PHOTOS} photos.` };
  const reference = randomUUID();
  const photoPaths: string[] = [];
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return { kind: "error", message: "Each photo must be 8 MB or smaller." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) return { kind: "error", message: "Photos must be JPEG, PNG, WebP, or HEIC images." };
    const path = `${reference}/${randomUUID()}.${IMAGE_EXT[type]}`;
    const { error } = await db.storage.from("quote-photos").upload(path, bytes, { contentType: type, upsert: false });
    if (error) return { kind: "error", message: "We couldn't upload your photos. Please try again, or submit without them." };
    photoPaths.push(path);
  }

  const config = await loadPricingConfig(db);
  const result = config
    ? calculateQuote(config, {
        city: data.city,
        panelCount: data.panelCount,
        stories: data.stories,
        propertyType: data.propertyType,
        roofType: data.roofType,
        accessType: data.accessType,
        cleaningRequest: data.cleaningRequest,
      })
    : null;
  const status: QuoteStatus = result?.status ?? "pricing_unpublished";

  const { error } = await db.from("quote_requests").insert({
    id: reference,
    territory_id: result?.zoneId ?? null,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    phone: data.phone,
    address_line1: data.addressLine1,
    address_line2: data.addressLine2 || null,
    city: data.city,
    state: data.state,
    postal_code: data.postalCode,
    panel_count: data.panelCount,
    property_type: data.propertyType,
    stories: data.stories,
    roof_type: data.roofType,
    access_type: data.accessType,
    access_details: data.accessDetails || null,
    cleaning_request: data.cleaningRequest,
    preferred_window: data.preferredWindow,
    photo_paths: photoPaths,
    status: DB_STATUS[status],
    review_reasons: result?.reviewReasons ?? [],
    engine_result: result,
    pricing_rules_version: result?.pricingVersion ?? null,
    // Auto-priced quotes can be booked right away at this price.
    approved_price_cents: status === "priced" ? result?.customerPriceCents ?? null : null,
    marketing_email_opt_in: data.marketingEmailOptIn,
    marketing_sms_opt_in: data.marketingSmsOptIn,
    referral_code: data.referralCode || null,
    source: "website",
    ip_hash: ipHash,
  });
  if (error) {
    console.error("quote insert failed", error.message);
    return { kind: "error", message: "Something went wrong saving your request. Please try again." };
  }

  return {
    kind: "submitted",
    status,
    reference: reference.slice(0, 8).toUpperCase(),
    priceLabel: status === "priced" && result?.customerPriceCents != null ? formatCents(result.customerPriceCents) : null,
    // Shown to the customer in plain language; detailed reasons stay internal.
    reviewReasons: status === "needs_review" ? ["We'll confirm safe access and give you an exact price."] : [],
  };
}
