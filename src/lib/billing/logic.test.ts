import { test } from "node:test";
import assert from "node:assert/strict";
import { dollarsToCents, centsToInput } from "../money.ts";
import {
  checkStripeKey, invoiceSubscriptionId, membershipEligibility, oneTimeEligibility, renewalDisclosure,
  subscriptionEnding, subscriptionPeriod, subscriptionPriceId, type CheckoutPlan, type CheckoutPrice, type CheckoutQuote,
} from "./logic.ts";

const quote: CheckoutQuote = { status: "quoted", approvedPriceCents: 15000, panelCount: 24 };
const plan: CheckoutPlan = { kind: "subscription", isActive: true, maxPanelsIncluded: 30 };
const price: CheckoutPrice = { interval: "month", amountCents: 2900, status: "published", stripePriceId: "price_123" };

test("one-time checkout needs a confirmed quote price", () => {
  assert.deepEqual(oneTimeEligibility(quote), { ok: true });
  assert.equal(oneTimeEligibility({ ...quote, approvedPriceCents: null }).ok, false);
  assert.equal(oneTimeEligibility({ ...quote, status: "needs_review" }).ok, false);
  assert.equal(oneTimeEligibility({ ...quote, status: "converted" }).ok, false);
  assert.equal(oneTimeEligibility({ ...quote, status: "new" }).ok, false);
});

test("membership checkout is blocked for unpriced, unpublished, or unsynced plans", () => {
  assert.deepEqual(membershipEligibility(quote, plan, price), { ok: true });
  assert.equal(membershipEligibility(quote, plan, undefined).ok, false);
  assert.equal(membershipEligibility(quote, plan, { ...price, status: "draft" }).ok, false);
  assert.equal(membershipEligibility(quote, plan, { ...price, amountCents: null }).ok, false);
  assert.equal(membershipEligibility(quote, plan, { ...price, stripePriceId: null }).ok, false);
  assert.equal(membershipEligibility(quote, { ...plan, isActive: false }, price).ok, false);
  assert.equal(membershipEligibility(quote, { ...plan, kind: "commercial" }, price).ok, false);
});

test("membership respects the plan's panel limit and quote review", () => {
  const r = membershipEligibility({ ...quote, panelCount: 31 }, plan, price);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /30 panels/);
  assert.equal(membershipEligibility(quote, { ...plan, maxPanelsIncluded: null }, price).ok, true);
  assert.equal(membershipEligibility({ ...quote, status: "needs_review" }, plan, price).ok, false);
});

test("renewal disclosure states amount, frequency, and cancellation, and fits Stripe metadata", () => {
  const text = renewalDisclosure("Unlimited Care", 4900, "month");
  assert.match(text, /renews automatically/);
  assert.match(text, /\$49\.00 every month/);
  assert.match(text, /cancel anytime online/);
  assert.ok(text.length <= 500, `length ${text.length}`);
  assert.match(renewalDisclosure("Seasonal Care", 30000, "year"), /\$300\.00 every year/);
});

test("live Stripe keys are refused until approved", () => {
  assert.deepEqual(checkStripeKey("sk_test_abc", false), { ok: true, live: false });
  assert.equal(checkStripeKey("sk_live_abc", false).ok, false);
  assert.deepEqual(checkStripeKey("sk_live_abc", true), { ok: true, live: true });
  assert.equal(checkStripeKey("pk_test_abc", false).ok, false);
  assert.equal(checkStripeKey("", false).ok, false);
  assert.equal(checkStripeKey(undefined, false).ok, false);
});

test("reads Stripe subscription and invoice fields from new and old API shapes", () => {
  const newShape = { items: { data: [{ current_period_start: 1767225600, current_period_end: 1769904000, price: { id: "price_new" } }] }, cancel_at: 1769904000 };
  assert.deepEqual(subscriptionPeriod(newShape), { start: "2026-01-01T00:00:00.000Z", end: "2026-02-01T00:00:00.000Z" });
  assert.equal(subscriptionPriceId(newShape), "price_new");
  assert.equal(subscriptionEnding(newShape), true);
  const oldShape = { current_period_start: 1767225600, current_period_end: 1769904000, items: { data: [{ price: "price_old" }] }, cancel_at_period_end: false, cancel_at: null };
  assert.equal(subscriptionPeriod(oldShape).end, "2026-02-01T00:00:00.000Z");
  assert.equal(subscriptionPriceId(oldShape), "price_old");
  assert.equal(subscriptionEnding(oldShape), false);
  assert.equal(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_new" } } }), "sub_new");
  assert.equal(invoiceSubscriptionId({ subscription: { id: "sub_old" } }), "sub_old");
  assert.equal(invoiceSubscriptionId({}), null);
});

test("dollar amounts typed by the owner become cents", () => {
  assert.equal(dollarsToCents("$1,234.50"), 123450);
  assert.equal(dollarsToCents("45"), 4500);
  assert.equal(dollarsToCents("45.5"), 4550);
  assert.equal(dollarsToCents(" 0.99 "), 99);
  assert.equal(dollarsToCents("0"), null);
  assert.equal(dollarsToCents("0", { allowZero: true }), 0);
  for (const bad of ["-5", "abc", "1.234", "", "1e3", "5000001"]) assert.equal(dollarsToCents(bad), null, bad);
  assert.equal(centsToInput(4550), "45.50");
  assert.equal(centsToInput(null), "");
});
