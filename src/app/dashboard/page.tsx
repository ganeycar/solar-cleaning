import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InstructionsForm, ProfileForm } from "@/components/account-forms";
import { ButtonLink, Container } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";
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

export default async function DashboardPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const { supabase, user } = session;
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  // All reads go through RLS as this user.
  const [profileRes, quotesRes, propertiesRes, subsRes, entRes, upcomingRes, pastRes] = await Promise.all([
    supabase.from("profiles").select("role,first_name,last_name,phone,email,marketing_email_opt_in,marketing_sms_opt_in").eq("id", user.id).maybeSingle(),
    supabase.from("quote_requests").select("id,created_at,address_line1,city,panel_count,cleaning_request,status,approved_price_cents").order("created_at", { ascending: false }).limit(20),
    supabase.from("properties").select("id,address_line1,address_line2,city,postal_code,panel_count,stories,technician_instructions").order("created_at"),
    supabase.from("subscriptions").select("id,status,current_period_end,cancel_at_period_end,plans(name),plan_prices(amount_cents,billing_interval)").order("created_at", { ascending: false }),
    supabase.from("service_entitlements").select("status,valid_until"),
    supabase.from("bookings").select("id,scheduled_start,status,properties(address_line1,city)").gte("scheduled_start", nowIso).in("status", ["requested", "confirmed", "weather_hold", "rescheduled"]).order("scheduled_start").limit(5),
    supabase.from("bookings").select("id,scheduled_start,status,properties(address_line1,city)").lt("scheduled_start", nowIso).order("scheduled_start", { ascending: false }).limit(10),
  ]);

  const profile = (profileRes.data ?? {}) as Row;
  const quotes = (quotesRes.data ?? []) as Row[];
  const properties = (propertiesRes.data ?? []) as Row[];
  const subscriptions = (subsRes.data ?? []) as Row[];
  const entitlements = (entRes.data ?? []) as Row[];
  const upcoming = (upcomingRes.data ?? []) as Row[];
  const past = (pastRes.data ?? []) as Row[];

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
          <div className="mb-6 rounded-xl border border-gold bg-gold-soft/50 p-4 text-sm text-navy">
            You&apos;re signed in as the business <strong>{profile.role}</strong>. The owner dashboard arrives in Phase 5; for now this page shows your customer view.
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
                      <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">{BOOKING_STATUS[b.status] ?? b.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No upcoming appointments. Online scheduling is coming soon; for now we&apos;ll confirm times with you after your quote.</Empty>
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
                        <div className="flex items-center gap-3">
                          {q.approved_price_cents != null && <span className="font-display font-bold text-navy">{formatCents(q.approved_price_cents)}</span>}
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.tone}`}>{st.label}</span>
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
              <p className="mt-3 text-xs text-muted">Included cleanings from your plan are tracked separately from billing.</p>
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
              <Empty>Payment methods and receipts will be managed securely through Stripe once online payments launch.</Empty>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}
