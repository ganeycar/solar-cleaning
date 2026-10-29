import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics, monthlyValue, planProfitability, type PaymentRow, type SubRow } from "./metrics.ts";
import { parseBusinessSettings } from "./business-settings.ts";
import { canComplete, checklistComplete, mapsLink, readChecklist, requiredEquipment, SAFETY_CHECKLIST } from "../tech/job.ts";

const now = new Date("2026-10-29T12:00:00Z");
const sub = (o: Partial<SubRow>): SubRow => ({
  status: "active", createdAt: "2026-06-01T00:00:00Z", canceledAt: null, cancelAtPeriodEnd: false,
  planName: "Seasonal Care", amountCents: 2900, interval: "month", territory: "Vacaville", ...o,
});
const pay = (o: Partial<PaymentRow>): PaymentRow => ({
  createdAt: "2026-10-20T00:00:00Z", amountCents: 15000, refundedCents: 0, status: "succeeded", planName: null, territory: "Vacaville", ...o,
});

test("monthly recurring revenue counts yearly plans as 1/12 and ignores inactive ones", () => {
  assert.equal(monthlyValue({ status: "active", amountCents: 2900, interval: "month" }), 2900);
  assert.equal(monthlyValue({ status: "active", amountCents: 30000, interval: "year" }), 2500);
  assert.equal(monthlyValue({ status: "canceled", amountCents: 2900, interval: "month" }), 0);
  assert.equal(monthlyValue({ status: "past_due", amountCents: 2900, interval: "month" }), 2900);
});

test("dashboard metrics: members, MRR/ARR, churn, failures, revenue splits", () => {
  const m = computeMetrics({
    now,
    windowDays: 30,
    subs: [
      sub({}),
      sub({ planName: "Premium Care", amountCents: 30000, interval: "year", createdAt: "2026-10-15T00:00:00Z", territory: "Davis" }),
      sub({ status: "past_due" }),
      sub({ status: "canceled", canceledAt: "2026-10-10T00:00:00Z" }),
      sub({ cancelAtPeriodEnd: true }),
    ],
    payments: [
      pay({}),
      pay({ amountCents: 2900, planName: "Seasonal Care" }),
      pay({ amountCents: 15000, refundedCents: 5000, status: "partially_refunded", territory: "Davis" }),
      pay({ status: "failed", amountCents: 2900 }),
      pay({ createdAt: "2026-08-01T00:00:00Z" }), // outside window
    ],
  });
  assert.equal(m.activeMembers, 4);
  assert.equal(m.pastDue, 1);
  assert.equal(m.endingSoon, 1);
  assert.equal(m.mrrCents, 2900 + 2500 + 2900 + 2900);
  assert.equal(m.arrCents, m.mrrCents * 12);
  assert.equal(m.newMemberships, 1);
  assert.equal(m.canceledMemberships, 1);
  assert.equal(m.failedPayments, 1);
  assert.equal(m.revenueCents, 15000 + 2900 + 10000);
  assert.deepEqual(m.revenueByPlan, [{ label: "One-time cleaning", cents: 25000 }, { label: "Seasonal Care", cents: 2900 }]);
  assert.deepEqual(m.revenueByTerritory.map((r) => r.label), ["Vacaville", "Davis"]);
});

test("plan profitability assumes every included cleaning is used", () => {
  const rows = planProfitability(
    [{ name: "Seasonal Care", cleaningsPerYear: 2, prices: [{ interval: "month", amountCents: 2900 }, { interval: "year", amountCents: 30000 }] }],
    9000,
  );
  assert.deepEqual(rows[0], { plan: "Seasonal Care", interval: "month", yearlyRevenueCents: 34800, yearlyCostCents: 18000, marginCents: 16800, marginPct: 48 });
  assert.equal(rows[1].yearlyRevenueCents, 30000);
  assert.equal(rows[1].marginCents, 12000);
});

test("technician safety checklist must be fully checked", () => {
  const all = Object.fromEntries(SAFETY_CHECKLIST.map((i) => [`check_${i.id}`, "on"]));
  assert.equal(checklistComplete(readChecklist((k) => all[k] ?? null)), true);
  const missing = { ...all, check_weather: undefined } as Record<string, string | undefined>;
  assert.equal(checklistComplete(readChecklist((k) => missing[k] ?? null)), false);
  assert.equal(checklistComplete(null), false);
});

test("equipment list follows the property", () => {
  assert.match(requiredEquipment({ stories: 1, panelCount: 20, accessType: "ground_reachable", roofType: "composition_shingle" })[0], /15–20 ft/);
  const two = requiredEquipment({ stories: 2, panelCount: 50, accessType: "ladder_required", roofType: "tile" });
  assert.match(two[0], /30–35 ft/);
  assert.ok(two.some((x) => x.startsWith("Ladder")));
  assert.ok(two.some((x) => x.includes("tile")));
  assert.ok(two.some((x) => x.includes("large array")));
});

test("jobs complete only with before and after photos", () => {
  assert.equal(canComplete([]).ok, false);
  assert.equal(canComplete(["before"]).ok, false);
  assert.equal(canComplete(["after", "damage"]).ok, false);
  assert.equal(canComplete(["before", "after"]).ok, true);
  assert.equal(mapsLink("1 Main St, Vacaville, CA"), "https://maps.apple.com/?q=1%20Main%20St%2C%20Vacaville%2C%20CA");
});

test("business settings form validates colors, links, phone, and only verifies filled-in license/insurance", () => {
  const good: Record<string, string> = {
    businessName: "Solar Cleaning Co.", phone: "(707) 555-0100", email: "Hi@Example.com", headquartersCity: "Vacaville",
    colorNavy: "#0b1b33", colorCharcoal: "#1f2933", colorGold: "#e8b04a",
    profileLinks: "https://g.page/example\nhttps://www.yelp.com/biz/example", licenseVerified: "on", insuranceInfo: "General liability: Example Insurance Co.", insuranceVerified: "on",
    costPerCleaning: "85",
  };
  const r = parseBusinessSettings((k) => good[k] ?? null);
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) {
    assert.equal(r.value.phone, "+17075550100");
    assert.equal(r.value.email, "hi@example.com");
    assert.equal(r.value.profile_links.length, 2);
    assert.equal(r.value.license_verified, false, "can't verify an empty license");
    assert.equal(r.value.insurance_verified, true);
    assert.equal(r.value.economics.costPerCleaningCents, 8500);
  }
  const bad = parseBusinessSettings((k) => ({ ...good, colorGold: "gold", profileLinks: "http://insecure.example", logoUrl: "ftp://x", businessName: "" } as Record<string, string>)[k] ?? null);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.length, 4);
});
