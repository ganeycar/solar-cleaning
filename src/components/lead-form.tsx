"use client";

import { useActionState } from "react";
import { submitLead, type LeadFormState } from "@/lib/leads/actions";

type Kind = "contact" | "commercial" | "neighborhood_group" | "installer_partner";

export function LeadForm({ kind = "contact", showCompany = false, showPanels = false, submitLabel = "Send message" }: { kind?: Kind; showCompany?: boolean; showPanels?: boolean; submitLabel?: string }) {
  const [state, action, pending] = useActionState<LeadFormState, FormData>(submitLead, { kind: "idle" });

  if (state.kind === "sent") {
    return <div role="status" className="rounded-2xl border border-line bg-paper p-6"><h3 className="text-lg font-bold">Thanks — we got your message.</h3><p className="mt-2 text-muted">We'll get back to you soon.</p></div>;
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="kind" value={kind} />
      {state.kind === "error" && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{state.message}</div>}
      <label className="block text-sm font-semibold text-navy">Name<input name="name" required autoComplete="name" className="field mt-1.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-navy">Email<input name="email" type="email" required autoComplete="email" className="field mt-1.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-navy">Phone (optional)<input name="phone" type="tel" autoComplete="tel" className="field mt-1.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-navy">City<input name="city" autoComplete="address-level2" className="field mt-1.5 font-normal" /></label>
      {showCompany && <label className="block text-sm font-semibold text-navy">Company / organization<input name="company" autoComplete="organization" className="field mt-1.5 font-normal" /></label>}
      {showPanels && <label className="block text-sm font-semibold text-navy">Approximate panel count<input name="panelEstimate" type="number" min={1} className="field mt-1.5 font-normal" /></label>}
      <label className="block text-sm font-semibold text-navy sm:col-span-2">Message<textarea name="message" required rows={5} maxLength={4000} className="field mt-1.5 font-normal" /></label>
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <input name="company_website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-full bg-navy px-7 py-3 font-semibold text-white transition hover:bg-navy-900 disabled:opacity-60">{pending ? "Sending…" : submitLabel}</button>
      </div>
    </form>
  );
}
