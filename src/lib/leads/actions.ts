"use server";

import { headers } from "next/headers";
import { getAdminClient } from "@/lib/supabase/admin";
import { clientIp, hashIp, isRateLimited } from "@/lib/rate-limit";

export type LeadFormState = { kind: "idle" } | { kind: "error"; message: string } | { kind: "sent" };

const KINDS = ["contact", "commercial", "neighborhood_group", "installer_partner"] as const;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function field(form: FormData, name: string, max: number): string {
  const v = form.get(name);
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

export async function submitLead(_prev: LeadFormState, form: FormData): Promise<LeadFormState> {
  if (field(form, "company_website", 200)) return { kind: "error", message: "Submission rejected." };

  const kindRaw = field(form, "kind", 40);
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "contact";
  const name = field(form, "name", 120);
  const email = field(form, "email", 254).toLowerCase();
  const message = field(form, "message", 4000);
  const panelRaw = field(form, "panelEstimate", 7);
  const panelEstimate = panelRaw && Number.isInteger(Number(panelRaw)) && Number(panelRaw) > 0 ? Number(panelRaw) : null;

  if (!name) return { kind: "error", message: "Please enter your name." };
  if (!EMAIL_RE.test(email)) return { kind: "error", message: "Please enter a valid email address." };
  if (message.length < 5) return { kind: "error", message: "Please add a short message." };

  const db = getAdminClient();
  if (!db) return { kind: "error", message: "Our contact form isn't connected yet. Please try again soon." };

  const ipHash = hashIp(clientIp(await headers()));
  if (await isRateLimited(db, "leads", ipHash, 5, 60)) {
    return { kind: "error", message: "Too many messages from this connection. Please try again later." };
  }

  const { error } = await db.from("leads").insert({
    kind,
    name,
    email,
    phone: field(form, "phone", 40) || null,
    company: field(form, "company", 160) || null,
    city: field(form, "city", 80) || null,
    panel_estimate: panelEstimate,
    message,
    ip_hash: ipHash,
  });
  if (error) {
    console.error("lead insert failed", error.message);
    return { kind: "error", message: "Something went wrong. Please try again." };
  }
  return { kind: "sent" };
}
