/**
 * Configurable quote pricing engine.
 *
 * This module is intentionally dependency-free and pure: the same inputs always
 * produce the same result. All prices are integers in cents. Nothing here is
 * hardcoded business pricing — every number comes from a PricingConfig that the
 * owner edits in the dashboard and stores in the `pricing_rules` table.
 *
 * Safety rule: anything the engine cannot be confident about is sent to manual
 * review instead of being auto-priced. Customers never see a number when
 * pricing is unpublished or the job needs review.
 */

export type PropertyType = "single_family" | "townhome" | "multi_family" | "commercial" | "ground_mount" | "other";
export type RoofType = "composition_shingle" | "tile" | "metal" | "flat" | "ground_mount" | "other" | "unknown";
export type AccessType =
  | "ground_reachable" // panels reachable from the ground with water-fed poles
  | "ladder_required"
  | "roof_access_required"
  | "unsure";
export type CleaningRequest = "one_time" | "seasonal" | "premium" | "unlimited" | "commercial" | "not_sure";

export interface PanelTier {
  /** Inclusive lower bound on total panel count. */
  minPanels: number;
  /** Per-panel price in cents for panels in this tier. */
  perPanelCents: number;
}

export interface TravelZone {
  id: string;
  name: string;
  /** Lowercase city names served by this zone. */
  cities: string[];
  travelFeeCents: number;
  /** false = city is known but not yet accepting bookings (waitlist). */
  acceptingNew: boolean;
}

export interface PricingConfig {
  version: number;
  /** When false, quotes are recorded and estimated internally but never shown to customers. */
  published: boolean;
  baseVisitCents: number;
  /** Panels covered by the base visit price before per-panel charges begin. */
  includedPanels: number;
  /** Tiers are matched by total panel count; the highest tier whose minPanels <= count applies. */
  panelTiers: PanelTier[];
  /** Surcharge for each story above the first. */
  perExtraStoryCents: number;
  accessSurchargesCents: Partial<Record<AccessType, number>>;
  /** Discount percentage (0-100) applied to the per-visit price for each membership plan. */
  membershipDiscountPct: Partial<Record<CleaningRequest, number>>;
  minimumVisitCents: number;
  zones: TravelZone[];
  /** Review thresholds. */
  review: {
    maxAutoPanels: number;
    maxAutoStories: number;
    reviewRoofTypes: RoofType[];
    reviewAccessTypes: AccessType[];
    reviewPropertyTypes: PropertyType[];
  };
}

export interface QuoteInput {
  city: string;
  panelCount: number;
  stories: number;
  propertyType: PropertyType;
  roofType: RoofType;
  accessType: AccessType;
  cleaningRequest: CleaningRequest;
}

export interface LineItem {
  code: string;
  label: string;
  amountCents: number;
}

export type QuoteStatus =
  /** A customer-visible price is available. */
  | "priced"
  /** Job must be reviewed by the owner before any price is given. */
  | "needs_review"
  /** Job is eligible but pricing has not been published yet. */
  | "pricing_unpublished"
  /** Address is outside every configured service zone. */
  | "out_of_area"
  /** City is in a zone that is not accepting new customers yet. */
  | "waitlist";

export interface QuoteResult {
  status: QuoteStatus;
  /** Price shown to the customer. Only set when status === "priced". */
  customerPriceCents: number | null;
  /** Owner-only estimate, computed whenever enough information exists. */
  internalEstimateCents: number | null;
  lineItems: LineItem[];
  reviewReasons: string[];
  zoneId: string | null;
  pricingVersion: number;
}

export function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findZone(config: PricingConfig, city: string): TravelZone | null {
  const c = normalizeCity(city);
  return config.zones.find((z) => z.cities.map(normalizeCity).includes(c)) ?? null;
}

function tierFor(config: PricingConfig, panelCount: number): PanelTier | null {
  const tiers = [...config.panelTiers].sort((a, b) => a.minPanels - b.minPanels);
  let match: PanelTier | null = null;
  for (const t of tiers) if (panelCount >= t.minPanels) match = t;
  return match;
}

export function reviewReasonsFor(config: PricingConfig, input: QuoteInput): string[] {
  const r: string[] = [];
  const rv = config.review;
  if (input.cleaningRequest === "commercial") r.push("Commercial jobs are priced individually.");
  if (rv.reviewPropertyTypes.includes(input.propertyType)) r.push(`Property type "${input.propertyType}" requires review.`);
  if (input.panelCount > rv.maxAutoPanels) r.push(`More than ${rv.maxAutoPanels} panels.`);
  if (input.stories > rv.maxAutoStories) r.push(`More than ${rv.maxAutoStories} stories.`);
  if (rv.reviewRoofTypes.includes(input.roofType)) r.push(`Roof type "${input.roofType}" requires a safety review.`);
  if (rv.reviewAccessTypes.includes(input.accessType)) r.push(`Access "${input.accessType}" requires a safety review.`);
  if (config.panelTiers.length === 0) r.push("No per-panel pricing tiers are configured.");
  return r;
}

export function calculateQuote(config: PricingConfig, input: QuoteInput): QuoteResult {
  const base: Omit<QuoteResult, "status"> = {
    customerPriceCents: null,
    internalEstimateCents: null,
    lineItems: [],
    reviewReasons: [],
    zoneId: null,
    pricingVersion: config.version,
  };

  if (!Number.isInteger(input.panelCount) || input.panelCount < 1) {
    return { ...base, status: "needs_review", reviewReasons: ["Panel count is missing or invalid."] };
  }
  if (!Number.isInteger(input.stories) || input.stories < 1) {
    return { ...base, status: "needs_review", reviewReasons: ["Number of stories is missing or invalid."] };
  }

  const zone = findZone(config, input.city);
  if (!zone) return { ...base, status: "out_of_area" };
  base.zoneId = zone.id;

  const lineItems: LineItem[] = [];
  lineItems.push({ code: "base", label: "Base visit", amountCents: config.baseVisitCents });

  const tier = tierFor(config, input.panelCount);
  const billablePanels = Math.max(0, input.panelCount - config.includedPanels);
  if (tier && billablePanels > 0) {
    lineItems.push({
      code: "panels",
      label: `${billablePanels} additional panel${billablePanels === 1 ? "" : "s"}`,
      amountCents: billablePanels * tier.perPanelCents,
    });
  }

  const extraStories = Math.max(0, input.stories - 1);
  if (extraStories > 0 && config.perExtraStoryCents > 0) {
    lineItems.push({ code: "stories", label: `${extraStories} additional stor${extraStories === 1 ? "y" : "ies"}`, amountCents: extraStories * config.perExtraStoryCents });
  }

  const access = config.accessSurchargesCents[input.accessType] ?? 0;
  if (access > 0) lineItems.push({ code: "access", label: "Access surcharge", amountCents: access });

  if (zone.travelFeeCents > 0) lineItems.push({ code: "travel", label: `Travel (${zone.name})`, amountCents: zone.travelFeeCents });

  let subtotal = lineItems.reduce((s, li) => s + li.amountCents, 0);
  if (subtotal < config.minimumVisitCents) {
    lineItems.push({ code: "minimum", label: "Minimum visit adjustment", amountCents: config.minimumVisitCents - subtotal });
    subtotal = config.minimumVisitCents;
  }

  const pct = Math.min(100, Math.max(0, config.membershipDiscountPct[input.cleaningRequest] ?? 0));
  if (pct > 0) {
    const discount = Math.round((subtotal * pct) / 100);
    lineItems.push({ code: "membership_discount", label: `Membership discount (${pct}%)`, amountCents: -discount });
    subtotal -= discount;
  }

  const reviewReasons = reviewReasonsFor(config, input);
  const result: Omit<QuoteResult, "status"> = { ...base, lineItems, internalEstimateCents: subtotal, reviewReasons };

  if (!zone.acceptingNew) return { ...result, status: "waitlist" };
  if (reviewReasons.length > 0) return { ...result, status: "needs_review" };
  if (!config.published) return { ...result, status: "pricing_unpublished" };
  return { ...result, status: "priced", customerPriceCents: subtotal };
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
