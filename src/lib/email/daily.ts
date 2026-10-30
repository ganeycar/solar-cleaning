import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBookingInfo } from "./notify";
import { annualReminderDue, expiringReminderDue, followUpDue, isTomorrow, renewalNoticeDue } from "./schedule";
import { loadBrand, sendEmail } from "./send";
import * as T from "./templates";
import { unsubscribeUrl } from "./unsubscribe";

/**
 * The once-a-day job. Every email is keyed, so running it twice in a day (or
 * re-running after a failure) never sends duplicates.
 */

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const DAY = 24 * 3600_000;

export interface DailyResult { reminders: number; followUps: number; renewalNotices: number; annualReminders: number; expiring: number; errors: string[] }

export async function runDailyJob(db: SupabaseClient, now = new Date()): Promise<DailyResult> {
  const result: DailyResult = { reminders: 0, followUps: 0, renewalNotices: 0, annualReminders: 0, expiring: 0, errors: [] };
  await db.from("job_runs").upsert({ name: "daily", last_started_at: now.toISOString() }, { onConflict: "name" });
  const brand = await loadBrand(db);
  const step = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err) { result.errors.push(`${name}: ${(err as Error).message}`); }
  };

  // 1. Appointment reminders for tomorrow.
  await step("reminders", async () => {
    const { data } = await db.from("bookings").select("id, scheduled_start")
      .in("status", ["requested", "confirmed", "rescheduled"])
      .gte("scheduled_start", now.toISOString())
      .lt("scheduled_start", new Date(now.getTime() + 2 * DAY).toISOString());
    for (const row of (data ?? []) as Row[]) {
      if (!isTomorrow(row.scheduled_start, now)) continue;
      const b = await loadBookingInfo(db, row.id);
      if (!b) continue;
      const r = await sendEmail(db, { key: `booking:${b.id}:reminder:${b.start}`, kind: "booking_reminder", to: b.email, customerId: b.customerId, relatedId: b.id, email: T.bookingReminder(brand, b) });
      if (r === "sent" || r === "skipped") result.reminders++;
    }
  });

  // 2. Follow-ups for priced quotes that weren't booked.
  await step("follow-ups", async () => {
    const { data } = await db.from("quote_requests").select("id, customer_id, first_name, email, created_at, approved_price_cents, follow_up_count")
      .eq("status", "quoted").not("approved_price_cents", "is", null)
      .gte("created_at", new Date(now.getTime() - 31 * DAY).toISOString())
      .lt("follow_up_count", 2);
    for (const q of (data ?? []) as Row[]) {
      const n = followUpDue(q.created_at, q.follow_up_count, now);
      if (!n) continue;
      // Skip if this person has bought since (a newer quote converted, or they're a member).
      const { count } = await db.from("quote_requests").select("id", { count: "exact", head: true }).eq("email", q.email).eq("status", "converted");
      if (count) continue;
      const r = await sendEmail(db, { key: `quote:${q.id}:followup:${n}`, kind: "quote_follow_up", to: q.email, customerId: q.customer_id, relatedId: q.id,
        email: T.quoteFollowUp(brand, { id: q.id, firstName: q.first_name, priceCents: q.approved_price_cents, n }, unsubscribeUrl(brand.siteUrl, q.email)) });
      if (r !== "failed") {
        await db.from("quote_requests").update({ follow_up_count: n, follow_up_sent_at: now.toISOString() }).eq("id", q.id);
        if (r === "sent" || r === "skipped") result.followUps++;
      }
    }
  });

  // 3 & 4. Membership notices (California automatic renewal law).
  await step("membership notices", async () => {
    const { data } = await db.from("subscriptions").select("id, customer_id, status, started_at, current_period_end, cancel_at_period_end, plans(name), plan_prices(amount_cents, billing_interval), profiles!subscriptions_customer_id_fkey(first_name, email)")
      .in("status", ["active", "trialing", "past_due"]).eq("cancel_at_period_end", false);
    for (const s of (data ?? []) as Row[]) {
      const plan = one(s.plans) as Row | null;
      const price = one(s.plan_prices) as Row | null;
      const person = one(s.profiles) as Row | null;
      if (!plan || !price || !person) continue;
      if (price.billing_interval === "year" && s.current_period_end && renewalNoticeDue(s.current_period_end, now)) {
        const r = await sendEmail(db, { key: `membership:${s.id}:renewal:${s.current_period_end.slice(0, 10)}`, kind: "renewal_notice", to: person.email, customerId: s.customer_id, relatedId: s.id,
          email: T.renewalNotice(brand, { firstName: person.first_name, planName: plan.name, amountCents: price.amount_cents, renewsOn: s.current_period_end }) });
        if (r === "sent" || r === "skipped") result.renewalNotices++;
      }
      if (price.billing_interval !== "year" && s.started_at) {
        const n = annualReminderDue(s.started_at, now);
        if (n) {
          const r = await sendEmail(db, { key: `membership:${s.id}:annual:${n}`, kind: "annual_reminder", to: person.email, customerId: s.customer_id, relatedId: s.id,
            email: T.annualReminder(brand, { firstName: person.first_name, planName: plan.name, amountCents: price.amount_cents, interval: price.billing_interval }) });
          if (r === "sent" || r === "skipped") result.annualReminders++;
        }
      }
    }
  });

  // 5. Cleanings about to expire unused.
  await step("expiring cleanings", async () => {
    const today = now.toISOString().slice(0, 10);
    const in31 = new Date(now.getTime() + 31 * DAY).toISOString().slice(0, 10);
    const { data } = await db.from("service_entitlements").select("customer_id, valid_until").eq("status", "available").gte("valid_until", today).lte("valid_until", in31);
    const groups = new Map<string, { customerId: string; validUntil: string; count: number }>();
    for (const e of (data ?? []) as Row[]) {
      if (!expiringReminderDue(e.valid_until, now)) continue;
      const k = `${e.customer_id}:${e.valid_until}`;
      const g = groups.get(k) ?? { customerId: e.customer_id, validUntil: e.valid_until, count: 0 };
      g.count++;
      groups.set(k, g);
    }
    for (const g of groups.values()) {
      const { data: p } = await db.from("profiles").select("first_name, email").eq("id", g.customerId).maybeSingle();
      if (!p) continue;
      const r = await sendEmail(db, { key: `cleanings:${g.customerId}:expiring:${g.validUntil}`, kind: "cleanings_expiring", to: (p as Row).email, customerId: g.customerId,
        email: T.cleaningsExpiring(brand, { firstName: (p as Row).first_name, count: g.count, validUntil: g.validUntil }) });
      if (r === "sent" || r === "skipped") result.expiring++;
    }
  });

  await db.from("job_runs").upsert({ name: "daily", last_finished_at: new Date().toISOString(), last_result: result, last_error: result.errors.join("; ") || null }, { onConflict: "name" });
  return result;
}
