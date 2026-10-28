import type { Metadata } from "next";
import { LeadForm } from "@/components/lead-form";
import { CheckItem, Eyebrow, PageHero, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Commercial Solar Panel Cleaning",
  description: "Custom solar panel cleaning for commercial, agricultural, and multi-building properties in Solano and Yolo counties.",
  alternates: { canonical: "/commercial" },
};

export default function CommercialPage() {
  return (
    <>
      <PageHero eyebrow="Commercial" title="Solar cleaning for larger installations" intro="Offices, warehouses, farms, wineries, HOAs, and multi-building sites. Every commercial job is scoped and priced individually." />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="text-3xl font-extrabold">Scoped to your site</h2>
            <ul className="mt-6 space-y-3">
              <CheckItem>Site assessment of array size, access, water source, and safety needs</CheckItem>
              <CheckItem>Custom cleaning frequency that fits your operations</CheckItem>
              <CheckItem>Scheduling around business hours and site rules</CheckItem>
              <CheckItem>Photo documentation and service reports for every visit</CheckItem>
              <CheckItem>Contract or invoice billing</CheckItem>
            </ul>
            <p className="mt-6 text-sm text-muted">Some rooftop commercial arrays require access methods we don't offer at launch. We'll tell you plainly during the assessment.</p>
          </div>
          <div id="inquiry" className="scroll-mt-24 rounded-2xl border border-line p-6 sm:p-8">
            <h2 className="text-xl font-bold">Request a commercial quote</h2>
            <p className="mb-6 mt-2 text-sm text-muted">Tell us about the site and we'll follow up to schedule an assessment.</p>
            <LeadForm kind="commercial" showCompany showPanels submitLabel="Request a site quote" />
          </div>
        </div>
      </Section>
    </>
  );
}
