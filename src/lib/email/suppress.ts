import { getAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "./unsubscribe";

/** Records an unsubscribe if the signed link is valid. Returns false otherwise. */
export async function suppressEmail(email: string, token: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e || !verifyUnsubscribe(e, token)) return false;
  const db = getAdminClient();
  if (!db) return false;
  const { error } = await db.from("email_suppressions").upsert({ email: e, reason: "unsubscribed" }, { onConflict: "email" });
  if (error) return false;
  // Also turn off marketing consent on their account and quotes.
  await db.from("profiles").update({ marketing_email_opt_in: false, marketing_consent_updated_at: new Date().toISOString() }).eq("email", e);
  await db.from("quote_requests").update({ marketing_email_opt_in: false }).eq("email", e);
  return true;
}
