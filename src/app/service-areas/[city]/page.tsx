import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink, Eyebrow, PageHero, Section } from "@/components/ui";
import { CITIES, getCity } from "@/content/cities";
import { getSiteSettings, getTerritories, siteUrl } from "@/lib/site";

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

  const localFaqs = [
    {
      q: `Do you clean solar panels in ${c.name}?`,
      a: accepting
        ? `Yes. We're booking solar panel cleanings in ${c.name} now. Get a quote online; simple jobs can get a price right away.`
        : `We're opening ${c.name} as our schedule allows. Request a quote and you'll be on our list; we'll contact you as soon as we can book you.`,
    },
    ...c.faqs,
  ];
  const base = siteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        serviceType: "Solar panel cleaning",
        name: `Solar panel cleaning in ${c.name}, CA`,
        provider: { "@type": "HomeAndConstructionBusiness", "@id": `${base}/#business`, name: settings.businessName },
        areaServed: { "@type": "City", name: `${c.name}, CA`, containedInPlace: { "@type": "AdministrativeArea", name: `${c.county}, California` } },
        url: `${base}/service-areas/${c.slug}`,
      },
      {
        "@type": "FAQPage",
        mainEntity: localFaqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
          { "@type": "ListItem", position: 2, name: "Service areas", item: `${base}/service-areas` },
          { "@type": "ListItem", position: 3, name: c.name, item: `${base}/service-areas/${c.slug}` },
        ],
      },
    ],
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
        <div className="mt-12">
          <h2 className="text-2xl font-extrabold">{c.name} solar cleaning questions</h2>
          <div className="mt-4 max-w-3xl divide-y divide-line border-y border-line">
            {localFaqs.map((f) => (
              <div key={f.q} className="py-4">
                <h3 className="text-base font-bold">{f.q}</h3>
                <p className="mt-1 text-muted">{f.a}</p>
              </div>
            ))}
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
