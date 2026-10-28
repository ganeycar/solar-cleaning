import type { Metadata } from "next";
import { ButtonLink, PageHero, Section } from "@/components/ui";
import { FAQ } from "@/content/faq";

export const metadata: Metadata = {
  title: "Solar Panel Cleaning FAQ",
  description: "Answers about solar panel cleaning methods, safety, weather, memberships, and service areas.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHero eyebrow="FAQ" title="Frequently asked questions" />
      <Section>
        <div className="max-w-3xl divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold text-navy">
                {f.q}
                <span aria-hidden className="text-gold transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10"><ButtonLink href="/contact" variant="secondary">Ask us something else</ButtonLink></div>
      </Section>
    </>
  );
}
