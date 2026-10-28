"use client";

import { useActionState } from "react";
import { sendLoginLink, updateProfile, updatePropertyInstructions, type LoginState, type SaveState } from "@/lib/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendLoginLink, { kind: "idle" });

  if (state.kind === "sent") {
    return (
      <div role="status" className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="text-xl font-bold">Check your email</h2>
        <p className="mt-2 text-muted">
          We sent a sign-in link to <strong className="text-navy">{state.email}</strong>. Open it on this device and browser to finish signing in. The link expires in about an hour.
        </p>
        <p className="mt-3 text-sm text-muted">Don&apos;t see it? Check spam, or wait a minute and try again.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.kind === "error" && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.message}</div>}
      <label className="block text-sm font-semibold text-navy">
        Email address
        <input name="email" type="email" required autoComplete="email" className="field mt-1.5 font-normal" />
      </label>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-gold px-6 py-3 font-semibold text-navy shadow-sm transition hover:brightness-95 disabled:opacity-60">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="text-xs text-muted">New here? The same link creates your account. Use the email you gave on your quote and we&apos;ll connect your past requests automatically.</p>
    </form>
  );
}

function SaveMessage({ state }: { state: SaveState }) {
  if (state.kind === "saved") return <p role="status" className="text-sm font-medium text-emerald-700">Saved.</p>;
  if (state.kind === "error") return <p role="alert" className="text-sm font-medium text-red-700">{state.message}</p>;
  return null;
}

export function ProfileForm({ profile }: { profile: { firstName: string; lastName: string; phone: string; email: string; marketingEmail: boolean; marketingSms: boolean } }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(updateProfile, { kind: "idle" });
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold text-navy">First name<input name="firstName" defaultValue={profile.firstName} autoComplete="given-name" className="field mt-1.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-navy">Last name<input name="lastName" defaultValue={profile.lastName} autoComplete="family-name" className="field mt-1.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-navy">Mobile phone<input name="phone" type="tel" defaultValue={profile.phone} autoComplete="tel" className="field mt-1.5 font-normal" /></label>
      <div className="text-sm">
        <span className="block font-semibold text-navy">Email</span>
        <span className="mt-2.5 block text-muted">{profile.email}</span>
      </div>
      <fieldset className="space-y-2 text-sm sm:col-span-2">
        <legend className="mb-1 font-semibold text-navy">Optional marketing messages</legend>
        <p className="text-xs text-muted">Appointment confirmations, reminders and receipts are always sent. These settings only control promotional messages.</p>
        <label className="flex items-start gap-3"><input type="checkbox" name="marketingEmailOptIn" defaultChecked={profile.marketingEmail} className="mt-1" /> Seasonal reminders and offers by email</label>
        <label className="flex items-start gap-3"><input type="checkbox" name="marketingSmsOptIn" defaultChecked={profile.marketingSms} className="mt-1" /> Seasonal reminders and offers by text</label>
      </fieldset>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-full bg-navy px-6 py-2.5 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60">{pending ? "Saving…" : "Save details"}</button>
        <SaveMessage state={state} />
      </div>
    </form>
  );
}

export function InstructionsForm({ propertyId, value }: { propertyId: string; value: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(updatePropertyInstructions, { kind: "idle" });
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <label className="block text-sm font-semibold text-navy">
        Instructions for our technician
        <textarea name="technicianInstructions" defaultValue={value} rows={3} maxLength={2000} placeholder="Gate access, pets, where the outdoor spigot is…" className="field mt-1.5 font-normal" />
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-full border border-navy px-5 py-2 text-sm font-semibold text-navy hover:bg-paper disabled:opacity-60">{pending ? "Saving…" : "Save instructions"}</button>
        <SaveMessage state={state} />
      </div>
    </form>
  );
}
