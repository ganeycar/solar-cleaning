import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** One-way hash of the visitor IP so we can rate limit without storing raw IPs. */
export function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT || "dev-only-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Database-backed limit (works across serverless instances): rejects when the
 * same hashed IP has created `max` rows in `table` within `windowMinutes`.
 */
export async function isRateLimited(db: SupabaseClient, table: "quote_requests" | "leads", ipHash: string, max: number, windowMinutes: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if (error) return false; // fail open on transient errors; honeypot + validation still apply
  return (count ?? 0) >= max;
}
