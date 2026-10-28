import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnv } from "./url.ts";

/**
 * Supabase client acting AS the signed-in user (anon key + session cookie).
 * Every query is filtered by Row Level Security, so a customer can only ever
 * read their own records through this client.
 */
export async function createSessionClient(): Promise<SupabaseClient | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session cookie on the next request.
        }
      },
    },
  });
}

/** Returns the verified signed-in user (checked with Supabase, not just read from the cookie). */
export async function getCurrentUser(): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const supabase = await createSessionClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}
