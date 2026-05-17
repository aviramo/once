"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { userImageUrl } from "@/lib/userImage";
import { parseUserLocation } from "@/lib/userLocation";
import {
  PRESENCE_COLOR,
  PRESENCE_TICK_MS,
  presenceOf,
  type Presence,
} from "@/lib/presence";
import { project } from "./geo";
import {
  BaseMap,
  frameClass,
  MapControls,
  useMapView,
  type MapChromeDict,
} from "./mapCanvas";
import { Avatar } from "./ui";

/**
 * Full-screen live map of located users. Initial set is server-rendered from
 * the `users_map` view; thereafter the admin browser subscribes to raw
 * `postgres_changes` on `public.users` (allowed by the "admins read all" RLS
 * policy) and decodes each row's `location` client-side. A periodic tick
 * re-evaluates freshness so a green marker fades to gray and a >1d-stale one
 * drops off on its own, with no event. Pan/zoom/fit all come from the shared
 * useMapView — this component only owns the avatar markers + realtime.
 */

export type MapUser = {
  user_id: string;
  name: string | null;
  image: string | null; // storage filename, not a URL
  lat: number;
  lng: number;
  last_seen: string | null;
};

export type UsersMapDict = MapChromeDict & {
  live: string;
  idle: string;
  empty: string;
};

// Google Static Maps free-tier hard cap per logical dimension. The frame is
// downscaled uniformly to fit inside this so the basemap aspect always
// matches the frame aspect (no crop, overlay stays aligned).
const MAX_LOGICAL = 640;

type RawUserRow = {
  user_id?: string;
  name?: string | null;
  last_seen?: string | null;
  location?: unknown;
  data?: { images?: Array<{ normal?: string }> } | null;
};

function rowToUser(row: RawUserRow, prev?: MapUser): MapUser | null {
  if (!row?.user_id) return null;
  const loc = parseUserLocation(row.location);
  const lat = loc?.lat ?? prev?.lat;
  const lng = loc?.lng ?? prev?.lng;
  if (lat == null || lng == null) return null; // never been placeable
  return {
    user_id: row.user_id,
    name: row.name ?? prev?.name ?? null,
    image: row.data?.images?.[0]?.normal ?? prev?.image ?? null,
    lat,
    lng,
    last_seen: row.last_seen ?? prev?.last_seen ?? null,
  };
}

export function UsersMap({
  initial,
  dict,
  lang,
}: {
  initial: MapUser[];
  dict: UsersMapDict;
  lang: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Measured frame size (client px) → uniform-downscaled logical size.
  const [client, setClient] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () =>
      setClient({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const logical = useMemo(() => {
    if (!client.w || !client.h) return { w: 0, h: 0 };
    const s = Math.min(1, MAX_LOGICAL / Math.max(client.w, client.h));
    return { w: Math.round(client.w * s), h: Math.round(client.h * s) };
  }, [client.w, client.h]);

  // Live store. Realtime membership/positions update freely; the initial set
  // only seeds first paint (consistent with the admin list's realtime model).
  const [users, setUsers] = useState<Map<string, MapUser>>(
    () => new Map(initial.map((u) => [u.user_id, u])),
  );

  // fitTargets read once at init by useMapView (a later realtime change must
  // not yank the view), so a stable snapshot of the seed is correct here.
  const fitTargets = useMemo(
    () => initial.map((u) => ({ lat: u.lat, lng: u.lng, radius_m: 0 })),
    [initial],
  );

  const { view, panPx, dragging, frameProps, zoomIn, zoomOut, fit } =
    useMapView({ frameRef, logical, fitTargets });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("admin-users-map")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        (payload) => {
          setUsers((prev) => {
            const row = payload.new as RawUserRow;
            const next = rowToUser(row, row.user_id ? prev.get(row.user_id) : undefined);
            if (!next) return prev;
            const m = new Map(prev);
            m.set(next.user_id, next);
            return m;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "users" },
        (payload) => {
          const id = (payload.old as { user_id?: string })?.user_id;
          if (!id) return;
          setUsers((prev) => {
            if (!prev.has(id)) return prev;
            const m = new Map(prev);
            m.delete(id);
            return m;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Re-evaluate freshness on a timer even with no realtime event.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), PRESENCE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Project every still-fresh user to rendered (client) px. logical aspect ==
  // client aspect (uniform downscale) ⇒ a single scalar maps both axes.
  const markers = useMemo(() => {
    if (!view || !client.w) return [];
    const scale = client.w / view.w;
    const out: Array<{
      u: MapUser;
      presence: Presence;
      x: number;
      y: number;
    }> = [];
    for (const u of users.values()) {
      const presence = presenceOf(u.last_seen, now);
      if (!presence) continue;
      const p = project(u.lat, u.lng, view);
      out.push({ u, presence, x: p.x * scale, y: p.y * scale });
    }
    // Idle first so live markers paint on top.
    out.sort(
      (a, b) =>
        Number(a.presence === "live") - Number(b.presence === "live"),
    );
    return out;
  }, [users, view, client.w, now]);

  const ready = !!view && client.w > 0;
  const src = view
    ? `/api/staticmap?lat=${view.centerLat}&lng=${view.centerLng}&zoom=${view.zoom}&w=${view.w}&h=${view.h}&lang=${encodeURIComponent(lang)}`
    : "";

  return (
    <div
      ref={frameRef}
      {...frameProps}
      className={frameClass(
        dragging,
        "h-full w-full rounded-2xl border border-border",
      )}
    >
      {ready ? (
        <>
          {/* Transient drag offset rides basemap + markers together. */}
          <div
            className="absolute inset-0"
            style={
              panPx
                ? { transform: `translate(${panPx.x}px, ${panPx.y}px)` }
                : undefined
            }
          >
            <BaseMap key={src} src={src} alt="" dict={dict}>
              <div
                className="absolute inset-0"
                role="presentation"
              >
                {markers.map(({ u, presence, x, y }) => (
                  <Link
                    key={u.user_id}
                    href={`/admin/users/${u.user_id}`}
                    title={u.name ?? u.user_id}
                    // pointer-events-none on the wrapper so a drag that starts
                    // on a marker still pans; the inner parts re-enable them
                    // so a genuine click/tap opens the profile.
                    className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                    style={{ left: x, top: y }}
                  >
                    <span
                      className="pointer-events-auto rounded-full ring-2 ring-white"
                      style={{
                        outline: `3px solid ${PRESENCE_COLOR[presence]}`,
                        outlineOffset: -1,
                      }}
                    >
                      <Avatar
                        src={userImageUrl(u.user_id, u.image)}
                        name={u.name}
                        size="sm"
                        circle
                      />
                    </span>
                    <span className="pointer-events-auto max-w-28 truncate rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm backdrop-blur">
                      {u.name ?? "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </BaseMap>
          </div>

          {markers.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur">
                {dict.empty}
              </span>
            </div>
          ) : null}

          {/* Presence legend. Logical start-side; doesn't block panning. */}
          <div className="pointer-events-none absolute start-3 top-3 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur">
            {(
              [
                ["live", dict.live],
                ["idle", dict.idle],
              ] as const
            ).map(([k, label]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: PRESENCE_COLOR[k] }}
                  aria-hidden
                />
                {label}
              </span>
            ))}
          </div>

          <MapControls
            dict={dict}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onFit={fit}
          />
        </>
      ) : null}
    </div>
  );
}
