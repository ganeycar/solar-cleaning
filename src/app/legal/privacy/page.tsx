import type { Metadata } from "next";
import { Container, DraftNotice, PageHero } from "@/components/ui";
import { getSiteSettings } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/legal/privacy" } };

export default async function PrivacyPage() {
  const s = await getSiteSettings();
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy Policy" />
      <Container className="py-14">
        <DraftNotice>This template has not been reviewed by a lawyer. Confirm with an attorney which California privacy laws apply to your business as it grows, and fill in every [bracketed] item.</DraftNotice>
        <div className="prose-site">
          <p><em>Last updated: [date].</em></p>

          <h2>What we collect</h2>
          <ul>
            <li><strong>Contact details:</strong> name, email, mobile phone.</li>
            <li><strong>Property details:</strong> service address, panel count, home type, roof and access information, and photos you upload.</li>
            <li><strong>Service records:</strong> appointments, technician notes, and before-and-after photos.</li>
            <li><strong>Payment records:</strong> payment status and history. Card details are handled by Stripe and never stored by us.</li>
            <li><strong>Technical data:</strong> a one-way hashed version of your IP address used to prevent spam, plus standard server logs.</li>
          </ul>

          <h2>How we use it</h2>
          <ul>
            <li>To quote, schedule, perform, and document cleanings.</li>
            <li>To send required service messages (confirmations, reminders, receipts, renewal notices).</li>
            <li>To send marketing emails or texts <strong>only if you opted in</strong>. You can opt out at any time; opting out doesn&apos;t affect service messages.</li>
            <li>To prevent fraud and abuse.</li>
          </ul>

          <h2>Who we share it with</h2>
          <p>We don&apos;t sell your personal information. We share it only with service providers that help us operate: Supabase (data hosting), Stripe (payments), Vercel (website hosting), [Resend] (email), [SMS provider], and [Google Calendar] (scheduling). Technicians see only the information needed for their assigned jobs, never billing details.</p>

          <h2>How long we keep it</h2>
          <p>[Quote requests that don&apos;t become customers: X months. Customer service records: X years. Payment records: as required for tax and accounting.]</p>

          <h2>Your choices</h2>
          <p>You may request access to, correction of, or deletion of your personal information by contacting [email]. We&apos;ll verify your request before acting on it.</p>

          <h2>Contact</h2>
          <p>{s.businessName} · [mailing address] · [email]</p>
        </div>
      </Container>
    </>
  );
}
