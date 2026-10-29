"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadAvailabilityInputs, loadSchedulingSettings } from "./data";
import { availableSlots, canChangeBooking, jobDurationMinutes, localDate } from "./slots";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f-]{36}$/i;
const DAY = 24 * 3600_000;

function back(params: Record<string, string>): never {
  redirect(`/schedule?${new URLSearchParams(params).toString()}`);
}

function dbErrorCode(err: { code?: string; message?: string } | null): string {
  if (!err) return "error";
  if (err.code === "23P01") return "taken";
  if (err.message?.includes("CLEANING_NOT_AVAILABLE") || err.message?.includes("OUTSIDE_CLEANING_VALIDITY")) return "no-cleaning";
  if (err.message?.includes("BOOKING_NOT_CHANGEABLE")) return "cutoff";
  return "error";
}

/** Finds the open slot at exactly `startIso` for a job of this size, re-checked on the server. */
async function findSlot(admin: NonNullable<ReturnType<typeof getAdminClient>>, startIso: string, panelCount: number, excludeBookingId?: string) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const settings = await loadSchedulingSettings(admin);
  const duration = jobDurationMinutes(settings, panelCount);
  const date = localDate(start, settings.timezone);
  const from = new Date(start.getTime() - DAY);
  const to = new Date(start.getTime() + 2 * DAY);
  const inputs = await loadAvailabilityInputs(admin, from, to, excludeBookingId);
  const slot = availableSlots({ settings, ...inputs, now: new Date(), durationMinutes: duration, onlyDate: date }).find((s) => s.start.getTime() === start.getTime());
  return slot ? { slot, settings } : null;
}

/** Membership minimum spacing (e.g. Unlimited Care: 30 days between cleanings). */
async function tooSoon(session: Row, subscriptionId: string | null, start: Date, excludeBookingId?: string): Promise<number | null> {
  if (!subscriptionId) return null;
  const { data: sub } = await session.from("subscriptions").select("plans(min_days_between_cleanings)").eq("id", subscriptionId).maybeSingle();
  const plan = Array.isArray(sub?.plans) ? sub.plans[0] : sub?.plans;
  const minDays: number | null = plan?.min_days_between_cleanings ?? null;
  if (!minDays) return null;
  const { data: nearby } = await session
    .from("bookings")
    .select("id, scheduled_start")
    .eq("subscription_id", subscriptionId)
    .in("status", ["requested", "confirmed", "in_progress", "completed", "rescheduled"])
    .gt("scheduled_start", new Date(start.getTime() - minDays * DAY).toISOString())
    .lt("scheduled_start", new Date(start.getTime() + minDays * DAY).toISOString());
  return (nearby ?? []).some((b: Row) => b.id !== excludeBookingId) ? minDays : null;
}

export async function bookCleaning(form: FormData): Promise<void> {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const admin = getAdminClient();
  if (!admin) back({ error: "unavailable" });

  const propertyId = String(form.get("propertyId") ?? "");
  const startIso = String(form.get("start") ?? "");
  if (!UUID.test(propertyId)) back({ error: "error" });

  // RLS: only the customer's own property is returned.
  const { data: property } = await session.supabase.from("properties").select("id, panel_count").eq("id", propertyId).maybeSingle();
  if (!property) back({ error: "error" });

  const found = await findSlot(admin, startIso, property.panel_count);
  if (!found) back({ error: "taken", property: propertyId });
  const { slot, settings } = found;
  const day = localDate(slot.start, settings.timezone);

  // Use the cleaning credit that expires soonest and is valid on that day.
  const { data: credits } = await session.supabase
    .from("service_entitlements")
    .select("id, subscription_id, valid_from, valid_until")
    .eq("status", "available")
    .lte("valid_from", day)
    .gte("valid_until", day)
    .order("valid_until", { ascending: true })
    .limit(1);
  const credit = credits?.[0];
  if (!credit) back({ error: "no-cleaning", property: propertyId });

  const spacing = await tooSoon(session.supabase, credit.subscription_id, slot.start);
  if (spacing) back({ error: "too-soon", days: String(spacing), property: propertyId });

  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000) || null;
  const { error } = await admin.rpc("book_cleaning", {
    p_customer: session.user.id,
    p_entitlement: credit.id,
    p_property: propertyId,
    p_technician: slot.technicianId,
    p_start: slot.start.toISOString(),
    p_end: slot.end.toISOString(),
    p_buffer_minutes: settings.bufferMinutes,
    p_notes: notes,
  });
  if (error) {
    console.error("booking failed", error.message);
    back({ error: dbErrorCode(error), property: propertyId });
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?booked=1");
}

export async function rescheduleCleaning(bookingId: string, form: FormData): Promise<void> {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const admin = getAdminClient();
  if (!admin || !UUID.test(bookingId)) back({ error: "error" });

  const { data: booking } = await session.supabase
    .from("bookings")
    .select("id, scheduled_start, status, subscription_id, properties(panel_count)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) back({ error: "error" });
  const settings = await loadSchedulingSettings(admin);
  if (!canChangeBooking(new Date(booking.scheduled_start), new Date(), settings.rescheduleCutoffHours)) back({ error: "cutoff", booking: bookingId });

  const property = Array.isArray(booking.properties) ? booking.properties[0] : booking.properties;
  const found = await findSlot(admin, String(form.get("start") ?? ""), property?.panel_count ?? 0, bookingId);
  if (!found) back({ error: "taken", booking: bookingId });

  const spacing = await tooSoon(session.supabase, booking.subscription_id, found.slot.start, bookingId);
  if (spacing) back({ error: "too-soon", days: String(spacing), booking: bookingId });

  const { error } = await admin.rpc("reschedule_booking", {
    p_customer: session.user.id,
    p_booking: bookingId,
    p_technician: found.slot.technicianId,
    p_start: found.slot.start.toISOString(),
    p_end: found.slot.end.toISOString(),
  });
  if (error) {
    console.error("reschedule failed", error.message);
    back({ error: dbErrorCode(error), booking: bookingId });
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?rescheduled=1");
}

export async function cancelCleaning(bookingId: string): Promise<void> {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const admin = getAdminClient();
  if (!admin || !UUID.test(bookingId)) redirect("/dashboard?schedule=error");

  const { data: booking } = await session.supabase.from("bookings").select("id, scheduled_start").eq("id", bookingId).maybeSingle();
  if (!booking) redirect("/dashboard?schedule=error");
  const settings = await loadSchedulingSettings(admin);
  if (!canChangeBooking(new Date(booking.scheduled_start), new Date(), settings.rescheduleCutoffHours)) redirect("/dashboard?schedule=cutoff");

  const { error } = await admin.rpc("cancel_booking", { p_booking: bookingId, p_reason: "Canceled by customer", p_return_cleaning: true, p_customer: session.user.id });
  if (error) {
    console.error("cancel failed", error.message);
    redirect("/dashboard?schedule=error");
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?canceled=1");
}

