import { redirect } from "next/navigation";

// Customer dashboard is built in Phase 2 behind authentication.
// Until then, never render account data here.
export default function DashboardPage() {
  redirect("/login");
}
