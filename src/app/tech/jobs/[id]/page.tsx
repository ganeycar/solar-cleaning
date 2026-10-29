import Link from "next/link";
import { notFound } from "next/navigation";
import { Feedback } from "@/components/admin-ui";
import { PhotoGrid } from "@/components/job-photos";
import { PhotoInput } from "@/components/photo-input";
import { assignedBooking, requireTechnician } from "@/lib/auth/technician";
import { ACCESS_TYPES, ROOF_TYPES } from "@/lib/quote/validate";
import { completeJob, reportNoAccess, saveJobNotes, startJob, stopUnsafe, uploadJobPhotos } from "@/lib/tech/actions";
import { canComplete, checklistComplete, mapsLink, requiredEquipment, SAFETY_CHECKLIST } from "@/lib/tech/job";
import { loadServiceReport } from "@/lib/tech/report";

const TZ = "America/Los_Angeles";
const whenFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

const big = "w-full rounded-2xl px-5 py-4 text-base font-bold";
const OPEN = ["requested", "confirmed", "rescheduled"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h2 className="mb-3 text-base font-bold text-navy">{title}</h2>
      {children}
    </section>
  );
}

export default async function TechJob({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { id } = await params;
  const { msg, error } = await searchParams;
  const { admin, tech } = await requireTechnician();
  if (!(await assignedBooking(admin, tech.id, id))) notFound();
  const job = await loadServiceReport(admin, id, { includeContact: true });
  if (!job) notFound();

  const { booking: b, property: p, customer: c, report: r, photos } = job;
  const address = p ? [p.address_line1, p.address_line2, `${p.city}, CA ${p.postal_code}`].filter(Boolean).join(", ") : "";
  const phone = c?.phone ? String(c.phone) : null;
  const status: string = b.status;
  const isOpen = OPEN.includes(status);
  const working = status === "in_progress";
  const done = status === "completed";
  const completeCheck = canComplete(photos.map((x) => x.kind));
  const equipment = p ? requiredEquipment({ stories: p.stories, panelCount: p.panel_count, accessType: p.access_type, roofType: p.roof_type }) : [];
  const startedChecklist = checklistComplete(r?.safety_checklist);

  return (
    <div className="space-y-4">
      <Link href="/tech" className="text-sm font-semibold text-navy underline">← All jobs</Link>
      <Feedback msg={msg} error={error} />

      <Section title={`${whenFmt.format(new Date(b.scheduled_start))} – ${timeFmt.format(new Date(b.scheduled_end))}`}>
        <p className="text-lg font-semibold">{address}</p>
        {c && <p className="text-sm text-muted">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "Customer"}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={mapsLink(address)} target="_blank" rel="noopener noreferrer" className={`${big} bg-navy text-center text-white`}>Directions</a>
          {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={`${big} border-2 border-navy text-center text-navy`}>Call</a> : <span className={`${big} border border-line text-center text-muted`}>No phone</span>}
        </div>
        {p && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Panels</dt><dd className="font-semibold">{p.panel_count}</dd>
            <dt className="text-muted">Stories</dt><dd className="font-semibold">{p.stories}</dd>
            <dt className="text-muted">Roof</dt><dd className="font-semibold">{ROOF_TYPES[p.roof_type as keyof typeof ROOF_TYPES] ?? p.roof_type}</dd>
            <dt className="text-muted">Access</dt><dd className="font-semibold">{ACCESS_TYPES[p.access_type as keyof typeof ACCESS_TYPES] ?? p.access_type}</dd>
          </dl>
        )}
      </Section>

      {(p?.technician_instructions || b.customer_notes) && (
        <Section title="Customer notes">
          {p?.technician_instructions && <p className="whitespace-pre-line text-sm"><strong>Property:</strong> {p.technician_instructions}</p>}
          {b.customer_notes && <p className="mt-2 whitespace-pre-line text-sm"><strong>This visit:</strong> {b.customer_notes}</p>}
        </Section>
      )}

      <Section title="Bring">
        <ul className="list-disc space-y-1 pl-5 text-sm">{equipment.map((e) => <li key={e}>{e}</li>)}</ul>
      </Section>

      {isOpen && (
        <Section title="1. Safety check">
          <form action={startJob.bind(null, b.id)} className="space-y-3">
            {SAFETY_CHECKLIST.map((item) => (
              <label key={item.id} className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" name={`check_${item.id}`} required className="mt-0.5 h-6 w-6 flex-none" />
                <span>{item.label}</span>
              </label>
            ))}
            <button className={`${big} bg-gold text-navy`}>Start job</button>
          </form>
        </Section>
      )}

      {(working || done) && (
        <>
          {startedChecklist && working && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Safety check done. Job in progress.</p>}
          <Section title={done ? "Photos" : "2. Photos"}>
            <PhotoGrid photos={photos} empty="Take before photos now, then after photos when you're done." />
            <form action={uploadJobPhotos.bind(null, b.id)} className="mt-4 space-y-3 border-t border-line pt-4">
              <fieldset className="grid grid-cols-3 gap-2 text-sm font-semibold">
                <legend className="sr-only">Photo type</legend>
                {([["before", "Before"], ["after", "After"], ["damage", "Issue"]] as const).map(([v, l], i) => (
                  <label key={v} className="flex items-center justify-center gap-2 rounded-xl border border-line p-3 has-[:checked]:border-navy has-[:checked]:bg-paper">
                    <input type="radio" name="kind" value={v} defaultChecked={i === (photos.some((x) => x.kind === "before") ? 1 : 0)} required /> {l}
                  </label>
                ))}
              </fieldset>
              <PhotoInput name="photos" accept="image/*" capture="environment" multiple required className="block w-full text-sm" />
              <p className="text-xs text-muted">Up to 10 at a time. Photos are resized on your phone before upload.</p>
              <input name="caption" placeholder="Caption (optional), e.g. cracked panel, back row" className="field" maxLength={300} />
              <button className={`${big} bg-navy text-white`}>Upload photos</button>
            </form>
          </Section>

          <Section title={done ? "Notes" : "3. Notes"}>
            <form action={saveJobNotes.bind(null, b.id)} className="space-y-3 text-sm">
              <label className="block font-semibold">What you did (the customer sees this)
                <textarea name="serviceNotes" rows={3} defaultValue={r?.service_notes ?? ""} className="field mt-1" />
              </label>
              <label className="flex items-center gap-3 font-semibold"><input type="checkbox" name="damageReported" defaultChecked={r?.damage_reported} className="h-5 w-5" /> I found existing damage</label>
              <label className="block font-semibold">Describe the damage (add an Issue photo)
                <textarea name="damageNotes" rows={2} defaultValue={r?.damage_notes ?? ""} className="field mt-1" />
              </label>
              <label className="block font-semibold">Unsafe conditions noticed
                <textarea name="unsafeConditions" rows={2} defaultValue={r?.unsafe_conditions ?? ""} className="field mt-1" />
              </label>
              <button className={`${big} border-2 border-navy text-navy`}>Save notes</button>
            </form>
          </Section>
        </>
      )}

      {working && (
        <Section title="4. Finish">
          {!completeCheck.ok && <p className="mb-3 text-sm text-amber-900">{completeCheck.reason}</p>}
          <form action={completeJob.bind(null, b.id)}>
            <button className={`${big} ${completeCheck.ok ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-500"}`}>Complete job</button>
          </form>
        </Section>
      )}

      {done && <p className="rounded-xl bg-emerald-50 p-4 text-center font-semibold text-emerald-900">Job complete. Thank you!</p>}
      {(status === "no_access" || status === "canceled") && <p className="rounded-xl bg-gray-100 p-4 text-sm">This job is closed{b.cancel_reason ? `: ${b.cancel_reason}` : "."}</p>}

      {(isOpen || working) && (
        <details className="rounded-2xl border border-red-200 bg-white p-4">
          <summary className="cursor-pointer text-base font-bold text-red-700">Can&apos;t do this job?</summary>
          <form action={stopUnsafe.bind(null, b.id)} className="mt-4 space-y-2">
            <label className="block text-sm font-semibold">Stop: unsafe (weather, roof, damage). The customer keeps their cleaning.
              <input name="reason" required maxLength={300} placeholder="What's unsafe?" className="field mt-1" />
            </label>
            <button className={`${big} border-2 border-red-300 text-red-700`}>Stop for safety</button>
          </form>
          <form action={reportNoAccess.bind(null, b.id)} className="mt-6 space-y-2 border-t border-line pt-4">
            <label className="block text-sm font-semibold">No access (locked gate, no one home, no water). This uses the customer&apos;s cleaning.
              <input name="reason" maxLength={300} placeholder="What happened?" className="field mt-1" />
            </label>
            <button className={`${big} border-2 border-red-300 text-red-700`}>Record no access</button>
          </form>
        </details>
      )}
    </div>
  );
}
