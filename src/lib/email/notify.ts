import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrand, ownerEmail, sendEmail } from "./send";
import * as T from "./templates";

/**
 * One function per business event. Each loads what it needs, sends the
 * customer (and sometimes owner) email, and never throws.
 */

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

async function safe(what: string, fn: () => Promise<void>) {
  try { await fn(); } catch (err) { console.error(`notify ${what} failed:`, (err as Error).message); }
}

export function notifyQuoteReceived(db: SupabaseClient, quoteId: string) {
  return safe("quote", async () => {
    const { data } = await db.from("quote_requests").select("id, customer_id, first_name, last_name, email, phone, address_line1, city, panel_count, stories, status, review_reasons, approved_price_cents").eq("id", quoteId).maybeSingle();
    const q = data as Row | null;
    if (!q) return;
    const brand = await loadBrand(db);
    const address = `${q.address_line1}, ${q.city}`;
    await sendEmail(db, { key: `quote:${q.id}:received`, kind: "quote_received", to: q.email, customerId: q.customer_id, relatedId: q.id,
      email: T.quoteReceived(brand, { id: q.id, firstName: q.first_name, status: q.status, priceCents: q.approved_price_cents, address }) });
    await sendEmail(db, { key: `quote:${q.id}:owner`, kind: "owner_new_quote", to: ownerEmail(brand), relatedId: q.id,
      email: T.ownerNewQuote(brand, { id: q.id, name: `${q.first_name} ${q.last_name}`, email: q.email, phone: q.phone, address, panels: q.panel_count, stories: q.stories, status: q.status, reasons: q.review_reasons ?? [], priceCents: q.approved_price_cents }) });
  });
}

async function profile(db: SupabaseClient, id: string): Promise<Row | null> {
  const { data } = await db.from("profiles").select("id, first_name, last_name, email").eq("id", id).maybeSingle();
  return (data as Row | null) ?? null;
}

export function notifyOneTimePurchase(db: SupabaseClient, d: { customerId: string; paymentIntentId: string; amountCents: number; validUntil: string }) {
  return safe("one-time purchase", async () => {
    const p = await profile(db, d.customerId);
    if (!p) return;
    const brand = await loadBrand(db);
    await sendEmail(db, { key: `purchase:${d.paymentIntentId}`, kind: "one_time_confirmation", to: p.email, customerId: p.id,
      email: T.oneTimeConfirmation(brand, { firstName: p.first_name, amountCents: d.amountCents, validUntil: d.validUntil }) });
  });
}

export function notifyMembershipStarted(db: SupabaseClient, subscriptionRowId: string) {
  return safe("membership", async () => {
    const { data } = await db.from("subscriptions").select("id, customer_id, current_period_end, auto_renew_consent_at, consent_disclosure, plans(name), plan_prices(amount_cents, billing_interval)").eq("id", subscriptionRowId).maybeSingle();
    const s = data as Row | null;
    if (!s) return;
    const p = await profile(db, s.customer_id);
    const plan = one(s.plans) as Row | null;
    const price = one(s.plan_prices) as Row | null;
    if (!p || !plan || !price) return;
    const brand = await loadBrand(db);
    await sendEmail(db, { key: `membership:${s.id}:ack`, kind: "membership_acknowledgment", to: p.email, customerId: p.id, relatedId: s.id,
      email: T.membershipAcknowledgment(brand, { firstName: p.first_name, planName: plan.name, amountCents: price.amount_cents, interval: price.billing_interval, disclosure: s.consent_disclosure, consentAt: s.auto_renew_consent_at, renewsOn: s.current_period_end }) });
  });
}

export function notifyPaymentFailed(db: SupabaseClient, d: { invoiceId: string; subscriptionRowId: string; customerId: string; amountCents: number }) {
  return safe("payment failed", async () => {
    const p = await profile(db, d.customerId);
    if (!p) return;
    const { data } = await db.from("subscriptions").select("plans(name)").eq("id", d.subscriptionRowId).maybeSingle();
    const planName = (one((data as Row | null)?.plans) as Row | null)?.name ?? null;
    const brand = await loadBrand(db);
    await sendEmail(db, { key: `invoice:${d.invoiceId}:failed`, kind: "payment_failed", to: p.email, customerId: p.id, relatedId: d.subscriptionRowId,
      email: T.paymentFailed(brand, { firstName: p.first_name, amountCents: d.amountCents, planName }) });
    await sendEmail(db, { key: `invoice:${d.invoiceId}:failed:owner`, kind: "owner_payment_failed", to: ownerEmail(brand), customerId: p.id,
      email: T.ownerPaymentFailed(brand, { customer: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email, amountCents: d.amountCents, customerId: p.id }) });
  });
}

export async function loadBookingInfo(db: SupabaseClient, bookingId: string): Promise<(T.BookingInfo & { email: string | null; customerId: string; status: string; damage: boolean }) | null> {
  const { data } = await db.from("bookings").select("id, customer_id, scheduled_start, status, properties(address_line1, address_line2, city), profiles!bookings_customer_id_fkey(first_name, last_name, email)").eq("id", bookingId).maybeSingle();
  const b = data as Row | null;
  if (!b) return null;
  const prop = one(b.properties) as Row | null;
  const person = one(b.profiles) as Row | null;
  const { data: report } = await db.from("job_reports").select("damage_reported").eq("booking_id", bookingId).maybeSingle();
  return {
    id: b.id,
    customerId: b.customer_id,
    status: b.status,
    start: b.scheduled_start,
    firstName: person?.first_name ?? null,
    customerName: [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || undefined,
    email: person?.email ?? null,
    address: prop ? [prop.address_line1, prop.address_line2, prop.city].filter(Boolean).join(", ") : "",
    damage: Boolean((report as Row | null)?.damage_reported),
  };
}

export type BookingEvent = "booked" | "rescheduled" | "canceled_by_customer" | "weather" | "safety" | "no_access" | "completed";

const OWNER_TITLE: Partial<Record<BookingEvent, string>> = {
  booked: "New booking",
  rescheduled: "Appointment moved",
  canceled_by_customer: "Customer canceled",
  safety: "Job stopped for safety",
  no_access: "No access at appointment",
};

/** `notifyOwner` is false when the owner did it themselves. */
export function notifyBooking(db: SupabaseClient, bookingId: string, event: BookingEvent, opts: { notifyOwner?: boolean } = {}) {
  return safe(`booking ${event}`, async () => {
    const b = await loadBookingInfo(db, bookingId);
    if (!b) return;
    const brand = await loadBrand(db);
    const base = { to: b.email, customerId: b.customerId, relatedId: b.id };
    const key = `booking:${b.id}:${event}:${b.start}`;
    let email: T.Email;
    switch (event) {
      case "booked": email = T.bookingConfirmed(brand, b, "booked"); break;
      case "rescheduled": email = T.bookingConfirmed(brand, b, "rescheduled"); break;
      case "canceled_by_customer": email = T.bookingCanceled(brand, b, "customer"); break;
      case "weather": email = T.bookingCanceled(brand, b, "weather"); break;
      case "safety": email = T.bookingCanceled(brand, b, "safety"); break;
      case "no_access": email = T.bookingCanceled(brand, b, "no_access"); break;
      case "completed": email = T.jobCompleted(brand, b); break;
    }
    await sendEmail(db, { ...base, key, kind: `booking_${event}`, email });
    const title = OWNER_TITLE[event];
    if (title && opts.notifyOwner !== false) {
      await sendEmail(db, { key: `${key}:owner`, kind: `owner_booking_${event}`, to: ownerEmail(brand), relatedId: b.id, email: T.ownerBookingEvent(brand, b, title) });
    }
  });
}
