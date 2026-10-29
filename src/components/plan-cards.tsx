import { formatCents } from "@/lib/pricing/engine";
import type { Plan } from "@/lib/site";
import { ButtonLink, CheckItem } from "./ui";

const INTERVAL_LABEL = { one_time: "one time", month: "/ month", year: "/ year" } as const;

/**
 * Shows only published prices. Unpriced plans say "Pricing coming soon" and
 * link to the quote form — there is no checkout button anywhere until prices
 * are published (and checkout itself arrives in Phase 3).
 */
export function PlanCards({ plans, includeCommercial = true }: { plans: Plan[]; includeCommercial?: boolean }) {
  const shown = plans.filter((p) => includeCommercial || p.kind !== "commercial");
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {shown.map((plan) => {
        const featured = plan.slug === "premium-care";
        return (
          <article key={plan.slug} className={`flex flex-col rounded-2xl border p-6 ${featured ? "border-gold bg-gold-soft/40 shadow-md" : "border-line bg-white"}`}>
            <h3 className="text-xl font-bold">{plan.name}</h3>
            <p className="mt-2 text-sm text-muted">{plan.summary}</p>
            <div className="mt-5 min-h-12">
              {plan.kind === "commercial" ? (
                <p className="font-display text-lg font-bold text-navy">Custom quote</p>
              ) : plan.prices.length > 0 ? (
                <div className="space-y-1">
                  {plan.prices.map((p) => (
                    <p key={p.interval} className="font-display text-navy">
                      {plan.kind === "one_time" && <span className="text-sm text-muted">Starting at </span>}
                      <span className="text-2xl font-extrabold">{formatCents(p.amountCents)}</span>{" "}
                      <span className="text-sm text-muted">{INTERVAL_LABEL[p.interval]}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="font-display text-lg font-bold text-navy">Pricing coming soon</p>
              )}
            </div>
            <ul className="mt-5 space-y-2 text-sm">
              {plan.benefits.map((b) => <CheckItem key={b}>{b}</CheckItem>)}
            </ul>
            {plan.limitations.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-4 text-xs text-muted">
                {plan.limitations.map((l) => <li key={l}>• {l}</li>)}
              </ul>
            )}
            <div className="mt-auto pt-6">
              <ButtonLink href={plan.kind === "commercial" ? "/commercial#inquiry" : `/quote?plan=${plan.slug}`} variant={featured ? "primary" : "secondary"} className="w-full">
                {plan.kind === "commercial" ? "Request a site quote" : "Request a quote"}
              </ButtonLink>
            </div>
          </article>
        );
      })}
    </div>
  );
}
