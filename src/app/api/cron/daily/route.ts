import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDailyJob } from "@/lib/email/daily";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Daily job (reminders, follow-ups, renewal notices). Vercel Cron calls this
 * once a day (see vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
 * Anyone without the secret gets a 401.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getAdminClient();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const result = await runDailyJob(db);
  return NextResponse.json(result, { status: result.errors.length ? 500 : 200 });
}
