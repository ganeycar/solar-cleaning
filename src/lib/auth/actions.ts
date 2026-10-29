"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePhone } from "@/lib/quote/validate";
import { siteUrl } from "@/lib/site";
import { createSessionClient, getCurrentUser } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export type LoginState = { kind: "idle" } | { kind: "error"; message: string } | { kind: "sent"; email: string };

/**
 * Passwordless sign-in / sign-up. Supabase emails a one-time link; clicking it
 * proves the customer owns the address. No passwords to store or reset.
 */
export async function sendLoginLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const raw = form.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "";
  if (!EMAIL_RE.test(email)) return { kind: "error", message: "Please enter a valid email address." };

  const supabase = await createSessionClient();
  if (!supabase) return { kind: "error", message: "Accounts aren't connected yet." };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm`, shouldCreateUser: true },
  });
  if (error) {
    console.error("sign-in link failed", error.message);
    const rateLimited = error.status === 429 || /rate limit/i.test(error.message);
    return {
      kind: "error",
      message: rateLimited
        ? "Too many sign-in emails were requested. Please wait a few minutes and try again."
        : "We couldn't send a sign-in link right now. Please try again.",
    };
  }
  return { kind: "sent", email };
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase?.auth.signOut();
  redirect("/login");
}

export type SaveState = { kind: "idle" } | { kind: "error"; message: string } | { kind: "saved" };

function text(form: FormData, name: string, max: number): string {
  const v = form.get(name);
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

export async function updateProfile(_prev: SaveState, form: FormData): Promise<SaveState> {
  const session = await getCurrentUser();
  if (!session) return { kind: "error", message: "Please sign in again." };

  const firstName = text(form, "firstName", 80);
  const lastName = text(form, "lastName", 80);
  const phoneRaw = text(form, "phone", 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { kind: "error", message: "Please enter a valid 10-digit phone number." };

  // RLS + column privileges: this can only ever update the user's own row,
  // and never their role.
  const { error } = await session.supabase
    .from("profiles")
    .update({
      first_name: firstName || null,
      last_name: lastName || null,
      phone,
      marketing_email_opt_in: form.get("marketingEmailOptIn") === "on",
      marketing_sms_opt_in: form.get("marketingSmsOptIn") === "on",
      marketing_consent_updated_at: new Date().toISOString(),
    })
    .eq("id", session.user.id);

  if (error) {
    console.error("profile update failed", error.message);
    return { kind: "error", message: "Couldn't save your details. Please try again." };
  }
  revalidatePath("/dashboard");
  return { kind: "saved" };
}

export async function updatePropertyInstructions(_prev: SaveState, form: FormData): Promise<SaveState> {
  const session = await getCurrentUser();
  if (!session) return { kind: "error", message: "Please sign in again." };

  const propertyId = text(form, "propertyId", 40);
  if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return { kind: "error", message: "Unknown property." };

  const { data, error } = await session.supabase
    .from("properties")
    .update({ technician_instructions: text(form, "technicianInstructions", 2000) || null })
    .eq("id", propertyId)
    .eq("customer_id", session.user.id)
    .select("id");

  if (error || !data?.length) {
    if (error) console.error("property update failed", error.message);
    return { kind: "error", message: "Couldn't save your instructions. Please try again." };
  }
  revalidatePath("/dashboard");
  return { kind: "saved" };
}
