"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitQuote, type QuoteFormState } from "@/lib/quote/actions";
import { ACCESS_TYPES, CLEANING_REQUESTS, PREFERRED_WINDOWS, PROPERTY_TYPES, ROOF_TYPES, type FieldErrors } from "@/lib/quote/validate";

const initial: QuoteFormState = { kind: "idle" };

function Field({ label, name, error, hint, children }: { label: string; name: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-semibold text-navy">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${name}-error`} className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

function Select({ name, options, defaultValue, error, required = true }: { name: string; options: Record<string, string>; defaultValue?: string; error?: string; required?: boolean }) {
  return (
    <select id={name} name={name} defaultValue={defaultValue ?? ""} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} className="field">
      <option value="" disabled>Choose…</option>
      {Object.entries(options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function QuoteForm({ defaultCleaning, defaultCity }: { defaultCleaning?: string; defaultCity?: string }) {
  const [state, action, pending] = useActionState(submitQuote, initial);
  const e: FieldErrors = state.kind === "error" ? state.fieldErrors ?? {} : {};

  if (state.kind === "submitted") return <QuoteResult state={state} />;

  const input = (name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={name} name={name} aria-invalid={Boolean(e[name as keyof FieldErrors])} aria-describedby={e[name as keyof FieldErrors] ? `${name}-error` : undefined} className="field" {...props} />
  );

  return (
    <form action={action} className="space-y-10" noValidate={false}>
      {state.kind === "error" && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{state.message}</div>
      )}

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 font-display text-lg font-bold text-navy">1. Your system</legend>
        <Field label="Number of solar panels" name="panelCount" error={e.panelCount} hint="An estimate is fine. You can count rows on a satellite map.">
          {input("panelCount", { type: "number", min: 1, max: 5000, inputMode: "numeric", required: true })}
        </Field>
        <Field label="Property type" name="propertyType" error={e.propertyType}>
          <Select name="propertyType" options={PROPERTY_TYPES} defaultValue="single_family" error={e.propertyType} />
        </Field>
        <Field label="Number of stories" name="stories" error={e.stories}>
          {input("stories", { type: "number", min: 1, max: 10, defaultValue: 1, inputMode: "numeric", required: true })}
        </Field>
        <Field label="Roof type" name="roofType" error={e.roofType}>
          <Select name="roofType" options={ROOF_TYPES} defaultValue="unknown" error={e.roofType} />
        </Field>
        <Field label="How can the panels be reached?" name="accessType" error={e.accessType} hint="If you're not sure, choose “Not sure.” We'll review before quoting.">
          <Select name="accessType" options={ACCESS_TYPES} defaultValue="unsure" error={e.accessType} />
        </Field>
        <Field label="Service you're interested in" name="cleaningRequest" error={e.cleaningRequest}>
          <Select name="cleaningRequest" options={CLEANING_REQUESTS} defaultValue={defaultCleaning ?? "not_sure"} error={e.cleaningRequest} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Access details (optional)" name="accessDetails" hint="Gates, dogs, steep slopes, trees, where the water spigot is, anything we should know.">
            <textarea id="accessDetails" name="accessDetails" rows={3} maxLength={2000} className="field" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Photos (optional, up to 5)" name="photos" hint="A photo of the panels from the ground helps us quote accurately. JPEG, PNG, WebP or HEIC, 8 MB each.">
            <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="field" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 font-display text-lg font-bold text-navy">2. Service address</legend>
        <div className="sm:col-span-2">
          <Field label="Street address" name="addressLine1" error={e.addressLine1}>
            {input("addressLine1", { autoComplete: "address-line1", required: true })}
          </Field>
        </div>
        <Field label="Apt, unit (optional)" name="addressLine2">{input("addressLine2", { autoComplete: "address-line2" })}</Field>
        <Field label="City" name="city" error={e.city}>{input("city", { autoComplete: "address-level2", defaultValue: defaultCity, required: true })}</Field>
        <Field label="State" name="state" error={e.state}>{input("state", { defaultValue: "CA", maxLength: 2, autoComplete: "address-level1", required: true })}</Field>
        <Field label="ZIP code" name="postalCode" error={e.postalCode}>{input("postalCode", { inputMode: "numeric", autoComplete: "postal-code", required: true })}</Field>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 font-display text-lg font-bold text-navy">3. Contact &amp; timing</legend>
        <Field label="First name" name="firstName" error={e.firstName}>{input("firstName", { autoComplete: "given-name", required: true })}</Field>
        <Field label="Last name" name="lastName" error={e.lastName}>{input("lastName", { autoComplete: "family-name", required: true })}</Field>
        <Field label="Email" name="email" error={e.email}>{input("email", { type: "email", autoComplete: "email", required: true })}</Field>
        <Field label="Mobile phone" name="phone" error={e.phone}>{input("phone", { type: "tel", autoComplete: "tel", required: true })}</Field>
        <Field label="Preferred appointment time" name="preferredWindow">
          <Select name="preferredWindow" options={PREFERRED_WINDOWS} defaultValue="flexible" />
        </Field>
        <Field label="Referral code (optional)" name="referralCode">{input("referralCode", { maxLength: 40 })}</Field>

        {/* Honeypot for bots; hidden from people and screen readers. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="company_website">Company website</label>
          <input id="company_website" name="company_website" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="space-y-3 text-sm sm:col-span-2">
          <p className="text-muted">We'll email and text you about this request and any appointment you book. These service messages aren't marketing.</p>
          <label className="flex items-start gap-3"><input type="checkbox" name="marketingEmailOptIn" className="mt-1" /> <span>Also email me occasional seasonal reminders and offers. (Optional)</span></label>
          <label className="flex items-start gap-3"><input type="checkbox" name="marketingSmsOptIn" className="mt-1" /> <span>Also text me occasional reminders and offers. Message and data rates may apply; reply STOP to opt out. (Optional)</span></label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">By submitting, you agree to our <Link href="/legal/privacy" className="underline">Privacy Policy</Link>. Submitting a quote request does not book or charge anything.</p>
        <button type="submit" disabled={pending} className="rounded-full bg-gold px-8 py-3 font-semibold text-navy shadow-sm transition hover:brightness-95 disabled:opacity-60">
          {pending ? "Sending…" : "Get my quote"}
        </button>
      </div>
    </form>
  );
}

function QuoteResult({ state }: { state: Extract<QuoteFormState, { kind: "submitted" }> }) {
  const copy: Record<typeof state.status, { title: string; body: string }> = {
    priced: { title: "Here's your estimate", body: "This estimate is based on the details you entered. We'll confirm everything before your appointment." },
    needs_review: { title: "Thanks — we'll review your property", body: "Some details need a quick look before we can give a price. We'll confirm safe access and reach out with an exact quote, usually within one business day." },
    pricing_unpublished: { title: "Thanks — your request is in", body: "We're finalizing our launch pricing. We'll reach out personally with a quote for your system." },
    out_of_area: { title: "Thanks — you're just outside our area", body: "We don't serve that city yet, but we've saved your request and will let you know if we expand." },
    waitlist: { title: "You're on the list", body: "We're opening that area as our schedule allows. We've saved your request and will contact you as soon as we can serve you." },
  };
  const c = copy[state.status];
  return (
    <div role="status" className="rounded-2xl border border-line bg-paper p-8">
      <h2 className="text-2xl font-bold">{c.title}</h2>
      {state.priceLabel && <p className="mt-4 font-display text-4xl font-extrabold text-navy">{state.priceLabel}</p>}
      <p className="mt-4 max-w-xl text-muted">{c.body}</p>
      <p className="mt-6 text-sm">Reference: <strong className="font-mono">{state.reference}</strong></p>
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-sm text-muted">
          {state.status === "priced"
            ? "Ready to book? Sign in with the same email address to pay securely and track your appointment."
            : "Sign in with the same email address to follow your request and book as soon as your price is ready."}
        </p>
        <Link href="/login" className="mt-3 inline-block rounded-full bg-navy px-6 py-2.5 text-sm font-semibold text-white hover:bg-navy-900">
          {state.status === "priced" ? "Sign in to book" : "Create your account"}
        </Link>
      </div>
    </div>
  );
}
