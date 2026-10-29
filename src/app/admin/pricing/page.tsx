import { btn, DollarInput, Feedback, Field, Panel } from "@/components/admin-ui";
import { addPriceVersion, publishPrice, saveDraftAmount, savePlanDetails, unpublishPrice } from "@/lib/admin/actions";
import { requireStaff } from "@/lib/auth/staff";
import { centsToInput } from "@/lib/money";
import { formatCents } from "@/lib/pricing/engine";
import { getStripe } from "@/lib/stripe/client";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Interval = "one_time" | "month" | "year";

const INTERVAL_LABEL: Record<Interval, string> = { one_time: "Per cleaning (\"starting at\" on the website)", month: "Monthly billing", year: "Yearly billing" };
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" });

export default async function AdminPricingPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { supabase } = await requireStaff();
  const { msg, error } = await searchParams;
  const { data } = await supabase
    .from("plans")
    .select("*, plan_prices(id,billing_interval,amount_cents,status,stripe_price_id,published_at,archived_at,created_at)")
    .order("display_order");
  const plans = (data ?? []) as Row[];
  const stripe = getStripe();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Plans &amp; prices</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Prices start as private drafts. Publishing makes a price live on the website and available at checkout. A published price is never edited: you publish a new version, and existing members keep the price they signed up at.
        </p>
      </div>
      <Feedback msg={msg} error={error} />
      {!stripe.ok && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Stripe: {stripe.reason} Membership prices can&apos;t be published until it&apos;s connected.</div>
      )}
      {stripe.ok && !stripe.live && <p className="text-xs font-semibold text-muted">Stripe is in TEST MODE. Payments use test cards only.</p>}

      {plans.map((plan) => {
        const prices = (plan.plan_prices ?? []) as Row[];
        const intervals: Interval[] = plan.kind === "subscription" ? ["month", "year"] : plan.kind === "one_time" ? ["one_time"] : [];
        return (
          <Panel key={plan.id} title={plan.name} aside={<span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">{plan.is_active ? "Shown on website" : "Hidden"}</span>}>
            {intervals.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {intervals.map((interval) => {
                  const forInterval = prices.filter((p) => p.billing_interval === interval);
                  const published = forInterval.find((p) => p.status === "published");
                  const draft = forInterval.find((p) => p.status === "draft");
                  const history = forInterval.filter((p) => p.status === "archived").sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
                  return (
                    <div key={interval} className="rounded-xl border border-line p-4">
                      <h3 className="text-sm font-bold">{INTERVAL_LABEL[interval]}</h3>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {published ? (
                          <p className="text-sm"><span className="font-display text-xl font-bold text-navy">{formatCents(published.amount_cents)}</span> <span className="text-muted">live since {dateFmt.format(new Date(published.published_at))}</span></p>
                        ) : (
                          <p className="text-sm text-muted">Not published: the website shows &quot;Pricing coming soon.&quot;</p>
                        )}
                        {published && (
                          <form action={unpublishPrice.bind(null, published.id)}><button className="text-xs font-semibold text-red-700 underline">Unpublish</button></form>
                        )}
                      </div>

                      {draft ? (
                        <div className="mt-3 rounded-lg bg-paper p-3">
                          <form action={saveDraftAmount.bind(null, draft.id)} className="flex flex-wrap items-end gap-2">
                            <label className="text-xs font-semibold text-navy">Draft {published ? "new price" : "price"}
                              <span className="mt-1 block w-32"><DollarInput name="amount" required defaultValue={centsToInput(draft.amount_cents)} /></span>
                            </label>
                            <button className={btn.outline}>Save draft</button>
                          </form>
                          {draft.amount_cents != null && (
                            <form action={publishPrice.bind(null, draft.id)} className="mt-2">
                              <button className={btn.primary}>Publish {formatCents(draft.amount_cents)}{published ? ` (replaces ${formatCents(published.amount_cents)})` : ""}</button>
                            </form>
                          )}
                        </div>
                      ) : (
                        <form action={addPriceVersion.bind(null, plan.id, interval)} className="mt-3">
                          <button className={btn.outline}>{published ? "Change price…" : "Set a price…"}</button>
                        </form>
                      )}

                      {history.length > 0 && (
                        <details className="mt-3 text-xs text-muted">
                          <summary className="cursor-pointer">Price history ({history.length})</summary>
                          <ul className="mt-2 space-y-1">
                            {history.map((h) => <li key={h.id}>{h.amount_cents != null ? formatCents(h.amount_cents) : "—"} · {h.published_at ? dateFmt.format(new Date(h.published_at)) : "never published"} to {h.archived_at ? dateFmt.format(new Date(h.archived_at)) : "—"}</li>)}
                          </ul>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted">Commercial jobs are priced individually from quote requests.</p>
            )}

            <details className="mt-5 border-t border-line pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-navy">Edit plan details and benefits</summary>
              <form action={savePlanDetails.bind(null, plan.id)} className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Plan name"><input name="name" defaultValue={plan.name} required className="field" /></Field>
                <Field label="Short description"><input name="summary" defaultValue={plan.summary ?? ""} className="field" /></Field>
                <Field label="Cleanings per year" hint="Leave blank for commercial."><input name="cleaningsPerYear" type="number" min={0} max={52} defaultValue={plan.cleanings_per_year ?? ""} className="field" /></Field>
                <Field label="Minimum days between cleanings"><input name="minDaysBetween" type="number" min={0} max={365} defaultValue={plan.min_days_between_cleanings ?? ""} className="field" /></Field>
                <Field label="Maximum panels included" hint="Larger systems can't buy this plan online. Blank = no limit."><input name="maxPanelsIncluded" type="number" min={1} defaultValue={plan.max_panels_included ?? ""} className="field" /></Field>
                <div className="space-y-2 pt-6 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" name="priorityScheduling" defaultChecked={plan.priority_scheduling} /> Priority scheduling</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={plan.is_active} /> Show this plan on the website</label>
                </div>
                <Field label="Benefits (one per line)"><textarea name="benefits" rows={4} defaultValue={(plan.benefits ?? []).join("\n")} className="field" /></Field>
                <Field label="Limitations shown to customers (one per line)"><textarea name="limitations" rows={4} defaultValue={(plan.limitations ?? []).join("\n")} className="field" /></Field>
                <p className="text-xs text-muted sm:col-span-2">Changes to included cleanings or limits apply to existing members too. Give members notice before reducing benefits.</p>
                <div className="sm:col-span-2"><button className={btn.dark}>Save plan details</button></div>
              </form>
            </details>
          </Panel>
        );
      })}
    </div>
  );
}
