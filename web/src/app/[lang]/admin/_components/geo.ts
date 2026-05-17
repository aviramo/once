// Pure geo helpers shared by every admin map (the areas overview circles and
// the live users map). No React, no framework — just the Web Mercator math
// Google Static Maps uses, so an overlay can sit pixel-exact on top of a
// `center`+`zoom` basemap, plus the single source of truth for an area's
// effective status.
//
// The projection space is a logical `w`×`h` rectangle (not a square): the
// areas map passes a square (`w === h`), the users map passes the basemap's
// real aspect so a full-screen rectangular map stays undistorted. Every
// helper carries `w`/`h` through unchanged.

import type { AreaMode } from "./areaMode";

/* ----------------------------------------------------------------- status -- */

export type AreaStatus = "active" | "waiting" | "disabled";

// One definition of "what colour is this area", reused by AreaRow (badge) and
// AreasMap (circle). `waiting` = scheduled but its start time is still in the
// future; a scheduled area whose time has passed is effectively live.
export function areaStatus(
  mode: AreaMode,
  startsAtIso: string,
  nowMs: number,
): { status: AreaStatus; future: boolean } {
  const future = new Date(startsAtIso).getTime() > nowMs;
  const status: AreaStatus =
    mode === "disabled"
      ? "disabled"
      : mode === "active"
        ? "active"
        : future
          ? "waiting"
          : "active";
  return { status, future };
}

/* ------------------------------------------------------------- projection -- */

// Google Static Maps is a 256px-tile Web Mercator (scale=2 only doubles the
// raster; logical coordinates stay 256-based). World pixels = 256 * 2^zoom.
const TILE = 256;
// Metres per pixel at the equator, zoom 0, 256 tile.
const M_PER_PX_Z0 = 156543.03392804097;

const rad = (deg: number) => (deg * Math.PI) / 180;

// Normalised world coordinates in [0,1].
function worldX(lng: number): number {
  return (lng + 180) / 360;
}
function worldY(lat: number): number {
  const s = Math.sin(rad(lat));
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export type ViewBox = {
  centerLat: number;
  centerLng: number;
  zoom: number;
  /** Logical pixel size of the (rectangular) map the projection is relative
   *  to. The areas map keeps `w === h`; the users map matches the basemap. */
  w: number;
  h: number;
};

// Project a lat/lng to logical pixel coordinates inside the map frame.
export function project(
  lat: number,
  lng: number,
  view: ViewBox,
): { x: number; y: number } {
  const scale = TILE * 2 ** view.zoom;
  const cx = worldX(view.centerLng) * scale;
  const cy = worldY(view.centerLat) * scale;
  return {
    x: view.w / 2 + (worldX(lng) * scale - cx),
    y: view.h / 2 + (worldY(lat) * scale - cy),
  };
}

// Metres → logical pixels at a given latitude and zoom (Mercator scale grows
// with |lat|, so a fixed-metre radius is wider in pixels nearer the poles).
export function metersToPixels(
  meters: number,
  lat: number,
  zoom: number,
): number {
  const mPerPx = (M_PER_PX_Z0 * Math.cos(rad(lat))) / 2 ** zoom;
  return meters / mPerPx;
}

const deg = (r: number) => (r * 180) / Math.PI;

// Inverse of `project`: a logical pixel inside the frame → lat/lng. Used by the
// interactive map for wheel-zoom-to-cursor and drag-to-pan (both need to know
// which geographic point sits under a given screen pixel).
export function unproject(
  x: number,
  y: number,
  view: ViewBox,
): { lat: number; lng: number } {
  const scale = TILE * 2 ** view.zoom;
  const wx = (x - view.w / 2) / scale + worldX(view.centerLng);
  const wy = (y - view.h / 2) / scale + worldY(view.centerLat);
  const lng = wx * 360 - 180;
  // Invert the Mercator worldY: s = tanh(L/2), L = (0.5 - wy) * 4π.
  const s = Math.tanh((0.5 - wy) * 2 * Math.PI);
  const lat = deg(Math.asin(Math.max(-1, Math.min(1, s))));
  return { lat, lng };
}

/* ----------------------------------------------------------- interaction -- */

// Interactive zoom range. Wider than fitBounds' MAX (street level), capped
// below the Static Maps hard limit (21) the proxy clamps to.
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 20;

export const clampZoom = (z: number) =>
  Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z)));

// Re-centre so the geo point currently under screen (x,y) stays under (x,y)
// after changing zoom — the natural "zoom toward the cursor" behaviour.
export function viewAround(
  view: ViewBox,
  x: number,
  y: number,
  newZoom: number,
): ViewBox {
  const z = clampZoom(newZoom);
  if (z === view.zoom) return view;
  const p = unproject(x, y, view);
  const scale = TILE * 2 ** z;
  const cwx = worldX(p.lng) - (x - view.w / 2) / scale;
  const cwy = worldY(p.lat) - (y - view.h / 2) / scale;
  const centerLng = cwx * 360 - 180;
  const s = Math.tanh((0.5 - cwy) * 2 * Math.PI);
  const centerLat = deg(Math.asin(Math.max(-1, Math.min(1, s))));
  return { centerLat, centerLng, zoom: z, w: view.w, h: view.h };
}

// Commit a drag: the frame centre now shows whatever geo point sat at screen
// (w/2 - dx, h/2 - dy) before the gesture (content follows the finger).
export function panView(
  view: ViewBox,
  dxLogical: number,
  dyLogical: number,
): ViewBox {
  const { lat, lng } = unproject(
    view.w / 2 - dxLogical,
    view.h / 2 - dyLogical,
    view,
  );
  return {
    centerLat: lat,
    centerLng: lng,
    zoom: view.zoom,
    w: view.w,
    h: view.h,
  };
}

/* -------------------------------------------------------------- fitBounds -- */

const MIN_ZOOM = 1;
const MAX_ZOOM = 17;
const M_PER_DEG_LAT = 111_320;

type Circle = { lat: number; lng: number; radius_m: number };

// Smallest integer zoom (centred on the collective bbox) at which every circle
// fits inside a `w`×`h` frame, leaving `pad` of the frame as margin so nothing
// renders flush to the edge. Handles the single-point/all-coincident cases via
// the MIN/MAX clamp (a 0-radius point list still yields a sane street zoom).
export function fitBounds(
  circles: Circle[],
  w: number,
  h: number,
  pad = 0.18,
): ViewBox {
  if (circles.length === 0) {
    return { centerLat: 0, centerLng: 0, zoom: MIN_ZOOM, w, h };
  }
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const c of circles) {
    const dLat = c.radius_m / M_PER_DEG_LAT;
    const dLng =
      c.radius_m / (M_PER_DEG_LAT * Math.max(0.01, Math.cos(rad(c.lat))));
    minLat = Math.min(minLat, c.lat - dLat);
    maxLat = Math.max(maxLat, c.lat + dLat);
    minLng = Math.min(minLng, c.lng - dLng);
    maxLng = Math.max(maxLng, c.lng + dLng);
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Mercator fraction spans of the bbox (worldY decreases as lat grows).
  const latFrac = Math.max(1e-9, worldY(minLat) - worldY(maxLat));
  const lngFrac = Math.max(1e-9, worldX(maxLng) - worldX(minLng));
  const zoomLat = Math.log2((h * (1 - pad)) / TILE / latFrac);
  const zoomLng = Math.log2((w * (1 - pad)) / TILE / lngFrac);

  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Math.floor(Math.min(zoomLat, zoomLng))),
  );
  return { centerLat, centerLng, zoom, w, h };
}
