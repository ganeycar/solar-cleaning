import type { Metadata } from "next";
import { LeadForm } from "@/components/lead-form";
import { PageHero, Section } from "@/components/ui";
import { getSiteSettings } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Questions about solar panel cleaning, memberships, or group bookings? Get in touch.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const [{ topic }, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const neighborhood = topic === "neighborhood";
  return (
    <>
      <PageHero eyebrow="Contact" title={neighborhood ? "Book with your neighbors" : "Get in touch"} intro={neighborhood ? "Tell us your street or neighborhood and roughly how many homes are interested. We'll plan one visit for everyone." : "Questions, special requests, or partnership ideas — we'd like to hear from you."} />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.3fr_0.7fr]">
          <LeadForm kind={neighborhood ? "neighborhood_group" : "contact"} submitLabel={neighborhood ? "Send group request" : "Send message"} />
          <aside className="space-y-4 text-sm">
            <div className="rounded-2xl bg-paper p-6">
              <h2 className="text-lg font-bold">Reach us directly</h2>
              {settings.phone || settings.email ? (
                <ul className="mt-3 space-y-1">
                  {settings.phone && <li><a href={`tel:${settings.phone}`} className="underline">{settings.phone}</a></li>}
                  {settings.email && <li><a href={`mailto:${settings.email}`} className="underline">{settings.email}</a></li>}
                </ul>
              ) : (
                <p className="mt-3 text-muted">Use the form and we'll reply by email.</p>
              )}
              <p className="mt-3 text-muted">Based in {settings.headquartersCity}, {settings.headquartersState}.</p>
            </div>
            <div className="rounded-2xl bg-paper p-6">
              <h2 className="text-lg font-bold">Solar installers</h2>
              <p className="mt-2 text-muted">Interested in referring customers for cleaning? Mention it in your message and we'll talk partnership.</p>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
