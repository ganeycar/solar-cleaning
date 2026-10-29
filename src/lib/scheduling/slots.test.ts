import { test } from "node:test";
import assert from "node:assert/strict";
import { availableSlots, canChangeBooking, DEFAULT_SCHEDULING, jobDurationMinutes, localDate, parseSchedulingForm, weekdayOf, withDefaults, zonedToUtc } from "./slots.ts";
import { buildIcs, escapeText } from "./ics.ts";

const TZ = "America/Los_Angeles";
const S = DEFAULT_SCHEDULING;

test("converts Pacific wall-clock times to UTC across daylight saving changes", () => {
  assert.equal(zonedToUtc("2026-03-06", "08:00", TZ).toISOString(), "2026-03-06T16:00:00.000Z"); // PST
  assert.equal(zonedToUtc("2026-03-09", "08:00", TZ).toISOString(), "2026-03-09T15:00:00.000Z"); // PDT
  assert.equal(zonedToUtc("2026-10-30", "08:00", TZ).toISOString(), "2026-10-30T15:00:00.000Z"); // PDT
  assert.equal(zonedToUtc("2026-11-02", "08:00", TZ).toISOString(), "2026-11-02T16:00:00.000Z"); // PST
  assert.equal(localDate(new Date("2026-10-29T06:30:00Z"), TZ), "2026-10-28"); // still the 28th in California
  assert.equal(weekdayOf("2026-10-28"), 3);
  assert.equal(weekdayOf("2026-11-01"), 0);
});

test("job length scales with panel count and rounds to 15 minutes", () => {
  assert.equal(jobDurationMinutes(S, 20), 75); // 45 + 30
  assert.equal(jobDurationMinutes(S, 30), 90); // 45 + 45
  assert.equal(jobDurationMinutes(S, 0), 45);
  assert.equal(jobDurationMinutes({ ...S, durationBaseMinutes: 10, durationPerPanelMinutes: 0 }, 5), 30);
  assert.equal(jobDurationMinutes(S, 10_000), 480);
});

const now = new Date("2026-10-28T17:00:00Z"); // Wed 10:00 am Pacific
const friday = "2026-10-30";

test("respects minimum notice, opening hours, and job length", () => {
  const slots = availableSlots({ settings: S, technicians: ["A"], busy: [], blackouts: [], now, durationMinutes: 90, onlyDate: friday });
  // Earliest is 48h later (Fri 10:00); last start must finish by 16:00 (14:30).
  assert.equal(slots.length, 10);
  assert.equal(slots[0].start.toISOString(), zonedToUtc(friday, "10:00", TZ).toISOString());
  assert.equal(slots.at(-1)!.start.toISOString(), zonedToUtc(friday, "14:30", TZ).toISOString());
});

test("never offers a time that would double-book a technician, including travel buffer", () => {
  const busy = [{ technicianId: "A", start: zonedToUtc(friday, "11:00", TZ), blockedUntil: zonedToUtc(friday, "13:00", TZ) }];
  const one = availableSlots({ settings: S, technicians: ["A"], busy, blackouts: [], now, durationMinutes: 90, onlyDate: friday });
  assert.deepEqual(one.map((s) => localTime(s.start)), ["13:00", "13:30", "14:00", "14:30"]);
  const two = availableSlots({ settings: S, technicians: ["A", "B"], busy, blackouts: [], now, durationMinutes: 90, onlyDate: friday });
  assert.equal(two.length, 10);
  assert.ok(two.filter((s) => localTime(s.start) === "11:00").every((s) => s.technicianId === "B"));
});

test("closed days, blackout days, and no technicians produce no slots", () => {
  assert.equal(availableSlots({ settings: S, technicians: ["A"], busy: [], blackouts: [], now, durationMinutes: 60, onlyDate: "2026-11-01" }).length, 0);
  const blackout = [{ technicianId: null, start: zonedToUtc(friday, "00:00", TZ), end: zonedToUtc("2026-10-31", "00:00", TZ) }];
  assert.equal(availableSlots({ settings: S, technicians: ["A"], busy: [], blackouts: blackout, now, durationMinutes: 60, onlyDate: friday }).length, 0);
  assert.equal(availableSlots({ settings: S, technicians: [], busy: [], blackouts: [], now, durationMinutes: 60 }).length, 0);
});

test("slots after the fall time change use standard time", () => {
  const slots = availableSlots({ settings: S, technicians: ["A"], busy: [], blackouts: [], now, durationMinutes: 60, onlyDate: "2026-11-02" });
  assert.equal(slots[0].start.toISOString(), "2026-11-02T16:00:00.000Z");
});

test("changes are allowed only before the cutoff", () => {
  const start = new Date("2026-11-02T16:00:00Z");
  assert.equal(canChangeBooking(start, new Date("2026-11-01T15:00:00Z"), 24), true);
  assert.equal(canChangeBooking(start, new Date("2026-11-01T17:00:00Z"), 24), false);
});

test("owner schedule settings form", () => {
  const values: Record<string, string> = { day_1_open: "on", day_1_start: "08:00", day_1_end: "15:00", day_6_open: "on", day_6_start: "09:00", day_6_end: "12:00", bufferMinutes: "20", durationPerPanelMinutes: "2.5" };
  const r = parseSchedulingForm((k) => values[k] ?? null);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.settings.weeklyHours[1], { start: "08:00", end: "15:00" });
    assert.equal(r.settings.weeklyHours[2], null);
    assert.equal(r.settings.bufferMinutes, 20);
    assert.equal(r.settings.durationPerPanelMinutes, 2.5);
  }
  const bad = parseSchedulingForm((k) => ({ day_2_open: "on", day_2_start: "15:00", day_2_end: "09:00", horizonDays: "1000" } as Record<string, string>)[k] ?? null);
  assert.equal(bad.ok, false);
  const closed = parseSchedulingForm(() => null);
  assert.equal(closed.ok, false);
  assert.equal(withDefaults({ bufferMinutes: 10, weeklyHours: [] }).weeklyHours.length, 7);
});

test("calendar feed escapes text, uses CRLF, and folds long lines", () => {
  assert.equal(escapeText("a,b;c\nd\\e"), "a\\,b\\;c\\nd\\\\e");
  const ics = buildIcs("Cleanings", [
    { uid: "b1@solar", start: new Date("2026-11-02T16:00:00Z"), end: new Date("2026-11-02T17:30:00Z"), summary: "Cleaning: Alex, 24 panels", location: "123 Example St, Vacaville", description: "x".repeat(200) },
  ], new Date("2026-10-28T00:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART:20261102T160000Z"));
  assert.ok(ics.includes("SUMMARY:Cleaning: Alex\\, 24 panels"));
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

function localTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d);
}
