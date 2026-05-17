"use client";

import { useMemo, useRef } from "react";
import { MAP_AMBER, MAP_EMERALD, MAP_ZINC } from "@/lib/mapColors";
import {
  metersToPixels,
  project,
  type AreaStatus,
} from "../../_components/geo";
import {
  BaseMap,
  frameClass,
  MapControls,
  MAP_SIZE,
  useMapView,
  type MapChromeDict,
} from "../../_components/mapCanvas";

export type MapArea = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
  status: AreaStatus;
};

export type MapDict = MapChromeDict & {
  statusActive: string;
  statusWaiting: string;
  statusDisabled: string;
};

// Same palette as the list status badge (emerald / amber / zinc), so the dot
// next to a row and its circle on the map are unmistakably the same thing.
const COLOR: Record<AreaStatus, string> = {
  active: MAP_EMERALD,
  waiting: MAP_AMBER,
  disabled: MAP_ZINC,
};

// Areas overview: coloured radius circles drawn as an SVG overlay on top of
// the shared interactive basemap. All pan/zoom/fit behaviour comes from
// useMapView; this component only owns the circle geometry + selection.
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
  const frameRef = useRef<HTMLDivElement | null>(null);
  const {
    view,
    transientStyle,
    dragging,
    frameProps,
    zoomIn,
    zoomOut,
    fit,
    eatDragClick,
  } = useMapView({
    frameRef,
    logical: { w: MAP_SIZE, h: MAP_SIZE },
    fitTargets: areas,
  });

  const points = useMemo(() => {
    if (!view) return [];
    return areas.map((a) => {
      const { x, y } = project(a.lat, a.lng, view);
      return {
        ...a,
        x,
        y,
        r: Math.max(5, metersToPixels(a.radius_m, a.lat, view.zoom)),
      };
    });
  }, [areas, view]);

  if (areas.length === 0 || !view) return null;

  const src = `/api/staticmap?lat=${view.centerLat}&lng=${view.centerLng}&zoom=${view.zoom}&size=${MAP_SIZE}&lang=${encodeURIComponent(lang)}`;

  // Largest first → smallest painted last, so it sits on top and wins the
  // click when one zone is contained in another (clicking inside the small
  // circle selects the small one, not the big one swallowing it). Selected
  // only breaks ties between same-size circles.
  const ordered = [...points].sort(
    (a, b) =>
      b.r - a.r || Number(a.id === selectedId) - Number(b.id === selectedId),
  );

  const legend: { status: AreaStatus; label: string }[] = [
    { status: "active", label: dict.statusActive },
    { status: "waiting", label: dict.statusWaiting },
    { status: "disabled", label: dict.statusDisabled },
  ];

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        {...frameProps}
        className={frameClass(
          dragging,
          "aspect-square w-full rounded-2xl border border-border",
        )}
      >
        {/* Transient drag offset rides the whole basemap+overlay together so
            it never refetches mid-gesture; committed on pointer-up. */}
        <div className="absolute inset-0" style={transientStyle}>
          <BaseMap src={src} alt="" dict={dict}>
            <svg
              viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
              className="absolute inset-0 size-full"
              role="presentation"
            >
              {/* Click off any circle clears the selection (unless we dragged). */}
              <rect
                x={0}
                y={0}
                width={MAP_SIZE}
                height={MAP_SIZE}
                fill="transparent"
                onClick={() => {
                  if (eatDragClick()) return;
                  onSelect(null);
                }}
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
                      if (eatDragClick()) return;
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

        <MapControls
          dict={dict}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={fit}
        />
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
    </div>
  );
}
