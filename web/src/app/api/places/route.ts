import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";

// Server-side proxy for the admin "areas" address search. Mirrors the mobile
// app's Places Autocomplete + Details flow (same billing-session token model)
// but keeps GOOGLE_PLACES_KEY on the server — it is never shipped to the
// browser. Admin-gated: a non-admin gets 403. Soft-fails (200 + empty list)
// when the key is missing/restricted so the areas form stays usable via
// manual lat/lng entry.
const KEY = process.env.GOOGLE_PLACES_KEY ?? "";

export async function GET(request: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  if (!KEY) {
    return NextResponse.json({ error: "no_key", predictions: [] });
  }

  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") || "he";
  const token = url.searchParams.get("token") || "";
  const placeId = url.searchParams.get("place_id");

  try {
    if (placeId) {
      const g = new URL(
        "https://maps.googleapis.com/maps/api/place/details/json",
      );
      g.searchParams.set("place_id", placeId);
      g.searchParams.set("key", KEY);
      g.searchParams.set("sessiontoken", token);
      g.searchParams.set("language", lang);
      g.searchParams.set("fields", "geometry,formatted_address,name");
      const r = await fetch(g.toString());
      const j = await r.json();
      const loc = j.result?.geometry?.location;
      if (j.status !== "OK" || !loc) {
        return NextResponse.json({ error: j.status || "details_failed" });
      }
      return NextResponse.json({
        lat: loc.lat,
        lng: loc.lng,
        label: j.result.formatted_address || j.result.name || "",
      });
    }

    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ predictions: [] });
    const g = new URL(
      "https://maps.googleapis.com/maps/api/place/autocomplete/json",
    );
    g.searchParams.set("input", q);
    g.searchParams.set("key", KEY);
    g.searchParams.set("sessiontoken", token);
    g.searchParams.set("language", lang);
    const r = await fetch(g.toString());
    const j = await r.json();
    if (j.status !== "OK" && j.status !== "ZERO_RESULTS") {
      return NextResponse.json({
        error: j.status || "autocomplete_failed",
        predictions: [],
      });
    }
    return NextResponse.json({
      predictions: (j.predictions ?? []).map(
        (p: { place_id: string; description: string }) => ({
          place_id: p.place_id,
          description: p.description,
        }),
      ),
    });
  } catch {
    return NextResponse.json({ error: "fetch_failed", predictions: [] });
  }
}
