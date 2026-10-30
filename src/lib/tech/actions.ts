"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyBooking } from "@/lib/email/notify";
import { redirect } from "next/navigation";
import { assignedBooking, requireTechnician } from "@/lib/auth/technician";
import { IMAGE_EXT, sniffImageType } from "@/lib/quote/validate";
import { checklistComplete, readChecklist } from "./job";

// Photos are resized in the browser (see PhotoInput); this is the server-side backstop.
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_PHOTOS_PER_UPLOAD = 10;
const KINDS = ["before", "after", "damage"] as const;

function back(bookingId: string, kind: "msg" | "error", text: string): never {
  revalidatePath(`/tech/jobs/${bookingId}`);
  revalidatePath("/tech");
  redirect(`/tech/jobs/${bookingId}?${kind}=${encodeURIComponent(text)}`);
}
function text(form: FormData, k: string, max = 2000): string {
  const v = form.get(k);
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

async function load(bookingId: string) {
  const { admin, tech, user } = await requireTechnician();
  const booking = await assignedBooking(admin, tech.id, bookingId);
  if (!booking) redirect("/tech");
  return { admin, tech, user, booking };
}
/** Photos and notes can be added only while the job is underway (or just finished, for late uploads). */
function requireWorking(bookingId: string, status: string) {
  if (!["in_progress", "completed"].includes(status)) back(bookingId, "error", "Start the job (safety checklist) first.");
}

export async function startJob(bookingId: string, form: FormData) {
  const { admin, tech } = await load(bookingId);
  const checklist = readChecklist((k) => { const v = form.get(k); return typeof v === "string" ? v : null; });
  if (!checklistComplete(checklist)) back(bookingId, "error", "Check every safety item before starting. If something isn't safe, use \"Stop: unsafe\" instead.");
  const { error } = await admin.rpc("tech_start_job", { p_tech: tech.id, p_booking: bookingId, p_checklist: checklist });
  if (error) back(bookingId, "error", error.message.includes("JOB_NOT_AVAILABLE") ? "This job can't be started (it may be canceled or already done)." : `Couldn't start: ${error.message}`);
  back(bookingId, "msg", "Job started. Take your before photos.");
}

export async function uploadJobPhotos(bookingId: string, form: FormData) {
  const { admin, user, booking } = await load(bookingId);
  requireWorking(bookingId, booking.status);
  const kindRaw = text(form, "kind", 20);
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as (typeof KINDS)[number]) : null;
  if (!kind) back(bookingId, "error", "Choose before, after, or damage.");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) back(bookingId, "error", "Choose at least one photo.");
  if (files.length > MAX_PHOTOS_PER_UPLOAD) back(bookingId, "error", `Upload up to ${MAX_PHOTOS_PER_UPLOAD} photos at a time.`);

  const caption = text(form, "caption", 300) || null;
  let saved = 0;
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) back(bookingId, "error", "Each photo must be 12 MB or smaller.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) back(bookingId, "error", "Photos must be JPEG, PNG, WebP, or HEIC images.");
    const path = `${bookingId}/${randomUUID()}.${IMAGE_EXT[type]}`;
    const { error: upErr } = await admin.storage.from("job-photos").upload(path, bytes, { contentType: type, upsert: false });
    if (upErr) back(bookingId, "error", `Upload failed: ${upErr.message}`);
    const { error } = await admin.from("job_photos").insert({ booking_id: bookingId, kind, storage_path: path, uploaded_by: user.id, caption });
    if (error) back(bookingId, "error", `Couldn't save the photo: ${error.message}`);
    saved++;
  }
  back(bookingId, "msg", `${saved} ${kind} photo${saved === 1 ? "" : "s"} saved.`);
}

export async function saveJobNotes(bookingId: string, form: FormData) {
  const { admin, tech, booking } = await load(bookingId);
  requireWorking(bookingId, booking.status);
  const damage = form.get("damageReported") === "on";
  const { error } = await admin.from("job_reports").upsert(
    {
      booking_id: bookingId,
      technician_id: tech.id,
      service_notes: text(form, "serviceNotes") || null,
      damage_reported: damage,
      damage_notes: damage ? text(form, "damageNotes") || null : null,
      unsafe_conditions: text(form, "unsafeConditions") || null,
    },
    { onConflict: "booking_id" },
  );
  if (error) back(bookingId, "error", `Couldn't save notes: ${error.message}`);
  back(bookingId, "msg", "Notes saved.");
}

export async function completeJob(bookingId: string) {
  const { admin, tech } = await load(bookingId);
  const { error } = await admin.rpc("tech_complete_job", { p_tech: tech.id, p_booking: bookingId });
  if (error) {
    if (error.message.includes("PHOTOS_REQUIRED")) back(bookingId, "error", "Add at least one before photo and one after photo first.");
    if (error.message.includes("JOB_NOT_IN_PROGRESS")) back(bookingId, "error", "Start the job (safety checklist) before completing it.");
    back(bookingId, "error", `Couldn't complete: ${error.message}`);
  }
  after(() => notifyBooking(admin, bookingId, "completed"));
  back(bookingId, "msg", "Job completed. The customer was emailed their photos and report.");
}

/** Couldn't get access at the scheduled time: the cleaning counts as used (per policy). */
export async function reportNoAccess(bookingId: string, form: FormData) {
  const { admin } = await load(bookingId);
  const reason = text(form, "reason", 300) || "No access at appointment time";
  const { error } = await admin.rpc("cancel_booking", { p_booking: bookingId, p_reason: `No access: ${reason}`, p_return_cleaning: false, p_customer: null });
  if (error) back(bookingId, "error", `Couldn't record that: ${error.message}`);
  after(() => notifyBooking(admin, bookingId, "no_access"));
  back(bookingId, "msg", "Recorded as no access. The customer and owner were emailed.");
}

/** Unsafe to work (weather, roof, damage): stop, and the customer keeps the cleaning to rebook. */
export async function stopUnsafe(bookingId: string, form: FormData) {
  const { admin, tech } = await load(bookingId);
  const reason = text(form, "reason", 300);
  if (!reason) back(bookingId, "error", "Describe what's unsafe.");
  await admin.from("job_reports").upsert({ booking_id: bookingId, technician_id: tech.id, unsafe_conditions: reason }, { onConflict: "booking_id" });
  const { error } = await admin.rpc("cancel_booking", { p_booking: bookingId, p_reason: `Stopped for safety: ${reason}`, p_return_cleaning: true, p_customer: null });
  if (error) back(bookingId, "error", `Couldn't stop the job: ${error.message}`);
  after(() => notifyBooking(admin, bookingId, "safety"));
  back(bookingId, "msg", "Job stopped for safety. The customer's cleaning was returned and they were emailed to rebook.");
}
