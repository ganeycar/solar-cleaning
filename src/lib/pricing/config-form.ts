import { dollarsToCents } from "../money.ts";
import type { AccessType, PanelTier, PricingConfig, PropertyType, RoofType } from "./engine.ts";

/** The parts of PricingConfig the owner edits (zones come from territories; version/published from the database row). */
export type EditablePricing = Omit<PricingConfig, "version" | "published" | "zones">;

export const MAX_TIERS = 5;
export const ROOF_OPTIONS: RoofType[] = ["composition_shingle", "tile", "metal", "flat", "ground_mount", "other"];
export const ACCESS_OPTIONS: AccessType[] = ["ground_reachable", "ladder_required"];
export const PROPERTY_OPTIONS: PropertyType[] = ["single_family", "townhome", "multi_family", "commercial", "ground_mount", "other"];

export const DEFAULT_EDITABLE: EditablePricing = {
  baseVisitCents: 0,
  includedPanels: 0,
  panelTiers: [{ minPanels: 1, perPanelCents: 0 }],
  perExtraStoryCents: 0,
  accessSurchargesCents: { ladder_required: 0 },
  membershipDiscountPct: { seasonal: 0, premium: 0, unlimited: 0 },
  minimumVisitCents: 0,
  review: {
    maxAutoPanels: 60,
    maxAutoStories: 2,
    reviewRoofTypes: ["tile", "unknown", "other"],
    reviewAccessTypes: ["roof_access_required", "unsure"],
    reviewPropertyTypes: ["commercial", "multi_family", "other"],
  },
};

type Get = (name: string) => string | null;
type GetAll = (name: string) => string[];
export type ParseResult = { ok: true; config: EditablePricing } | { ok: false; errors: string[] };

export function parsePricingForm(get: Get, getAll: GetAll): ParseResult {
  const errors: string[] = [];

  const money = (name: string, label: string): number => {
    const raw = (get(name) ?? "").trim();
    if (raw === "") return 0;
    const cents = dollarsToCents(raw, { allowZero: true, max: 100_000 });
    if (cents == null) { errors.push(`${label}: enter a dollar amount like 125 or 4.50.`); return 0; }
    return cents;
  };
  const int = (name: string, label: string, min: number, max: number, fallback = 0): number => {
    const raw = (get(name) ?? "").trim();
    if (raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) { errors.push(`${label}: enter a whole number from ${min} to ${max}.`); return fallback; }
    return n;
  };

  const tiers: PanelTier[] = [];
  for (let i = 0; i < MAX_TIERS; i++) {
    const minRaw = (get(`tier_min_${i}`) ?? "").trim();
    const priceRaw = (get(`tier_price_${i}`) ?? "").trim();
    if (minRaw === "" && priceRaw === "") continue;
    const minPanels = int(`tier_min_${i}`, `Tier ${i + 1} starting panel count`, 1, 10_000, -1);
    const perPanelCents = money(`tier_price_${i}`, `Tier ${i + 1} price per panel`);
    if (minPanels >= 1) tiers.push({ minPanels, perPanelCents });
  }
  tiers.sort((a, b) => a.minPanels - b.minPanels);
  if (tiers.length === 0 || tiers[0].minPanels !== 1) errors.push("Per-panel pricing needs a tier that starts at 1 panel.");
  if (new Set(tiers.map((t) => t.minPanels)).size !== tiers.length) errors.push("Two panel tiers start at the same panel count.");

  const pick = <T extends string>(name: string, allowed: readonly T[]): T[] => getAll(name).filter((v): v is T => (allowed as readonly string[]).includes(v));

  const config: EditablePricing = {
    baseVisitCents: money("baseVisit", "Base visit price"),
    includedPanels: int("includedPanels", "Panels included in base price", 0, 10_000),
    panelTiers: tiers,
    perExtraStoryCents: money("perExtraStory", "Each additional story"),
    accessSurchargesCents: { ladder_required: money("surchargeLadder", "Ladder surcharge") },
    membershipDiscountPct: {
      seasonal: int("discountSeasonal", "Seasonal Care discount", 0, 100),
      premium: int("discountPremium", "Premium Care discount", 0, 100),
      unlimited: int("discountUnlimited", "Unlimited Care discount", 0, 100),
    },
    minimumVisitCents: money("minimumVisit", "Minimum visit price"),
    review: {
      maxAutoPanels: int("maxAutoPanels", "Review jobs above this many panels", 1, 10_000, 60),
      maxAutoStories: int("maxAutoStories", "Review jobs above this many stories", 1, 10, 2),
      // "unknown" roofs and unsure/roof-walking access are always reviewed by the engine itself.
      reviewRoofTypes: Array.from(new Set<RoofType>(["unknown", ...pick("reviewRoof", ROOF_OPTIONS)])),
      reviewAccessTypes: Array.from(new Set<AccessType>(["unsure", "roof_access_required", ...pick("reviewAccess", ACCESS_OPTIONS)])),
      reviewPropertyTypes: pick("reviewProperty", PROPERTY_OPTIONS),
    },
  };

  if (config.baseVisitCents === 0 && tiers.every((t) => t.perPanelCents === 0) && config.minimumVisitCents === 0) {
    errors.push("Set a base visit price, a per-panel price, or a minimum visit price. Every quote would be $0.");
  }

  return errors.length ? { ok: false, errors } : { ok: true, config };
}

/** Merges a stored config with defaults so older or partial versions still fill the form. */
export function toEditable(stored: unknown): EditablePricing {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<EditablePricing>;
  return {
    ...DEFAULT_EDITABLE,
    ...s,
    panelTiers: Array.isArray(s.panelTiers) && s.panelTiers.length ? s.panelTiers : DEFAULT_EDITABLE.panelTiers,
    accessSurchargesCents: { ...DEFAULT_EDITABLE.accessSurchargesCents, ...(s.accessSurchargesCents ?? {}) },
    membershipDiscountPct: { ...DEFAULT_EDITABLE.membershipDiscountPct, ...(s.membershipDiscountPct ?? {}) },
    review: { ...DEFAULT_EDITABLE.review, ...(s.review ?? {}) },
  };
}
