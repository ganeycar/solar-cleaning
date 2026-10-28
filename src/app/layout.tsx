import type { Metadata, Viewport } from "next";
import { Archivo, Source_Sans_3 } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getSiteSettings, isIndexable, siteUrl } from "@/lib/site";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${s.businessName} | Solar Panel Cleaning in ${s.headquartersCity}, CA`, template: `%s | ${s.businessName}` },
    description: s.tagline,
    // Kept out of search results until launch (NEXT_PUBLIC_SITE_INDEXABLE=true).
    robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { type: "website", siteName: s.businessName, locale: "en_US" },
  };
}

export const viewport: Viewport = { themeColor: "#0b1b33", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  const brandVars = `:root{--brand-navy:${settings.colors.navy};--brand-charcoal:${settings.colors.charcoal};--brand-gold:${settings.colors.gold};}`;
  return (
    <html lang="en" className={`${archivo.variable} ${sourceSans.variable}`}>
      <head>
        {/* Colors are validated hex values from business_settings. */}
        <style dangerouslySetInnerHTML={{ __html: brandVars }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        <SiteHeader settings={settings} />
        <main id="main" className="flex-1">{children}</main>
        <SiteFooter settings={settings} />
      </body>
    </html>
  );
}
