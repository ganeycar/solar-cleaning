import type { Metadata } from "next";
import { ButtonLink, PageHero, Section } from "@/components/ui";

export const metadata: Metadata = { title: "Customer Login", robots: { index: false } };

// Phase 2 replaces this with Supabase Auth (email magic link / password),
// using @supabase/ssr cookie sessions. No custom login system.
export default function LoginPage() {
  return (
    <>
      <PageHero eyebrow="Customer portal" title="Log in" intro="Customer accounts are launching soon. You'll be able to see appointments, cleanings remaining, photos, and billing in one place." />
      <Section>
        <p className="text-muted">In the meantime, start with a quote and we'll keep you updated by email.</p>
        <div className="mt-6"><ButtonLink href="/quote">Get a quote</ButtonLink></div>
      </Section>
    </>
  );
}
