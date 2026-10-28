import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink, Eyebrow, PageHero, Section } from "@/components/ui";
import { CITIES, getCity } from "@/content/cities";
import { getSiteSettings, getTerritories } from "@/lib/site";

type Props = { params: Promise<{ city: string }> };

export function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city } = await params;
  const c = getCity(city);
  if (!c) return {};
  return {
    title: `Solar Panel Cleaning in ${c.name}, CA`,
    description: `${c.intro} Online quotes and membership plans for ${c.name} homes.`,
    alternates: { canonical: `/service-areas/${c.slug}` },
  };
}

export default async function CityPage({ params }: Props) {
  const { city } = await params;
  const c = getCity(city);
  if (!c) notFound();
  const [settings, territories] = await Promise.all([getSiteSettings(), getTerritories()]);
  const accepting = territories.find((t) => t.slug === c.slug)?.acceptingNew ?? false;
  const others = CITIES.filter((x) => x.slug !== c.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Solar panel cleaning",
    provider: { "@type": "HomeAndConstructionBusiness", name: settings.businessName },
    areaServed: { "@type": "City", name: `${c.name}, CA` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHero eyebrow={`${c.county} · ${accepting ? "Booking now" : "Waitlist open"}`} title={c.headline} intro={c.intro}>
        <ButtonLink href={`/quote?city=${encodeURIComponent(c.name)}`}>{accepting ? "Get a quote" : "Join the waitlist"}</ButtonLink>
        <ButtonLink href="/memberships" variant="ghost">Membership plans</ButtonLink>
      </PageHero>
      <Section>
        <Eyebrow>Local conditions</Eyebrow>
        <h2 className="text-3xl font-extrabold">What gets on panels in {c.name}</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {c.localConditions.map((lc) => (
            <div key={lc.title} className="rounded-2xl border border-line p-6">
              <h3 className="text-lg font-bold">{lc.title}</h3>
              <p className="mt-2 text-sm text-muted">{lc.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl bg-paper p-6">
            <h2 className="text-lg font-bold">Scheduling in {c.name}</h2>
            <p className="mt-2 text-muted">{c.schedulingNote}</p>
          </div>
          <div className="rounded-2xl bg-paper p-6">
            <h2 className="text-lg font-bold">Booking with neighbors</h2>
            <p className="mt-2 text-muted">{c.neighborhoodsNote} <Link href="/contact?topic=neighborhood" className="underline">Ask about a group booking</Link>.</p>
          </div>
        </div>
        <nav aria-label="Other service areas" className="mt-12 text-sm text-muted">
          Also serving:{" "}
          {others.map((o, i) => (
            <span key={o.slug}>
              <Link href={`/service-areas/${o.slug}`} className="underline">{o.name}</Link>
              {i < others.length - 1 ? ", " : ""}
            </span>
          ))}
        </nav>
      </Section>
    </>
  );
}
