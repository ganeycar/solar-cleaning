import Link from "next/link";
import type { SiteSettings } from "@/lib/site";
import { ButtonLink, Container, SunMark } from "./ui";

const NAV = [
  { href: "/residential", label: "Residential" },
  { href: "/commercial", label: "Commercial" },
  { href: "/memberships", label: "Memberships" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/service-areas", label: "Service areas" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader({ settings }: { settings: SiteSettings }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/95 text-white backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logoUrl} alt="" className="h-8 w-auto" />
          ) : (
            <SunMark className="h-7 w-7" />
          )}
          <span>{settings.businessName}</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm text-white/80 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-white">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm text-white/80 hover:text-white sm:inline">Log in</Link>
          <ButtonLink href="/quote" className="!px-4 !py-2 text-sm">Get a quote</ButtonLink>
        </div>
      </Container>
      {/* Mobile nav: simple horizontal scroller, no JavaScript needed */}
      <nav aria-label="Main mobile" className="border-t border-white/10 lg:hidden">
        <Container className="flex gap-5 overflow-x-auto py-2.5 text-sm text-white/80 [scrollbar-width:none]">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap hover:text-white">{n.label}</Link>
          ))}
          <Link href="/login" className="whitespace-nowrap hover:text-white sm:hidden">Log in</Link>
        </Container>
      </nav>
    </header>
  );
}

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-charcoal text-white/75">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 font-display text-lg font-extrabold text-white">
            <SunMark className="h-6 w-6" /> {settings.businessName}
          </div>
          <p className="mt-3 max-w-sm text-sm">{settings.tagline}</p>
          <p className="mt-3 text-sm">Based in {settings.headquartersCity}, {settings.headquartersState}.</p>
          {settings.phone && <p className="mt-1 text-sm"><a href={`tel:${settings.phone}`} className="hover:text-white">{settings.phone}</a></p>}
          {settings.email && <p className="mt-1 text-sm"><a href={`mailto:${settings.email}`} className="hover:text-white">{settings.email}</a></p>}
          {settings.licenseInfo && <p className="mt-3 text-xs">{settings.licenseInfo}</p>}
          {settings.insuranceInfo && <p className="mt-1 text-xs">{settings.insuranceInfo}</p>}
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Services</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/residential" className="hover:text-white">Residential cleaning</Link></li>
            <li><Link href="/commercial" className="hover:text-white">Commercial cleaning</Link></li>
            <li><Link href="/memberships" className="hover:text-white">Membership plans</Link></li>
            <li><Link href="/quote" className="hover:text-white">Instant quote</Link></li>
            <li><Link href="/book" className="hover:text-white">Book an appointment</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Company</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/about" className="hover:text-white">About</Link></li>
            <li><Link href="/service-areas" className="hover:text-white">Service areas</Link></li>
            <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
            <li><Link href="/legal/terms" className="hover:text-white">Terms of Service</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-white">Privacy Policy</Link></li>
            <li><Link href="/legal/membership-terms" className="hover:text-white">Membership terms &amp; cancellation</Link></li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="py-5 text-xs text-white/50">© {year} {settings.businessName}. Cleaning services only — we do not perform electrical work, repairs, or installations.</Container>
      </div>
    </footer>
  );
}
