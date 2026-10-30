import { dollarsToCents } from "../money.ts";
import { normalizePhone } from "../quote/validate.ts";

/** Owner-editable business settings form. Pure; unit-tested. */

export interface BusinessSettingsInput {
  business_name: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  headquarters_city: string;
  logo_url: string | null;
  brand_colors: { navy: string; charcoal: string; gold: string };
  license_info: string | null;
  license_verified: boolean;
  insurance_info: string | null;
  insurance_verified: boolean;
  profile_links: string[];
  economics: { costPerCleaningCents: number };
  review_url: string | null;
  mailing_address: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function httpsUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type BusinessParse = { ok: true; value: BusinessSettingsInput } | { ok: false; errors: string[] };

export function parseBusinessSettings(get: (k: string) => string | null): BusinessParse {
  const errors: string[] = [];
  const t = (k: string, max: number) => (get(k) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

  const business_name = t("businessName", 80);
  if (!business_name) errors.push("Business name can't be empty.");

  const phoneRaw = t("phone", 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) errors.push("Phone must be a 10-digit US number.");

  const email = t("email", 254).toLowerCase() || null;
  if (email && !EMAIL.test(email)) errors.push("Enter a valid email address.");

  const logoRaw = t("logoUrl", 500);
  const logo_url = logoRaw ? httpsUrl(logoRaw) : null;
  if (logoRaw && !logo_url) errors.push("Logo link must start with https://");

  const colors = { navy: t("colorNavy", 7), charcoal: t("colorCharcoal", 7), gold: t("colorGold", 7) };
  for (const [k, v] of Object.entries(colors)) if (!HEX.test(v)) errors.push(`Color "${k}" must look like #0b1b33.`);

  const links = t("profileLinks", 3000).split(/\s+/).filter(Boolean).slice(0, 12);
  const profile_links: string[] = [];
  for (const l of links) {
    const u = httpsUrl(l);
    if (u) profile_links.push(u);
    else errors.push(`Profile link isn't a valid https:// address: ${l.slice(0, 60)}`);
  }

  const license_info = t("licenseInfo", 300) || null;
  const insurance_info = t("insuranceInfo", 300) || null;
  const license_verified = get("licenseVerified") === "on" && Boolean(license_info);
  const insurance_verified = get("insuranceVerified") === "on" && Boolean(insurance_info);

  const reviewRaw = t("reviewUrl", 500);
  const review_url = reviewRaw ? httpsUrl(reviewRaw) : null;
  if (reviewRaw && !review_url) errors.push("Review link must start with https://");
  const mailing_address = t("mailingAddress", 200) || null;

  const costRaw = t("costPerCleaning", 20);
  const cost = costRaw ? dollarsToCents(costRaw, { allowZero: true, max: 10_000 }) : 0;
  if (cost == null) errors.push("Cost per cleaning must be a dollar amount.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      business_name,
      tagline: t("tagline", 200) || null,
      phone,
      email,
      headquarters_city: t("headquartersCity", 80) || "Vacaville",
      logo_url,
      brand_colors: colors,
      license_info,
      license_verified,
      insurance_info,
      insurance_verified,
      profile_links,
      economics: { costPerCleaningCents: cost ?? 0 },
      review_url,
      mailing_address,
    },
  };
}
