import Link from "next/link";
import { btn, DollarInput, Feedback } from "@/components/admin-ui";
import { approveQuote, declineQuote, retryFailedStripeEvents } from "@/lib/admin/actions";
import { requireStaff } from "@/lib/auth/staff";
import { centsToInput } from "@/lib/money";
import { formatCents } from "@/lib/pricing/engine";
import { ACCESS_TYPES, CLEANING_REQUESTS, PREFERRED_WINDOWS, PROPERTY_TYPES, ROOF_TYPES } from "@/lib/quote/validate";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const FILTERS: Record<string, { label: string; statuses: string[] | null }> = {
  open: { label: "Needs action", statuses: ["new", "needs_review"] },
  quoted: { label: "Quoted", statuses: ["quoted"] },
  booked: { label: "Booked", statuses: ["converted"] },
  waitlist: { label: "Waitlist & outside area", statuses: ["waitlist", "out_of_area"] },
  all: { label: "All", statuses: null },
};

const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const label = (map: Record<string, string>, v: string) => map[v] ?? v;

export default async function AdminQuotesPage({ searchParams }: { searchParams: Promise<{ filter?: string; msg?: string; error?: string }> }) {
  const { supabase } = await requireStaff();
  const { filter = "open", msg, error } = await searchParams;
  const active = FILTERS[filter] ?? FILTERS.open;

  let query = supabase.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (active.statuses) query = query.in("status", active.statuses);
  const { data } = await query;
  const quotes = (data ?? []) as Row[];

  const admin0 = getAdminClient();
  const { data: failedEvents } = admin0
    ? await admin0.from("stripe_events").select("id, type, error").is("processed_at", null).order("received_at", { ascending: false }).limit(25)
    : { data: [] as { id: string; type: string; error: string | null }[] };

  // Private photos are shown through short-lived signed links.
  const photoUrls = new Map<string, string>();
  const allPaths = quotes.flatMap((q) => (q.photo_paths ?? []) as string[]);
  const admin = getAdminClient();
  if (admin && allPaths.length) {
    const { data: signed } = await admin.storage.from("quote-photos").createSignedUrls(allPaths, 60 * 15);
    for (const s of signed ?? []) if (s.path && s.signedUrl) photoUrls.set(s.path, s.signedUrl);
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Quote requests</h1>
      <p className="mt-1 text-sm text-muted">Approve a price to let the customer book and pay online. Customers aren&apos;t emailed automatically yet, so contact them when you approve.</p>
      <nav aria-label="Filter" className="my-6 flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([key, f]) => (
          <Link key={key} href={`/admin/quotes?filter=${key}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${key === filter || (!FILTERS[filter] && key === "open") ? "bg-navy text-white" : "border border-line bg-white text-navy"}`}>{f.label}</Link>
        ))}
      </nav>
      <Feedback msg={msg} error={error} />
      {(failedEvents ?? []).length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span><strong>{(failedEvents ?? []).length} payment confirmation{(failedEvents ?? []).length === 1 ? "" : "s"} from Stripe didn&apos;t finish processing.</strong> The customer was charged, so retry these.</span>
            <form action={retryFailedStripeEvents}><button className={btn.primary}>Retry now</button></form>
          </div>
          <ul className="mt-2 list-disc pl-5 text-xs">
            {(failedEvents ?? []).slice(0, 5).map((e) => <li key={e.id}>{e.type}: {e.error ?? "not processed yet"}</li>)}
          </ul>
        </div>
      )}

      {quotes.length === 0 && <p className="rounded-2xl border border-line bg-white p-6 text-muted">Nothing here right now.</p>}

      <div className="space-y-4">
        {quotes.map((q) => {
          const estimate: number | null = q.engine_result?.internalEstimateCents ?? null;
          const canAct = q.status !== "converted";
          return (
            <article key={q.id} className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{q.first_name} {q.last_name} · {q.panel_count} panels</h2>
                  <p className="text-sm text-muted">
                    {q.address_line1}{q.address_line2 ? `, ${q.address_line2}` : ""}, {q.city} {q.postal_code} · {dateFmt.format(new Date(q.created_at))} · Ref {String(q.id).slice(0, 8).toUpperCase()}
                  </p>
                  <p className="text-sm"><a href={`mailto:${q.email}`} className="underline">{q.email}</a> · <a href={`tel:${q.phone}`} className="underline">{q.phone}</a>{q.customer_id ? " · has an account" : ""}</p>
                </div>
                <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">{q.status.replace("_", " ")}</span>
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div><dt className="text-muted">Service</dt><dd>{label(CLEANING_REQUESTS, q.cleaning_request)}</dd></div>
                <div><dt className="text-muted">Property</dt><dd>{label(PROPERTY_TYPES, q.property_type)}, {q.stories} {q.stories === 1 ? "story" : "stories"}</dd></div>
                <div><dt className="text-muted">Roof</dt><dd>{label(ROOF_TYPES, q.roof_type)}</dd></div>
                <div><dt className="text-muted">Access</dt><dd>{label(ACCESS_TYPES, q.access_type)}</dd></div>
                <div><dt className="text-muted">Preferred time</dt><dd>{label(PREFERRED_WINDOWS, q.preferred_window)}</dd></div>
                <div><dt className="text-muted">Engine estimate</dt><dd>{estimate != null && estimate > 0 ? formatCents(estimate) : "No pricing set"}</dd></div>
              </dl>
              {q.access_details && <p className="mt-3 rounded-lg bg-paper p-3 text-sm"><strong>Customer notes:</strong> {q.access_details}</p>}
              {q.review_reasons?.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-sm text-amber-900">{q.review_reasons.map((r: string) => <li key={r}>{r}</li>)}</ul>
              )}
              {(q.photo_paths ?? []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {(q.photo_paths as string[]).map((p) =>
                    photoUrls.get(p) ? (
                      <a key={p} href={photoUrls.get(p)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrls.get(p)} alt="Customer photo" className="h-24 w-24 rounded-lg object-cover" />
                      </a>
                    ) : null,
                  )}
                </div>
              )}

              {canAct ? (
                <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                  <form action={approveQuote.bind(null, q.id)} className="flex flex-wrap items-end gap-3">
                    <label className="text-sm font-semibold text-navy">
                      Price for this job
                      <span className="mt-1 block w-36"><DollarInput name="price" required defaultValue={centsToInput(q.approved_price_cents ?? (estimate && estimate > 0 ? estimate : null))} /></span>
                    </label>
                    <button type="submit" className={btn.primary}>{q.status === "quoted" ? "Update price" : "Approve & send price"}</button>
                  </form>
                  {q.status !== "declined" && (
                    <form action={declineQuote.bind(null, q.id)}>
                      <button type="submit" className={btn.danger}>Decline</button>
                    </form>
                  )}
                </div>
              ) : (
                <p className="mt-4 border-t border-line pt-4 text-sm text-muted">Booked{q.approved_price_cents != null ? ` at ${formatCents(q.approved_price_cents)}` : ""}.</p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
