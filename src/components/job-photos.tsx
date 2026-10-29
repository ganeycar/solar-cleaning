import type { JobPhoto } from "@/lib/tech/report";

const LABEL = { before: "Before", after: "After", damage: "Issue found" } as const;

/** Grid of before / after / issue photos. Links open the full image. */
export function PhotoGrid({ photos, empty = "No photos yet." }: { photos: JobPhoto[]; empty?: string }) {
  if (photos.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const groups = (["before", "after", "damage"] as const).map((k) => [k, photos.filter((p) => p.kind === k)] as const).filter(([, list]) => list.length > 0);
  return (
    <div className="space-y-5">
      {groups.map(([kind, list]) => (
        <div key={kind} className="break-inside-avoid">
          <h3 className={`mb-2 text-sm font-bold ${kind === "damage" ? "text-red-700" : "text-navy"}`}>{LABEL[kind]} ({list.length})</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((p) => (
              <li key={p.id} className="break-inside-avoid">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs; next/image would cache them */}
                    <img src={p.url} alt={`${LABEL[p.kind]} photo${p.caption ? `: ${p.caption}` : ""}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-line bg-paper text-xs text-muted">Photo unavailable</div>
                )}
                {p.caption && <p className="mt-1 text-xs text-muted">{p.caption}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
