"use client";

import { useMemo, useState } from "react";
import {
  fitBounds,
  metersToPixels,
  project,
  type AreaStatus,
} from "./geo";

export type MapArea = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
  status: AreaStatus;
};

export type MapDict = {
  mapUnavailable: string;
  mapHint: string;
  linkHint: string;
  statusActive: string;
  statusWaiting: string;
  statusDisabled: string;
};

// Logical px of the square static map we request; the SVG viewBox matches it
// so the overlay sits pixel-exact regardless of the rendered (responsive) box.
const MAP_SIZE = 640;

// Same palette as the list status badge (emerald / amber / zinc), so the dot
// next to a row and its circle on the map are unmistakably the same thing.
const COLOR: Record<AreaStatus, string> = {
  active: "#10b981",
  waiting: "#f59e0b",
  disabled: "#71717a",
};

// Keyed by `src` from the caller so a new bbox (areas changed) gets a fresh
// error state without a set-state-in-effect — same pattern as the form's
// MapPreview. Children (the SVG overlay) render only over a live basemap.
function BaseMap({
  src,
  alt,
  dict,
  children,
}: {
  src: string;
  alt: string;
  dict: MapDict;
  children: React.ReactNode;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted/30 px-4 text-center">
        <span className="text-sm font-medium text-foreground">
          {dict.mapUnavailable}
        </span>
        <span className="text-xs text-muted-foreground">{dict.mapHint}</span>
      </div>
    );
  }
  return (
    <>
      {/* Server-proxied dynamic endpoint, not a static asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 size-full object-cover"
        onError={() => setErrored(true)}
      />
      {children}
    </>
  );
}

export function AreasMap({
  areas,
  selectedId,
  onSelect,
  lang,
  dict,
}: {
  areas: MapArea[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  lang: string;
  dict: MapDict;
}) {
  const view = useMemo(() => fitBounds(areas, MAP_SIZE), [areas]);

  const points = useMemo(
    () =>
      areas.map((a) => {
        const { x, y } = project(a.lat, a.lng, view);
        return {
          ...a,
          x,
          y,
          r: Math.max(5, metersToPixels(a.radius_m, a.lat, view.zoom)),
        };
      }),
    [areas, view],
  );

  if (areas.length === 0) return null;

  const src = `/api/staticmap?lat=${view.centerLat}&lng=${view.centerLng}&zoom=${view.zoom}&size=${MAP_SIZE}&lang=${encodeURIComponent(lang)}`;

  // Selected last so it paints on top of any overlapping circles.
  const ordered = [...points].sort(
    (a, b) =>
      Number(a.id === selectedId) - Number(b.id === selectedId),
  );

  const legend: { status: AreaStatus; label: string }[] = [
    { status: "active", label: dict.statusActive },
    { status: "waiting", label: dict.statusWaiting },
    { status: "disabled", label: dict.statusDisabled },
  ];

  return (
    <div className="space-y-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted/30">
        <BaseMap key={src} src={src} alt="" dict={dict}>
          <svg
            viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
            className="absolute inset-0 size-full"
            role="presentation"
          >
            {/* Click off any circle clears the selection. */}
            <rect
              x={0}
              y={0}
              width={MAP_SIZE}
              height={MAP_SIZE}
              fill="transparent"
              onClick={() => onSelect(null)}
            />
            {ordered.map((p) => {
              const selected = p.id === selectedId;
              const c = COLOR[p.status];
              return (
                <g
                  key={p.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(selected ? null : p.id);
                  }}
                  role="button"
                  aria-label={p.label}
                  aria-pressed={selected}
                >
                  {/* White halo so a selected circle reads on any basemap. */}
                  {selected && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.r + 3}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={4}
                      opacity={0.9}
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill={c}
                    fillOpacity={selected ? 0.42 : 0.18}
                    stroke={c}
                    strokeWidth={selected ? 3 : 1.5}
                  />
                  {/* Solid centre anchor — keeps a tiny or huge zone findable. */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={selected ? 6 : 4}
                    fill={c}
                    stroke="#ffffff"
                    strokeWidth={selected ? 2 : 1}
                  />
                  {/* Generous transparent hit target for small zones. */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(p.r, 14)}
                    fill="transparent"
                  />
                </g>
              );
            })}
          </svg>
        </BaseMap>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {legend.map((l) => (
          <span
            key={l.status}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: COLOR[l.status] }}
              aria-hidden
            />
            {l.label}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{dict.linkHint}</p>
    </div>
  );
}
