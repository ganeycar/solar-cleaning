import { btn, Feedback, Field, Panel } from "@/components/admin-ui";
import { addTechnicianByEmail, saveBusinessSettings, setTechnicianActive } from "@/lib/admin/operations-actions";
import { requireStaff } from "@/lib/auth/staff";
import { centsToInput } from "@/lib/money";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function AdminBusiness({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  await requireStaff();
  const { msg, error } = await searchParams;
  const admin = getAdminClient();
  if (!admin) return <p className="text-muted">The Supabase service key isn&apos;t configured.</p>;
  const [{ data: s }, { data: techs }] = await Promise.all([
    admin.from("business_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("technicians").select("id, display_name, is_active, profiles(email)").order("created_at"),
  ]);
  const b = (s ?? {}) as Row;
  const colors = b.brand_colors ?? {};
  const links: string[] = Array.isArray(b.profile_links) ? b.profile_links : [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold">Business</h1>
      <Feedback msg={msg} error={error} />

      <Panel title="Business details">
        <form action={saveBusinessSettings} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><input name="businessName" required defaultValue={b.business_name ?? ""} className="field" /></Field>
            <Field label="Tagline"><input name="tagline" defaultValue={b.tagline ?? ""} className="field" /></Field>
            <Field label="Phone (shown on the website)"><input name="phone" defaultValue={b.phone ?? ""} className="field" /></Field>
            <Field label="Email (shown on the website)"><input name="email" type="email" defaultValue={b.email ?? ""} className="field" /></Field>
            <Field label="Home base city"><input name="headquartersCity" defaultValue={b.headquarters_city ?? "Vacaville"} className="field" /></Field>
            <Field label="Logo image link (https://…)" hint="Optional. Upload your logo anywhere public, then paste the link."><input name="logoUrl" defaultValue={b.logo_url ?? ""} className="field" /></Field>
          </div>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-bold">Brand colors</legend>
            {[["colorNavy", "Main (dark)", colors.navy ?? "#0b1b33"], ["colorCharcoal", "Text", colors.charcoal ?? "#1f2933"], ["colorGold", "Accent", colors.gold ?? "#e8b04a"]].map(([n, l, v]) => (
              <Field key={n} label={l}>
                <span className="flex items-center gap-2"><span aria-hidden="true" className="h-10 w-10 flex-none rounded-lg border border-line" style={{ background: v }} /><input name={n} defaultValue={v} pattern="#[0-9a-fA-F]{6}" className="field" /></span>
              </Field>
            ))}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">License and insurance</legend>
            <div>
              <Field label="License information" hint="e.g. City of Vacaville business license #12345"><input name="licenseInfo" defaultValue={b.license_info ?? ""} className="field" /></Field>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="licenseVerified" defaultChecked={b.license_verified} /> I&apos;ve confirmed this is current. Show it on the website.</label>
            </div>
            <div>
              <Field label="Insurance information" hint="e.g. General liability insured through Example Co."><input name="insuranceInfo" defaultValue={b.insurance_info ?? ""} className="field" /></Field>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="insuranceVerified" defaultChecked={b.insurance_verified} /> I&apos;ve confirmed this is current. Show it on the website.</label>
            </div>
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">Emails to customers</legend>
            <Field label="Review link (https://…)" hint="Your Google review link. Added to the email customers get after each cleaning. Leave blank until you have one.">
              <input name="reviewUrl" defaultValue={b.review_url ?? ""} className="field" />
            </Field>
            <Field label="Mailing address for emails" hint="Required by law in follow-up emails. A PO box or mailbox service is fine; it isn't shown on the website.">
              <input name="mailingAddress" defaultValue={b.mailing_address ?? ""} className="field" />
            </Field>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Google Business Profile, Yelp, Facebook links (one per line)" hint="Helps Google and AI tools connect your listings to this website.">
              <textarea name="profileLinks" rows={4} defaultValue={links.join("\n")} className="field" />
            </Field>
            <Field label="Your cost per cleaning (private)" hint="Labor, water, fuel, and equipment wear per visit. Used only for profit estimates.">
              <span className="relative block"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span><input name="costPerCleaning" inputMode="decimal" defaultValue={centsToInput(b.economics?.costPerCleaningCents ?? null)} className="field !pl-7" /></span>
            </Field>
          </div>
          <button className={btn.dark}>Save business details</button>
        </form>
      </Panel>

      <Panel title="Team (technicians)">
        <ul className="divide-y divide-line text-sm">
          {((techs ?? []) as Row[]).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span><strong className="text-navy">{t.display_name}</strong> <span className="text-muted">{(Array.isArray(t.profiles) ? t.profiles[0] : t.profiles)?.email}</span></span>
              <form action={setTechnicianActive.bind(null, t.id, !t.is_active)}>
                <button className={t.is_active ? btn.danger : btn.outline}>{t.is_active ? "Deactivate" : "Reactivate"}</button>
              </form>
            </li>
          ))}
          {(techs ?? []).length === 0 && <li className="py-2 text-muted">No technicians yet. Add yourself on the Schedule page, or add a helper below.</li>}
        </ul>
        <form action={addTechnicianByEmail} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <Field label="Helper's email"><input name="email" type="email" required className="field" /></Field>
          <Field label="Name shown on jobs"><input name="displayName" className="field" /></Field>
          <button className={btn.outline}>Add technician</button>
        </form>
        <p className="mt-2 text-xs text-muted">They must sign in once at /login first. Technicians see only their own jobs at /tech: addresses, notes, and photos, never payments or other customers.</p>
      </Panel>
    </div>
  );
}
