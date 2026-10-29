import type { SupabaseClient } from "@supabase/supabase-js";
import { withDefaults, type Blackout, type Busy, type SchedulingSettings } from "./slots";

/**
 * Server-only loaders for availability. These use the service-role client
 * because availability depends on OTHER customers' bookings; only times and
 * technician ids are read, never customer details.
 */

export async function loadSchedulingSettings(admin: SupabaseClient): Promise<SchedulingSettings> {
  const { data } = await admin.from("business_settings").select("scheduling").eq("id", 1).maybeSingle();
  return withDefaults(data?.scheduling);
}

export async function loadAvailabilityInputs(
  admin: SupabaseClient,
  from: Date,
  to: Date,
  excludeBookingId?: string,
): Promise<{ technicians: string[]; busy: Busy[]; blackouts: Blackout[] }> {
  const [techRes, bookingRes, blackoutRes] = await Promise.all([
    admin.from("technicians").select("id").eq("is_active", true),
    admin
      .from("bookings")
      .select("id, technician_id, scheduled_start, blocked_until")
      .in("status", ["requested", "confirmed", "in_progress"])
      .not("technician_id", "is", null)
      .lt("scheduled_start", to.toISOString())
      .gt("blocked_until", from.toISOString()),
    admin.from("blackout_dates").select("technician_id, starts_at, ends_at").lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()),
  ]);
  if (techRes.error || bookingRes.error || blackoutRes.error) {
    throw new Error(`Could not load availability: ${techRes.error?.message ?? bookingRes.error?.message ?? blackoutRes.error?.message}`);
  }
  return {
    technicians: (techRes.data ?? []).map((t: { id: string }) => t.id),
    busy: (bookingRes.data ?? [])
      .filter((b: { id: string }) => b.id !== excludeBookingId)
      .map((b: { technician_id: string; scheduled_start: string; blocked_until: string }) => ({
        technicianId: b.technician_id,
        start: new Date(b.scheduled_start),
        blockedUntil: new Date(b.blocked_until),
      })),
    blackouts: (blackoutRes.data ?? []).map((b: { technician_id: string | null; starts_at: string; ends_at: string }) => ({
      technicianId: b.technician_id,
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
    })),
  };
}
