import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/url";

/**
 * Next.js 16 proxy (formerly "middleware"). Runs only on account routes:
 * refreshes the Supabase session cookie and sends signed-out visitors from the
 * dashboard, checkout, and owner pages to the login page. Public pages are untouched and stay fast.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = supabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  const protectedPath = ["/dashboard", "/checkout", "/admin"].some((p) => request.nextUrl.pathname.startsWith(p));
  if (!data.user && protectedPath) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/checkout/:path*", "/admin/:path*", "/login"],
};
