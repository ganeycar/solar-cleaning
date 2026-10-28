import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./url.ts";

/**
 * Server-only Supabase clients.
 *
 * - `getPublicClient` uses the anon key and is subject to Row Level Security.
 * - `getAdminClient` uses the service role key and BYPASSES RLS. Only call it
 *   from server code after validating input; never import it into a client
 *   component.
 *
 * Both return null when Supabase isn't configured yet, so the public site
 * still renders with default content during setup.
 */

if (typeof window !== "undefined") {
  throw new Error("src/lib/supabase/admin.ts must only be imported on the server.");
}

let publicClient: SupabaseClient | null | undefined;
let adminClient: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getPublicClient(): SupabaseClient | null {
  if (publicClient !== undefined) return publicClient;
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  publicClient = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return publicClient;
}

export function getAdminClient(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return adminClient;
}
