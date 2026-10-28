import type { Metadata } from "next";
import { ButtonLink, PageHero, PhotoSlot, Section } from "@/components/ui";
import { getSiteSettings } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Us",
  description: "A locally operated solar panel cleaning company based in Vacaville, California.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const s = await getSiteSettings();
  return (
    <>
      <PageHero eyebrow="About" title={`About ${s.businessName}`} />
      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="prose-site">
            {/* Replace this placeholder story with your own. Don't add claims about experience, licensing, or insurance until they're confirmed. */}
            <p>
              {s.businessName} is a locally operated solar panel cleaning company based in {s.headquartersCity}, California. We started with a simple idea: homeowners invested in solar shouldn't have to climb onto a roof or guess when their panels need attention.
            </p>
            <p>
              We clean with professional water-fed poles, soft brushes, and purified water, working from the ground whenever practical. We focus on cleaning and do it carefully. We don't do electrical work, repairs, or installations.
            </p>
            <h2>How we work</h2>
            <ul>
              <li><strong>Safety first.</strong> If a job can't be done safely, we say so.</li>
              <li><strong>Honest results.</strong> Before-and-after photos, not promises about energy numbers.</li>
              <li><strong>Clear terms.</strong> Memberships with plain-language renewal and cancellation terms.</li>
              <li><strong>Local.</strong> Serving our own community and the towns around it.</li>
            </ul>
            {s.licenseInfo && <p className="text-sm">{s.licenseInfo}</p>}
            {s.insuranceInfo && <p className="text-sm">{s.insuranceInfo}</p>}
          </div>
          <PhotoSlot alt="Owner with cleaning equipment and service vehicle" label="you and your equipment" className="aspect-[4/5] w-full" />
        </div>
        <div className="mt-12"><ButtonLink href="/quote">Get a quote</ButtonLink></div>
      </Section>
    </>
  );
}
