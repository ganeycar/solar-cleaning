import type { Metadata } from "next";
import Link from "next/link";
import { PlanCards } from "@/components/plan-cards";
import { PageHero, Section } from "@/components/ui";
import { getPlans } from "@/lib/site";

export const metadata: Metadata = {
  title: "Solar Cleaning Membership Plans",
  description: "Seasonal, Premium, and Unlimited Care solar panel cleaning memberships with monthly or annual billing.",
  alternates: { canonical: "/memberships" },
};

export default async function MembershipsPage() {
  const plans = await getPlans();
  return (
    <>
      <PageHero eyebrow="Memberships" title="Year-round care, on autopilot" intro="Choose how often your panels get cleaned. We'll schedule around the dry season and track every included cleaning in your portal." />
      <Section>
        <PlanCards plans={plans} />
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          <div>
            <h2 className="text-lg font-bold">Billing and cleanings are tracked separately</h2>
            <p className="mt-2 text-sm text-muted">Your portal shows exactly how many cleanings you've earned, scheduled, and used, separate from your payment history.</p>
          </div>
          <div>
            <h2 className="text-lg font-bold">Weather-smart scheduling</h2>
            <p className="mt-2 text-sm text-muted">Billing continues year-round while most cleanings happen in Northern California's drier months, when panels need it most.</p>
          </div>
          <div>
            <h2 className="text-lg font-bold">Clear terms, easy cancellation</h2>
            <p className="mt-2 text-sm text-muted">Renewal terms are shown before you join, and you can cancel online. Read the <Link href="/legal/membership-terms" className="underline">Membership Terms</Link>.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
