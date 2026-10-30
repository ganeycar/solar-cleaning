import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/site";
import type { Brand, Email } from "./templates";
import { unsubscribeToken } from "./unsubscribe";

/**
 * Sends one email through Resend (https://resend.com) and logs it.
 *
 * - Never throws: an email problem must never break a booking or a payment.
 * - Idempotent: `key` is unique, so the same message is sent at most once even
 *   when a webhook or the daily job runs again.
 * - Without RESEND_API_KEY the email is logged as "skipped" (nothing is sent).
 * - EMAIL_TEST_TO sends every email to that one address instead (test mode).
 * - Optional emails (follow-ups) are not sent to unsubscribed addresses.
 */

export interface SendArgs {
  key: string;
  kind: string;
  to: string | null | undefined;
  email: Email;
  customerId?: string | null;
  relatedId?: string | null;
}

export type SendResult = "sent" | "skipped" | "suppressed" | "failed" | "duplicate" | "no-recipient";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendEmail(db: SupabaseClient, args: SendArgs): Promise<SendResult> {
  try {
    const to = args.to?.trim().toLowerCase();
    if (!to || !EMAIL_RE.test(to)) return "no-recipient";

    // Claim the key. If it exists and was sent (or deliberately skipped), stop.
    const { data: existing } = await db.from("email_log").select("id, status").eq("idem_key", args.key).maybeSingle();
    if (existing && ["sent", "suppressed", "pending"].includes(existing.status)) return "duplicate";

    let status: "pending" | "skipped" | "suppressed" = "pending";
    let note: string | null = null;
    if (args.email.optional) {
      const { data: sup } = await db.from("email_suppressions").select("email").eq("email", to).maybeSingle();
      if (sup) status = "suppressed";
    }
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (status === "pending" && !apiKey) { status = "skipped"; note = "RESEND_API_KEY not set"; }

    const row = { idem_key: args.key, kind: args.kind, to_email: to, subject: args.email.subject.slice(0, 300), customer_id: args.customerId ?? null, related_id: args.relatedId ?? null, status, error: note };
    if (existing) {
      await db.from("email_log").update(row).eq("id", existing.id);
    } else {
      const { error } = await db.from("email_log").insert(row);
      if (error) return error.code === "23505" ? "duplicate" : "failed"; // Another process claimed it.
    }
    if (status !== "pending") return status;

    const testTo = process.env.EMAIL_TEST_TO?.trim();
    const from = process.env.EMAIL_FROM?.trim() || "Bookings <onboarding@resend.dev>";
    const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;
    const headers: Record<string, string> = {};
    if (args.email.optional) {
      const token = unsubscribeToken(to);
      if (token) {
        const url = `${siteUrl()}/api/unsubscribe?${new URLSearchParams({ e: to, t: token })}`;
        headers["List-Unsubscribe"] = `<${url}>`;
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": args.key.slice(0, 256) },
      body: JSON.stringify({
        from,
        to: [testTo || to],
        subject: testTo ? `[TEST to ${to}] ${args.email.subject}` : args.email.subject,
        html: args.email.html,
        text: args.email.text,
        reply_to: replyTo,
        headers: Object.keys(headers).length ? headers : undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      await db.from("email_log").update({ status: "failed", error: `${res.status}: ${body.message ?? "send failed"}`.slice(0, 500) }).eq("idem_key", args.key);
      console.error(`Email ${args.kind} to ${to} failed: ${res.status} ${body.message ?? ""}`);
      return "failed";
    }
    await db.from("email_log").update({ status: "sent", provider_id: body.id ?? null, sent_at: new Date().toISOString(), error: null }).eq("idem_key", args.key);
    return "sent";
  } catch (err) {
    console.error(`Email ${args.kind} error:`, (err as Error).message);
    try { await db.from("email_log").update({ status: "failed", error: String((err as Error).message).slice(0, 500) }).eq("idem_key", args.key); } catch { /* ignore */ }
    return "failed";
  }
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function prettyPhone(p: string | null | undefined): string | null {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p ?? "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p ?? null;
}

export async function loadBrand(db: SupabaseClient): Promise<Brand> {
  const { data } = await db.from("business_settings").select("business_name, phone, email, brand_colors, review_url, mailing_address").eq("id", 1).maybeSingle();
  const s = (data ?? {}) as Row;
  return {
    businessName: s.business_name ?? "Solano Solar Cleaning",
    phone: prettyPhone(s.phone),
    email: s.email ?? null,
    navy: s.brand_colors?.navy ?? "#0b1b33",
    gold: s.brand_colors?.gold ?? "#e8b04a",
    siteUrl: siteUrl(),
    reviewUrl: s.review_url ?? null,
    mailingAddress: s.mailing_address ?? null,
  };
}

/** Where owner alerts go: OWNER_NOTIFY_EMAIL, else the business email. */
export function ownerEmail(brand: Brand): string | null {
  return process.env.OWNER_NOTIFY_EMAIL?.trim() || brand.email || null;
}
