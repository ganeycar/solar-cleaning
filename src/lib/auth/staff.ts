import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Use at the top of every owner page AND every owner server action (server
 * actions are public endpoints, so the page check alone isn't enough).
 * Non-staff get a 404 so the owner area isn't advertised.
 */
export async function requireStaff() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const { data } = await session.supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
  const role = data?.role as string | undefined;
  if (role !== "owner" && role !== "admin") notFound();
  return { ...session, role };
}
