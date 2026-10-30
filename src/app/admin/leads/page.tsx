import Link from "next/link";
import { Panel } from "@/components/admin-ui";
import { leadFunnel, pct, type QuoteRow } from "@/lib/admin/leads";
import { requireStaff } from "@/lib/auth/staff";
import { formatCents } from "@/lib/pricing/engine";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const WINDOWS = [30, 90, 365];
const TZ = "America/Los_Angeles";
const dt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const d = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });

const EMAIL_STATUS: Record<string, string> = {
  sent: "text-emerald-700", skipped: "text-muted", suppressed: "text-muted", failed: "text-red-700 font-semibold", pending: "text-amber-700",
};

function Stat({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${warn ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-navy">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function AdminLeads({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireStaff();
  const { days: daysRaw } = await searchParams;
  const days = WINDOWS.includes(Number(daysRaw)) ? Number(daysRaw) : 30;
  const admin = getAdminClient();
  if (!admin) return <p className="text-muted">The Supabase service key isn&apos;t configured.</p>;

  const now = new Date();
  const since = new Date(now.getTime() - days * 86400_000).toISOString();
  const [quotesRes, openRes, reviewRes, emailsRes, runRes] = await Promise.all([
    admin.from("quote_requests").select("status, city, created_at, approved_price_cents, follow_up_count").gte("created_at", since).limit(5000),
    admin.from("quote_requests").select("id, first_name, last_name, email, city, created_at, approved_price_cents, follow_up_count, follow_up_sent_at").eq("status", "quoted").order("created_at", { ascending: false }).limit(25),
    admin.from("quote_requests").select("id, first_name, last_name, city, created_at").in("status", ["needs_review", "new"]).order("created_at").limit(25),
    admin.from("email_log").select("id, created_at, kind, to_email, subject, status, error").order("created_at", { ascending: false }).limit(60),
    admin.from("job_runs").select("last_finished_at, last_result, last_error").eq("name", "daily").maybeSingle(),
  ]);

  const rows: QuoteRow[] = ((quotesRes.data ?? []) as Row[]).map((q) => ({ status: q.status, city: q.city, createdAt: q.created_at, priceCents: q.approved_price_cents, followUps: q.follow_up_count ?? 0 }));
  const f = leadFunnel(rows, now, days);
  const open = (openRes.data ?? []) as Row[];
  const waiting = (reviewRes.data ?? []) as Row[];
  const emails = (emailsRes.data ?? []) as Row[];
  const run = runRes.data as Row | null;
  const failedEmails = emails.filter((e) => e.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Leads &amp; emails</h1>
        <nav className="flex gap-2 text-sm" aria-label="Time window">
          {WINDOWS.map((w) => (
            <Link key={w} href={`/admin/leads?days=${w}`} className={`rounded-full px-4 py-1.5 font-semibold ${w === days ? "bg-navy text-white" : "border border-line bg-white text-navy"}`}>{w === 365 ? "1 year" : `${w} days`}</Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Quote requests" value={f.total} />
        <Stat label="Auto-priced" value={f.autoPriced} sub="waiting to book" />
        <Stat label="Need your review" value={f.needsReview + f.unpublished} warn={f.needsReview + f.unpublished > 0} />
        <Stat label="Booked" value={f.booked} sub={`${f.bookedAfterFollowUp} after a follow-up`} />
        <Stat label="Close rate" value={pct(f.closeRate)} sub="booked ÷ priced" />
        <Stat label="Outside area / waitlist" value={f.outOfArea + f.waitlist} sub="demand to expand" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Waiting on you" aside={<Link href="/admin/quotes" className="text-sm font-semibold text-navy underline">All quotes</Link>}>
          {waiting.length ? (
            <ul className="divide-y divide-line text-sm">
              {waiting.map((q) => {
                const hours = Math.round((now.getTime() - new Date(q.created_at).getTime()) / 3600_000);
                return (
                  <li key={q.id} className="flex justify-between gap-2 py-2">
                    <span>{q.first_name} {q.last_name} · {q.city}</span>
                    <span className={hours > 24 ? "font-semibold text-red-700" : "text-muted"}>{hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">Nothing waiting. Nice.</p>}
          <p className="mt-3 text-xs text-muted">Quotes needing a price or access check. Customers were told to expect a reply within one business day.</p>
        </Panel>

        <Panel title="Priced, not booked yet">
          {open.length ? (
            <ul className="divide-y divide-line text-sm">
              {open.map((q) => (
                <li key={q.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{q.first_name} {q.last_name} · {q.city} · {q.approved_price_cents != null ? formatCents(q.approved_price_cents) : "—"}</span>
                  <span className="text-muted">{d.format(new Date(q.created_at))} · {q.follow_up_count ? `${q.follow_up_count} follow-up${q.follow_up_count > 1 ? "s" : ""} sent` : "no follow-up yet"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No open quotes.</p>}
          <p className="mt-3 text-xs text-muted">The daily job emails these customers after 2 days and once more after 7 days, then stops. A personal call or text often works better.</p>
        </Panel>
      </div>

      <Panel title="By city">
        {f.byCity.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="py-2">City</th><th>Requests</th><th>Priced</th><th>Booked</th><th>Close rate</th></tr></thead>
            <tbody className="divide-y divide-line">
              {f.byCity.map((c) => <tr key={c.label}><td className="py-2 font-semibold">{c.label}</td><td>{c.requests}</td><td>{c.priced}</td><td>{c.booked}</td><td>{pct(c.rate)}</td></tr>)}
            </tbody>
          </table>
        ) : <p className="text-sm text-muted">No quote requests in this period.</p>}
      </Panel>

      <Panel title="Recent emails" aside={
        <span className="text-xs text-muted">
          Daily job: {run?.last_finished_at ? `last ran ${dt.format(new Date(run.last_finished_at))}${run.last_error ? " (with errors)" : ""}` : "hasn't run yet"}
        </span>
      }>
        {failedEmails > 0 && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{failedEmails} recent email{failedEmails > 1 ? "s" : ""} failed. Check the Launch page for email setup.</p>}
        {emails.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="py-2">When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
              <tbody className="divide-y divide-line">
                {emails.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap py-2 pr-3">{dt.format(new Date(e.created_at))}</td>
                    <td className="pr-3">{e.to_email}</td>
                    <td className="pr-3">{e.subject}</td>
                    <td className={EMAIL_STATUS[e.status] ?? ""} title={e.error ?? undefined}>{e.status}{e.status === "skipped" ? " (email not set up)" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No emails yet.</p>}
      </Panel>
    </div>
  );
}
