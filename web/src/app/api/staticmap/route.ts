import { getAdminUser } from "@/lib/admin-auth";

// Server-proxied Google Maps Static API: renders the area's centre marker +
// a polygon approximating the radius circle, so the admin sees the zone on a
// real map instead of raw coordinates. The key stays server-side (same
// GOOGLE_PLACES_KEY; it must additionally have the Maps Static API enabled).
// Admin-gated. Any failure returns a non-2xx text response (NOT a blank 200
// image) so the <img onError> in AreaForm fires and the form can show an
// explanatory placeholder instead of a silent empty box.
const KEY = process.env.GOOGLE_PLACES_KEY ?? "";

const fail = (status: number, reason: string) =>
  new Response(reason, {
    status,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });

// Points around the centre at `radius` metres (destination-point formula).
function circle(lat: number, lng: number, radius: number, n = 48): string {
  const R = 6371000;
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const d = radius / R;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const brng = (2 * Math.PI * i) / n;
    const lat2 = Math.asin(
      Math.sin(latR) * Math.cos(d) +
        Math.cos(latR) * Math.sin(d) * Math.cos(brng),
    );
    const lng2 =
      lngR +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latR),
        Math.cos(d) - Math.sin(latR) * Math.sin(lat2),
      );
    pts.push(
      `${((lat2 * 180) / Math.PI).toFixed(6)},${((lng2 * 180) / Math.PI).toFixed(6)}`,
    );
  }
  return pts.join("|");
}

export async function GET(request: Request) {
  if (!(await getAdminUser())) return fail(403, "forbidden");
  if (!KEY) return fail(503, "no_key");

  const u = new URL(request.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const r = Math.max(1, Number(u.searchParams.get("r")) || 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail(400, "bad_coords");
  }

  const g = new URL("https://maps.googleapis.com/maps/api/staticmap");
  // 4:3 landscape (scale 2 → 1280x960) — natural map orientation, taller
  // than the old wide letterbox strip.
  g.searchParams.set("size", "640x480");
  g.searchParams.set("scale", "2");
  g.searchParams.set("maptype", "roadmap");
  g.searchParams.set("language", u.searchParams.get("lang") || "he");
  // size:small → a smaller pin (the default marker dominated the frame).
  g.searchParams.set("markers", `size:small|color:0xe11d48|${lat},${lng}`);
  // Translucent rose fill, matching the admin accent.
  g.searchParams.set(
    "path",
    `color:0xe11d48aa|weight:2|fillcolor:0xe11d4833|${circle(lat, lng, r)}`,
  );
  g.searchParams.set("key", KEY);

  try {
    const res = await fetch(g.toString());
    if (!res.ok) return fail(502, "upstream");
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return fail(502, "error");
  }
}
