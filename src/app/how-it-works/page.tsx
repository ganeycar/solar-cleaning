import type { Metadata } from "next";
import { ButtonLink, PageHero, PhotoSlot, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "How Solar Panel Cleaning Works",
  description: "From online quote to before-and-after photos: how our solar panel cleaning service works.",
  alternates: { canonical: "/how-it-works" },
};

const STEPS = [
  { t: "Get a quote online", b: "Enter your address, panel count, home type, and how the panels can be reached. Optional photos help us quote accurately." },
  { t: "We review anything uncertain", b: "Steep, tile, or tall roofs, or unclear access, are reviewed by a person before we give a price. Safety comes before speed." },
  { t: "Choose your service", b: "Pick a one-time cleaning or a membership. Membership terms, including renewal and cancellation, are shown before you agree." },
  { t: "Schedule and get reminders", b: "You'll get a confirmation and reminders. If weather turns unsafe, we reschedule rather than cut corners." },
  { t: "We clean — gently", b: "Water-fed poles, soft brushes, and purified water. No pressure washers or harsh chemicals, and ground-based whenever practical." },
  { t: "See the results", b: "Before-and-after photos and service notes appear in your customer portal. Members can see their remaining cleanings anytime." },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero eyebrow="How it works" title="Simple for you. Careful on your roof." />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <ol className="space-y-8">
            {STEPS.map((s, i) => (
              <li key={s.t} className="flex gap-5">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-navy font-display font-bold text-gold">{i + 1}</span>
                <div>
                  <h2 className="text-lg font-bold">{s.t}</h2>
                  <p className="mt-1 text-muted">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="space-y-5">
            <PhotoSlot alt="Water-fed pole and soft brush equipment" label="water-fed pole equipment" className="aspect-square w-full" />
            <div className="rounded-2xl bg-paper p-6">
              <h2 className="text-lg font-bold">About water use</h2>
              <p className="mt-2 text-sm text-muted">We use purified water and only as much as the cleaning needs. Runoff is plain water — no soaps or chemicals going into your yard or storm drains.</p>
            </div>
          </div>
        </div>
        <div className="mt-12"><ButtonLink href="/quote">Get a quote</ButtonLink></div>
      </Section>
    </>
  );
}
