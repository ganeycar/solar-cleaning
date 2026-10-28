import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingConfig, TravelZone } from "./engine.ts";

/**
 * Loads the active pricing configuration. Territories (cities, travel fees,
 * "accepting new customers") come from the service_territories table so they
 * are managed in one place. If no rules are published, the latest draft is
 * used for review logic but forced to unpublished, so no price is ever shown.
 */
export async function loadPricingConfig(db: SupabaseClient): Promise<PricingConfig | null> {
  const [{ data: published }, { data: territories }] = await Promise.all([
    db.from("pricing_rules").select("version,config").eq("status", "published").maybeSingle(),
    db.from("service_territories").select("id,name,cities,travel_fee_cents,accepting_new").eq("is_active", true),
  ]);

  let row = published;
  let isPublished = Boolean(published);
  if (!row) {
    const { data: draft } = await db.from("pricing_rules").select("version,config").eq("status", "draft").order("version", { ascending: false }).limit(1).maybeSingle();
    row = draft;
    isPublished = false;
  }
  if (!row) return null;

  const zones: TravelZone[] = (territories ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    cities: t.cities ?? [],
    travelFeeCents: t.travel_fee_cents ?? 0,
    acceptingNew: Boolean(t.accepting_new),
  }));

  return { ...(row.config as PricingConfig), version: row.version, published: isPublished, zones };
}
