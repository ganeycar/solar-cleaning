import Link from "next/link";
import { Panel } from "@/components/admin-ui";
import { computeMetrics, planProfitability, type PaymentRow, type SubRow } from "@/lib/admin/metrics";
import { requireStaff } from "@/lib/auth/staff";
import { formatCents } from "@/lib/pricing/engine";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = (x: unknown) => (Array.isArray(x) ? x[0] : x) as Row | undefined;
const WINDOWS = [30, 90, 365];

function Tile({ label, value, sub, href, tone }: { label: string; value: string | number; sub?: string; href?: string; tone?: "warn" }) {
  const body = (
    <div className={`h-full rounded-2xl border p-4 ${tone === "warn" ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-navy">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

function Bars({ rows }: { rows: { label: string; cents: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No data yet.</p>;
  const max = Math.max(...rows.map((r) => r.cents), 1);
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between"><span>{r.label}</span><span className="font-semibold text-navy">{formatCents(r.cents)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-gold" style={{ width: `${Math.max(2, (r.cents / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireStaff();
  const { days: daysRaw } = await searchParams;
  const days = WINDOWS.includes(Number(daysRaw)) ? Number(daysRaw) : 30;
  const admin = getAdminClient();
  if (!admin) return <p className="text-muted">The Supabase service key isn&apos;t configured.</p>;

  const now = new Date();
  const since = new Date(now.getTime() - Math.max(days, 30) * 24 * 3600_000).toISOString();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();

  const [subsRes, payRes, propRes, customersRes, quotesRes, upcomingRes, doneRes, eventsRes, plansRes, settingsRes, creditsRes] = await Promise.all([
    admin.from("subscriptions").select("status, created_at, canceled_at, cancel_at_period_end, plans(name), plan_prices(amount_cents, billing_interval), properties(service_territories(name))"),
    admin.from("payments").select("created_at, amount_cents, refunded_cents, status, customer_id, subscriptions(plans(name))").gte("created_at", since),
    admin.from("properties").select("customer_id, service_territories(name)").order("created_at"),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    admin.from("quote_requests").select("id", { count: "exact", head: true }).in("status", ["new", "needs_review"]),
    admin.from("bookings").select("id", { count: "exact", head: true }).in("status", ["confirmed", "requested", "rescheduled"]).gte("scheduled_start", now.toISOString()).lte("scheduled_start", weekAhead),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed").gte("scheduled_start", since),
    admin.from("stripe_events").select("id", { count: "exact", head: true }).is("processed_at", null),
    admin.from("plans").select("name, kind, cleanings_per_year, plan_prices(billing_interval, amount_cents, status)").eq("kind", "subscription"),
    admin.from("business_settings").select("economics").eq("id", 1).maybeSingle(),
    admin.from("service_entitlements").select("id", { count: "exact", head: true }).eq("status", "available"),
  ]);

  const territoryByCustomer = new Map<string, string>();
  for (const p of (propRes.data ?? []) as Row[]) if (!territoryByCustomer.has(p.customer_id)) territoryByCustomer.set(p.customer_id, one(p.service_territories)?.name ?? "Unknown");

  const subs: SubRow[] = ((subsRes.data ?? []) as Row[]).map((s) => ({
    status: s.status, createdAt: s.created_at, canceledAt: s.canceled_at, cancelAtPeriodEnd: s.cancel_at_period_end,
    planName: one(s.plans)?.name ?? "Membership", amountCents: one(s.plan_prices)?.amount_cents ?? null,
    interval: one(s.plan_prices)?.billing_interval ?? "month", territory: one(one(s.properties)?.service_territories)?.name ?? null,
  }));
  const payments: PaymentRow[] = ((payRes.data ?? []) as Row[]).map((p) => ({
    createdAt: p.created_at, amountCents: p.amount_cents, refundedCents: p.refunded_cents ?? 0, status: p.status,
    planName: one(one(p.subscriptions)?.plans)?.name ?? null, territory: territoryByCustomer.get(p.customer_id) ?? null,
  }));
  const m = computeMetrics({ subs, payments, now, windowDays: days });

  const cost = Number(settingsRes.data?.economics?.costPerCleaningCents ?? 0);
  const profit = planProfitability(
    ((plansRes.data ?? []) as Row[]).map((p) => ({
      name: p.name, cleaningsPerYear: p.cleanings_per_year,
      prices: ((p.plan_prices ?? []) as Row[]).filter((x) => x.status === "published" && x.amount_cents != null).map((x) => ({ interval: x.billing_interval, amountCents: x.amount_cents })),
    })),
    cost,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Overview</h1>
          <p className="mt-1 text-sm text-muted">Test-mode payments are included while Stripe is in test mode.</p>
        </div>
        <nav aria-label="Period" className="flex gap-2">
          {WINDOWS.map((d) => (
            <Link key={d} href={`/admin?days=${d}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${d === days ? "bg-navy text-white" : "border border-line bg-white text-navy"}`}>
              {d === 365 ? "Year" : `${d} days`}
            </Link>
          ))}
        </nav>
      </div>

      {(quotesRes.count || eventsRes.count || m.pastDue) ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {quotesRes.count ? <Tile tone="warn" label="Quotes waiting for you" value={quotesRes.count} href="/admin/quotes" /> : null}
          {m.pastDue ? <Tile tone="warn" label="Members with failed payments" value={m.pastDue} sub="Stripe retries automatically" href="/admin/customers" /> : null}
          {eventsRes.count ? <Tile tone="warn" label="Payment confirmations to retry" value={eventsRes.count} href="/admin/quotes" /> : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Monthly recurring revenue" value={formatCents(m.mrrCents)} sub={`${formatCents(m.arrCents)} per year`} />
        <Tile label="Active members" value={m.activeMembers} sub={m.endingSoon ? `${m.endingSoon} ending at period end` : undefined} />
        <Tile label={`Collected (${days === 365 ? "year" : `${days} days`})`} value={formatCents(m.revenueCents)} sub="After refunds" />
        <Tile label="Customers" value={customersRes.count ?? 0} href="/admin/customers" />
        <Tile label="New memberships" value={m.newMemberships} />
        <Tile label="Canceled memberships" value={m.canceledMemberships} />
        <Tile label="Failed payments" value={m.failedPayments} />
        <Tile label="Cleanings owed" value={creditsRes.count ?? 0} sub="Available, not yet booked" />
        <Tile label="Appointments next 7 days" value={upcomingRes.count ?? 0} href="/admin/schedule" />
        <Tile label={`Completed (${days === 365 ? "year" : `${days} days`})`} value={doneRes.count ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Revenue by plan"><Bars rows={m.revenueByPlan} /></Panel>
        <Panel title="Revenue by city"><Bars rows={m.revenueByTerritory} /></Panel>
        <Panel title="Recurring revenue by plan"><Bars rows={m.mrrByPlan} /></Panel>
      </div>

      <Panel title="Membership profitability (estimate)">
        {cost === 0 ? (
          <p className="text-sm text-muted">Enter your cost per cleaning on the <Link href="/admin/business" className="underline">Business</Link> page (labor, water, fuel, wear) to see estimated margins.</p>
        ) : profit.length === 0 ? (
          <p className="text-sm text-muted">Publish membership prices to see margins.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr><th className="py-2">Plan</th><th>Billing</th><th>Revenue / yr</th><th>Cleaning cost / yr</th><th>Margin / yr</th><th>Margin</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {profit.map((p) => (
                  <tr key={`${p.plan}-${p.interval}`}>
                    <td className="py-2 font-semibold text-navy">{p.plan}</td>
                    <td>{p.interval === "month" ? "Monthly" : "Yearly"}</td>
                    <td>{formatCents(p.yearlyRevenueCents)}</td>
                    <td>{formatCents(p.yearlyCostCents)}</td>
                    <td className={p.marginCents < 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>{formatCents(p.marginCents)}</td>
                    <td>{p.marginPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">Assumes every member uses all included cleanings at {formatCents(cost)} each, before card fees (about 3%). Update your cost as you track real jobs.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}
