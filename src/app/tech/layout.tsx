import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireTechnician } from "@/lib/auth/technician";

export const metadata: Metadata = { title: "Technician", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TechLayout({ children }: { children: ReactNode }) {
  const { tech } = await requireTechnician();
  return (
    <div className="min-h-screen bg-paper">
      <div className="border-b border-line bg-white text-navy">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/tech" className="font-display text-lg font-bold">Today&apos;s jobs</Link>
          <span className="truncate text-sm text-muted">{tech.display_name}</span>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-6">{children}</div>
    </div>
  );
}
