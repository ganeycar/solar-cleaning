import Link from "next/link";
import { notFound } from "next/navigation";
import { btn, Feedback, Field, Panel } from "@/components/admin-ui";
import { grantCleaning, manualBook, updateCustomerContact, updateCustomerProperty } from "@/lib/admin/operations-actions";
import { requireStaff } from "@/lib/auth/staff";
import { formatCents } from "@/lib/pricing/engine";
import { ACCESS_TYPES, PROPERTY_TYPES, ROOF_TYPES } from "@/lib/quote/validate";
import { addDays, localDate } from "@/lib/scheduling/slots";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const TZ = "America/Los_Angeles";
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const one = (x: unknown) => (Array.isArray(x) ? x[0] : x) as Row | undefined;

function Select({ name, options, value }: { name: string; options: Record<string, string>; value: string }) {
  return (
    <select name={name} defaultValue={value} className="field">
      {Object.entries(options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export default async function AdminCustomer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  await requireStaff();
  const [{ id }, { msg, error }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = getAdminClient();
  if (!admin) return <p className="text-muted">The Supabase service key isn&apos;t configured.</p>;

  const [profileRes, propsRes, subsRes, creditsRes, bookingsRes, quotesRes, paymentsRes, techRes] = await Promise.all([
    admin.from("profiles").select("*").eq("id", id).maybeSingle(),
    admin.from("properties").select("*").eq("customer_id", id).order("created_at"),
    admin.from("subscriptions").select("*, plans(name), plan_prices(amount_cents, billing_interval)").eq("customer_id", id).order("created_at", { ascending: false }),
    admin.from("service_entitlements").select("*").eq("customer_id", id).order("valid_until"),
    admin.from("bookings").select("id, scheduled_start, status, cancel_reason, technicians(display_name), properties(address_line1)").eq("customer_id", id).order("scheduled_start", { ascending: false }).limit(30),
    admin.from("quote_requests").select("id, created_at, status, approved_price_cents, address_line1, panel_count").eq("customer_id", id).order("created_at", { ascending: false }),
    admin.from("payments").select("created_at, amount_cents, refunded_cents, status, description").eq("customer_id", id).order("created_at", { ascending: false }).limit(30),
    admin.from("technicians").select("id, display_name").eq("is_active", true),
  ]);
  const p = profileRes.data as Row | null;
  if (!p) notFound();
  const properties = (propsRes.data ?? []) as Row[];
  const credits = (creditsRes.data ?? []) as Row[];
  const available = credits.filter((c) => c.status === "available");
  const today = localDate(new Date(), TZ);
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;

  return (
    <div className="space-y-6">
      <Link href="/admin/customers" className="text-sm text-muted underline">← All customers</Link>
      <div>
        <h1 className="text-3xl font-extrabold">{name}</h1>
        <p className="mt-1 text-sm text-muted">{p.email}{p.phone ? <> · <a href={`tel:${p.phone}`} className="underline">{p.phone}</a></> : null} · joined {dateFmt.format(new Date(p.created_at))}{p.role !== "customer" ? ` · ${p.role}` : ""}</p>
        <p className="mt-1 text-xs text-muted">Marketing: email {p.marketing_email_opt_in ? "yes" : "no"}, text {p.marketing_sms_opt_in ? "yes" : "no"}</p>
      </div>
      <Feedback msg={msg} error={error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Cleanings" aside={<span className="text-sm font-semibold text-navy">{available.length} available</span>}>
          {credits.length ? (
            <ul className="divide-y divide-line text-sm">
              {credits.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{c.note ?? c.source} <span className="text-muted">· valid {dateFmt.format(new Date(c.valid_from + "T12:00:00Z"))}–{dateFmt.format(new Date(c.valid_until + "T12:00:00Z"))}</span></span>
                  <span className="font-semibold">{c.status}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No cleanings yet.</p>}
          <details className="mt-4 border-t border-line pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-navy">Give a cleaning (goodwill, makeup visit, paid in person)</summary>
            <form action={grantCleaning.bind(null, id)} className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Reason"><input name="reason" required placeholder="Makeup visit after rain delay" className="field" /></Field>
              <Field label="Valid until"><input type="date" name="validUntil" required defaultValue={addDays(today, 365)} className="field" /></Field>
              <div className="sm:col-span-2"><button className={btn.outline}>Add cleaning</button></div>
            </form>
          </details>
        </Panel>

        <Panel title="Book an appointment">
          {properties.length === 0 ? (
            <p className="text-sm text-muted">This customer has no property on file yet. A property is created when they pay for a quote.</p>
          ) : (techRes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">Set up a technician first on the <Link href="/admin/schedule" className="underline">Schedule</Link> page.</p>
          ) : (
            <form action={manualBook.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Property">
                <select name="propertyId" className="field">{properties.map((pr) => <option key={pr.id} value={pr.id}>{pr.address_line1}, {pr.city}</option>)}</select>
              </Field>
              <Field label="Technician">
                <select name="technicianId" className="field">{((techRes.data ?? []) as Row[]).map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}</select>
              </Field>
              <Field label="Date"><input type="date" name="date" required min={today} defaultValue={addDays(today, 1)} className="field" /></Field>
              <Field label="Arrival time"><input type="time" name="time" required defaultValue="09:00" className="field" /></Field>
              <Field label="Job length in minutes" hint="Blank = estimate from panel count"><input name="minutes" type="number" min={15} max={600} className="field" /></Field>
              <Field label="Notes (optional)"><input name="notes" className="field" /></Field>
              <div className="sm:col-span-2">
                <button className={btn.primary} disabled={available.length === 0}>Book using an available cleaning</button>
                {available.length === 0 && <p className="mt-2 text-xs text-muted">No available cleanings. Add one first, or ask the customer to pay online.</p>}
              </div>
            </form>
          )}
        </Panel>
      </div>

      <Panel title="Appointments">
        {(bookingsRes.data ?? []).length ? (
          <ul className="divide-y divide-line text-sm">
            {((bookingsRes.data ?? []) as Row[]).map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{dtFmt.format(new Date(b.scheduled_start))} · {one(b.properties)?.address_line1} · {one(b.technicians)?.display_name ?? "Unassigned"}</span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{b.status.replace("_", " ")}{b.cancel_reason ? ` (${b.cancel_reason})` : ""}</span>
                  {b.status === "completed" && <Link href={`/dashboard/reports/${b.id}`} className="text-navy underline">Report</Link>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No appointments yet.</p>}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Memberships">
          {(subsRes.data ?? []).length ? (
            <ul className="space-y-4 text-sm">
              {((subsRes.data ?? []) as Row[]).map((s) => (
                <li key={s.id}>
                  <p className="font-semibold text-navy">{one(s.plans)?.name} · {s.status}{s.cancel_at_period_end ? " (ending)" : ""}</p>
                  <p className="text-muted">
                    {one(s.plan_prices)?.amount_cents != null ? `${formatCents(one(s.plan_prices)!.amount_cents)} / ${one(s.plan_prices)!.billing_interval}` : ""}
                    {s.current_period_end ? ` · renews ${dateFmt.format(new Date(s.current_period_end))}` : ""}
                  </p>
                  {s.auto_renew_consent_at && (
                    <details className="mt-1 text-xs text-muted">
                      <summary className="cursor-pointer">Auto-renewal consent record</summary>
                      <p className="mt-1">Agreed {dtFmt.format(new Date(s.auto_renew_consent_at))} · terms version {s.consent_terms_version}</p>
                      <p className="mt-1 italic">&ldquo;{s.consent_disclosure}&rdquo;</p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No membership.</p>}
        </Panel>

        <Panel title="Payments">
          {(paymentsRes.data ?? []).length ? (
            <ul className="divide-y divide-line text-sm">
              {((paymentsRes.data ?? []) as Row[]).map((pm, i) => (
                <li key={i} className="flex justify-between gap-2 py-2">
                  <span>{dateFmt.format(new Date(pm.created_at))} · {pm.description ?? "Payment"}</span>
                  <span className={pm.status === "failed" ? "font-semibold text-red-700" : ""}>{formatCents(pm.amount_cents)} · {pm.status}{pm.refunded_cents ? ` (−${formatCents(pm.refunded_cents)})` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No payments.</p>}
          <p className="mt-3 text-xs text-muted">Refunds are issued in your Stripe dashboard and show here automatically.</p>
        </Panel>
      </div>

      <Panel title="Contact details">
        <form action={updateCustomerContact.bind(null, id)} className="grid gap-3 sm:grid-cols-3">
          <Field label="First name"><input name="firstName" defaultValue={p.first_name ?? ""} className="field" /></Field>
          <Field label="Last name"><input name="lastName" defaultValue={p.last_name ?? ""} className="field" /></Field>
          <Field label="Phone"><input name="phone" defaultValue={p.phone ?? ""} className="field" /></Field>
          <div className="sm:col-span-3"><button className={btn.outline}>Save contact</button></div>
        </form>
      </Panel>

      {properties.map((pr) => (
        <Panel key={pr.id} title={`Property: ${pr.address_line1}`}>
          <form action={updateCustomerProperty.bind(null, id, pr.id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Street address"><input name="addressLine1" defaultValue={pr.address_line1} required className="field" /></Field>
            <Field label="Unit"><input name="addressLine2" defaultValue={pr.address_line2 ?? ""} className="field" /></Field>
            <Field label="City"><input name="city" defaultValue={pr.city} required className="field" /></Field>
            <Field label="ZIP"><input name="postalCode" defaultValue={pr.postal_code} required className="field" /></Field>
            <Field label="Panels"><input name="panelCount" type="number" min={1} defaultValue={pr.panel_count} className="field" /></Field>
            <Field label="Stories"><input name="stories" type="number" min={1} defaultValue={pr.stories} className="field" /></Field>
            <Field label="Property type"><Select name="propertyType" options={PROPERTY_TYPES} value={pr.property_type} /></Field>
            <Field label="Roof"><Select name="roofType" options={ROOF_TYPES} value={pr.roof_type} /></Field>
            <Field label="Access"><Select name="accessType" options={ACCESS_TYPES} value={pr.access_type} /></Field>
            <div className="sm:col-span-2 lg:col-span-3"><Field label="Technician instructions"><input name="technicianInstructions" defaultValue={pr.technician_instructions ?? ""} className="field" /></Field></div>
            <div className="sm:col-span-2 lg:col-span-4"><button className={btn.outline}>Save property</button></div>
          </form>
        </Panel>
      ))}

      {(quotesRes.data ?? []).length > 0 && (
        <Panel title="Quotes">
          <ul className="divide-y divide-line text-sm">
            {((quotesRes.data ?? []) as Row[]).map((q) => (
              <li key={q.id} className="flex justify-between gap-2 py-2">
                <span>{dateFmt.format(new Date(q.created_at))} · {q.address_line1} · {q.panel_count} panels</span>
                <span>{q.status}{q.approved_price_cents != null ? ` · ${formatCents(q.approved_price_cents)}` : ""}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
