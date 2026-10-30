import { btn, Feedback, Panel } from "@/components/admin-ui";
import { launchChecks, readiness, type CheckState } from "@/lib/admin/launch";
import { runDailyJobNow, sendTestEmail } from "@/lib/admin/launch-actions";
import { requireStaff } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BADGE: Record<CheckState, { label: string; cls: string }> = {
  ok: { label: "Done", cls: "bg-emerald-50 text-emerald-800" },
  todo: { label: "To do", cls: "bg-amber-50 text-amber-900" },
  warn: { label: "Check", cls: "bg-red-50 text-red-800" },
  manual: { label: "Your step", cls: "bg-sky-50 text-sky-800" },
};

const ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SITE_INDEXABLE", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_LIVE_MODE_APPROVED",
  "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_TEST_TO", "OWNER_NOTIFY_EMAIL", "CRON_SECRET",
];

export default async function AdminLaunch({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  await requireStaff();
  const { msg, error } = await searchParams;
  const admin = getAdminClient();
  if (!admin) return <p className="text-muted">The Supabase service key isn&apos;t configured.</p>;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const [prices, rules, techs, biz, lastEvt, failedEvt, run, failedEmails] = await Promise.all([
    admin.from("plan_prices").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("pricing_rules").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("technicians").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("business_settings").select("phone, email, mailing_address, review_url, license_verified, insurance_verified").eq("id", 1).maybeSingle(),
    admin.from("stripe_events").select("received_at").order("received_at", { ascending: false }).limit(1),
    admin.from("stripe_events").select("id", { count: "exact", head: true }).is("processed_at", null).not("error", "is", null),
    admin.from("job_runs").select("last_finished_at, last_error").eq("name", "daily").maybeSingle(),
    admin.from("email_log").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo),
  ]);
  const b = (biz.data ?? {}) as Row;
  const env: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) env[k] = process.env[k];

  const checks = launchChecks({
    env,
    publishedPrices: prices.count ?? 0,
    pricingRulesPublished: (rules.count ?? 0) > 0,
    activeTechnicians: techs.count ?? 0,
    business: { phone: b.phone ?? null, email: b.email ?? null, mailingAddress: b.mailing_address ?? null, reviewUrl: b.review_url ?? null, licenseVerified: Boolean(b.license_verified), insuranceVerified: Boolean(b.insurance_verified) },
    lastWebhookAt: ((lastEvt.data ?? []) as Row[])[0]?.received_at ?? null,
    failedWebhooks: failedEvt.count ?? 0,
    lastDailyRunAt: (run.data as Row | null)?.last_finished_at ?? null,
    lastDailyError: (run.data as Row | null)?.last_error ?? null,
    failedEmails7d: failedEmails.count ?? 0,
    now,
  });
  const { done, total } = readiness(checks);
  const groups = [...new Set(checks.map((c) => c.group))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Launch checklist</h1>
        <p className="mt-1 text-muted">{done} of {total} setup items done. Items marked &ldquo;Your step&rdquo; happen outside the website.</p>
      </div>
      <Feedback msg={msg} error={error} />

      <Panel title="Try it">
        <div className="flex flex-wrap gap-3">
          <form action={sendTestEmail}><button className={btn.dark}>Send me a test email</button></form>
          <form action={runDailyJobNow}><button className={btn.outline}>Run daily job now</button></form>
        </div>
        <p className="mt-3 text-xs text-muted">The daily job sends tomorrow&apos;s appointment reminders, quote follow-ups, and membership notices. Once the site is online it runs by itself every morning; running it again never sends duplicates.</p>
      </Panel>

      {groups.map((g) => (
        <Panel key={g} title={g}>
          <ul className="divide-y divide-line">
            {checks.filter((c) => c.group === g).map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-semibold text-navy">{c.label}</p>
                  <p className="text-sm text-muted">{c.detail}</p>
                </div>
                <span className={`flex-none rounded-full px-3 py-1 text-xs font-semibold ${BADGE[c.state].cls}`}>{BADGE[c.state].label}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
