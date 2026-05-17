"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  fitBounds,
  metersToPixels,
  panView,
  project,
  viewAround,
  type AreaStatus,
  type ViewBox,
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
  statusActive: string;
  statusWaiting: string;
  statusDisabled: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
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

// Below this pointer travel a press counts as a click (select), above it as a
// pan (and the trailing click is swallowed so it doesn't change selection).
const DRAG_PX = 4;

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
        draggable={false}
        className="absolute inset-0 size-full select-none object-cover"
        onError={() => setErrored(true)}
      />
      {children}
    </>
  );
}

function CtrlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-lg border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
    >
      {children}
    </button>
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
  // The fit is the initial view; pan/zoom mutate it from here. A data change
  // remounts this component (keyed in AreasBoard) so the view refits.
  const initial = useMemo(() => fitBounds(areas, MAP_SIZE), [areas]);
  const [view, setView] = useState<ViewBox>(initial);

  const frameRef = useRef<HTMLDivElement | null>(null);
  // Live drag bookkeeping (refs → no re-render per pointer move; the transient
  // translate is the only thing that animates while dragging).
  const drag = useRef<{
    id: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  // A drag is followed by a synthetic click on whatever was under the pointer;
  // this latches across that one click so panning never changes the selection.
  // (Refs, not state — the click fires before any state flush.)
  const suppressClick = useRef(false);
  const [panPx, setPanPx] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // client px → logical map px (the SVG/projection space is MAP_SIZE-based).
  const toLogical = (clientDelta: number) => {
    const w = frameRef.current?.clientWidth || MAP_SIZE;
    return (clientDelta * MAP_SIZE) / w;
  };

  // Wheel = zoom toward the cursor. Native non-passive listener so we can
  // preventDefault (React's onWheel is passive and can't stop page scroll).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) * MAP_SIZE) / rect.width;
      const ly = ((e.clientY - rect.top) * MAP_SIZE) / rect.height;
      const dir = e.deltaY < 0 ? 1 : -1;
      setView((v) => viewAround(v, lx, ly, v.zoom + dir));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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

  // Largest first → smallest painted last, so it sits on top and wins the
  // click when one zone is contained in another (clicking inside the small
  // circle selects the small one, not the big one swallowing it). Selected
  // only breaks ties between same-size circles.
  const ordered = [...points].sort(
    (a, b) =>
      b.r - a.r ||
      Number(a.id === selectedId) - Number(b.id === selectedId),
  );

  const legend: { status: AreaStatus; label: string }[] = [
    { status: "active", label: dict.statusActive },
    { status: "waiting", label: dict.statusWaiting },
    { status: "disabled", label: dict.statusDisabled },
  ];

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    suppressClick.current = false;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    d.moved = true;
    if (!dragging) setDragging(true);
    setPanPx({ x: dx, y: dy });
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      suppressClick.current = true;
      setView((v) => panView(v, toLogical(dx), toLogical(dy)));
    }
    setPanPx(null);
    setDragging(false);
  }

  // Consumes the one post-drag synthetic click (latched in endDrag, cleared on
  // the next pointerdown if no click ever arrived).
  const eatDragClick = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "relative aspect-square w-full touch-none overflow-hidden rounded-2xl border border-border bg-muted/30",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {/* Transient drag offset rides the whole basemap+overlay together so
            it never refetches mid-gesture; committed on pointer-up. */}
        <div
          className="absolute inset-0"
          style={
            panPx
              ? { transform: `translate(${panPx.x}px, ${panPx.y}px)` }
              : undefined
          }
        >
          <BaseMap key={src} src={src} alt="" dict={dict}>
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

        {/* Zoom / fit controls. Logical end-side so RTL & LTR both anchor to
            the inline-end edge. Stop pointerdown so a control tap never starts
            a pan. */}
        <div
          className="absolute bottom-3 end-3 z-10 flex flex-col gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <CtrlButton
            label={dict.zoomIn}
            onClick={() =>
              setView((v) =>
                viewAround(v, MAP_SIZE / 2, MAP_SIZE / 2, v.zoom + 1),
              )
            }
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </CtrlButton>
          <CtrlButton
            label={dict.zoomOut}
            onClick={() =>
              setView((v) =>
                viewAround(v, MAP_SIZE / 2, MAP_SIZE / 2, v.zoom - 1),
              )
            }
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M5 12h14" />
            </svg>
          </CtrlButton>
          <CtrlButton
            label={dict.fit}
            onClick={() => setView(fitBounds(areas, MAP_SIZE))}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
            </svg>
          </CtrlButton>
        </div>
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
