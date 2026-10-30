import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "./templates.ts";
import { annualReminderDue, expiringReminderDue, followUpDue, isTomorrow, renewalNoticeDue } from "./schedule.ts";
import { unsubscribeToken, verifyUnsubscribe } from "./unsubscribe.ts";

const brand: T.Brand = {
  businessName: "Solano Solar Cleaning", phone: "(707) 555-0100", email: "hi@example.com", navy: "#0b1b33", gold: "#e8b04a",
  siteUrl: "https://example.com", reviewUrl: null, mailingAddress: "PO Box 1, Vacaville, CA 95688",
};

test("customer-entered text is escaped in HTML", () => {
  const e = T.quoteReceived(brand, { id: "abcdef12-0000-0000-0000-000000000000", firstName: "<script>x</script>", status: "needs_review", priceCents: null, address: "1 \"Main\" St, Vacaville" });
  assert.ok(!e.html.includes("<script>"));
  assert.ok(e.html.includes("&lt;script&gt;"));
  assert.ok(e.text.includes("<script>x</script>"), "plain text keeps the original");
  assert.equal(T.esc(`a&b<'"`), "a&amp;b&lt;&#39;&quot;");
});

test("quote received: priced quotes show the price and a booking link; others never show a price", () => {
  const priced = T.quoteReceived(brand, { id: "abcdef12-0000", firstName: "Ana", status: "quoted", priceCents: 14900, address: "1 Main St" });
  assert.match(priced.subject, /\$149\.00/);
  assert.ok(priced.html.includes("https://example.com/dashboard"));
  const review = T.quoteReceived(brand, { id: "abcdef12-0000", firstName: "Ana", status: "needs_review", priceCents: null, address: "1 Main St" });
  assert.ok(!review.html.includes("$"), "no price for quotes under review");
  assert.ok(review.text.includes("ABCDEF12"), "includes the reference");
});

test("membership acknowledgment includes terms, price, and how to cancel (California ARL)", () => {
  const e = T.membershipAcknowledgment(brand, { firstName: "Ana", planName: "Seasonal Care", amountCents: 2900, interval: "month", disclosure: "Renews monthly at $29.00 until you cancel.", consentAt: "2026-10-01T10:00:00Z", renewsOn: "2026-11-01T10:00:00Z" });
  assert.ok(e.text.includes("$29.00 per month"));
  assert.ok(e.text.includes("Renews monthly at $29.00 until you cancel."));
  assert.match(e.text, /How to cancel/);
  assert.match(e.text, /Change plan or cancel/);
  assert.ok(!e.optional, "required notices ignore unsubscribes");
});

test("follow-ups are optional and carry an unsubscribe link and mailing address", () => {
  const e = T.quoteFollowUp(brand, { id: "abcdef12-0000", firstName: "Ana", priceCents: 14900, n: 2 }, "https://example.com/unsubscribe?e=a&t=b");
  assert.equal(e.optional, true);
  assert.ok(e.html.includes("unsubscribe?e=a&amp;t=b"));
  assert.ok(e.text.includes("PO Box 1, Vacaville"));
  assert.match(e.text, /last reminder/);
});

test("job completed: report link always; review button only when a review link is set", () => {
  const b = { id: "b1", firstName: "Ana", start: "2026-11-02T17:00:00Z", address: "1 Main St, Vacaville", damage: false };
  assert.ok(!T.jobCompleted(brand, b).text.includes("Leave a review"));
  const withReview = T.jobCompleted({ ...brand, reviewUrl: "https://g.page/r/abc/review" }, b);
  assert.ok(withReview.text.includes("https://g.page/r/abc/review"));
  assert.ok(withReview.text.includes("https://example.com/dashboard/reports/b1"));
  assert.match(T.jobCompleted(brand, { ...b, damage: true }).text, /solar installer/);
});

test("appointment times are shown in Pacific time", () => {
  const e = T.bookingConfirmed(brand, { id: "b1", firstName: null, start: "2026-11-02T17:00:00Z", address: "1 Main St" }, "booked");
  assert.match(e.subject, /Monday, November 2.*9:00\s?AM/);
  assert.ok(e.text.startsWith("Your cleaning is booked"));
});

test("reminders go out the day before, by Pacific date", () => {
  const now = new Date("2026-11-01T16:00:00Z"); // 8am PST, Nov 1
  assert.equal(isTomorrow("2026-11-02T17:00:00Z", now), true);
  assert.equal(isTomorrow("2026-11-03T07:30:00Z", now), true, "11:30pm Nov 2 Pacific is still tomorrow");
  assert.equal(isTomorrow("2026-11-03T08:30:00Z", now), false, "12:30am Nov 3 Pacific is not");
  assert.equal(isTomorrow("2026-11-01T22:00:00Z", now), false);
});

test("quote follow-ups: day 2, then day 7, then never", () => {
  const created = "2026-10-01T12:00:00Z";
  const at = (d: number) => new Date(new Date(created).getTime() + d * 86400_000);
  assert.equal(followUpDue(created, 0, at(1)), null);
  assert.equal(followUpDue(created, 0, at(2)), 1);
  assert.equal(followUpDue(created, 1, at(5)), null);
  assert.equal(followUpDue(created, 1, at(7)), 2);
  assert.equal(followUpDue(created, 2, at(10)), null);
  assert.equal(followUpDue(created, 0, at(31)), null, "too old");
});

test("renewal notice falls 15 to 40 days before an annual renewal", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  assert.equal(renewalNoticeDue("2026-11-10T00:00:00Z", now), true); // 40 days
  assert.equal(renewalNoticeDue("2026-11-12T00:00:00Z", now), false); // 42 days: not yet
  assert.equal(renewalNoticeDue("2026-10-10T00:00:00Z", now), false); // 9 days: too late to count
});

test("monthly members get a yearly reminder before each anniversary", () => {
  assert.equal(annualReminderDue("2025-11-15T00:00:00Z", new Date("2026-10-20T00:00:00Z")), 1);
  assert.equal(annualReminderDue("2025-11-15T00:00:00Z", new Date("2026-09-01T00:00:00Z")), null);
  assert.equal(annualReminderDue("2024-11-15T00:00:00Z", new Date("2026-11-01T00:00:00Z")), 2);
});

test("expiring cleanings reminder window", () => {
  const now = new Date("2026-10-01T16:00:00Z");
  assert.equal(expiringReminderDue("2026-10-25", now), true);
  assert.equal(expiringReminderDue("2026-12-15", now), false);
  assert.equal(expiringReminderDue("2026-10-02", now), false);
});

test("unsubscribe links are signed per address", () => {
  const t = unsubscribeToken("Ana@Example.com", "secret-key");
  assert.ok(t);
  assert.equal(verifyUnsubscribe("ana@example.com", t!, "secret-key"), true);
  assert.equal(verifyUnsubscribe("bob@example.com", t!, "secret-key"), false);
  assert.equal(verifyUnsubscribe("ana@example.com", t!, "other-key"), false);
  assert.equal(verifyUnsubscribe("ana@example.com", "short", "secret-key"), false);
  assert.equal(unsubscribeToken("a@b.co", null), null);
});
