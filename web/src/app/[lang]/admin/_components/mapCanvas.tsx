"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  fitBounds,
  panView,
  viewAround,
  type ViewBox,
} from "./geo";

/**
 * The one interactive-map primitive every admin map composes. It owns the
 * basemap fetch + error placeholder, drag-to-pan, wheel-zoom-to-cursor,
 * zoom/fit controls and the post-drag click suppression. Consumers only
 * supply the projection size, the points to fit, and the overlay to draw on
 * top (SVG circles for the areas map, HTML avatar markers for the users map).
 * No screen reimplements pan/zoom — that behaviour lives here exactly once.
 */

// Logical px of the square basemap the areas overview requests; its SVG
// viewBox matches it so the overlay sits pixel-exact regardless of the
// rendered (responsive) box. The users map measures its own (rectangular)
// logical size instead.
export const MAP_SIZE = 640;

// Below this pointer travel a press counts as a click (select); above it as a
// pan (and the trailing click is swallowed so it doesn't change selection).
const DRAG_PX = 4;

export type MapChromeDict = {
  mapUnavailable: string;
  mapHint: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
};

type Circle = { lat: number; lng: number; radius_m: number };

/* ---------------------------------------------------------------- BaseMap -- */

// Keyed by `src` from the caller so a new bbox (data/view changed) gets a
// fresh error state without a set-state-in-effect. Children (the overlay)
// render only over a live basemap.
export function BaseMap({
  src,
  alt,
  dict,
  children,
}: {
  src: string;
  alt: string;
  dict: Pick<MapChromeDict, "mapUnavailable" | "mapHint">;
  children: ReactNode;
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

/* ------------------------------------------------------------ MapControls -- */

function CtrlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
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

// Zoom / fit cluster. Logical end-side so RTL & LTR both anchor to the
// inline-end edge. Stops pointerdown so a control tap never starts a pan.
export function MapControls({
  dict,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  dict: Pick<MapChromeDict, "zoomIn" | "zoomOut" | "fit">;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div
      className="absolute bottom-3 end-3 z-10 flex flex-col gap-1.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <CtrlButton label={dict.zoomIn} onClick={onZoomIn}>
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
      <CtrlButton label={dict.zoomOut} onClick={onZoomOut}>
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
      <CtrlButton label={dict.fit} onClick={onFit}>
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
  );
}

/* ----------------------------------------------------------- useMapView -- */

export type MapViewApi = {
  /** Null until the logical size is known (one frame for measured maps). */
  view: ViewBox | null;
  /** Transient drag offset (px) to translate the basemap+overlay together. */
  panPx: { x: number; y: number } | null;
  dragging: boolean;
  /** Spread on the pannable frame div (which the consumer owns/styles). */
  frameProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  };
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Consumes the one post-drag synthetic click; true → swallow it. */
  eatDragClick: () => boolean;
};

// `logical` is the consumer-decided projection size: the areas map passes a
// fixed square (`MAP_SIZE`), the users map passes its measured frame aspect
// (so a full-screen rectangle stays undistorted). `fitTargets` are the points
// the initial view and the fit button frame; they are read at init only — a
// realtime data change must NOT yank the view (the consumer remounts if it
// wants a refit), so changing the array later is intentionally ignored.
export function useMapView({
  frameRef,
  logical,
  fitTargets,
}: {
  frameRef: React.RefObject<HTMLDivElement | null>;
  logical: { w: number; h: number };
  fitTargets: Circle[];
}): MapViewApi {
  const ready = logical.w > 0 && logical.h > 0;

  // fitTargets is read at init only (and by the fit button); a later realtime
  // change must not yank the view. Synced via an effect (never during render).
  const fitTargetsRef = useRef(fitTargets);
  useEffect(() => {
    fitTargetsRef.current = fitTargets;
  }, [fitTargets]);

  const [view, setView] = useState<ViewBox | null>(() =>
    ready ? fitBounds(fitTargets, logical.w, logical.h) : null,
  );

  // Keep a ref so the once-bound wheel listener and the pointer handlers read
  // the live view without rebinding every frame. Synced post-render (the
  // handlers only fire after commit, so this is always current for them).
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Init once the logical size is known; thereafter only sync w/h (keep the
  // geographic centre + zoom — the centre always maps to the frame centre, so
  // a resize never makes the content jump).
  useEffect(() => {
    if (!ready) return;
    setView((v) => {
      if (!v) return fitBounds(fitTargetsRef.current, logical.w, logical.h);
      if (v.w === logical.w && v.h === logical.h) return v;
      return { ...v, w: logical.w, h: logical.h };
    });
  }, [ready, logical.w, logical.h]);

  // client px → logical px, per axis (the projection space is w×h).
  const toLogical = useCallback(
    (clientDelta: number, axis: "x" | "y") => {
      const el = frameRef.current;
      const v = viewRef.current;
      if (!el || !v) return clientDelta;
      return axis === "x"
        ? (clientDelta * v.w) / (el.clientWidth || v.w)
        : (clientDelta * v.h) / (el.clientHeight || v.h);
    },
    [frameRef],
  );

  // Wheel = zoom toward the cursor. Native non-passive listener so we can
  // preventDefault (React onWheel is passive and can't stop page scroll).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (!v) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) * v.w) / rect.width;
      const ly = ((e.clientY - rect.top) * v.h) / rect.height;
      const dir = e.deltaY < 0 ? 1 : -1;
      setView((cur) => (cur ? viewAround(cur, lx, ly, cur.zoom + dir) : cur));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [frameRef]);

  const drag = useRef<{
    id: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [panPx, setPanPx] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      suppressClick.current = false;
      drag.current = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
      d.moved = true;
      setDragging((cur) => (cur ? cur : true));
      setPanPx({ x: dx, y: dy });
    },
    [],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      if (d.moved) {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        suppressClick.current = true;
        setView((v) =>
          v ? panView(v, toLogical(dx, "x"), toLogical(dy, "y")) : v,
        );
      }
      setPanPx(null);
      setDragging(false);
    },
    [toLogical],
  );

  const eatDragClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  const zoomIn = useCallback(
    () =>
      setView((v) =>
        v ? viewAround(v, v.w / 2, v.h / 2, v.zoom + 1) : v,
      ),
    [],
  );
  const zoomOut = useCallback(
    () =>
      setView((v) =>
        v ? viewAround(v, v.w / 2, v.h / 2, v.zoom - 1) : v,
      ),
    [],
  );
  const fit = useCallback(
    () =>
      setView((v) =>
        v ? fitBounds(fitTargetsRef.current, v.w, v.h) : v,
      ),
    [],
  );

  return {
    view,
    panPx,
    dragging,
    frameProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    zoomIn,
    zoomOut,
    fit,
    eatDragClick,
  };
}

/* --------------------------------------------------------- frame helpers -- */

// Shared className for the pannable frame (cursor flips with `dragging`).
export function frameClass(dragging: boolean, extra?: string): string {
  return cn(
    "relative touch-none overflow-hidden bg-muted/30",
    dragging ? "cursor-grabbing" : "cursor-grab",
    extra,
  );
}
