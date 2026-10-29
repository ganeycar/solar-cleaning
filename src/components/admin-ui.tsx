import type { ReactNode } from "react";

/** Shows ?msg= / ?error= feedback from owner actions. */
export function Feedback({ msg, error }: { msg?: string; error?: string }) {
  if (error) return <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  if (msg) return <div role="status" className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{msg}</div>;
  return null;
}

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-navy">
      {label}
      <span className="mt-1.5 block font-normal">{children}</span>
      {hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function DollarInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
      <input inputMode="decimal" className="field !pl-7" {...props} />
    </span>
  );
}

export const btn = {
  primary: "rounded-full bg-gold px-5 py-2 text-sm font-semibold text-navy shadow-sm hover:brightness-95",
  dark: "rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-navy-900",
  outline: "rounded-full border border-navy px-5 py-2 text-sm font-semibold text-navy hover:bg-paper",
  danger: "rounded-full border border-red-300 px-5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50",
};
