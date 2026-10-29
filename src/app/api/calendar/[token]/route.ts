import { timingSafeEqual } from "node:crypto";
import { buildIcs, type IcsEvent } from "@/lib/scheduling/ics";
import { getSiteSettings } from "@/lib/site";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Private iCalendar feed of appointments, protected by a long random token. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  const admin = getAdminClient();
  if (!admin || !/^[0-9a-f]{48}$/.test(token)) return new Response("Not found", { status: 404 });

  const { data: settings } = await admin.from("business_settings").select("calendar_token").eq("id", 1).maybeSingle();
  const stored: string | null = settings?.calendar_token ?? null;
  if (!stored || stored.length !== token.length || !timingSafeEqual(Buffer.from(stored), Buffer.from(token))) {
    return new Response("Not found", { status: 404 });
  }

  const now = Date.now();
  const { data } = await admin
    .from("bookings")
    .select("id, scheduled_start, scheduled_end, status, customer_notes, profiles!bookings_customer_id_fkey(first_name, last_name, phone), properties(address_line1, city, postal_code, panel_count, technician_instructions)")
    .gte("scheduled_start", new Date(now - 14 * 24 * 3600_000).toISOString())
    .lte("scheduled_start", new Date(now + 180 * 24 * 3600_000).toISOString())
    .in("status", ["requested", "confirmed", "in_progress", "rescheduled", "completed", "canceled"]);

  const one = (x: unknown) => (Array.isArray(x) ? x[0] : x) as Row | undefined;
  const events: IcsEvent[] = ((data ?? []) as Row[]).map((b) => {
    const c = one(b.profiles);
    const p = one(b.properties);
    const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Customer";
    return {
      uid: `${b.id}@solar-cleaning`,
      start: new Date(b.scheduled_start),
      end: new Date(b.scheduled_end),
      summary: `${b.status === "completed" ? "✓ " : ""}Cleaning: ${name}, ${p?.panel_count ?? "?"} panels`,
      location: p ? `${p.address_line1}, ${p.city} ${p.postal_code ?? ""}`.trim() : undefined,
      description: [c?.phone ? `Phone: ${c.phone}` : null, p?.technician_instructions, b.customer_notes].filter(Boolean).join("\n") || undefined,
      status: b.status === "canceled" ? "CANCELLED" : "CONFIRMED",
    };
  });

  const s = await getSiteSettings();
  return new Response(buildIcs(`${s.businessName} appointments`, events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
