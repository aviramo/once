import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { presenceCutoffIso } from "@/lib/presence";
import { AdminShell, Section } from "../_components/ui";
import {
  UsersMap,
  type LocationType,
  type MapUser,
} from "../_components/UsersMap";

type GeoRow = {
  user_id: string;
  name: string | null;
  last_seen: string | null;
  image: string | null;
  lat: number | null;
  lng: number | null;
  location_type: string | null;
};

const LOCATION_TYPES: readonly LocationType[] = ["device", "home", "work"];
const asLocationType = (v: string | null): LocationType =>
  (LOCATION_TYPES as readonly string[]).includes(v ?? "")
    ? (v as LocationType)
    : "device";

// Bounded server seed for first paint; realtime takes over after mount. The
// active located base is small for this app, so 500 is comfortably above it
// while staying a hard ceiling.
const SEED_LIMIT = 500;

export default async function AdminMapPage({
  params,
}: PageProps<"/[lang]/admin/map">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const d = dict.admin;

  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  const admin = createSupabaseAdmin();
  // Only users seen within the presence window can be shown; anything older
  // is filtered the same way the client tick later drops it.
  const { data } = await admin
    .from("users_map")
    .select("user_id, name, last_seen, image, lat, lng, location_type")
    .gt("last_seen", presenceCutoffIso())
    .order("last_seen", { ascending: false })
    .limit(SEED_LIMIT);

  const initial: MapUser[] = ((data ?? []) as GeoRow[])
    .filter(
      (r): r is GeoRow & { lat: number; lng: number } =>
        typeof r.lat === "number" && typeof r.lng === "number",
    )
    .map((r) => ({
      user_id: r.user_id,
      name: r.name,
      image: r.image,
      lat: r.lat,
      lng: r.lng,
      last_seen: r.last_seen,
      locationType: asLocationType(r.location_type),
    }));

  return (
    <AdminShell dict={d} active="map">
      <Section title={d.map.title} hint={d.map.subtitle}>
        {/* Full-bleed: break out of the shell's max-w container so the map
            truly spans the screen, tall enough to fill the viewport under
            the sticky header. */}
        <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-5">
          <div className="h-[calc(100dvh-13rem)] min-h-[460px] w-full">
            <UsersMap
              initial={initial}
              lang={locale}
              dict={{
                live: d.map.live,
                idle: d.map.idle,
                empty: d.map.empty,
                home: d.map.home,
                work: d.map.work,
                mapUnavailable: d.map.mapUnavailable,
                mapHint: d.map.mapHint,
                zoomIn: d.map.zoomIn,
                zoomOut: d.map.zoomOut,
                fit: d.map.fit,
              }}
            />
          </div>
        </div>
      </Section>
    </AdminShell>
  );
}
