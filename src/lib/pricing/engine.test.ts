import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateQuote, type PricingConfig, type QuoteInput } from "./engine.ts";

// Test numbers only — not real business prices.
const config: PricingConfig = {
  version: 3,
  published: true,
  baseVisitCents: 10000,
  includedPanels: 10,
  panelTiers: [
    { minPanels: 1, perPanelCents: 500 },
    { minPanels: 30, perPanelCents: 400 },
  ],
  perExtraStoryCents: 2500,
  accessSurchargesCents: { ladder_required: 1500 },
  membershipDiscountPct: { seasonal: 10, premium: 15 },
  minimumVisitCents: 12000,
  zones: [
    { id: "z1", name: "Vacaville", cities: ["Vacaville"], travelFeeCents: 0, acceptingNew: true },
    { id: "z2", name: "Davis", cities: ["davis"], travelFeeCents: 2000, acceptingNew: true },
    { id: "z3", name: "Winters", cities: ["winters"], travelFeeCents: 3000, acceptingNew: false },
  ],
  review: {
    maxAutoPanels: 60,
    maxAutoStories: 2,
    reviewRoofTypes: ["tile", "unknown"],
    reviewAccessTypes: ["roof_access_required", "unsure"],
    reviewPropertyTypes: ["commercial", "other"],
  },
};

const input: QuoteInput = {
  city: "Vacaville",
  panelCount: 20,
  stories: 1,
  propertyType: "single_family",
  roofType: "composition_shingle",
  accessType: "ground_reachable",
  cleaningRequest: "one_time",
};

test("prices a simple ground-reachable job", () => {
  const r = calculateQuote(config, input);
  assert.equal(r.status, "priced");
  // base 100.00 + 10 extra panels x 5.00 = 150.00
  assert.equal(r.customerPriceCents, 15000);
  assert.equal(r.pricingVersion, 3);
});

test("applies the highest matching panel tier", () => {
  const r = calculateQuote(config, { ...input, panelCount: 40 });
  // base 100 + 30 x 4.00 = 220.00
  assert.equal(r.customerPriceCents, 22000);
});

test("adds story, access and travel fees; city match ignores case/space", () => {
  const r = calculateQuote(config, { ...input, city: "  DAVIS ", stories: 2, accessType: "ladder_required" });
  // 150 + 25 story + 15 ladder + 20 travel = 210.00
  assert.equal(r.status, "priced");
  assert.equal(r.customerPriceCents, 21000);
});

test("enforces minimum visit, then applies membership discount", () => {
  const small = calculateQuote(config, { ...input, panelCount: 4 });
  assert.equal(small.customerPriceCents, 12000);
  const member = calculateQuote(config, { ...input, panelCount: 4, cleaningRequest: "seasonal" });
  assert.equal(member.customerPriceCents, 10800);
});

test("never shows a price when pricing is unpublished", () => {
  const r = calculateQuote({ ...config, published: false }, input);
  assert.equal(r.status, "pricing_unpublished");
  assert.equal(r.customerPriceCents, null);
  assert.equal(r.internalEstimateCents, 15000);
});

test("uncertain or risky access always goes to manual review", () => {
  for (const change of [
    { accessType: "unsure" as const },
    { accessType: "roof_access_required" as const },
    { roofType: "unknown" as const },
    { roofType: "tile" as const },
    { stories: 3 },
    { panelCount: 61 },
    { cleaningRequest: "commercial" as const },
    { propertyType: "commercial" as const },
  ]) {
    const r = calculateQuote(config, { ...input, ...change });
    assert.equal(r.status, "needs_review", JSON.stringify(change));
    assert.equal(r.customerPriceCents, null);
    assert.ok(r.reviewReasons.length > 0);
  }
});

test("out-of-area and waitlisted cities are not priced", () => {
  assert.equal(calculateQuote(config, { ...input, city: "Sacramento" }).status, "out_of_area");
  const w = calculateQuote(config, { ...input, city: "Winters" });
  assert.equal(w.status, "waitlist");
  assert.equal(w.customerPriceCents, null);
});

test("invalid panel counts are flagged, not priced", () => {
  assert.equal(calculateQuote(config, { ...input, panelCount: 0 }).status, "needs_review");
  assert.equal(calculateQuote(config, { ...input, panelCount: 2.5 }).status, "needs_review");
});

test("missing tiers force review", () => {
  const r = calculateQuote({ ...config, panelTiers: [] }, input);
  assert.equal(r.status, "needs_review");
});
