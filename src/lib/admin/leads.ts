/** Quote-request funnel for the owner's Leads page. Pure; unit-tested. */

export interface QuoteRow { status: string; city: string; createdAt: string; priceCents: number | null; followUps: number }

export interface FunnelRow { label: string; requests: number; priced: number; booked: number; rate: number | null }

export interface LeadFunnel {
  total: number;
  autoPriced: number;
  needsReview: number;
  unpublished: number;
  outOfArea: number;
  waitlist: number;
  booked: number;
  /** Booked ÷ quotes that were given a price. */
  closeRate: number | null;
  bookedAfterFollowUp: number;
  byCity: FunnelRow[];
}

const PRICED = new Set(["quoted", "accepted", "converted", "declined", "expired"]);

export function leadFunnel(rows: QuoteRow[], now: Date, windowDays: number): LeadFunnel {
  const since = now.getTime() - windowDays * 86400_000;
  const inWindow = rows.filter((r) => new Date(r.createdAt).getTime() >= since);
  const count = (pred: (r: QuoteRow) => boolean) => inWindow.filter(pred).length;
  const priced = count((r) => PRICED.has(r.status));
  const booked = count((r) => r.status === "converted");

  const cities = new Map<string, FunnelRow>();
  for (const r of inWindow) {
    const label = r.city.trim() || "Unknown";
    const c = cities.get(label) ?? { label, requests: 0, priced: 0, booked: 0, rate: null };
    c.requests++;
    if (PRICED.has(r.status)) c.priced++;
    if (r.status === "converted") c.booked++;
    cities.set(label, c);
  }
  const byCity = [...cities.values()].map((c) => ({ ...c, rate: c.priced ? c.booked / c.priced : null })).sort((a, b) => b.requests - a.requests);

  return {
    total: inWindow.length,
    autoPriced: count((r) => r.status === "quoted"),
    needsReview: count((r) => r.status === "needs_review"),
    unpublished: count((r) => r.status === "new"),
    outOfArea: count((r) => r.status === "out_of_area"),
    waitlist: count((r) => r.status === "waitlist"),
    booked,
    closeRate: priced ? booked / priced : null,
    bookedAfterFollowUp: count((r) => r.status === "converted" && r.followUps > 0),
    byCity,
  };
}

export function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}
