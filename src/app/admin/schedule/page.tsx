import { btn, Feedback, Field, Panel } from "@/components/admin-ui";
import { addBlackout, addSelfAsTechnician, deleteBlackout, generateCalendarToken, markCompleted, noAccess, saveSchedulingSettings, weatherCancel } from "@/lib/admin/schedule-actions";
import { requireStaff } from "@/lib/auth/staff";
import { loadSchedulingSettings } from "@/lib/scheduling/data";
import { localDate } from "@/lib/scheduling/slots";
import { siteUrl } from "@/lib/site";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TZ = "America/Los_Angeles";
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });

export default async function AdminSchedulePage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { supabase } = await requireStaff();
  const { msg, error } = await searchParams;
  const admin = getAdminClient();
  if (!admin) return <Feedback error="The Supabase service key isn't configured." />;

  const now = new Date();
  const [settings, techRes, bookingRes, blackoutRes, tokenRes] = await Promise.all([
    loadSchedulingSettings(admin),
    admin.from("technicians").select("id, display_name, is_active"),
    supabase
      .from("bookings")
      .select("id, scheduled_start, scheduled_end, status, customer_notes, profiles!bookings_customer_id_fkey(first_name, last_name, phone, email), properties(address_line1, city, panel_count, technician_instructions, access_type)")
      .gte("scheduled_start", new Date(now.getTime() - 2 * 24 * 3600_000).toISOString())
      .lte("scheduled_start", new Date(now.getTime() + 45 * 24 * 3600_000).toISOString())
      .in("status", ["requested", "confirmed", "in_progress", "rescheduled"])
      .order("scheduled_start"),
    admin.from("blackout_dates").select("id, starts_at, ends_at, reason").gte("ends_at", now.toISOString()).order("starts_at"),
    admin.from("business_settings").select("calendar_token").eq("id", 1).maybeSingle(),
  ]);
  const technicians = (techRes.data ?? []) as Row[];
  const bookings = (bookingRes.data ?? []) as Row[];
  const blackouts = (blackoutRes.data ?? []) as Row[];
  const token: string | null = tokenRes.data?.calendar_token ?? null;
  const calendarUrl = token ? `${siteUrl()}/api/calendar/${token}` : null;

  const byDay = new Map<string, Row[]>();
  for (const b of bookings) {
    const d = localDate(new Date(b.scheduled_start), TZ);
    byDay.set(d, [...(byDay.get(d) ?? []), b]);
  }
  const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Schedule</h1>
        <p className="mt-1 text-sm text-muted">Customers book open times themselves. Times shown in Pacific time.</p>
      </div>
      <Feedback msg={msg} error={error} />

      {technicians.filter((t) => t.is_active).length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <span><strong>No technician is set up</strong>, so customers can&apos;t book any times yet.</span>
          <form action={addSelfAsTechnician}><button className={btn.primary}>I&apos;ll do the cleanings myself</button></form>
        </div>
      )}

      <Panel title="Upcoming appointments">
        {byDay.size === 0 ? (
          <p className="text-sm text-muted">No appointments in the next 45 days.</p>
        ) : (
          <div className="space-y-6">
            {[...byDay.entries()].map(([day, list]) => (
              <div key={day}>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{dayFmt.format(new Date(list[0].scheduled_start))}</h3>
                <ul className="space-y-3">
                  {list.map((b) => {
                    const c = one(b.profiles) as Row | undefined;
                    const p = one(b.properties) as Row | undefined;
                    const past = new Date(b.scheduled_start) < now;
                    return (
                      <li key={b.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-navy">{timeFmt.format(new Date(b.scheduled_start))}–{timeFmt.format(new Date(b.scheduled_end))} · {[c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.email}</p>
                            <p className="text-sm text-muted">{p?.address_line1}, {p?.city} · {p?.panel_count} panels{c?.phone ? <> · <a href={`tel:${c.phone}`} className="underline">{c.phone}</a></> : null}</p>
                            {(p?.technician_instructions || b.customer_notes) && (
                              <p className="mt-1 text-sm"><strong>Notes:</strong> {[p?.technician_instructions, b.customer_notes].filter(Boolean).join(" · ")}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <form action={markCompleted.bind(null, b.id)}><button className={btn.dark}>Completed</button></form>
                            {!past && <form action={weatherCancel.bind(null, b.id)}><button className={btn.outline}>Weather: cancel &amp; return cleaning</button></form>}
                            <form action={noAccess.bind(null, b.id)}><button className={btn.danger}>No access</button></form>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">Weather cancels give the cleaning back so the customer can rebook. No access counts the cleaning as used. Automatic customer emails arrive in Phase 6; until then, call or text the customer.</p>
      </Panel>

      <Panel title="Working hours & job timing">
        <form action={saveSchedulingSettings} className="space-y-6">
          <div className="space-y-2">
            {DAYS.map((name, d) => {
              const h = settings.weeklyHours[d];
              return (
                <div key={name} className="flex flex-wrap items-center gap-3 rounded-lg bg-paper p-2 text-sm">
                  <label className="flex w-32 items-center gap-2 font-semibold text-navy"><input type="checkbox" name={`day_${d}_open`} defaultChecked={Boolean(h)} /> {name}</label>
                  <input type="time" name={`day_${d}_start`} defaultValue={h?.start ?? "08:00"} className="field !w-32 !py-1.5" aria-label={`${name} start`} />
                  <span className="text-muted">to</span>
                  <input type="time" name={`day_${d}_end`} defaultValue={h?.end ?? "16:00"} className="field !w-32 !py-1.5" aria-label={`${name} end`} />
                </div>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Base job time (minutes)"><input name="durationBaseMinutes" type="number" min={15} defaultValue={settings.durationBaseMinutes} className="field" /></Field>
            <Field label="Extra minutes per panel"><input name="durationPerPanelMinutes" type="number" min={0} step={0.5} defaultValue={settings.durationPerPanelMinutes} className="field" /></Field>
            <Field label="Travel buffer between jobs (min)"><input name="bufferMinutes" type="number" min={0} defaultValue={settings.bufferMinutes} className="field" /></Field>
            <Field label="Start times every (min)"><input name="slotStepMinutes" type="number" min={15} step={15} defaultValue={settings.slotStepMinutes} className="field" /></Field>
            <Field label="Minimum notice (hours)"><input name="minNoticeHours" type="number" min={0} defaultValue={settings.minNoticeHours} className="field" /></Field>
            <Field label="Customers can book up to (days ahead)"><input name="horizonDays" type="number" min={7} defaultValue={settings.horizonDays} className="field" /></Field>
            <Field label="Customers can change up to (hours before)"><input name="rescheduleCutoffHours" type="number" min={0} defaultValue={settings.rescheduleCutoffHours} className="field" /></Field>
          </div>
          <p className="text-xs text-muted">Job time = base + minutes per panel, rounded up to 15 minutes. Record your real job times from your first cleanings and adjust these.</p>
          <button className={btn.dark}>Save scheduling settings</button>
        </form>
      </Panel>

      <Panel title="Days off">
        <form action={addBlackout} className="flex flex-wrap items-end gap-3">
          <Field label="From"><input type="date" name="from" required className="field" /></Field>
          <Field label="To (optional)"><input type="date" name="to" className="field" /></Field>
          <Field label="Reason (optional)"><input name="reason" placeholder="Vacation, rain forecast…" className="field" /></Field>
          <button className={btn.outline}>Add days off</button>
        </form>
        {blackouts.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {blackouts.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper p-2">
                <span>{shortDate.format(new Date(b.starts_at))} – {shortDate.format(new Date(new Date(b.ends_at).getTime() - 1))}{b.reason ? ` · ${b.reason}` : ""}</span>
                <form action={deleteBlackout.bind(null, b.id)}><button className="text-xs font-semibold text-red-700 underline">Remove</button></form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="See appointments in your calendar">
        {calendarUrl ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted">Subscribe to this private link to see every appointment in your calendar app. It updates automatically. Anyone with the link can see customer names and addresses, so keep it private.</p>
            <input readOnly value={calendarUrl} className="field font-mono text-xs" aria-label="Calendar link" />
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li><strong>Apple Calendar (Mac):</strong> File → New Calendar Subscription, paste the link.</li>
              <li><strong>Google Calendar:</strong> Other calendars → + → From URL. Google needs the live website, so this works after launch, not with localhost.</li>
            </ul>
            <form action={generateCalendarToken}><button className={btn.outline}>Replace link (old one stops working)</button></form>
          </div>
        ) : (
          <form action={generateCalendarToken} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">Create a private link your calendar app can subscribe to.</span>
            <button className={btn.primary}>Create calendar link</button>
          </form>
        )}
      </Panel>
    </div>
  );
}
