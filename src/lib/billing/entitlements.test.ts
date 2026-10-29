import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonthsUtc, cleaningsEarned, membershipYear, wholeMonthsBetween } from "./entitlements.ts";

test("month math handles short months", () => {
  assert.equal(addMonthsUtc("2026-01-31T10:00:00.000Z", 1), "2026-02-28T10:00:00.000Z");
  assert.equal(addMonthsUtc("2026-01-31T10:00:00.000Z", 2), "2026-03-31T10:00:00.000Z");
  assert.equal(wholeMonthsBetween("2026-01-31T10:00:00Z", "2026-02-28T10:00:00Z"), 1);
  assert.equal(wholeMonthsBetween("2026-03-15T10:00:00Z", "2026-03-15T10:00:00Z"), 0);
  assert.equal(wholeMonthsBetween("2026-03-15T10:00:00Z", "2026-04-15T09:59:00Z"), 1); // small Stripe timing slack
});

test("membership years roll over every 12 months", () => {
  const start = "2026-03-15T10:00:00.000Z";
  assert.deepEqual(membershipYear(start, start), { yearIndex: 0, yearStart: start, yearEnd: "2027-03-15T10:00:00.000Z", monthInYear: 1 });
  assert.equal(membershipYear(start, "2026-09-15T10:00:00Z").monthInYear, 7);
  const y2 = membershipYear(start, "2027-03-15T10:00:00Z");
  assert.equal(y2.yearIndex, 1);
  assert.equal(y2.monthInYear, 1);
  assert.equal(y2.yearStart, "2027-03-15T10:00:00.000Z");
});

test("monthly members unlock cleanings through the year", () => {
  // Seasonal Care: 2 per year -> first right away, second after 6 months paid.
  assert.deepEqual([1, 6, 7, 12].map((m) => cleaningsEarned(2, "month", m)), [1, 1, 2, 2]);
  // Premium Care: 4 per year -> months 1, 4, 7, 10.
  assert.deepEqual([1, 3, 4, 7, 10, 12].map((m) => cleaningsEarned(4, "month", m)), [1, 1, 2, 3, 4, 4]);
  // Unlimited Care: one per paid month.
  assert.equal(cleaningsEarned(12, "month", 5), 5);
});

test("annual members get the whole year up front; nothing for plans without cleanings", () => {
  assert.equal(cleaningsEarned(2, "year", 1), 2);
  assert.equal(cleaningsEarned(4, "year", 1), 4);
  assert.equal(cleaningsEarned(null, "month", 3), 0);
  assert.equal(cleaningsEarned(0, "year", 1), 0);
});
