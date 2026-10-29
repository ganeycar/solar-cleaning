import { notFound, redirect } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * For every technician page and action. The signed-in user must have an
 * ACTIVE technician record (the owner can be a technician too).
 */
export async function requireTechnician() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const admin = getAdminClient();
  if (!admin) notFound();
  const { data: tech } = await admin.from("technicians").select("id, display_name, is_active").eq("id", session.user.id).maybeSingle();
  if (!tech?.is_active) notFound();
  return { ...session, admin, tech: tech as { id: string; display_name: string } };
}

/** Loads a booking only if it's assigned to this technician. */
export async function assignedBooking(admin: NonNullable<ReturnType<typeof getAdminClient>>, techId: string, bookingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const { data } = await admin.from("bookings").select("id, status, technician_id, scheduled_start").eq("id", bookingId).eq("technician_id", techId).maybeSingle();
  return data as { id: string; status: string; technician_id: string; scheduled_start: string } | null;
}
