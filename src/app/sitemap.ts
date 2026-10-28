import type { MetadataRoute } from "next";
import { CITIES } from "@/content/cities";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const pages = ["", "/residential", "/commercial", "/memberships", "/quote", "/book", "/how-it-works", "/service-areas", "/faq", "/contact", "/about", "/legal/terms", "/legal/privacy", "/legal/membership-terms"];
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.7 })),
    ...CITIES.map((c) => ({ url: `${base}/service-areas/${c.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
