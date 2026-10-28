import type { Metadata } from "next";
import { ButtonLink, PageHero, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Book a Solar Panel Cleaning",
  description: "Schedule a solar panel cleaning appointment.",
  alternates: { canonical: "/book" },
};

// Online self-scheduling (availability, technician assignment, entitlements)
// is built in Phase 4. Until then, booking starts with a quote request.
export default function BookPage() {
  return (
    <>
      <PageHero eyebrow="Booking" title="Book an appointment" intro="Online self-scheduling is coming soon. For now, start with a quick quote and we'll confirm a time with you directly." />
      <Section>
        <ol className="grid gap-6 md:grid-cols-3">
          {[
            ["Request a quote", "Tell us about your panels and access."],
            ["We confirm the details", "We review your request and reach out with a price and available times."],
            ["We clean and send photos", "You'll get before-and-after photos when the job is done."],
          ].map(([t, b], i) => (
            <li key={t} className="rounded-2xl border border-line p-6">
              <span className="font-display text-3xl font-extrabold text-gold">{i + 1}</span>
              <h2 className="mt-2 text-lg font-bold">{t}</h2>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10"><ButtonLink href="/quote">Start with a quote</ButtonLink></div>
      </Section>
    </>
  );
}
