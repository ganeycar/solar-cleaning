import { cache } from "react";
import { getPublicClient } from "./supabase/admin.ts";

/**
 * Business settings and catalog, loaded from Supabase (editable in the owner
 * dashboard in Phase 5). Defaults below are used only until Supabase is
 * connected, and intentionally contain no prices, licenses, or insurance claims.
 */

export interface SiteSettings {
  businessName: string;
  tagline: string;
  phone: string | null;
  email: string | null;
  headquartersCity: string;
  headquartersState: string;
  logoUrl: string | null;
  colors: { navy: string; charcoal: string; gold: string };
  /** Only non-null when the owner has entered AND marked the info verified. */
  licenseInfo: string | null;
  insuranceInfo: string | null;
  /** Google Business Profile, Yelp, social links (for search engines). */
  profileLinks: string[];
}

export interface PlanPrice {
  interval: "one_time" | "month" | "year";
  amountCents: number;
}

export interface Plan {
  slug: string;
  name: string;
  kind: "one_time" | "subscription" | "commercial";
  summary: string;
  cleaningsPerYear: number | null;
  minDaysBetween: number | null;
  priorityScheduling: boolean;
  benefits: string[];
  limitations: string[];
  /** Published prices only. Empty = "Pricing coming soon". */
  prices: PlanPrice[];
}

export interface Territory {
  slug: string;
  name: string;
  acceptingNew: boolean;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  businessName: "Solano Solar Cleaning",
  tagline: "Solar panel cleaning and care memberships for Solano and Yolo County homes.",
  phone: null,
  email: null,
  headquartersCity: "Vacaville",
  headquartersState: "CA",
  logoUrl: null,
  colors: { navy: "#0b1b33", charcoal: "#1f2933", gold: "#e8b04a" },
  licenseInfo: null,
  insuranceInfo: null,
  profileLinks: [],
};

export const DEFAULT_PLANS: Plan[] = [
  { slug: "one-time", name: "One-Time Cleaning", kind: "one_time", summary: "A single, complete standard cleaning with no recurring commitment.", cleaningsPerYear: 1, minDaysBetween: null, priorityScheduling: false, benefits: ["One complete standard cleaning", "Before-and-after photos", "No recurring commitment"], limitations: [], prices: [] },
  { slug: "seasonal-care", name: "Seasonal Care", kind: "subscription", summary: "Two standard cleanings a year, timed around the dry season.", cleaningsPerYear: 2, minDaysBetween: 120, priorityScheduling: false, benefits: ["Two standard cleanings per year", "Before-and-after photos every visit", "Monthly or annual billing"], limitations: ["Cleanings scheduled in dry-weather windows", "Unused cleanings do not roll over"], prices: [] },
  { slug: "premium-care", name: "Premium Care", kind: "subscription", summary: "Four standard cleanings a year for homes that collect dust and pollen quickly.", cleaningsPerYear: 4, minDaysBetween: 60, priorityScheduling: false, benefits: ["Four standard cleanings per year", "Before-and-after photos every visit", "Monthly or annual billing"], limitations: ["Cleanings scheduled in dry-weather windows", "Unused cleanings do not roll over"], prices: [] },
  { slug: "unlimited-care", name: "Unlimited Care", kind: "subscription", summary: "Up to one standard cleaning every 30 days, with priority scheduling.", cleaningsPerYear: 12, minDaysBetween: 30, priorityScheduling: true, benefits: ["Up to one standard cleaning every 30 days", "Priority scheduling", "Monthly or annual billing"], limitations: ["Maximum one cleaning per 30 days", "Subject to weather, safe access, and eligibility limits in the Membership Terms", "Panel count limit applies"], prices: [] },
  { slug: "commercial", name: "Commercial Service", kind: "commercial", summary: "Custom cleaning frequency and scope for larger installations.", cleaningsPerYear: null, minDaysBetween: null, priorityScheduling: false, benefits: ["Site assessment", "Custom frequency and scope", "Contract or invoice billing"], limitations: [], prices: [] },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const db = getPublicClient();
  if (!db) return DEFAULT_SETTINGS;
  const { data, error } = await db
    .from("business_settings")
    .select("business_name,tagline,phone,email,headquarters_city,headquarters_state,logo_url,brand_colors,license_info,license_verified,insurance_info,insurance_verified,profile_links")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  const colors = { ...DEFAULT_SETTINGS.colors };
  for (const k of ["navy", "charcoal", "gold"] as const) {
    const v = data.brand_colors?.[k];
    if (typeof v === "string" && HEX.test(v)) colors[k] = v;
  }
  return {
    businessName: data.business_name || DEFAULT_SETTINGS.businessName,
    tagline: data.tagline || DEFAULT_SETTINGS.tagline,
    phone: data.phone || null,
    email: data.email || null,
    headquartersCity: data.headquarters_city || "Vacaville",
    headquartersState: data.headquarters_state || "CA",
    logoUrl: data.logo_url || null,
    colors,
    licenseInfo: data.license_verified && data.license_info ? data.license_info : null,
    insuranceInfo: data.insurance_verified && data.insurance_info ? data.insurance_info : null,
    profileLinks: Array.isArray(data.profile_links) ? data.profile_links.filter((l: unknown) => typeof l === "string" && l.startsWith("https://")) : [],
  };
});

export const getPlans = cache(async (): Promise<Plan[]> => {
  const db = getPublicClient();
  if (!db) return DEFAULT_PLANS;
  // RLS returns only active plans and only *published* prices to the public.
  const { data, error } = await db
    .from("plans")
    .select("slug,name,kind,summary,cleanings_per_year,min_days_between_cleanings,priority_scheduling,benefits,limitations,display_order,plan_prices(billing_interval,amount_cents,status)")
    .order("display_order");
  if (error || !data?.length) return DEFAULT_PLANS;
  return data.map((p) => ({
    slug: p.slug,
    name: p.name,
    kind: p.kind,
    summary: p.summary ?? "",
    cleaningsPerYear: p.cleanings_per_year,
    minDaysBetween: p.min_days_between_cleanings,
    priorityScheduling: p.priority_scheduling,
    benefits: Array.isArray(p.benefits) ? p.benefits : [],
    limitations: Array.isArray(p.limitations) ? p.limitations : [],
    prices: (p.plan_prices ?? [])
      .filter((x: { status: string; amount_cents: number | null }) => x.status === "published" && x.amount_cents != null)
      .map((x: { billing_interval: PlanPrice["interval"]; amount_cents: number }) => ({ interval: x.billing_interval, amountCents: x.amount_cents })),
  }));
});

export const getTerritories = cache(async (): Promise<Territory[]> => {
  const fallback: Territory[] = [
    { slug: "vacaville", name: "Vacaville", acceptingNew: true },
    ...["Fairfield", "Suisun City", "Dixon", "Winters", "Davis"].map((name) => ({ slug: name.toLowerCase().replace(/ /g, "-"), name, acceptingNew: false })),
  ];
  const db = getPublicClient();
  if (!db) return fallback;
  const { data, error } = await db.from("service_territories").select("slug,name,accepting_new").order("sort_order");
  if (error || !data?.length) return fallback;
  return data.map((t) => ({ slug: t.slug, name: t.name, acceptingNew: t.accepting_new }));
});

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function isIndexable(): boolean {
  return process.env.NEXT_PUBLIC_SITE_INDEXABLE === "true";
}
