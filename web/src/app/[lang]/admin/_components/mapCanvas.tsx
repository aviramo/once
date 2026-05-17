"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
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

// Transient pinch scale is clamped to this range so a wild gesture can't
// invert or explode the layer before it commits to an integer zoom step.
const PINCH_MIN = 0.25;
const PINCH_MAX = 6;

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
  // Last src that successfully loaded — it stays painted as a stable base
  // layer while the next src loads, so pan/zoom never blanks the map (the
  // old fix remounted on every src change, which is exactly the flicker).
  // `failedSrc` is the exact src that errored; comparing it to the current
  // src is self-resetting (a new src is automatically "not failed"), so no
  // effect / render-time setState is needed to clear the error.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const knownFailed = failedSrc === src;

  // Only a never-loaded failure shows the placeholder; a failed *refetch*
  // keeps the last good map + overlay on screen instead.
  if (knownFailed && !loaded) {
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
      {/* Stable base: the last good basemap, kept until the new one loads. */}
      {loaded ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={loaded}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 size-full select-none object-cover"
        />
      ) : null}
      {/* Foreground: the requested src. Transparent while it loads (the base
          shows through), promoted to the base on load. Skipped when this src
          is known-failed so a broken refetch never paints a broken glyph. */}
      {!knownFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 size-full select-none object-cover"
          onLoad={() => setLoaded(src)}
          onError={() => setFailedSrc(src)}
        />
      ) : null}
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
  showZoom = true,
}: {
  dict: Pick<MapChromeDict, "zoomIn" | "zoomOut" | "fit">;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Hide the +/- buttons (touch maps use pinch instead). Fit always shows. */
  showZoom?: boolean;
}) {
  return (
    <div
      className="absolute bottom-3 end-3 z-10 flex flex-col gap-1.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showZoom ? (
        <>
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
        </>
      ) : null}
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
  /** Transform to apply to the basemap+overlay wrapper while a gesture is in
   *  flight (drag → translate, pinch → scale around the pinch point), so the
   *  map moves/zooms live and only refetches once on gesture end. undefined
   *  when idle. */
  transientStyle: CSSProperties | undefined;
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

  // --- gesture state -------------------------------------------------------
  // Every live pointer (client px). One pointer → pan; two → pinch-zoom.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const drag = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ startDist: number; ox: number; oy: number } | null>(
    null,
  );
  // After a pinch ends a finger may still be down; ignore it for panning
  // until every finger lifts (otherwise the map jumps on gesture end).
  const ignoreUntilEmpty = useRef(false);
  const suppressClick = useRef(false);
  const [transient, setTransient] = useState<{
    tx: number;
    ty: number;
    scale: number;
    ox: number;
    oy: number;
  } | null>(null);
  const transientRef = useRef(transient);
  useEffect(() => {
    transientRef.current = transient;
  }, [transient]);
  const [dragging, setDragging] = useState(false);

  const frameLocal = (clientX: number, clientY: number) => {
    const el = frameRef.current;
    if (!el) return { x: clientX, y: clientY };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  // Distance + frame-local midpoint of the first two live pointers.
  const twoPointerInfo = () => {
    const [a, b] = [...pointers.current.values()];
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const mid = frameLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
    return { dist, mid };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    suppressClick.current = false;

    if (pointers.current.size === 1) {
      ignoreUntilEmpty.current = false;
      drag.current = { sx: e.clientX, sy: e.clientY, moved: false };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      // Second finger → switch to pinch; cancel any single-finger pan.
      drag.current = null;
      setDragging(false);
      const { dist, mid } = twoPointerInfo();
      pinch.current = { startDist: dist, ox: mid.x, oy: mid.y };
      setTransient({ tx: 0, ty: 0, scale: 1, ox: mid.x, oy: mid.y });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pinch.current && pointers.current.size >= 2) {
      const { dist } = twoPointerInfo();
      const scale = Math.max(
        PINCH_MIN,
        Math.min(PINCH_MAX, dist / pinch.current.startDist),
      );
      const { ox, oy } = pinch.current;
      setTransient({ tx: 0, ty: 0, scale, ox, oy });
      return;
    }

    if (ignoreUntilEmpty.current) return;

    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    d.moved = true;
    setDragging((cur) => (cur ? cur : true));
    setTransient({ tx: dx, ty: dy, scale: 1, ox: 0, oy: 0 });
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (pinch.current) {
      if (pointers.current.size < 2) {
        const pn = pinch.current;
        pinch.current = null;
        const scale = transientRef.current?.scale ?? 1;
        const dz = Math.round(Math.log2(scale));
        if (dz !== 0) {
          const el = frameRef.current;
          const cw = el?.clientWidth || 1;
          const ch = el?.clientHeight || 1;
          setView((v) =>
            v
              ? viewAround(v, (pn.ox * v.w) / cw, (pn.oy * v.h) / ch, v.zoom + dz)
              : v,
          );
        }
        setTransient(null);
        suppressClick.current = true;
        // A finger may still be down; don't let it pan until all are up.
        ignoreUntilEmpty.current = pointers.current.size > 0;
      }
    } else if (drag.current) {
      const d = drag.current;
      drag.current = null;
      if (d.moved) {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        suppressClick.current = true;
        setView((v) =>
          v ? panView(v, toLogical(dx, "x"), toLogical(dy, "y")) : v,
        );
      }
      setTransient(null);
      setDragging(false);
    }

    if (pointers.current.size === 0) {
      ignoreUntilEmpty.current = false;
      setTransient(null);
      setDragging(false);
    }
  };

  const eatDragClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  const zoomIn = useCallback(
    () => setView((v) => (v ? viewAround(v, v.w / 2, v.h / 2, v.zoom + 1) : v)),
    [],
  );
  const zoomOut = useCallback(
    () => setView((v) => (v ? viewAround(v, v.w / 2, v.h / 2, v.zoom - 1) : v)),
    [],
  );
  const fit = useCallback(
    () => setView((v) => (v ? fitBounds(fitTargetsRef.current, v.w, v.h) : v)),
    [],
  );

  const transientStyle: CSSProperties | undefined = transient
    ? {
        transform: `translate(${transient.tx}px, ${transient.ty}px) scale(${transient.scale})`,
        transformOrigin: `${transient.ox}px ${transient.oy}px`,
      }
    : undefined;

  return {
    view,
    transientStyle,
    dragging,
    frameProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
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
