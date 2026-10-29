import type { getAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof getAdminClient>>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface JobPhoto { id: string; kind: "before" | "after" | "damage"; url: string | null; caption: string | null; createdAt: string }
export interface ServiceReport {
  booking: Row;
  property: Row | null;
  customer: Row | null;
  report: Row | null;
  photos: JobPhoto[];
}

/**
 * Loads one job with its report and short-lived photo links. Callers MUST check
 * access first (customer owns it, technician is assigned, or staff).
 */
export async function loadServiceReport(admin: Admin, bookingId: string, opts: { includeContact?: boolean } = {}): Promise<ServiceReport | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const { data: booking } = await admin
    .from("bookings")
    .select("id, customer_id, technician_id, scheduled_start, scheduled_end, status, cancel_reason, customer_notes, properties(id, address_line1, address_line2, city, postal_code, property_type, stories, roof_type, panel_count, access_type, technician_instructions), technicians(display_name)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;
  const b = booking as Row;
  const property = (Array.isArray(b.properties) ? b.properties[0] : b.properties) ?? null;

  const [{ data: report }, { data: photoRows }, contact] = await Promise.all([
    admin.from("job_reports").select("safety_checklist, checklist_completed_at, started_at, completed_at, service_notes, damage_reported, damage_notes, unsafe_conditions").eq("booking_id", bookingId).maybeSingle(),
    admin.from("job_photos").select("id, kind, storage_path, caption, created_at").eq("booking_id", bookingId).in("kind", ["before", "after", "damage"]).order("created_at"),
    opts.includeContact ? admin.from("profiles").select("first_name, last_name, phone").eq("id", b.customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const rows = (photoRows ?? []) as Row[];
  const signed = rows.length
    ? (await admin.storage.from("job-photos").createSignedUrls(rows.map((r) => r.storage_path), 60 * 60)).data ?? []
    : [];
  const urlFor = new Map<string, string>();
  for (const s of signed as Row[]) if (s?.path && s?.signedUrl) urlFor.set(s.path, s.signedUrl);

  return {
    booking: b,
    property,
    customer: (contact as { data: Row | null }).data,
    report: (report as Row | null) ?? null,
    photos: rows.map((r) => ({ id: r.id, kind: r.kind, url: urlFor.get(r.storage_path) ?? null, caption: r.caption ?? null, createdAt: r.created_at })),
  };
}
