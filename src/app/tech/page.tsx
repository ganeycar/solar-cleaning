import Link from "next/link";
import { requireTechnician } from "@/lib/auth/technician";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TZ = "America/Los_Angeles";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

const STATUS: Record<string, { label: string; tone: string }> = {
  requested: { label: "Scheduled", tone: "bg-sky-50 text-sky-800" },
  confirmed: { label: "Scheduled", tone: "bg-sky-50 text-sky-800" },
  rescheduled: { label: "Scheduled", tone: "bg-sky-50 text-sky-800" },
  in_progress: { label: "In progress", tone: "bg-amber-50 text-amber-900" },
  completed: { label: "Done", tone: "bg-emerald-50 text-emerald-800" },
  no_access: { label: "No access", tone: "bg-gray-100 text-gray-700" },
  canceled: { label: "Canceled", tone: "bg-gray-100 text-gray-700" },
};

export default async function TechJobs() {
  const { admin, tech } = await requireTechnician();
  const now = new Date();
  // From the start of today (Pacific, with a margin) through the next 7 days.
  const from = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const to = new Date(now.getTime() + 8 * 24 * 3600_000).toISOString();
  const { data } = await admin
    .from("bookings")
    .select("id, scheduled_start, scheduled_end, status, properties(address_line1, city, panel_count, stories)")
    .eq("technician_id", tech.id)
    .gte("scheduled_start", from)
    .lt("scheduled_start", to)
    .in("status", ["requested", "confirmed", "rescheduled", "in_progress", "completed", "no_access"])
    .order("scheduled_start");

  const today = dayKey.format(now);
  const jobs = ((data ?? []) as Row[]).filter((j) => dayKey.format(new Date(j.scheduled_start)) >= today || j.status === "in_progress");
  const byDay = new Map<string, Row[]>();
  for (const j of jobs) {
    const k = dayKey.format(new Date(j.scheduled_start));
    byDay.set(k, [...(byDay.get(k) ?? []), j]);
  }

  return (
    <div className="space-y-6">
      {jobs.length === 0 && <p className="rounded-2xl border border-line bg-white p-6 text-center text-muted">No jobs scheduled in the next 7 days.</p>}
      {[...byDay.entries()].map(([k, list]) => (
        <section key={k}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{k === today ? "Today" : dayLabel.format(new Date(list[0].scheduled_start))}</h2>
          <ul className="space-y-3">
            {list.map((j) => {
              const p = (Array.isArray(j.properties) ? j.properties[0] : j.properties) ?? {};
              const st = STATUS[j.status] ?? { label: j.status, tone: "bg-gray-100" };
              return (
                <li key={j.id}>
                  <Link href={`/tech/jobs/${j.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-sm active:bg-paper">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-lg font-bold text-navy">{timeFmt.format(new Date(j.scheduled_start))}–{timeFmt.format(new Date(j.scheduled_end))}</p>
                        <p className="text-sm">{p.address_line1}, {p.city}</p>
                        <p className="text-xs text-muted">{p.panel_count} panels · {p.stories} {p.stories === 1 ? "story" : "stories"}</p>
                      </div>
                      <span className={`flex-none rounded-full px-3 py-1 text-xs font-semibold ${st.tone}`}>{st.label}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
