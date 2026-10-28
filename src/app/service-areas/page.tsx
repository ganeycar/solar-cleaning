import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, PageHero, Section } from "@/components/ui";
import { CITIES } from "@/content/cities";
import { getTerritories } from "@/lib/site";

export const metadata: Metadata = {
  title: "Service Areas",
  description: "Solar panel cleaning in Vacaville, Fairfield, Suisun City, Dixon, Winters, and Davis, California.",
  alternates: { canonical: "/service-areas" },
};

export default async function ServiceAreasPage() {
  const territories = await getTerritories();
  const open = new Map(territories.map((t) => [t.slug, t.acceptingNew]));
  return (
    <>
      <PageHero eyebrow="Service areas" title="Where we clean" intro="We're based in Vacaville and opening nearby cities as our schedule allows. Not on the list? Request a quote anyway — we'll let you know." />
      <Section>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CITIES.map((c) => (
            <Link key={c.slug} href={`/service-areas/${c.slug}`} className="group rounded-2xl border border-line p-6 transition hover:border-navy hover:shadow-md">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">{c.name}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${open.get(c.slug) ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {open.get(c.slug) ? "Booking now" : "Join waitlist"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{c.county}</p>
              <p className="mt-3 text-sm text-muted">{c.intro}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-navy group-hover:underline">{c.name} details →</span>
            </Link>
          ))}
        </div>
        <div className="mt-10"><ButtonLink href="/quote">Check my address</ButtonLink></div>
      </Section>
    </>
  );
}
