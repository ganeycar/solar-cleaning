import Link from "next/link";
import { PlanCards } from "@/components/plan-cards";
import { ButtonLink, CheckItem, Container, Eyebrow, PanelGrid, PhotoSlot, Section } from "@/components/ui";
import { CITIES } from "@/content/cities";
import { getPlans, getSiteSettings, siteUrl } from "@/lib/site";
import { loadSchedulingSettings } from "@/lib/scheduling/data";
import { getPublicClient } from "@/lib/supabase/admin";

export default async function HomePage() {
  const db = getPublicClient();
  const [settings, plans, scheduling] = await Promise.all([getSiteSettings(), getPlans(), db ? loadSchedulingSettings(db) : Promise.resolve(null)]);
  const base = siteUrl();
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Structured data includes only information that is actually configured:
  // no street address (service-area business), no prices until published.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${base}/#business`,
    name: settings.businessName,
    description: settings.tagline,
    url: `${base}/`,
    ...(settings.logoUrl ? { logo: settings.logoUrl } : {}),
    ...(settings.phone ? { telephone: settings.phone } : {}),
    ...(settings.email ? { email: settings.email } : {}),
    address: { "@type": "PostalAddress", addressLocality: settings.headquartersCity, addressRegion: settings.headquartersState, addressCountry: "US" },
    areaServed: CITIES.map((c) => ({ "@type": "City", name: `${c.name}, CA` })),
    ...(settings.profileLinks.length ? { sameAs: settings.profileLinks } : {}),
    knowsAbout: ["Solar panel cleaning", "Residential solar maintenance", "Commercial solar panel cleaning", "Water-fed pole cleaning"],
    ...(scheduling
      ? {
          openingHoursSpecification: scheduling.weeklyHours.flatMap((h, d) =>
            h ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${DAY_NAMES[d]}`, opens: h.start, closes: h.end }] : [],
          ),
        }
      : {}),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Solar panel cleaning services",
      itemListElement: plans.map((p) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: p.name, description: p.summary },
        // Only published prices. One-time cleanings are "starting at"; memberships are per month or year.
        ...(p.prices[0]
          ? p.kind === "one_time"
            ? { priceSpecification: { "@type": "PriceSpecification", minPrice: (p.prices[0].amountCents / 100).toFixed(2), priceCurrency: "USD" } }
            : {
                priceSpecification: p.prices.map((pr) => ({
                  "@type": "UnitPriceSpecification",
                  price: (pr.amountCents / 100).toFixed(2),
                  priceCurrency: "USD",
                  unitText: pr.interval === "year" ? "year" : "month",
                })),
              }
          : {}),
      })),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <section className="relative overflow-hidden bg-navy text-white">
        <PanelGrid className="absolute -right-40 top-0 h-[560px] w-[820px] text-white opacity-[0.12]" />
        <div aria-hidden className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gold/25 blur-3xl" />
        <Container className="relative grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Eyebrow>Locally operated in {settings.headquartersCity}, CA</Eyebrow>
            <h1 className="text-4xl font-extrabold leading-[1.05] text-white sm:text-6xl">
              Clean panels.<br />
              <span className="text-gold">Clear sunlight.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/80">
              Professional solar panel cleaning and care memberships for homes and businesses in Solano and Yolo counties. Purified water, soft brushes, and a ground-first safety approach.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/quote">Get an instant quote</ButtonLink>
              <ButtonLink href="/memberships" variant="ghost">See membership plans</ButtonLink>
            </div>
            <ul className="mt-10 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
              <CheckItem>Before-and-after photos every visit</CheckItem>
              <CheckItem>Online quotes and scheduling</CheckItem>
              <CheckItem>No harsh chemicals or pressure washing</CheckItem>
              <CheckItem>Weather-safe rescheduling</CheckItem>
            </ul>
          </div>
          <PhotoSlot alt="Technician cleaning rooftop solar panels with a water-fed pole" label="technician cleaning panels from the ground" className="aspect-[4/5] w-full" />
        </Container>
      </section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-3">
          {[
            { href: "/quote", title: "Book a cleaning", body: "A one-time, complete standard cleaning. Get a quote online in a couple of minutes." },
            { href: "/memberships", title: "Join a membership", body: "Two, four, or up to twelve cleanings a year, timed for the dry season and billed monthly or annually." },
            { href: "/commercial", title: "Commercial quotes", body: "Custom scope and frequency for larger installations, ag properties, and multi-building sites." },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="group rounded-2xl border border-line p-7 transition hover:border-navy hover:shadow-md">
              <h2 className="text-xl font-bold">{c.title}</h2>
              <p className="mt-3 text-muted">{c.body}</p>
              <span className="mt-5 inline-block text-sm font-semibold text-navy group-hover:underline">Learn more →</span>
            </Link>
          ))}
        </div>
      </Section>

      <section className="bg-paper py-16 sm:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <PhotoSlot alt="Close-up of dusty solar panel next to a freshly cleaned panel" label="before-and-after close-up" className="aspect-[4/3] w-full" />
          <div>
            <Eyebrow>Why it matters here</Eyebrow>
            <h2 className="text-3xl font-extrabold sm:text-4xl">Northern California summers are hard on panels.</h2>
            <p className="mt-5 text-muted">
              Months without rain, agricultural dust, spring pollen, and wildfire smoke all settle on glass. Rain alone often leaves a film behind. A careful cleaning restores clear glass without risking your panels or your roof.
            </p>
            <p className="mt-4 text-muted">
              We don't promise a specific energy increase — every system is different. Your monitoring app is the best way to see the effect on your own panels.
            </p>
            <div className="mt-7"><ButtonLink href="/how-it-works" variant="secondary">How a cleaning works</ButtonLink></div>
          </div>
        </Container>
      </section>

      <Section>
        <div className="mb-10 max-w-2xl">
          <Eyebrow>Plans</Eyebrow>
          <h2 className="text-3xl font-extrabold sm:text-4xl">One cleaning, or year-round care.</h2>
          <p className="mt-4 text-muted">Memberships keep your recurring cleanings on the calendar so you don't have to think about it. Every included cleaning is tracked in your customer portal.</p>
        </div>
        <PlanCards plans={plans} includeCommercial={false} />
        <p className="mt-6 text-sm text-muted">Membership renewal, cancellation, and service limits are explained in our <Link href="/legal/membership-terms" className="underline">Membership Terms</Link>.</p>
      </Section>

      <section className="bg-navy py-16 text-white sm:py-20">
        <Container>
          <Eyebrow>Service areas</Eyebrow>
          <h2 className="text-3xl font-extrabold text-white">Based in {settings.headquartersCity}. Growing across the region.</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {CITIES.map((c) => (
              <Link key={c.slug} href={`/service-areas/${c.slug}`} className="rounded-full border border-white/25 px-5 py-2 text-sm hover:border-gold hover:text-gold">{c.name}</Link>
            ))}
          </div>
        </Container>
      </section>

      <Section>
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gold-soft/60 p-8 sm:flex-row sm:items-center sm:p-12">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Ready for clear panels?</h2>
            <p className="mt-2 text-muted">Tell us about your system and we'll take it from there.</p>
          </div>
          <ButtonLink href="/quote">Get my quote</ButtonLink>
        </div>
      </Section>
    </>
  );
}
