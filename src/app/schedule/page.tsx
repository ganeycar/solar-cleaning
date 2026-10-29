import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui";
import { bookCleaning, rescheduleCleaning } from "@/lib/scheduling/actions";
import { loadAvailabilityInputs, loadSchedulingSettings } from "@/lib/scheduling/data";
import { availableSlots, canChangeBooking, jobDurationMinutes, localDate, zonedToUtc, addDays } from "@/lib/scheduling/slots";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Schedule a cleaning", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Props = { searchParams: Promise<{ property?: string; booking?: string; date?: string; error?: string; days?: string }> };

const ERRORS: Record<string, string> = {
  taken: "Sorry, that time was just taken. Please choose another.",
  "no-cleaning": "You don't have an available cleaning for that date. Cleanings must be used within their valid dates.",
  "too-soon": "Your plan requires more time between cleanings. Please choose a later date.",
  cutoff: "This appointment is too close to change online. Please contact us.",
  unavailable: "Online scheduling isn't available right now. Please contact us.",
  error: "Something went wrong. Please try again.",
};

export default async function SchedulePage({ searchParams }: Props) {
  const sp = await searchParams;
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const admin = getAdminClient();
  const { supabase } = session;

  const settings = admin ? await loadSchedulingSettings(admin) : null;
  const tz = settings?.timezone ?? "America/Los_Angeles";
  const now = new Date();
  const fullDate = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
  const dayChip = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

  // Reschedule mode
  let booking: Row | null = null;
  if (sp.booking) {
    const { data } = await supabase.from("bookings").select("id, scheduled_start, status, property_id, properties(id, address_line1, city, panel_count)").eq("id", sp.booking).eq("customer_id", session.user.id).maybeSingle();
    booking = data;
    if (!booking) redirect("/dashboard");
  }

  const [{ data: properties }, { data: credits }] = await Promise.all([
    supabase.from("properties").select("id, address_line1, city, panel_count").eq("customer_id", session.user.id).order("created_at"),
    supabase.from("service_entitlements").select("id, valid_from, valid_until").eq("customer_id", session.user.id).eq("status", "available").gte("valid_until", localDate(now, tz)),
  ]);
  const props = (properties ?? []) as Row[];
  const available = (credits ?? []) as Row[];

  const bookingProperty = booking ? (Array.isArray(booking.properties) ? booking.properties[0] : booking.properties) : null;
  const property: Row | undefined = bookingProperty ?? props.find((p) => p.id === sp.property) ?? props[0];

  const shell = (children: React.ReactNode) => (
    <div className="bg-paper">
      <Container className="max-w-3xl py-10 sm:py-14">
        <Link href="/dashboard" className="text-sm text-muted underline">← Back to your dashboard</Link>
        <h1 className="mt-3 text-3xl font-extrabold">{booking ? "Reschedule your cleaning" : "Schedule a cleaning"}</h1>
        {sp.error && ERRORS[sp.error] && (
          <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {sp.error === "too-soon" && sp.days ? `Your plan requires at least ${Number(sp.days)} days between cleanings. Please choose another date.` : ERRORS[sp.error]}
          </div>
        )}
        {children}
      </Container>
    </div>
  );

  if (!admin || !settings) return shell(<p className="mt-6 text-muted">{ERRORS.unavailable}</p>);
  if (booking && !canChangeBooking(new Date(booking.scheduled_start), now, settings.rescheduleCutoffHours)) {
    return shell(<p className="mt-6 text-muted">{ERRORS.cutoff}</p>);
  }
  if (!booking && available.length === 0) {
    return shell(
      <div className="mt-6 rounded-2xl border border-line bg-white p-6">
        <p className="text-muted">You don&apos;t have a cleaning available to schedule right now.</p>
        <p className="mt-2 text-sm text-muted">Book a one-time cleaning from a quote, or join a membership. Monthly memberships unlock cleanings through the year.</p>
        <Link href="/quote" className="mt-4 inline-block rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-navy">Get a quote</Link>
      </div>,
    );
  }
  if (!property) {
    return shell(<p className="mt-6 text-muted">We don&apos;t have a service address on file yet. <Link href="/contact" className="underline">Contact us</Link> and we&apos;ll get you scheduled.</p>);
  }

  // Dates the customer's cleanings are valid for.
  let validFrom: string, validUntil: string;
  if (booking) {
    const { data: credit } = await supabase.from("service_entitlements").select("valid_from, valid_until").eq("booking_id", booking.id).maybeSingle();
    validFrom = credit?.valid_from ?? "0000-01-01";
    validUntil = credit?.valid_until ?? "9999-12-31";
  } else {
    validFrom = available.reduce((m, c) => (c.valid_from < m ? c.valid_from : m), "9999-12-31");
    validUntil = available.reduce((m, c) => (c.valid_until > m ? c.valid_until : m), "0000-01-01");
  }

  const duration = jobDurationMinutes(settings, property.panel_count);
  const today = localDate(now, tz);
  const inputs = await loadAvailabilityInputs(admin, now, zonedToUtc(addDays(today, settings.horizonDays + 1), "00:00", tz), booking?.id);
  const slots = availableSlots({ settings, ...inputs, now, durationMinutes: duration }).filter((s) => s.date >= validFrom && s.date <= validUntil);

  const days = [...new Set(slots.map((s) => s.date))];
  const selected = sp.date && days.includes(sp.date) ? sp.date : days[0];
  const daySlots = slots.filter((s) => s.date === selected);
  const action = booking ? rescheduleCleaning.bind(null, booking.id) : bookCleaning;
  const base = booking ? `/schedule?booking=${booking.id}` : `/schedule?property=${property.id}`;

  return shell(
    <>
      <p className="mt-2 text-muted">
        {property.address_line1}, {property.city} · {property.panel_count} panels · about {Math.round(duration / 15) / 4} hours
        {booking && <> · currently {fullDate.format(new Date(booking.scheduled_start))} at {timeFmt.format(new Date(booking.scheduled_start))}</>}
      </p>

      {!booking && props.length > 1 && (
        <nav aria-label="Property" className="mt-5 flex flex-wrap gap-2">
          {props.map((p) => (
            <Link key={p.id} href={`/schedule?property=${p.id}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${p.id === property.id ? "bg-navy text-white" : "border border-line bg-white text-navy"}`}>{p.address_line1}</Link>
          ))}
        </nav>
      )}

      {days.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-6 text-muted">
          No open times in the next {settings.horizonDays} days. Please check back soon or <Link href="/contact" className="underline">contact us</Link>.
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-bold">Choose a day</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {days.map((d) => (
              <Link key={d} href={`${base}&date=${d}`} className={`rounded-xl px-3 py-2 text-sm font-semibold ${d === selected ? "bg-navy text-white" : "border border-line bg-white text-navy hover:border-navy"}`}>
                {dayChip.format(zonedToUtc(d, "12:00", tz))}
              </Link>
            ))}
          </div>

          <h2 className="mt-8 text-lg font-bold">Arrival times on {fullDate.format(zonedToUtc(selected!, "12:00", tz))}</h2>
          <form action={action} className="mt-3">
            {!booking && <input type="hidden" name="propertyId" value={property.id} />}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {daySlots.map((s) => (
                <button key={s.start.toISOString()} name="start" value={s.start.toISOString()} className="rounded-xl border border-line bg-white px-3 py-3 text-sm font-semibold text-navy hover:border-navy hover:bg-gold-soft/40">
                  {timeFmt.format(s.start)}
                </button>
              ))}
            </div>
            {!booking && (
              <label className="mt-6 block text-sm font-semibold text-navy">
                Notes for this visit (optional)
                <textarea name="notes" rows={2} maxLength={1000} placeholder="Gate code, pets, anything new since your quote" className="field mt-1.5 font-normal" />
              </label>
            )}
            <p className="mt-4 text-xs text-muted">
              Tapping a time {booking ? "moves" : "books"} your appointment. You can reschedule or cancel online up to {settings.rescheduleCutoffHours} hours before. We may move appointments for rain, wind, or unsafe conditions; you won&apos;t lose your cleaning.
            </p>
          </form>
        </>
      )}
    </>,
  );
}
