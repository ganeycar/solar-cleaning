"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { runDailyJob } from "@/lib/email/daily";
import { loadBrand, ownerEmail, sendEmail } from "@/lib/email/send";
import * as T from "@/lib/email/templates";
import { getAdminClient } from "@/lib/supabase/admin";

const PATH = "/admin/launch";
function go(kind: "msg" | "error", text: string): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${kind}=${encodeURIComponent(text)}`);
}

/** Sends a sample appointment confirmation to the owner, to check email setup. */
export async function sendTestEmail() {
  const session = await requireStaff();
  const db = getAdminClient();
  if (!db) go("error", "The database isn't configured.");
  const brand = await loadBrand(db);
  const to = ownerEmail(brand) || session.user.email;
  if (!to) go("error", "Add your email on the Business page first.");
  const sample = T.bookingConfirmed(brand, { id: "sample", firstName: "Sample", start: new Date(Date.now() + 3 * 86400_000).toISOString(), address: "123 Example St, Vacaville" }, "booked");
  const result = await sendEmail(db, { key: `test:${randomUUID()}`, kind: "test", to, email: { ...sample, subject: `Test email: ${sample.subject}` } });
  if (result === "sent") go("msg", `Test email sent${process.env.EMAIL_TEST_TO ? ` to ${process.env.EMAIL_TEST_TO} (test mode)` : ` to ${to}`}. Check your inbox (and spam).`);
  if (result === "skipped") go("error", "Email isn't set up yet: add RESEND_API_KEY to .env.local and restart the site.");
  go("error", "The test email failed. See the error on the Leads & emails page.");
}

export async function runDailyJobNow() {
  await requireStaff();
  const db = getAdminClient();
  if (!db) go("error", "The database isn't configured.");
  const r = await runDailyJob(db);
  if (r.errors.length) go("error", `Daily job finished with errors: ${r.errors.join("; ").slice(0, 300)}`);
  go("msg", `Daily job done: ${r.reminders} reminder(s), ${r.followUps} quote follow-up(s), ${r.renewalNotices} renewal notice(s), ${r.annualReminders} yearly reminder(s), ${r.expiring} expiring-cleaning notice(s).`);
}
