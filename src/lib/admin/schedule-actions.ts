"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { addDays, parseSchedulingForm, zonedToUtc } from "@/lib/scheduling/slots";
import { getAdminClient } from "@/lib/supabase/admin";

const PATH = "/admin/schedule";
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = "America/Los_Angeles";

function done(msg: string): never {
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(`${PATH}?msg=${encodeURIComponent(msg)}`);
}
function fail(error: string): never {
  redirect(`${PATH}?error=${encodeURIComponent(error)}`);
}
async function staffAdmin() {
  const session = await requireStaff();
  const admin = getAdminClient();
  if (!admin) fail("The Supabase service key isn't configured.");
  return { session, admin };
}

export async function saveSchedulingSettings(form: FormData) {
  const { admin } = await staffAdmin();
  const parsed = parseSchedulingForm((k) => { const v = form.get(k); return typeof v === "string" ? v : null; });
  if (!parsed.ok) fail(parsed.errors.join(" "));
  const { error } = await admin.from("business_settings").update({ scheduling: parsed.settings }).eq("id", 1);
  if (error) fail(`Couldn't save: ${error.message}`);
  done("Scheduling settings saved. Customers see the new times right away.");
}

export async function addSelfAsTechnician() {
  const { session, admin } = await staffAdmin();
  const { data: profile } = await admin.from("profiles").select("first_name, last_name, email").eq("id", session.user.id).single();
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "Owner";
  const { error } = await admin.from("technicians").upsert({ id: session.user.id, display_name: name, is_active: true }, { onConflict: "id" });
  if (error) fail(`Couldn't add you as a technician: ${error.message}`);
  done("You're set up as the technician. Customers can now book open times.");
}

export async function addBlackout(form: FormData) {
  const { admin } = await staffAdmin();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "") || from;
  if (!DATE.test(from) || !DATE.test(to) || to < from) fail("Choose a start date and an end date on or after it.");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200) || null;
  const { error } = await admin.from("blackout_dates").insert({
    technician_id: null,
    starts_at: zonedToUtc(from, "00:00", TZ).toISOString(),
    ends_at: zonedToUtc(addDays(to, 1), "00:00", TZ).toISOString(),
    reason,
  });
  if (error) fail(`Couldn't save: ${error.message}`);
  done("Days off saved. Those dates are no longer offered to customers.");
}

export async function deleteBlackout(id: string) {
  const { admin } = await staffAdmin();
  if (!UUID.test(id)) fail("Unknown entry.");
  await admin.from("blackout_dates").delete().eq("id", id);
  done("Days off removed.");
}

export async function generateCalendarToken() {
  const { admin } = await staffAdmin();
  const token = randomBytes(24).toString("hex");
  const { error } = await admin.from("business_settings").update({ calendar_token: token }).eq("id", 1);
  if (error) fail(`Couldn't create a calendar link: ${error.message}`);
  done("New calendar link created. Any old link stops working.");
}

async function bookingRpc(fn: string, args: Record<string, unknown>, ok: string) {
  const { admin } = await staffAdmin();
  const { error } = await admin.rpc(fn, args);
  if (error) fail(error.message.includes("BOOKING_NOT_CHANGEABLE") ? "That appointment can't be changed (it may already be completed or canceled)." : `Couldn't update: ${error.message}`);
  done(ok);
}

export async function markCompleted(bookingId: string) {
  if (!UUID.test(bookingId)) fail("Unknown appointment.");
  await bookingRpc("complete_booking", { p_booking: bookingId }, "Marked completed.");
}

export async function weatherCancel(bookingId: string) {
  if (!UUID.test(bookingId)) fail("Unknown appointment.");
  await bookingRpc(
    "cancel_booking",
    { p_booking: bookingId, p_reason: "Rescheduled for weather or safety", p_return_cleaning: true, p_customer: null },
    "Appointment canceled for weather. The customer's cleaning is back in their account so they can rebook. Let them know.",
  );
}

export async function noAccess(bookingId: string) {
  if (!UUID.test(bookingId)) fail("Unknown appointment.");
  await bookingRpc(
    "cancel_booking",
    { p_booking: bookingId, p_reason: "No access at appointment time", p_return_cleaning: false, p_customer: null },
    "Recorded as no access. The cleaning counts as used.",
  );
}
