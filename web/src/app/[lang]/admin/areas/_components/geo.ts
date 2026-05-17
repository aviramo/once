// Pure geo helpers shared by the areas overview map and the list rows. No
// React, no framework — just the Web Mercator math Google Static Maps uses,
// so an SVG overlay can sit pixel-exact on top of a `center`+`zoom` basemap,
// plus the single source of truth for an area's effective status.

import type { AreaMode } from "./AreaForm";

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
  /** Logical pixel size of the (square) map the projection is relative to. */
  size: number;
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
    x: view.size / 2 + (worldX(lng) * scale - cx),
    y: view.size / 2 + (worldY(lat) * scale - cy),
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

/* -------------------------------------------------------------- fitBounds -- */

const MIN_ZOOM = 1;
const MAX_ZOOM = 17;
const M_PER_DEG_LAT = 111_320;

type Circle = { lat: number; lng: number; radius_m: number };

// Smallest integer zoom (centred on the collective bbox) at which every area
// circle fits inside a `size`×`size` frame, leaving `pad` of the frame as
// margin so nothing renders flush to the edge. Handles the single-area and
// all-coincident cases via the MIN/MAX clamp.
export function fitBounds(
  circles: Circle[],
  size: number,
  pad = 0.18,
): ViewBox {
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
  const usable = size * (1 - pad);
  const zoomLat = Math.log2(usable / TILE / latFrac);
  const zoomLng = Math.log2(usable / TILE / lngFrac);

  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Math.floor(Math.min(zoomLat, zoomLng))),
  );
  return { centerLat, centerLng, zoom, size };
}
