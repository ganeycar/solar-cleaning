/**
 * Appointment availability. Pure functions (no database), unit-tested.
 *
 * All business hours are in the business's local time zone
 * (America/Los_Angeles) and converted to exact UTC instants, so daylight
 * saving changes are handled correctly.
 */

export type HHMM = `${number}:${number}` | string;
export interface DayHours { start: HHMM; end: HHMM }

export interface SchedulingSettings {
  timezone: string;
  /** Index 0 = Sunday ... 6 = Saturday. null = closed. */
  weeklyHours: (DayHours | null)[];
  slotStepMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  bufferMinutes: number;
  durationBaseMinutes: number;
  durationPerPanelMinutes: number;
  rescheduleCutoffHours: number;
}

export const DEFAULT_SCHEDULING: SchedulingSettings = {
  timezone: "America/Los_Angeles",
  weeklyHours: [
    null,
    { start: "08:00", end: "16:00" },
    { start: "08:00", end: "16:00" },
    { start: "08:00", end: "16:00" },
    { start: "08:00", end: "16:00" },
    { start: "08:00", end: "16:00" },
    { start: "09:00", end: "13:00" },
  ],
  slotStepMinutes: 30,
  minNoticeHours: 48,
  horizonDays: 45,
  bufferMinutes: 30,
  durationBaseMinutes: 45,
  durationPerPanelMinutes: 1.5,
  rescheduleCutoffHours: 24,
};

export function withDefaults(stored: unknown): SchedulingSettings {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<SchedulingSettings>;
  const merged = { ...DEFAULT_SCHEDULING, ...s };
  if (!Array.isArray(merged.weeklyHours) || merged.weeklyHours.length !== 7) merged.weeklyHours = DEFAULT_SCHEDULING.weeklyHours;
  return merged;
}

const MINUTE = 60_000;

/** Estimated on-site time: base + per panel, rounded up to 15 minutes, between 30 minutes and 8 hours. */
export function jobDurationMinutes(settings: SchedulingSettings, panelCount: number): number {
  const raw = settings.durationBaseMinutes + settings.durationPerPanelMinutes * Math.max(0, panelCount);
  return Math.min(480, Math.max(30, Math.ceil(raw / 15) * 15));
}

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** The UTC instant for a wall-clock date and time in `tz` (DST-safe). */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wallAsUtc;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess), tz);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wallAsUtc - shown;
  }
  return new Date(guess);
}

/** YYYY-MM-DD of an instant in `tz`. */
export function localDate(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export interface Busy { technicianId: string; start: Date; blockedUntil: Date }
export interface Blackout { technicianId: string | null; start: Date; end: Date }
export interface Slot { date: string; start: Date; end: Date; technicianId: string }

/**
 * Open appointment start times. A slot is offered when at least one technician
 * is free from the start until the end of the job plus the travel buffer
 * (matching the database's double-booking rule exactly).
 */
export function availableSlots(input: {
  settings: SchedulingSettings;
  technicians: string[];
  busy: Busy[];
  blackouts: Blackout[];
  now: Date;
  durationMinutes: number;
  /** Optional: only this local date. */
  onlyDate?: string;
}): Slot[] {
  const { settings: s, technicians, busy, blackouts, now, durationMinutes } = input;
  if (technicians.length === 0) return [];
  const earliest = new Date(now.getTime() + s.minNoticeHours * 60 * MINUTE);
  const today = localDate(now, s.timezone);
  const slots: Slot[] = [];

  for (let i = 0; i <= s.horizonDays; i++) {
    const date = addDays(today, i);
    if (input.onlyDate && date !== input.onlyDate) continue;
    const hours = s.weeklyHours[weekdayOf(date)];
    if (!hours) continue;
    const open = minutesOf(hours.start);
    const close = minutesOf(hours.end);

    for (let t = open; t + durationMinutes <= close; t += Math.max(5, s.slotStepMinutes)) {
      const start = zonedToUtc(date, hhmm(t), s.timezone);
      if (start < earliest) continue;
      const end = new Date(start.getTime() + durationMinutes * MINUTE);
      const blockedUntil = new Date(end.getTime() + s.bufferMinutes * MINUTE);

      const tech = technicians.find((id) => {
        const clash = busy.some((b) => b.technicianId === id && b.start < blockedUntil && start < b.blockedUntil);
        const off = blackouts.some((b) => (b.technicianId === null || b.technicianId === id) && b.start < end && start < b.end);
        return !clash && !off;
      });
      if (tech) slots.push({ date, start, end, technicianId: tech });
    }
  }
  return slots;
}

export function canChangeBooking(start: Date, now: Date, cutoffHours: number): boolean {
  return start.getTime() - now.getTime() >= cutoffHours * 60 * MINUTE;
}

// ---------------- Owner settings form ----------------

export type SettingsParse = { ok: true; settings: SchedulingSettings } | { ok: false; errors: string[] };

export function parseSchedulingForm(get: (k: string) => string | null): SettingsParse {
  const errors: string[] = [];
  const num = (k: string, label: string, min: number, max: number, fallback: number, allowDecimal = false) => {
    const raw = (get(k) ?? "").trim();
    if (raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max || (!allowDecimal && !Number.isInteger(n))) {
      errors.push(`${label}: enter a number from ${min} to ${max}.`);
      return fallback;
    }
    return n;
  };
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weeklyHours = DAYS.map((name, d) => {
    if (get(`day_${d}_open`) !== "on") return null;
    const start = (get(`day_${d}_start`) ?? "").trim();
    const end = (get(`day_${d}_end`) ?? "").trim();
    if (!time.test(start) || !time.test(end) || minutesOf(end) <= minutesOf(start)) {
      errors.push(`${name}: enter a start and end time, with the end after the start.`);
      return null;
    }
    return { start, end };
  });
  const D = DEFAULT_SCHEDULING;
  const settings: SchedulingSettings = {
    timezone: D.timezone,
    weeklyHours,
    slotStepMinutes: num("slotStepMinutes", "Start times every", 15, 120, D.slotStepMinutes),
    minNoticeHours: num("minNoticeHours", "Minimum notice", 0, 336, D.minNoticeHours),
    horizonDays: num("horizonDays", "Book up to", 7, 180, D.horizonDays),
    bufferMinutes: num("bufferMinutes", "Travel buffer", 0, 240, D.bufferMinutes),
    durationBaseMinutes: num("durationBaseMinutes", "Base job time", 15, 480, D.durationBaseMinutes),
    durationPerPanelMinutes: num("durationPerPanelMinutes", "Minutes per panel", 0, 30, D.durationPerPanelMinutes, true),
    rescheduleCutoffHours: num("rescheduleCutoffHours", "Changes allowed until", 0, 336, D.rescheduleCutoffHours),
  };
  if (weeklyHours.every((h) => h === null) && errors.length === 0) errors.push("Open at least one day a week.");
  return errors.length ? { ok: false, errors } : { ok: true, settings };
}
