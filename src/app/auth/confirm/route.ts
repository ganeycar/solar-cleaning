import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Landing point for the sign-in email link. Exchanges the one-time code for a
 * session cookie, links any earlier quote requests made with this (now
 * verified) email, and sends the customer to their dashboard.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const fail = () => NextResponse.redirect(new URL("/login?error=link", url.origin));

  const supabase = await createSessionClient();
  if (!supabase) return fail();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  if (!ok) return fail();

  const { error: claimError } = await supabase.rpc("claim_my_quotes");
  if (claimError) console.error("claim_my_quotes failed", claimError.message);

  return NextResponse.redirect(new URL("/dashboard", url.origin));
}
