import type { Metadata } from "next";
import { ButtonLink, CheckItem, Eyebrow, PageHero, PhotoSlot, Section } from "@/components/ui";

export const metadata: Metadata = {
  title: "Residential Solar Panel Cleaning",
  description: "Careful, ground-first solar panel cleaning for homes in Vacaville, Fairfield, Suisun City, Dixon, Winters, and Davis.",
  alternates: { canonical: "/residential" },
};

export default function ResidentialPage() {
  return (
    <>
      <PageHero eyebrow="Residential" title="Solar panel cleaning for your home" intro="A thorough, careful cleaning using purified water and soft brushes — with before-and-after photos so you can see the difference.">
        <ButtonLink href="/quote">Get a quote</ButtonLink>
        <ButtonLink href="/memberships" variant="ghost">Membership plans</ButtonLink>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>What's included</Eyebrow>
            <h2 className="text-3xl font-extrabold">A standard cleaning</h2>
            <ul className="mt-6 space-y-3">
              <CheckItem>Rinse and gentle brush of every reachable panel using a water-fed pole</CheckItem>
              <CheckItem>Purified water that dries without mineral spots</CheckItem>
              <CheckItem>Removal of dust, pollen, bird droppings, and smoke film</CheckItem>
              <CheckItem>A visual check for obvious debris or damage, documented with photos</CheckItem>
              <CheckItem>Before-and-after photos in your customer portal</CheckItem>
            </ul>
          </div>
          <PhotoSlot alt="Clean residential rooftop solar array" label="clean residential array" className="aspect-[4/3] w-full" />
        </div>
      </Section>

      <section className="bg-paper py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold">Ground-first safety</h3>
            <p className="mt-2 text-muted">Most residential arrays can be cleaned from the ground. When they can't, we review access before quoting, and we'll say so if a job isn't safe.</p>
          </div>
          <div>
            <h3 className="text-lg font-bold">Gentle on your system</h3>
            <p className="mt-2 text-muted">No pressure washers, abrasive pads, or harsh chemicals. We clean the glass only and never touch wiring or electrical components.</p>
          </div>
          <div>
            <h3 className="text-lg font-bold">Cleaning only</h3>
            <p className="mt-2 text-muted">We don't do repairs, electrical work, or installations. If we spot damage, we'll document it so you can contact your installer.</p>
          </div>
        </div>
      </section>

      <Section>
        <h2 className="text-2xl font-extrabold">What we may not be able to clean</h2>
        <ul className="prose-site mt-4">
          <li>Panels that can only be reached by walking on steep, tile, or fragile roofs</li>
          <li>Arrays above a height our equipment can safely reach from the ground</li>
          <li>Panels with visible cracked glass or exposed wiring (we'll document and stop)</li>
          <li>Any job during rain, high wind, extreme heat, or other unsafe conditions</li>
        </ul>
        <div className="mt-8"><ButtonLink href="/quote">Check my home</ButtonLink></div>
      </Section>
    </>
  );
}
