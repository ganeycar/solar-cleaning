"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { ACCESS_TYPES, normalizePhone, PROPERTY_TYPES, ROOF_TYPES } from "@/lib/quote/validate";
import { loadSchedulingSettings } from "@/lib/scheduling/data";
import { jobDurationMinutes, localDate, zonedToUtc } from "@/lib/scheduling/slots";
import { getAdminClient } from "@/lib/supabase/admin";
import { parseBusinessSettings } from "./business-settings";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TZ = "America/Los_Angeles";

function go(path: string, kind: "msg" | "error", text: string): never {
  if (kind === "msg") {
    revalidatePath(path);
    revalidatePath("/", "layout");
  }
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);
}
async function staffAdmin(path: string) {
  const session = await requireStaff();
  const admin = getAdminClient();
  if (!admin) go(path, "error", "The Supabase service key isn't configured.");
  return { session, admin };
}
function text(form: FormData, k: string, max = 300): string {
  const v = form.get(k);
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

// ---------------- Customers ----------------

export async function updateCustomerProperty(customerId: string, propertyId: string, form: FormData) {
  const path = `/admin/customers/${customerId}`;
  const { admin } = await staffAdmin(path);
  if (!UUID.test(customerId) || !UUID.test(propertyId)) go(path, "error", "Unknown property.");
  const panels = Number(text(form, "panelCount", 6));
  const stories = Number(text(form, "stories", 2));
  const propertyType = text(form, "propertyType", 40);
  const roofType = text(form, "roofType", 40);
  const accessType = text(form, "accessType", 40);
  if (!Number.isInteger(panels) || panels < 1 || !Number.isInteger(stories) || stories < 1) go(path, "error", "Panels and stories must be whole numbers.");
  if (!(propertyType in PROPERTY_TYPES) || !(roofType in ROOF_TYPES) || !(accessType in ACCESS_TYPES)) go(path, "error", "Choose a valid property, roof, and access type.");
  const addressLine1 = text(form, "addressLine1", 200);
  const city = text(form, "city", 80);
  const postalCode = text(form, "postalCode", 10);
  if (!addressLine1 || !city || !/^\d{5}(-\d{4})?$/.test(postalCode)) go(path, "error", "Address, city, and a valid ZIP are required.");

  const { data: territory } = await admin.from("service_territories").select("id").contains("cities", [city.toLowerCase()]).maybeSingle();
  const { error } = await admin
    .from("properties")
    .update({
      address_line1: addressLine1, address_line2: text(form, "addressLine2", 200) || null, city, postal_code: postalCode,
      territory_id: territory?.id ?? null, panel_count: panels, stories, property_type: propertyType, roof_type: roofType,
      access_type: accessType, technician_instructions: text(form, "technicianInstructions", 2000) || null,
    })
    .eq("id", propertyId)
    .eq("customer_id", customerId);
  if (error) go(path, "error", `Couldn't save: ${error.message}`);
  go(path, "msg", "Property saved.");
}

export async function updateCustomerContact(customerId: string, form: FormData) {
  const path = `/admin/customers/${customerId}`;
  const { admin } = await staffAdmin(path);
  if (!UUID.test(customerId)) go(path, "error", "Unknown customer.");
  const phoneRaw = text(form, "phone", 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) go(path, "error", "Phone must be a 10-digit US number.");
  const { error } = await admin.from("profiles").update({ first_name: text(form, "firstName", 80) || null, last_name: text(form, "lastName", 80) || null, phone }).eq("id", customerId);
  if (error) go(path, "error", `Couldn't save: ${error.message}`);
  go(path, "msg", "Contact details saved.");
}

/** Gives a customer a free cleaning (goodwill, makeup visit, or a cash/check job). Recorded in the audit log. */
export async function grantCleaning(customerId: string, form: FormData) {
  const path = `/admin/customers/${customerId}`;
  const { session, admin } = await staffAdmin(path);
  if (!UUID.test(customerId)) go(path, "error", "Unknown customer.");
  const until = text(form, "validUntil", 10);
  const today = localDate(new Date(), TZ);
  if (!DATE.test(until) || until < today) go(path, "error", "Choose a valid-until date in the future.");
  const reason = text(form, "reason", 200);
  if (!reason) go(path, "error", "Add a short reason (it's kept in the customer's history).");
  const { error } = await admin.from("service_entitlements").insert({
    customer_id: customerId, source: "goodwill", status: "available", valid_from: today, valid_until: until,
    source_ref: `manual:${randomUUID()}`, note: `Added by owner: ${reason}`, created_by: session.user.id,
  });
  if (error) go(path, "error", `Couldn't add the cleaning: ${error.message}`);
  go(path, "msg", "Cleaning added. You can book it now.");
}

/** Owner books an appointment directly (e.g. a phone booking), using one of the customer's available cleanings. */
export async function manualBook(customerId: string, form: FormData) {
  const path = `/admin/customers/${customerId}`;
  const { admin } = await staffAdmin(path);
  if (!UUID.test(customerId)) go(path, "error", "Unknown customer.");
  const propertyId = text(form, "propertyId", 40);
  const date = text(form, "date", 10);
  const time = text(form, "time", 5);
  const technicianId = text(form, "technicianId", 40);
  if (!UUID.test(propertyId) || !DATE.test(date) || !TIME.test(time) || !UUID.test(technicianId)) go(path, "error", "Choose a property, date, time, and technician.");

  const { data: property } = await admin.from("properties").select("id, panel_count").eq("id", propertyId).eq("customer_id", customerId).maybeSingle();
  if (!property) go(path, "error", "That property doesn't belong to this customer.");
  const settings = await loadSchedulingSettings(admin);
  const minutesRaw = Number(text(form, "minutes", 4));
  const minutes = Number.isInteger(minutesRaw) && minutesRaw >= 15 && minutesRaw <= 600 ? minutesRaw : jobDurationMinutes(settings, property.panel_count);
  const start = zonedToUtc(date, time, TZ);
  const end = new Date(start.getTime() + minutes * 60_000);

  const { data: credits } = await admin
    .from("service_entitlements")
    .select("id")
    .eq("customer_id", customerId)
    .eq("status", "available")
    .lte("valid_from", date)
    .gte("valid_until", date)
    .order("valid_until", { ascending: true })
    .limit(1);
  const credit = credits?.[0];
  if (!credit) go(path, "error", "This customer has no cleaning available on that date. Add a cleaning first, or have them pay online.");

  const { error } = await admin.rpc("book_cleaning", {
    p_customer: customerId, p_entitlement: credit.id, p_property: propertyId, p_technician: technicianId,
    p_start: start.toISOString(), p_end: end.toISOString(), p_buffer_minutes: settings.bufferMinutes, p_notes: text(form, "notes", 1000) || null,
  });
  if (error) {
    go(path, "error", error.code === "23P01" ? "That time overlaps another appointment for this technician (including travel time)." : `Couldn't book: ${error.message}`);
  }
  go(path, "msg", `Booked for ${date} at ${time}. Let the customer know.`);
}

// ---------------- Business settings and team ----------------

export async function saveBusinessSettings(form: FormData) {
  const path = "/admin/business";
  const { admin } = await staffAdmin(path);
  const parsed = parseBusinessSettings((k) => { const v = form.get(k); return typeof v === "string" ? v : null; });
  if (!parsed.ok) go(path, "error", parsed.errors.join(" "));
  const { error } = await admin.from("business_settings").update(parsed.value).eq("id", 1);
  if (error) go(path, "error", `Couldn't save: ${error.message}`);
  go(path, "msg", "Business settings saved. The website updates within a minute.");
}

export async function addTechnicianByEmail(form: FormData) {
  const path = "/admin/business";
  const { admin } = await staffAdmin(path);
  const email = text(form, "email", 254).toLowerCase();
  const { data: profile } = await admin.from("profiles").select("id, role, first_name, last_name").eq("email", email).maybeSingle();
  if (!profile) go(path, "error", "No account with that email. Ask them to sign in once at /login, then add them here.");
  if (profile.role === "customer") {
    const { error } = await admin.from("profiles").update({ role: "technician" }).eq("id", profile.id);
    if (error) go(path, "error", `Couldn't update their role: ${error.message}`);
  }
  const name = text(form, "displayName", 80) || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || email;
  const { error } = await admin.from("technicians").upsert({ id: profile.id, display_name: name, is_active: true }, { onConflict: "id" });
  if (error) go(path, "error", `Couldn't add the technician: ${error.message}`);
  go(path, "msg", `${name} can now use the technician app at /tech.`);
}

export async function setTechnicianActive(technicianId: string, active: boolean) {
  const path = "/admin/business";
  const { admin } = await staffAdmin(path);
  if (!UUID.test(technicianId)) go(path, "error", "Unknown technician.");
  if (!active) {
    const { count } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("technician_id", technicianId).in("status", ["confirmed", "requested", "rescheduled", "in_progress"]).gte("scheduled_start", new Date().toISOString());
    if (count) go(path, "error", `This technician has ${count} upcoming appointment${count === 1 ? "" : "s"}. Reassign or cancel them first.`);
  }
  const { error } = await admin.from("technicians").update({ is_active: active }).eq("id", technicianId);
  if (error) go(path, "error", `Couldn't update: ${error.message}`);
  go(path, "msg", active ? "Technician reactivated." : "Technician deactivated. They no longer receive new appointments.");
}

