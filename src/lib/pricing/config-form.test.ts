import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePricingForm, toEditable } from "./config-form.ts";
import { calculateQuote } from "./engine.ts";

function form(values: Record<string, string | string[]>) {
  return {
    get: (k: string) => { const v = values[k]; return Array.isArray(v) ? v[0] ?? null : v ?? null; },
    getAll: (k: string) => { const v = values[k]; return Array.isArray(v) ? v : v != null ? [v] : []; },
  };
}

const valid = {
  baseVisit: "99", includedPanels: "10", minimumVisit: "129", perExtraStory: "25", surchargeLadder: "15",
  tier_min_0: "1", tier_price_0: "5", tier_min_1: "40", tier_price_1: "4.25",
  discountSeasonal: "10", discountPremium: "15", discountUnlimited: "20",
  maxAutoPanels: "60", maxAutoStories: "2", reviewRoof: ["tile", "bogus"], reviewAccess: ["ladder_required"], reviewProperty: ["commercial"],
};

test("parses a complete pricing form into cents and percentages", () => {
  const f = form(valid);
  const r = parsePricingForm(f.get, f.getAll);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.config.baseVisitCents, 9900);
  assert.deepEqual(r.config.panelTiers, [{ minPanels: 1, perPanelCents: 500 }, { minPanels: 40, perPanelCents: 425 }]);
  assert.equal(r.config.accessSurchargesCents.ladder_required, 1500);
  assert.equal(r.config.membershipDiscountPct.unlimited, 20);
  assert.deepEqual(r.config.review.reviewRoofTypes.sort(), ["tile", "unknown"]);
  assert.ok(r.config.review.reviewAccessTypes.includes("unsure"), "unsure always reviewed");
  assert.ok(r.config.review.reviewAccessTypes.includes("roof_access_required"), "roof walking always reviewed");
});

test("parsed settings drive the quote engine", () => {
  const f = form(valid);
  const r = parsePricingForm(f.get, f.getAll);
  assert.ok(r.ok);
  if (!r.ok) return;
  const config = { ...r.config, version: 2, published: true, zones: [{ id: "z", name: "Vacaville", cities: ["vacaville"], travelFeeCents: 0, acceptingNew: true }] };
  const q = calculateQuote(config, { city: "Vacaville", panelCount: 20, stories: 1, propertyType: "single_family", roofType: "composition_shingle", accessType: "ground_reachable", cleaningRequest: "one_time" });
  assert.equal(q.status, "priced");
  assert.equal(q.customerPriceCents, 14900); // 99 + 10 x 5 = 149
});

test("reports clear errors instead of saving bad pricing", () => {
  const f = form({ ...valid, baseVisit: "abc", tier_min_0: "3", discountPremium: "150" });
  const r = parsePricingForm(f.get, f.getAll);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => e.startsWith("Base visit price")));
  assert.ok(r.errors.some((e) => e.includes("starts at 1 panel")));
  assert.ok(r.errors.some((e) => e.startsWith("Premium Care discount")));
});

test("refuses settings that would price every job at $0", () => {
  const f = form({ tier_min_0: "1", tier_price_0: "0" });
  const r = parsePricingForm(f.get, f.getAll);
  assert.equal(r.ok, false);
});

test("older or partial stored configs still fill the form", () => {
  const e = toEditable({ baseVisitCents: 5000, review: { maxAutoPanels: 40 } });
  assert.equal(e.baseVisitCents, 5000);
  assert.equal(e.review.maxAutoPanels, 40);
  assert.equal(e.review.maxAutoStories, 2);
  assert.equal(e.panelTiers[0].minPanels, 1);
  assert.equal(toEditable(null).baseVisitCents, 0);
});
