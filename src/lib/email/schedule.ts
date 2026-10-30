/** When the daily job sends each kind of email. Pure and unit-tested. */

const DAY = 24 * 3600_000;
const TZ = "America/Los_Angeles";

export function pacificDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Appointment reminders go out the day before (Pacific dates). */
export function isTomorrow(startIso: string, now: Date): boolean {
  return pacificDate(new Date(startIso)) === pacificDate(new Date(now.getTime() + DAY));
}

/**
 * Follow-ups for priced quotes that weren't booked: first after 2 days, the
 * last after 7 days. Never more than 2, never for quotes older than 30 days.
 */
export function followUpDue(createdAt: string, sentCount: number, now: Date): 1 | 2 | null {
  const age = (now.getTime() - new Date(createdAt).getTime()) / DAY;
  if (age > 30) return null;
  if (sentCount === 0 && age >= 2) return 1;
  if (sentCount === 1 && age >= 7) return 2;
  return null;
}

/**
 * Yearly members: renewal notice between 15 and 45 days before the charge
 * (California requirement for terms of one year or longer). The job sends it
 * the first day the renewal is 40 days away or less.
 */
export function renewalNoticeDue(periodEnd: string, now: Date): boolean {
  const days = (new Date(periodEnd).getTime() - now.getTime()) / DAY;
  return days >= 15 && days <= 40;
}

/**
 * Monthly members: a yearly reminder of their membership terms, sent in the
 * 30 days before each membership anniversary. Returns the anniversary number
 * (1, 2, …) to key the email on, or null.
 */
export function annualReminderDue(startedAt: string, now: Date): number | null {
  const start = new Date(startedAt);
  for (let n = 1; n <= 50; n++) {
    const anniv = new Date(start);
    anniv.setUTCFullYear(start.getUTCFullYear() + n);
    const days = (anniv.getTime() - now.getTime()) / DAY;
    if (days < 0) continue;
    return days <= 30 ? n : null;
  }
  return null;
}

/** Unscheduled cleanings: one reminder when the expiry is 30 days away or less (but at least 3). */
export function expiringReminderDue(validUntil: string, now: Date): boolean {
  const end = new Date(`${validUntil}T23:59:59-08:00`);
  const days = (end.getTime() - now.getTime()) / DAY;
  return days >= 3 && days <= 30;
}
