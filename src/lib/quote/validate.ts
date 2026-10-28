/**
 * Server-side validation for quote requests. Dependency-free so it can be unit
 * tested directly. Never trust browser-side validation alone.
 */
import type { AccessType, CleaningRequest, PropertyType, RoofType } from "../pricing/engine.ts";

export const PROPERTY_TYPES: Record<PropertyType, string> = {
  single_family: "Single-family home",
  townhome: "Townhome / duplex",
  multi_family: "Multi-family building",
  commercial: "Commercial / agricultural",
  ground_mount: "Ground-mounted array",
  other: "Other",
};
export const ROOF_TYPES: Record<RoofType, string> = {
  composition_shingle: "Composition shingle",
  tile: "Tile (clay or concrete)",
  metal: "Metal",
  flat: "Flat / low-slope",
  ground_mount: "Ground mount (no roof)",
  other: "Other",
  unknown: "Not sure",
};
export const ACCESS_TYPES: Record<AccessType, string> = {
  ground_reachable: "Panels can be reached from the ground",
  ladder_required: "A ladder is probably needed",
  roof_access_required: "Someone would need to walk on the roof",
  unsure: "Not sure",
};
export const CLEANING_REQUESTS: Record<CleaningRequest, string> = {
  one_time: "One-time cleaning",
  seasonal: "Seasonal Care membership",
  premium: "Premium Care membership",
  unlimited: "Unlimited Care membership",
  commercial: "Commercial service",
  not_sure: "Not sure yet",
};
export const PREFERRED_WINDOWS = {
  weekday_morning: "Weekday morning",
  weekday_afternoon: "Weekday afternoon",
  saturday: "Saturday",
  flexible: "Flexible",
} as const;
export type PreferredWindow = keyof typeof PREFERRED_WINDOWS;

export interface QuoteRequestData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  panelCount: number;
  propertyType: PropertyType;
  stories: number;
  roofType: RoofType;
  accessType: AccessType;
  accessDetails: string;
  cleaningRequest: CleaningRequest;
  preferredWindow: PreferredWindow;
  marketingEmailOptIn: boolean;
  marketingSmsOptIn: boolean;
  referralCode: string;
}

export type FieldErrors = Partial<Record<keyof QuoteRequestData | "form", string>>;
export type ValidationResult = { ok: true; data: QuoteRequestData } | { ok: false; errors: FieldErrors };

type Getter = (name: string) => string | null;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function clean(v: string | null, max: number): string {
  return (v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function oneOf<T extends string>(v: string, options: Record<T, string>): T | null {
  return Object.prototype.hasOwnProperty.call(options, v) ? (v as T) : null;
}

/** Normalizes US phone numbers to E.164 (+1XXXXXXXXXX). Returns null if invalid. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d)) return null;
  return `+1${d}`;
}

export function validateQuoteRequest(get: Getter): ValidationResult {
  const errors: FieldErrors = {};

  // Honeypot: real visitors never fill this hidden field.
  if (clean(get("company_website"), 200) !== "") return { ok: false, errors: { form: "Submission rejected." } };

  const firstName = clean(get("firstName"), 80);
  const lastName = clean(get("lastName"), 80);
  const email = clean(get("email"), 254).toLowerCase();
  const phoneRaw = clean(get("phone"), 40);
  const addressLine1 = clean(get("addressLine1"), 200);
  const addressLine2 = clean(get("addressLine2"), 200);
  const city = clean(get("city"), 80);
  const state = clean(get("state"), 2).toUpperCase() || "CA";
  const postalCode = clean(get("postalCode"), 10);
  const accessDetails = clean(get("accessDetails"), 2000);
  const referralCode = clean(get("referralCode"), 40);

  if (!firstName) errors.firstName = "Please enter your first name.";
  if (!lastName) errors.lastName = "Please enter your last name.";
  if (!EMAIL_RE.test(email)) errors.email = "Please enter a valid email address.";
  const phone = normalizePhone(phoneRaw);
  if (!phone) errors.phone = "Please enter a valid 10-digit mobile number.";
  if (addressLine1.length < 4) errors.addressLine1 = "Please enter the service street address.";
  if (!city) errors.city = "Please enter the city.";
  if (state !== "CA") errors.state = "We currently serve California addresses only.";
  if (!/^\d{5}(-\d{4})?$/.test(postalCode)) errors.postalCode = "Please enter a valid ZIP code.";

  const panelCount = Number(clean(get("panelCount"), 6));
  if (!Number.isInteger(panelCount) || panelCount < 1 || panelCount > 5000) errors.panelCount = "Enter the number of panels (an estimate is fine).";

  const stories = Number(clean(get("stories"), 2));
  if (!Number.isInteger(stories) || stories < 1 || stories > 10) errors.stories = "Enter the number of stories.";

  const propertyType = oneOf(clean(get("propertyType"), 40), PROPERTY_TYPES);
  if (!propertyType) errors.propertyType = "Choose a property type.";
  const roofType = oneOf(clean(get("roofType"), 40) || "unknown", ROOF_TYPES);
  if (!roofType) errors.roofType = "Choose a roof type, or “Not sure.”";
  const accessType = oneOf(clean(get("accessType"), 40) || "unsure", ACCESS_TYPES);
  if (!accessType) errors.accessType = "Choose how the panels can be reached.";
  const cleaningRequest = oneOf(clean(get("cleaningRequest"), 40) || "not_sure", CLEANING_REQUESTS);
  if (!cleaningRequest) errors.cleaningRequest = "Choose a service.";
  const preferredWindow = oneOf(clean(get("preferredWindow"), 40) || "flexible", PREFERRED_WINDOWS);
  if (!preferredWindow) errors.preferredWindow = "Choose a preferred time.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      firstName, lastName, email, phone: phone!, addressLine1, addressLine2, city, state, postalCode,
      panelCount, stories, propertyType: propertyType!, roofType: roofType!, accessType: accessType!,
      accessDetails, cleaningRequest: cleaningRequest!, preferredWindow: preferredWindow!,
      marketingEmailOptIn: get("marketingEmailOptIn") === "on",
      marketingSmsOptIn: get("marketingSmsOptIn") === "on",
      referralCode,
    },
  };
}

// ---- Photo uploads ----

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Detects the real image type from file bytes; the browser-supplied type is not trusted. */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1", "heif"].includes(ascii(8, 12))) return "image/heic";
  return null;
}

export const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
