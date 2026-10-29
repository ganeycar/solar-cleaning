import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, sniffImageType, validateQuoteRequest } from "./validate.ts";

const good: Record<string, string> = {
  firstName: "Alex", lastName: "Rivera", email: "Alex@Example.com", phone: "(707) 555-0142",
  addressLine1: "123 Example St", city: "Vacaville", state: "ca", postalCode: "95687",
  panelCount: "24", stories: "1", propertyType: "single_family", roofType: "composition_shingle",
  accessType: "ground_reachable", cleaningRequest: "one_time", preferredWindow: "saturday",
  marketingEmailOptIn: "on",
};
const getter = (o: Record<string, string>) => (k: string) => (k in o ? o[k] : null);

test("accepts and normalizes a valid request", () => {
  const r = validateQuoteRequest(getter(good));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.email, "alex@example.com");
  assert.equal(r.data.phone, "+17075550142");
  assert.equal(r.data.state, "CA");
  assert.equal(r.data.panelCount, 24);
  assert.equal(r.data.marketingEmailOptIn, true);
  assert.equal(r.data.marketingSmsOptIn, false);
});

test("roof and access must be chosen explicitly; Not sure is accepted", () => {
  const { roofType, accessType, ...rest } = good;
  const missing = validateQuoteRequest(getter(rest));
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.ok("roofType" in missing.errors);
    assert.ok("accessType" in missing.errors);
  }
  const unsure = validateQuoteRequest(getter({ ...rest, roofType: "unknown", accessType: "unsure" }));
  assert.ok(unsure.ok);
});

test("rejects bad fields with per-field messages", () => {
  const r = validateQuoteRequest(getter({ ...good, email: "nope", panelCount: "-3", postalCode: "9568", propertyType: "castle", state: "NV" }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    for (const k of ["email", "panelCount", "postalCode", "propertyType", "state"]) assert.ok(k in r.errors, k);
  }
});

test("honeypot submissions are rejected", () => {
  const r = validateQuoteRequest(getter({ ...good, company_website: "http://spam" }));
  assert.equal(r.ok, false);
});

test("phone normalization", () => {
  assert.equal(normalizePhone("1-707-555-0142"), "+17075550142");
  assert.equal(normalizePhone("555-0142"), null);
  assert.equal(normalizePhone("(107) 555-0142"), null);
});

test("image sniffing ignores file names and trusts bytes", () => {
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImageType(new TextEncoder().encode("\0\0\0\x18ftypheic")), "image/heic");
  assert.equal(sniffImageType(new TextEncoder().encode("<script>alert(1)</script>")), null);
});
