/**
 * Owner dashboard numbers. Pure functions over plain rows, unit-tested.
 * All money is in cents.
 */

export interface SubRow {
  status: string;
  createdAt: string;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  planName: string;
  amountCents: number | null;
  interval: "month" | "year" | string;
  territory: string | null;
}

export interface PaymentRow {
  createdAt: string;
  amountCents: number;
  refundedCents: number;
  status: string;
  /** Plan name for membership payments; null for one-time cleanings. */
  planName: string | null;
  territory: string | null;
}

export const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

/** Monthly recurring revenue from one subscription (yearly prices count 1/12 per month). */
export function monthlyValue(s: Pick<SubRow, "status" | "amountCents" | "interval">): number {
  if (!ACTIVE_STATUSES.includes(s.status) || s.amountCents == null) return 0;
  return s.interval === "year" ? Math.round(s.amountCents / 12) : s.amountCents;
}

export function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number): { label: string; cents: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return [...m.entries()].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);
}

export function computeMetrics(input: { subs: SubRow[]; payments: PaymentRow[]; now: Date; windowDays: number }) {
  const { subs, payments, now, windowDays } = input;
  const since = now.getTime() - windowDays * 24 * 3600_000;
  const inWindow = (iso: string | null) => iso != null && new Date(iso).getTime() >= since;

  const active = subs.filter((s) => ACTIVE_STATUSES.includes(s.status));
  const mrr = active.reduce((t, s) => t + monthlyValue(s), 0);
  const collected = payments.filter((p) => inWindow(p.createdAt) && (p.status === "succeeded" || p.status === "partially_refunded" || p.status === "refunded"));
  const net = (p: PaymentRow) => p.amountCents - p.refundedCents;

  return {
    activeMembers: active.length,
    pastDue: active.filter((s) => s.status === "past_due").length,
    endingSoon: active.filter((s) => s.cancelAtPeriodEnd).length,
    mrrCents: mrr,
    arrCents: mrr * 12,
    newMemberships: subs.filter((s) => inWindow(s.createdAt)).length,
    canceledMemberships: subs.filter((s) => inWindow(s.canceledAt)).length,
    failedPayments: payments.filter((p) => p.status === "failed" && inWindow(p.createdAt)).length,
    revenueCents: collected.reduce((t, p) => t + net(p), 0),
    revenueByPlan: sumBy(collected, (p) => p.planName ?? "One-time cleaning", net),
    revenueByTerritory: sumBy(collected, (p) => p.territory ?? "Unknown", net),
    mrrByPlan: sumBy(active, (s) => s.planName, monthlyValue),
  };
}

export interface PlanEconomicsInput {
  name: string;
  cleaningsPerYear: number | null;
  prices: { interval: string; amountCents: number }[];
}

/**
 * Rough yearly margin per member: yearly revenue minus the cost of every
 * included cleaning. Assumes members use all their cleanings (worst case).
 */
export function planProfitability(plans: PlanEconomicsInput[], costPerCleaningCents: number) {
  return plans.flatMap((p) =>
    p.prices
      .filter((pr) => pr.interval === "month" || pr.interval === "year")
      .map((pr) => {
        const yearlyRevenue = pr.interval === "month" ? pr.amountCents * 12 : pr.amountCents;
        const yearlyCost = (p.cleaningsPerYear ?? 0) * costPerCleaningCents;
        return {
          plan: p.name,
          interval: pr.interval,
          yearlyRevenueCents: yearlyRevenue,
          yearlyCostCents: yearlyCost,
          marginCents: yearlyRevenue - yearlyCost,
          marginPct: yearlyRevenue > 0 ? Math.round(((yearlyRevenue - yearlyCost) / yearlyRevenue) * 100) : 0,
        };
      }),
  );
}
