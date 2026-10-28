import Link from "next/link";
import type { ReactNode } from "react";

type ButtonProps = { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string };

export function ButtonLink({ href, children, variant = "primary", className = "" }: ButtonProps) {
  const styles = {
    primary: "bg-gold text-navy hover:brightness-95 shadow-sm",
    secondary: "bg-navy text-white hover:bg-navy-900",
    ghost: "border border-white/40 text-white hover:bg-white/10",
  }[variant];
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold transition ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Section({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`py-16 sm:py-24 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-gold">{children}</p>;
}

export function PageHero({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-navy text-white">
      <PanelGrid className="absolute -right-24 -top-10 h-[420px] w-[620px] opacity-[0.16]" />
      <Container className="relative py-16 sm:py-20">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="max-w-3xl text-4xl font-extrabold text-white sm:text-5xl">{title}</h1>
        {intro && <p className="mt-5 max-w-2xl text-lg text-white/80">{intro}</p>}
        {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
      </Container>
    </section>
  );
}

/** Decorative solar array pattern (pure SVG, no images to load). */
export function PanelGrid({ className = "" }: { className?: string }) {
  const cells = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) cells.push(<rect key={`${r}-${c}`} x={c * 68} y={r * 70} width="62" height="64" rx="3" />);
  return (
    <svg aria-hidden="true" viewBox="0 0 612 420" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <g transform="skewX(-18) translate(120 0)">{cells}</g>
    </svg>
  );
}

export function SunMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={className}>
      <circle cx="16" cy="16" r="7" fill="var(--color-gold)" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x="15" y="1.5" width="2" height="5" rx="1" fill="var(--color-gold)" transform={`rotate(${i * 45} 16 16)`} />
      ))}
    </svg>
  );
}

/**
 * Placeholder for real photography. Replace by dropping your own photo into
 * /public/images and passing `src`. We never use stock photos of other
 * companies' work as if it were ours.
 */
export function PhotoSlot({ src, alt, label, className = "" }: { src?: string; alt: string; label: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={`h-full w-full rounded-2xl object-cover ${className}`} loading="lazy" />;
  }
  return (
    <div role="img" aria-label={alt} className={`relative flex items-end overflow-hidden rounded-2xl bg-gradient-to-br from-navy via-navy-900 to-charcoal ${className}`}>
      <PanelGrid className="absolute inset-0 h-full w-full text-white opacity-20" />
      <div className="absolute right-6 top-6 h-16 w-16 rounded-full bg-gold/80 blur-[2px]" />
      <span className="relative m-4 rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white/80">Photo: {label}</span>
    </div>
  );
}

export function DraftNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <strong className="font-semibold">Draft template — not legal advice.</strong> {children}
    </div>
  );
}

export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1 h-4 w-4 flex-none text-gold"><path fill="currentColor" d="M7.6 13.6 4 10l-1.4 1.4 5 5 10-10L16.2 5z" /></svg>
      <span>{children}</span>
    </li>
  );
}
