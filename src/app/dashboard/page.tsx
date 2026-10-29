import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InstructionsForm, ProfileForm } from "@/components/account-forms";
import { ButtonLink, Container } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";
import { openBillingPortal } from "@/lib/billing/actions";
import { cancelCleaning } from "@/lib/scheduling/actions";
import { loadSchedulingSettings } from "@/lib/scheduling/data";
import { canChangeBooking } from "@/lib/scheduling/slots";
import { getAdminClient } from "@/lib/supabase/admin";
import { formatCents } from "@/lib/pricing/engine";
import { CLEANING_REQUESTS } from "@/lib/quote/validate";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

const TZ = "America/Los_Angeles";
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const QUOTE_STATUS: Record<string, { label: string; tone: string }> = {
  new: { label: "Received — we'll follow up", tone: "bg-sky-50 text-sky-800" },
  needs_review: { label: "Under review", tone: "bg-amber-50 text-amber-800" },
  quoted: { label: "Quote ready", tone: "bg-emerald-50 text-emerald-800" },
  accepted: { label: "Accepted", tone: "bg-emerald-50 text-emerald-800" },
  declined: { label: "Declined", tone: "bg-gray-100 text-gray-700" },
  expired: { label: "Expired", tone: "bg-gray-100 text-gray-700" },
  converted: { label: "Booked", tone: "bg-emerald-50 text-emerald-800" },
  out_of_area: { label: "Outside service area", tone: "bg-gray-100 text-gray-700" },
  waitlist: { label: "On the waitlist", tone: "bg-amber-50 text-amber-800" },
};
const BOOKING_STATUS: Record<string, string> = {
  requested: "Requested", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed",
  canceled: "Canceled", weather_hold: "Weather hold", rescheduled: "Rescheduled", no_access: "Couldn't access",
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

const PAYMENT_STATUS: Record<string, string> = { succeeded: "Paid", failed: "Failed", refunded: "Refunded", partially_refunded: "Partly refunded" };

const SCHEDULE_MSG: Record<string, { tone: "ok" | "warn"; text: string }> = {
  booked: { tone: "ok", text: "You're booked! Your appointment is below." },
  rescheduled: { tone: "ok", text: "Your appointment has been moved." },
  canceled: { tone: "ok", text: "Your appointment was canceled and the cleaning is back in your account." },
  cutoff: { tone: "warn", text: "That appointment is too close to change online. Please contact us." },
  error: { tone: "warn", text: "We couldn't update that appointment. Please try again or contact us." },
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ checkout?: string; billing?: string; booked?: string; rescheduled?: string; canceled?: string; schedule?: string }> }) {
  const sp = await searchParams;
  const { checkout, billing } = sp;
  const scheduleMsg = SCHEDULE_MSG[sp.booked ? "booked" : sp.rescheduled ? "rescheduled" : sp.canceled ? "canceled" : sp.schedule ?? ""];
  const adminForSettings = getAdminClient();
  const cutoffHours = adminForSettings ? (await loadSchedulingSettings(adminForSettings)).rescheduleCutoffHours : 24;
  const nowDate = new Date();
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const { supabase, user } = session;
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  // Link any quotes made with this (verified) email, e.g. ones submitted while signed in.
  await supabase.rpc("claim_my_quotes");

  // All reads go through RLS as this user AND are filtered to this user, because
  // owner/admin accounts can read every customer's records.
  const [profileRes, quotesRes, propertiesRes, subsRes, entRes, upcomingRes, pastRes, paymentsRes] = await Promise.all([
    supabase.from("profiles").select("role,first_name,last_name,phone,email,marketing_email_opt_in,marketing_sms_opt_in,stripe_customer_id").eq("id", user.id).maybeSingle(),
    supabase.from("quote_requests").select("id,created_at,address_line1,city,panel_count,cleaning_request,status,approved_price_cents").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("properties").select("id,address_line1,address_line2,city,postal_code,panel_count,stories,technician_instructions").eq("customer_id", user.id).order("created_at"),
    supabase.from("subscriptions").select("id,status,current_period_end,cancel_at_period_end,plans(name),plan_prices(amount_cents,billing_interval)").eq("customer_id", user.id).order("created_at", { ascending: false }),
    supabase.from("service_entitlements").select("status,valid_until").eq("customer_id", user.id),
    supabase.from("bookings").select("id,scheduled_start,status,properties(address_line1,city)").eq("customer_id", user.id).gte("scheduled_start", nowIso).in("status", ["requested", "confirmed", "weather_hold", "rescheduled"]).order("scheduled_start").limit(5),
    supabase.from("bookings").select("id,scheduled_start,status,properties(address_line1,city)").eq("customer_id", user.id).lt("scheduled_start", nowIso).order("scheduled_start", { ascending: false }).limit(10),
    supabase.from("payments").select("id,created_at,amount_cents,refunded_cents,status,description").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);

  const profile = (profileRes.data ?? {}) as Row;
  const quotes = (quotesRes.data ?? []) as Row[];
  const properties = (propertiesRes.data ?? []) as Row[];
  const subscriptions = (subsRes.data ?? []) as Row[];
  const entitlements = (entRes.data ?? []) as Row[];
  const upcoming = (upcomingRes.data ?? []) as Row[];
  const past = (pastRes.data ?? []) as Row[];
  const payments = (paymentsRes.data ?? []) as Row[];
  const hasBilling = Boolean(profile.stripe_customer_id);

  const available = entitlements.filter((e) => e.status === "available" && e.valid_until >= today).length;
  const scheduled = entitlements.filter((e) => e.status === "scheduled").length;
  const completed = entitlements.filter((e) => e.status === "completed").length;
  const activeSub = subscriptions.find((s) => ["active", "trialing", "past_due"].includes(s.status));
  const isStaff = profile.role === "owner" || profile.role === "admin";
  const greetingName = profile.first_name || user.email?.split("@")[0] || "there";

  return (
    <div className="bg-paper">
      <Container className="py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Customer portal</p>
            <h1 className="text-3xl font-extrabold sm:text-4xl">Hi, {greetingName}</h1>
          </div>
          <form action={signOut}>
            <button type="submit" className="rounded-full border border-line bg-white px-5 py-2 text-sm font-semibold text-navy hover:border-navy">Sign out</button>
          </form>
        </div>

        {isStaff && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold bg-gold-soft/50 p-4 text-sm text-navy">
            <span>You&apos;re signed in as the business <strong>{profile.role}</strong>.</span>
            <Link href="/admin" className="rounded-full bg-navy px-4 py-2 font-semibold text-white hover:bg-navy-900">Owner tools</Link>
          </div>
        )}
        {scheduleMsg && (
          <div role="status" className={`mb-6 rounded-xl border p-4 text-sm ${scheduleMsg.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{scheduleMsg.text}</div>
        )}
        {checkout === "success" && (
          <div role="status" className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Thanks! Stripe is confirming your payment. Your booking and receipt appear here once it&apos;s confirmed, usually within a few seconds. Refresh if you don&apos;t see it yet.
          </div>
        )}
        {billing && (
          <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            {billing === "none" ? "You don't have any billing history yet." : "Billing management isn't available right now. Please try again shortly."}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Next appointment">
              {upcoming.length ? (
                <ul className="divide-y divide-line">
                  {upcoming.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-navy">{dateTimeFmt.format(new Date(b.scheduled_start))}</p>
                        <p className="text-sm text-muted">{b.properties?.address_line1}, {b.properties?.city}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">{BOOKING_STATUS[b.status] ?? b.status}</span>
                        {canChangeBooking(new Date(b.scheduled_start), nowDate, cutoffHours) ? (
                          <>
                            <Link href={`/schedule?booking=${b.id}`} className="rounded-full border border-navy px-3 py-1 text-xs font-semibold text-navy hover:bg-paper">Reschedule</Link>
                            <form action={cancelCleaning.bind(null, b.id)}>
                              <button type="submit" className="rounded-full px-3 py-1 text-xs font-semibold text-red-700 underline">Cancel</button>
                            </form>
                          </>
                        ) : (
                          <span className="text-xs text-muted">Need a change? <Link href="/contact" className="underline">Contact us</Link></span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No upcoming appointments.{available > 0 ? " You have a cleaning ready to schedule." : ""}</Empty>
              )}
              {available > 0 && (
                <Link href="/schedule" className="mt-4 inline-block rounded-full bg-gold px-5 py-2 text-sm font-semibold text-navy hover:brightness-95">Schedule a cleaning</Link>
              )}
            </Card>

            <Card title="Your quote requests" action={<Link href="/quote" className="text-sm font-semibold text-navy underline">New quote</Link>}>
              {quotes.length ? (
                <ul className="divide-y divide-line">
                  {quotes.map((q) => {
                    const st = QUOTE_STATUS[q.status] ?? { label: q.status, tone: "bg-gray-100 text-gray-700" };
                    return (
                      <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div>
                          <p className="font-semibold text-navy">{CLEANING_REQUESTS[q.cleaning_request as keyof typeof CLEANING_REQUESTS] ?? "Cleaning"} · {q.panel_count} panels</p>
                          <p className="text-sm text-muted">{q.address_line1}, {q.city} · {dateFmt.format(new Date(q.created_at))} · Ref {String(q.id).slice(0, 8).toUpperCase()}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {q.approved_price_cents != null && <span className="font-display font-bold text-navy">{formatCents(q.approved_price_cents)}</span>}
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.tone}`}>{st.label}</span>
                          {q.status === "quoted" && q.approved_price_cents != null && (
                            <Link href={`/checkout/${q.id}`} className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-navy hover:brightness-95">Book now</Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty>No quote requests yet. <Link href="/quote" className="underline">Get a quote</Link> to get started.</Empty>
              )}
            </Card>

            <Card title="Service history">
              {past.length ? (
                <ul className="divide-y divide-line">
                  {past.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="font-semibold text-navy">{dateFmt.format(new Date(b.scheduled_start))}</p>
                        <p className="text-sm text-muted">{b.properties?.address_line1}, {b.properties?.city}</p>
                      </div>
                      <span className="text-sm text-muted">{BOOKING_STATUS[b.status] ?? b.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Completed cleanings, technician notes, and before-and-after photos will appear here.</Empty>
              )}
            </Card>

            <Card title="Your details">
              <ProfileForm
                profile={{
                  firstName: profile.first_name ?? "",
                  lastName: profile.last_name ?? "",
                  phone: profile.phone ?? "",
                  email: user.email ?? profile.email ?? "",
                  marketingEmail: Boolean(profile.marketing_email_opt_in),
                  marketingSms: Boolean(profile.marketing_sms_opt_in),
                }}
              />
            </Card>
          </div>

          <div className="space-y-6">
            <Card title="Membership">
              {activeSub ? (
                <div className="space-y-2 text-sm">
                  <p className="font-display text-xl font-bold text-navy">{activeSub.plans?.name ?? "Membership"}</p>
                  {activeSub.plan_prices?.amount_cents != null && (
                    <p className="text-muted">{formatCents(activeSub.plan_prices.amount_cents)} / {activeSub.plan_prices.billing_interval}</p>
                  )}
                  {activeSub.current_period_end && (
                    <p className="text-muted">{activeSub.cancel_at_period_end ? "Ends" : "Renews"} {dateFmt.format(new Date(activeSub.current_period_end))}</p>
                  )}
                  {activeSub.status === "past_due" && <p className="font-semibold text-red-700">Payment needed: please update your card.</p>}
                  <form action={openBillingPortal} className="pt-2">
                    <button type="submit" className="w-full rounded-full border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-paper">Change plan or cancel</button>
                  </form>
                </div>
              ) : (
                <div className="space-y-4">
                  <Empty>You don&apos;t have a membership yet.</Empty>
                  <ButtonLink href="/memberships" variant="secondary" className="w-full !py-2.5 text-sm">View plans</ButtonLink>
                </div>
              )}
            </Card>

            <Card title="Cleanings">
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[["Available", available], ["Scheduled", scheduled], ["Completed", completed]].map(([label, n]) => (
                  <div key={label as string} className="rounded-xl bg-paper p-3">
                    <dd className="font-display text-2xl font-extrabold text-navy">{n}</dd>
                    <dt className="text-xs text-muted">{label}</dt>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted">Monthly memberships unlock cleanings through the year as you pay; yearly memberships include the whole year up front. Cleanings are valid until the end of your membership year.</p>
            </Card>

            <Card title="Your properties">
              {properties.length ? (
                <ul className="space-y-5">
                  {properties.map((p) => (
                    <li key={p.id}>
                      <p className="font-semibold text-navy">{p.address_line1}{p.address_line2 ? `, ${p.address_line2}` : ""}</p>
                      <p className="text-sm text-muted">{p.city} {p.postal_code} · {p.panel_count} panels · {p.stories} {p.stories === 1 ? "story" : "stories"}</p>
                      <InstructionsForm propertyId={p.id} value={p.technician_instructions ?? ""} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Your property is added when your first cleaning is scheduled.</Empty>
              )}
              <p className="mt-4 text-xs text-muted">Need to change an address or panel count? <Link href="/contact" className="underline">Contact us</Link> so we can update your quote.</p>
            </Card>

            <Card title="Billing">
              {payments.length ? (
                <ul className="divide-y divide-line text-sm">
                  {payments.map((pm) => (
                    <li key={pm.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
                      <span>
                        <span className="block font-semibold text-navy">{formatCents(pm.amount_cents)}</span>
                        <span className="text-xs text-muted">{pm.description ?? "Payment"} · {dateFmt.format(new Date(pm.created_at))}</span>
                      </span>
                      <span className={`text-xs font-semibold ${pm.status === "failed" ? "text-red-700" : "text-muted"}`}>
                        {PAYMENT_STATUS[pm.status] ?? pm.status}
                        {pm.refunded_cents > 0 && pm.status !== "refunded" ? ` (${formatCents(pm.refunded_cents)} refunded)` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No payments yet.</Empty>
              )}
              {hasBilling && (
                <form action={openBillingPortal} className="mt-4">
                  <button type="submit" className="w-full rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-900">Manage billing &amp; receipts</button>
                </form>
              )}
              <p className="mt-3 text-xs text-muted">Payments are processed by Stripe. We never store your card number.</p>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}
