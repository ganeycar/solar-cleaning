/**
 * How members earn included cleanings (owner's choice: spread through the year).
 *
 * - Annual billing: all of the year's cleanings are available once the year is paid.
 * - Monthly billing: cleanings unlock as months are paid. After paying month m of
 *   the membership year, the member has earned ceil(m x N / 12) cleanings.
 *   Seasonal (2/yr): 1 at month 1, 2 at month 7. Premium (4/yr): months 1, 4, 7, 10.
 *   Unlimited (12/yr): one every paid month.
 * - Cleanings are valid until the end of the membership year (no rollover).
 * Pure functions; unit-tested.
 */

export function addMonthsUtc(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, lastDay));
  return t.toISOString();
}

/** Whole months from `fromIso` to `toIso` (a 30 Jan → 28 Feb period counts as 1). */
export function wholeMonthsBetween(fromIso: string, toIso: string): number {
  const to = new Date(toIso).getTime();
  let m = 0;
  // Allow a few hours of slack: Stripe period boundaries can differ slightly from calendar math.
  while (new Date(addMonthsUtc(fromIso, m + 1)).getTime() <= to + 6 * 3600_000) m++;
  return m;
}

export interface MembershipYear {
  yearIndex: number;
  yearStart: string;
  yearEnd: string;
  /** 1..12: which month of the membership year the billing period starts in. */
  monthInYear: number;
}

export function membershipYear(startIso: string, periodStartIso: string): MembershipYear {
  const months = Math.max(0, wholeMonthsBetween(startIso, periodStartIso));
  const yearIndex = Math.floor(months / 12);
  return {
    yearIndex,
    yearStart: addMonthsUtc(startIso, yearIndex * 12),
    yearEnd: addMonthsUtc(startIso, (yearIndex + 1) * 12),
    monthInYear: (months % 12) + 1,
  };
}

export function cleaningsEarned(cleaningsPerYear: number | null, interval: "month" | "year" | string, monthInYear: number): number {
  const n = Math.max(0, cleaningsPerYear ?? 0);
  if (n === 0) return 0;
  if (interval === "year") return n;
  return Math.min(n, Math.ceil((Math.min(12, Math.max(1, monthInYear)) * n) / 12));
}
