import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { requireStaff } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Owner tools", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/quotes", label: "Quotes" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/pricing", label: "Plans & prices" },
  { href: "/admin/settings", label: "Quote pricing & areas" },
  { href: "/admin/business", label: "Business" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return (
    <div className="min-h-screen bg-paper">
      <div className="border-b border-line bg-white">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Owner tools</p>
            <nav aria-label="Owner" className="mt-1 flex flex-wrap gap-5 text-sm font-semibold">
              {TABS.map((t) => <Link key={t.href} href={t.href} className="text-navy hover:underline">{t.label}</Link>)}
            </nav>
          </div>
          <Link href="/dashboard" className="text-sm text-muted underline">Back to my dashboard</Link>
        </Container>
      </div>
      <Container className="py-8">{children}</Container>
    </div>
  );
}
