import type { Metadata } from "next";
import { QuoteForm } from "@/components/quote-form";
import { Container, PageHero } from "@/components/ui";

export const metadata: Metadata = {
  title: "Instant Solar Cleaning Quote",
  description: "Get a solar panel cleaning quote online. Tell us your panel count and access, and we'll handle the rest.",
  alternates: { canonical: "/quote" },
};

const PLAN_TO_REQUEST: Record<string, string> = {
  "one-time": "one_time",
  "seasonal-care": "seasonal",
  "premium-care": "premium",
  "unlimited-care": "unlimited",
  commercial: "commercial",
};

export default async function QuotePage({ searchParams }: { searchParams: Promise<{ plan?: string; city?: string }> }) {
  const { plan, city } = await searchParams;
  return (
    <>
      <PageHero eyebrow="Instant quote" title="Get your quote" intro="It takes about two minutes. Jobs that need a closer look are reviewed by a person before we give a price — we never guess on safety." />
      <Container className="max-w-3xl py-14">
        <QuoteForm defaultCleaning={plan ? PLAN_TO_REQUEST[plan] : undefined} defaultCity={typeof city === "string" ? city.slice(0, 80) : undefined} />
      </Container>
    </>
  );
}
