import type { Metadata } from "next";
import Link from "next/link";
import { Container, DraftNotice, PageHero } from "@/components/ui";
import { getSiteSettings } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service", alternates: { canonical: "/legal/terms" } };

export default async function TermsPage() {
  const s = await getSiteSettings();
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms of Service" />
      <Container className="py-14">
        <DraftNotice>This template has not been reviewed by a lawyer. Fill in every [bracketed] item and have it reviewed before accepting paid work.</DraftNotice>
        <div className="prose-site">
          <p><em>Last updated: [date].</em></p>
          <p>These terms apply to services provided by [legal business name] (&quot;{s.businessName},&quot; &quot;we&quot;) and to use of this website.</p>

          <h2>1. Services</h2>
          <p>We provide solar panel cleaning services. We do not provide electrical work, repairs, inspections, installation, removal, or modification of solar equipment, and nothing we do is a substitute for service by your installer or a licensed electrician.</p>

          <h2>2. Quotes</h2>
          <p>Online estimates are based on the information you provide. If the actual panel count, access, or conditions differ, we may adjust the price before starting or decline the job. Jobs flagged for review are not confirmed until we give you a final price.</p>

          <h2>3. Your responsibilities</h2>
          <ul>
            <li>Provide accurate information about your property and system.</li>
            <li>Provide safe access to the work area and an outdoor water connection, if required.</li>
            <li>Tell us about known damage, roof problems, pets, or hazards.</li>
          </ul>

          <h2>4. Safety, weather, and refusal of service</h2>
          <p>We may reschedule for weather or unsafe conditions, and we may decline or stop any job we believe cannot be completed safely.</p>

          <h2>5. Pre-existing conditions</h2>
          <p>We may photograph and note visible damage before and during service. We are not responsible for pre-existing damage, defects, or wear, or for issues with the solar system&apos;s electrical performance. [Describe how customers report a concern about our work and the time limit to do so.]</p>

          <h2>6. Payment</h2>
          <p>Payments are processed by Stripe. We do not store your card details. One-time services are [charged at booking / after completion]. Memberships are governed by our <Link href="/legal/membership-terms">Membership Terms</Link>.</p>

          <h2>7. Cancellations</h2>
          <p>[State cancellation window and any fee for one-time appointments.]</p>

          <h2>8. Limitation of liability</h2>
          <p>[To be drafted by your attorney, consistent with California law and your insurance coverage.]</p>

          <h2>9. Contact</h2>
          <p>[legal business name] · [mailing address] · [email] · [phone]</p>
        </div>
      </Container>
    </>
  );
}
