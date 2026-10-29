import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PhotoGrid } from "@/components/job-photos";
import { PrintButton } from "@/components/print-button";
import { Container } from "@/components/ui";
import { getSiteSettings } from "@/lib/site";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadServiceReport } from "@/lib/tech/report";

export const metadata: Metadata = { title: "Service Report", robots: { index: false } };
export const dynamic = "force-dynamic";

const TZ = "America/Los_Angeles";
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export default async function ServiceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  const admin = getAdminClient();
  if (!admin) notFound();

  const job = await loadServiceReport(admin, id);
  // Customers see only their own completed jobs. Staff can view any report.
  if (!job) notFound();
  const { data: me } = await admin.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
  const isStaff = ["owner", "admin"].includes((me as { role?: string } | null)?.role ?? "");
  if (job.booking.customer_id !== session.user.id && !isStaff) notFound();
  if (job.booking.status !== "completed" && !isStaff) notFound();

  const site = await getSiteSettings();
  const { booking: b, property: p, report: r, photos } = job;
  const tech = (Array.isArray(b.technicians) ? b.technicians[0] : b.technicians)?.display_name;

  return (
    <div className="bg-paper print:bg-white">
      <Container className="max-w-3xl py-10 print:py-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/dashboard" className="text-sm font-semibold text-navy underline">← Back to dashboard</Link>
          <PrintButton />
        </div>

        <article className="space-y-6 rounded-2xl border border-line bg-white p-6 sm:p-8 print:border-0 print:p-0">
          <header className="border-b border-line pb-4">
            <p className="text-sm font-semibold text-muted">{site.businessName}</p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">Solar panel cleaning report</h1>
            <p className="mt-1 text-sm text-muted">Ref {String(b.id).slice(0, 8).toUpperCase()}</p>
          </header>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Date</dt><dd className="font-semibold">{dateFmt.format(new Date(b.scheduled_start))}</dd></div>
            <div><dt className="text-muted">Property</dt><dd className="font-semibold">{p ? `${p.address_line1}${p.address_line2 ? `, ${p.address_line2}` : ""}, ${p.city}` : "—"}</dd></div>
            {r?.started_at && r?.completed_at && (
              <div><dt className="text-muted">On site</dt><dd className="font-semibold">{timeFmt.format(new Date(r.started_at))} – {timeFmt.format(new Date(r.completed_at))}</dd></div>
            )}
            {p && <div><dt className="text-muted">Panels</dt><dd className="font-semibold">{p.panel_count}</dd></div>}
            {tech && <div><dt className="text-muted">Technician</dt><dd className="font-semibold">{tech}</dd></div>}
            <div><dt className="text-muted">Safety check</dt><dd className="font-semibold">{r?.checklist_completed_at ? "Completed before work began" : "—"}</dd></div>
          </dl>

          <section>
            <h2 className="mb-2 text-lg font-bold">Service notes</h2>
            <p className="whitespace-pre-line text-sm">{r?.service_notes || "Panels cleaned with purified water and soft brushes."}</p>
          </section>

          {(r?.damage_reported || r?.unsafe_conditions) && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <h2 className="mb-1 font-bold">Items we noticed</h2>
              {r?.damage_reported && <p className="whitespace-pre-line"><strong>Existing damage:</strong> {r.damage_notes || "See the photos below."}</p>}
              {r?.unsafe_conditions && <p className="mt-1 whitespace-pre-line"><strong>Conditions:</strong> {r.unsafe_conditions}</p>}
              <p className="mt-2 text-xs">We clean panels only and don&apos;t repair or diagnose solar equipment. For damage or performance questions, contact your solar installer.</p>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-bold">Photos</h2>
            <PhotoGrid photos={photos} empty="No photos were attached to this visit." />
          </section>

          <footer className="border-t border-line pt-4 text-xs text-muted">
            {[site.businessName, site.phone, site.email].filter(Boolean).join(" · ")}
          </footer>
        </article>
      </Container>
    </div>
  );
}
