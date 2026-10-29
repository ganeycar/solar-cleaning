import { ImageResponse } from "next/og";
import { getSiteSettings } from "@/lib/site";

// Preview image used when the site is shared in texts, social posts, and AI answers.
export const alt = "Solar panel cleaning in Solano and Yolo counties";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const s = await getSiteSettings();
  const cells = Array.from({ length: 24 });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: s.colors.navy, color: "white", padding: 72, position: "relative" }}>
        <div style={{ position: "absolute", right: 60, top: 70, display: "flex", flexWrap: "wrap", width: 420, gap: 10, opacity: 0.22 }}>
          {cells.map((_, i) => (
            <div key={i} style={{ width: 92, height: 92, border: "3px solid white", borderRadius: 6 }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 54, height: 54, borderRadius: 999, background: s.colors.gold }} />
            <div style={{ fontSize: 40, fontWeight: 800 }}>{s.businessName}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
            <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05 }}>Clean panels.</div>
            <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05, color: s.colors.gold }}>Clear sunlight.</div>
            <div style={{ marginTop: 28, fontSize: 30, opacity: 0.85 }}>Solar panel cleaning &amp; care memberships · {s.headquartersCity}, CA</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
