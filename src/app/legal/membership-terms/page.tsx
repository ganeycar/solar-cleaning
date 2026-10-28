import type { Metadata } from "next";
import { Container, DraftNotice, PageHero } from "@/components/ui";
import { getSiteSettings } from "@/lib/site";

export const metadata: Metadata = { title: "Membership Terms and Cancellation Policy", alternates: { canonical: "/legal/membership-terms" } };

export default async function MembershipTermsPage() {
  const s = await getSiteSettings();
  return (
    <>
      <PageHero eyebrow="Legal" title="Membership Terms and Cancellation Policy" />
      <Container className="py-14">
        <DraftNotice>
          This template was prepared as a starting point and has not been reviewed by a lawyer. California&apos;s Automatic Renewal Law
          (Business and Professions Code § 17600 and following) has specific disclosure, consent, reminder, and cancellation requirements.
          Have a California attorney review these terms, and fill in every [bracketed] item, before selling memberships.
        </DraftNotice>
        <div className="prose-site">
          <p><em>Last updated: [date]. Version [1].</em></p>

          <h2>1. What a membership is</h2>
          <p>A {s.businessName} membership is a recurring service plan that includes a set number of standard solar panel cleanings during each membership year for one service address. Plan details, included cleanings, and prices are shown on the Membership Plans page and on the checkout page before you join.</p>

          <h2>2. Automatic renewal</h2>
          <p><strong>Your membership automatically renews and you will be charged until you cancel.</strong> Before you join, the checkout page will show, clearly and next to the consent checkbox:</p>
          <ul>
            <li>that the membership continues until you cancel;</li>
            <li>the amount of each recurring charge and how often it is charged (monthly or annually);</li>
            <li>the length of any minimum term, if one applies [state: none / X months];</li>
            <li>how to cancel.</li>
          </ul>
          <p>We will not charge you until you check the consent box confirming you agree to these automatic renewal terms. After you join, we will email you a confirmation that includes these terms and how to cancel.</p>
          <p>For annual plans, we will send a reminder [at least X days] before each renewal with the renewal date, amount, and how to cancel. If we change the price of your membership, we will notify you [at least X days] before the new price applies, and you may cancel before it takes effect. A price change on our website never changes your existing membership price without that notice.</p>

          <h2>3. Included cleanings</h2>
          <ul>
            <li><strong>Seasonal Care:</strong> [2] standard cleanings per membership year.</li>
            <li><strong>Premium Care:</strong> [4] standard cleanings per membership year.</li>
            <li><strong>Unlimited Care:</strong> up to one standard cleaning every [30] days. &quot;Unlimited&quot; means you may request a cleaning as often as once every [30] days, subject to the limits in Section 4. It does not mean on-demand or same-day service.</li>
          </ul>
          <p>Paying for a membership does not by itself mean a cleaning has been performed. Your customer portal shows cleanings earned, scheduled, completed, and remaining. [Unused cleanings do not roll over to the next membership year / roll over up to X.]</p>

          <h2>4. Service limits</h2>
          <ul>
            <li>Memberships cover one service address and up to [X] panels. Additional panels may require a plan adjustment.</li>
            <li>A &quot;standard cleaning&quot; is a water-fed pole cleaning of panels that can be reached safely. It does not include roof walking where unsafe, repairs, electrical work, pest guards, or heavy contamination requiring special treatment.</li>
            <li>We schedule most cleanings during drier months. We may reschedule for rain, wind, extreme heat, smoke, or other unsafe conditions. A weather delay does not forfeit an included cleaning.</li>
            <li>We may decline or stop any job we determine cannot be completed safely, including because of roof condition, height, access, or visible panel damage.</li>
            <li>Priority scheduling (Unlimited Care) means members are offered available appointments before non-members; it is not a guaranteed response time.</li>
          </ul>

          <h2>5. Rescheduling and missed appointments</h2>
          <p>You may reschedule an appointment online up to [48] hours before it starts. If we cannot access the panels at the scheduled time [because a gate is locked, water is unavailable, etc.], [state policy, e.g., the cleaning may count as used / one free reschedule].</p>

          <h2>6. How to cancel</h2>
          <p>You can cancel at any time online from your customer portal, in the same way you signed up, without calling us. You may also cancel by emailing [email]. Cancellation takes effect [at the end of the current billing period / immediately]. [State refund policy for unused portions, e.g., annual plans canceled within X days of renewal with no cleanings used receive a full refund.]</p>

          <h2>7. Failed payments</h2>
          <p>If a payment fails, we will notify you and retry the charge. Scheduled cleanings may be paused while the account is past due. [State when a membership is canceled for non-payment.]</p>

          <h2>8. Changes to plans</h2>
          <p>You may upgrade or downgrade between plans from your portal. [State how proration and included cleanings are handled.]</p>

          <h2>9. Contact</h2>
          <p>Questions about your membership: [email] · [phone].</p>
        </div>
      </Container>
    </>
  );
}
