import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui";
import { startMembershipCheckout, startOneTimeCheckout } from "@/lib/billing/actions";
import { loadCheckoutContext } from "@/lib/billing/checkout-data";
import { renewalDisclosure } from "@/lib/billing/logic";
import { formatCents } from "@/lib/pricing/engine";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  consent: "Please check the box to agree to the automatic renewal terms before continuing.",
  "choose-plan": "Please choose a membership option.",
  "not-eligible": "This quote isn't ready for checkout yet.",
  "payments-unavailable": "Online payments aren't available right now. Please contact us to book.",
  account: "We couldn't find your account details. Please sign out and back in.",
  stripe: "We couldn't start a secure checkout. Please try again in a moment.",
};

type Props = { params: Promise<{ quoteId: string }>; searchParams: Promise<{ error?: string; canceled?: string }> };

export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ quoteId }, { error, canceled }] = await Promise.all([params, searchParams]);
  if (!(await getCurrentUser())) redirect("/login");
  const ctx = await loadCheckoutContext(quoteId);
  if (!ctx) notFound();
  const { quote, oneTime, memberships, unavailable } = ctx;

  return (
    <div className="bg-paper">
      <Container className="max-w-3xl py-10 sm:py-14">
        <Link href="/dashboard" className="text-sm text-muted underline">← Back to your dashboard</Link>
        <h1 className="mt-3 text-3xl font-extrabold">Book your cleaning</h1>
        <p className="mt-2 text-muted">{quote.addressLine1}, {quote.city} · {quote.panelCount} panels · Ref {quote.id.slice(0, 8).toUpperCase()}</p>

        {error && ERRORS[error] && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{ERRORS[error]}</div>}
        {canceled && <div role="status" className="mt-6 rounded-xl border border-line bg-white p-4 text-sm text-muted">Checkout was canceled. You haven&apos;t been charged.</div>}

        <section className="mt-8 rounded-2xl border border-line bg-white p-6">
          <h2 className="text-xl font-bold">One-time cleaning</h2>
          {oneTime.ok ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-3xl font-extrabold text-navy">{formatCents(quote.approvedPriceCents!)}</p>
                <p className="text-sm text-muted">One complete standard cleaning. No recurring charges.</p>
              </div>
              <form action={startOneTimeCheckout.bind(null, quote.id)}>
                <button type="submit" className="rounded-full bg-gold px-7 py-3 font-semibold text-navy shadow-sm hover:brightness-95">Pay securely</button>
              </form>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">{oneTime.reason}</p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-white p-6">
          <h2 className="text-xl font-bold">Or join a membership</h2>
          {memberships.length > 0 ? (
            <form action={startMembershipCheckout.bind(null, quote.id)} className="mt-4 space-y-5">
              <fieldset className="space-y-3">
                <legend className="sr-only">Choose a membership</legend>
                {memberships.map((m, i) => (
                  <label key={m.priceId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 has-[:checked]:border-navy has-[:checked]:bg-paper">
                    <input type="radio" name="priceId" value={m.priceId} defaultChecked={i === 0} required className="mt-1.5" />
                    <span className="flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-navy">{m.planName} · billed {m.interval === "month" ? "monthly" : "yearly"}</span>
                        <span className="font-display text-lg font-bold text-navy">{formatCents(m.amountCents)} / {m.interval}</span>
                      </span>
                      <span className="mt-1 block text-sm text-muted">{m.summary}</span>
                      <span className="mt-2 block rounded-lg bg-gold-soft/50 p-3 text-sm text-charcoal">{renewalDisclosure(m.planName, m.amountCents, m.interval)}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label className="flex items-start gap-3 rounded-xl border-2 border-navy p-4 text-sm">
                <input type="checkbox" name="consent" required className="mt-1 h-4 w-4" />
                <span>
                  <strong>I agree to the automatic renewal terms above</strong> for the membership I selected, and to the{" "}
                  <Link href="/legal/membership-terms" target="_blank" className="underline">Membership Terms and Cancellation Policy</Link>. I understand I can cancel online anytime from my account.
                </span>
              </label>

              <button type="submit" className="rounded-full bg-gold px-7 py-3 font-semibold text-navy shadow-sm hover:brightness-95">Continue to secure payment</button>
              <p className="text-xs text-muted">Payment is handled by Stripe. We never see or store your card number.</p>
            </form>
          ) : (
            <p className="mt-2 text-sm text-muted">Memberships aren&apos;t available online yet. <Link href="/contact" className="underline">Contact us</Link> to ask about one.</p>
          )}
          {unavailable.length > 0 && (
            <ul className="mt-5 space-y-1 border-t border-line pt-4 text-xs text-muted">
              {unavailable.map((u) => <li key={u.planName}><strong>{u.planName}:</strong> {u.reason}</li>)}
            </ul>
          )}
        </section>
      </Container>
    </div>
  );
}
