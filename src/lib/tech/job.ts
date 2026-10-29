/** Technician job helpers. Pure and unit-tested. */

export const SAFETY_CHECKLIST = [
  { id: "weather", label: "Weather is safe: no rain, no high wind, no extreme heat" },
  { id: "access", label: "Panels can be reached safely from the ground or with the approved access method" },
  { id: "no_damage", label: "No visible cracked glass, loose panels, or exposed wiring" },
  { id: "area_clear", label: "Work area is clear of people, pets, and vehicles" },
  { id: "water", label: "Purified water and soft brushes are ready (no chemicals, no pressure washer)" },
] as const;

export type ChecklistId = (typeof SAFETY_CHECKLIST)[number]["id"];

export function readChecklist(get: (k: string) => string | null): Record<ChecklistId, boolean> {
  const out = {} as Record<ChecklistId, boolean>;
  for (const item of SAFETY_CHECKLIST) out[item.id] = get(`check_${item.id}`) === "on";
  return out;
}

export function checklistComplete(values: Partial<Record<string, boolean>> | null | undefined): boolean {
  return SAFETY_CHECKLIST.every((i) => values?.[i.id] === true);
}

export interface JobProperty {
  stories: number;
  panelCount: number;
  accessType: string;
  roofType: string;
}

/** What to bring, based on the property. */
export function requiredEquipment(p: JobProperty): string[] {
  const list = ["Purified (deionized) water supply", "Soft-bristle brush head", "Hose and outdoor spigot adapter", "Camera for before-and-after photos"];
  if (p.stories <= 1) list.unshift("Water-fed pole, about 15–20 ft");
  else if (p.stories === 2) list.unshift("Water-fed pole, about 30–35 ft");
  else list.unshift(`Water-fed pole for ${p.stories} stories (confirm reach before the visit)`);
  if (p.accessType === "ladder_required") list.push("Ladder and ladder stabilizer (follow ladder safety rules)");
  if (p.roofType === "tile") list.push("Do not walk on tile roofs; ground-based cleaning only");
  if (p.panelCount > 40) list.push("Extra purified water for a large array");
  return list;
}

/** A job can be completed only with at least one before photo and one after photo. */
export function canComplete(photoKinds: string[]): { ok: true } | { ok: false; reason: string } {
  if (!photoKinds.includes("before")) return { ok: false, reason: "Add at least one before photo." };
  if (!photoKinds.includes("after")) return { ok: false, reason: "Add at least one after photo." };
  return { ok: true };
}

export function mapsLink(address: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
}
