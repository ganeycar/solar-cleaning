import { btn, DollarInput, Feedback, Field, Panel } from "@/components/admin-ui";
import { savePricingRules, saveTerritory, unpublishPricingRules } from "@/lib/admin/actions";
import { requireStaff } from "@/lib/auth/staff";
import { centsToInput } from "@/lib/money";
import { ACCESS_OPTIONS, MAX_TIERS, PROPERTY_OPTIONS, ROOF_OPTIONS, toEditable } from "@/lib/pricing/config-form";
import { ACCESS_TYPES, PROPERTY_TYPES, ROOF_TYPES } from "@/lib/quote/validate";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { supabase } = await requireStaff();
  const { msg, error } = await searchParams;

  const [{ data: versions }, { data: territories }] = await Promise.all([
    supabase.from("pricing_rules").select("id,version,status,config,notes,created_at,published_at").order("version", { ascending: false }).limit(20),
    supabase.from("service_territories").select("*").order("sort_order"),
  ]);
  const rows = (versions ?? []) as Row[];
  const published = rows.find((r) => r.status === "published");
  const latest = rows[0];
  const c = toEditable(latest?.config);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Quote pricing &amp; service areas</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          These settings power the instant quote. Every save creates a new version, so past quotes always show the pricing they were given.
        </p>
      </div>
      <Feedback msg={msg} error={error} />

      <div className={`rounded-xl border p-4 text-sm ${published ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
        {published ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span><strong>Instant prices are ON</strong> (version {published.version}, live since {dateFmt.format(new Date(published.published_at))}). Simple jobs get a price right away; anything uncertain still comes to you.</span>
            <form action={unpublishPricingRules}><button className={btn.danger}>Turn off instant prices</button></form>
          </div>
        ) : (
          <span><strong>Instant prices are OFF.</strong> Every quote request comes to you for a price. Fill in the form below and choose &quot;Save and publish&quot; when you&apos;re ready.</span>
        )}
      </div>

      <Panel title={`Quote pricing${latest ? ` (showing version ${latest.version}, ${latest.status})` : ""}`}>
        <form action={savePricingRules} className="space-y-8">
          <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="mb-3 text-sm font-bold">Visit pricing</legend>
            <Field label="Base visit price"><DollarInput name="baseVisit" defaultValue={centsToInput(c.baseVisitCents)} /></Field>
            <Field label="Panels included in base price"><input name="includedPanels" type="number" min={0} defaultValue={c.includedPanels} className="field" /></Field>
            <Field label="Minimum visit price"><DollarInput name="minimumVisit" defaultValue={centsToInput(c.minimumVisitCents)} /></Field>
            <Field label="Each additional story"><DollarInput name="perExtraStory" defaultValue={centsToInput(c.perExtraStoryCents)} /></Field>
            <Field label="Ladder surcharge"><DollarInput name="surchargeLadder" defaultValue={centsToInput(c.accessSurchargesCents.ladder_required ?? 0)} /></Field>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-bold">Price per panel (above the included panels)</legend>
            <p className="mb-3 text-xs text-muted">The first tier must start at 1. Add tiers to lower the per-panel price for larger systems. Leave rows blank to remove them.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: MAX_TIERS }).map((_, i) => {
                const t = c.panelTiers[i];
                return (
                  <div key={i} className="flex items-end gap-2 rounded-lg bg-paper p-3">
                    <Field label={`From panel #`}><input name={`tier_min_${i}`} type="number" min={1} defaultValue={t?.minPanels ?? ""} className="field w-24" /></Field>
                    <Field label="Per panel"><DollarInput name={`tier_price_${i}`} defaultValue={t ? centsToInput(t.perPanelCents) : ""} /></Field>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-3 text-sm font-bold">Membership discount on the quoted visit price (%)</legend>
            <Field label="Seasonal Care"><input name="discountSeasonal" type="number" min={0} max={100} defaultValue={c.membershipDiscountPct.seasonal ?? 0} className="field" /></Field>
            <Field label="Premium Care"><input name="discountPremium" type="number" min={0} max={100} defaultValue={c.membershipDiscountPct.premium ?? 0} className="field" /></Field>
            <Field label="Unlimited Care"><input name="discountUnlimited" type="number" min={0} max={100} defaultValue={c.membershipDiscountPct.unlimited ?? 0} className="field" /></Field>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 text-sm font-bold">Send to me for review when…</legend>
            <p className="text-xs text-muted">Unknown roofs, &quot;not sure&quot; access, and anything needing roof walking are always reviewed, whatever you choose here.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="More panels than"><input name="maxAutoPanels" type="number" min={1} defaultValue={c.review.maxAutoPanels} className="field" /></Field>
              <Field label="More stories than"><input name="maxAutoStories" type="number" min={1} max={10} defaultValue={c.review.maxAutoStories} className="field" /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 text-sm">
              <div><p className="mb-2 font-semibold text-navy">Roof types</p>{ROOF_OPTIONS.map((r) => <label key={r} className="flex items-center gap-2"><input type="checkbox" name="reviewRoof" value={r} defaultChecked={c.review.reviewRoofTypes.includes(r)} /> {ROOF_TYPES[r]}</label>)}</div>
              <div><p className="mb-2 font-semibold text-navy">Access</p>{ACCESS_OPTIONS.map((a) => <label key={a} className="flex items-center gap-2"><input type="checkbox" name="reviewAccess" value={a} defaultChecked={c.review.reviewAccessTypes.includes(a)} /> {ACCESS_TYPES[a]}</label>)}</div>
              <div><p className="mb-2 font-semibold text-navy">Property types</p>{PROPERTY_OPTIONS.map((p) => <label key={p} className="flex items-center gap-2"><input type="checkbox" name="reviewProperty" value={p} defaultChecked={c.review.reviewPropertyTypes.includes(p)} /> {PROPERTY_TYPES[p]}</label>)}</div>
            </div>
          </fieldset>

          <Field label="Note for this version (optional)"><input name="notes" maxLength={300} placeholder="e.g. Launch pricing after first 10 jobs" className="field" /></Field>

          <div className="flex flex-wrap gap-3 border-t border-line pt-5">
            <button name="publish" value="0" className={btn.outline}>Save as draft</button>
            <button name="publish" value="1" className={btn.primary}>Save and publish</button>
          </div>
        </form>
      </Panel>

      {rows.length > 0 && (
        <details className="rounded-2xl border border-line bg-white p-5 text-sm">
          <summary className="cursor-pointer font-semibold text-navy">Version history ({rows.length})</summary>
          <ul className="mt-3 space-y-1 text-muted">
            {rows.map((r) => <li key={r.id}>v{r.version} · {r.status} · saved {dateFmt.format(new Date(r.created_at))}{r.notes ? ` · ${r.notes}` : ""}</li>)}
          </ul>
        </details>
      )}

      <Panel title="Service areas">
        <p className="mb-4 text-sm text-muted">Turn on &quot;Accepting new customers&quot; to open a city for instant quotes and booking. Others show a waitlist.</p>
        <div className="space-y-3">
          {((territories ?? []) as Row[]).map((t) => (
            <form key={t.id} action={saveTerritory.bind(null, t.id)} className="flex flex-wrap items-end gap-4 rounded-lg bg-paper p-3">
              <p className="w-32 font-semibold text-navy">{t.name}</p>
              <label className="text-xs font-semibold text-navy">Travel fee<span className="mt-1 block w-28"><DollarInput name="travelFee" defaultValue={centsToInput(t.travel_fee_cents)} /></span></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acceptingNew" defaultChecked={t.accepting_new} /> Accepting new customers</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={t.is_active} /> Listed on website</label>
              <button className={btn.outline}>Save</button>
            </form>
          ))}
        </div>
      </Panel>
    </div>
  );
}
