// The single source of truth for an area's effective status, shared by the
// area row badge. (The Web Mercator projection helpers that once also lived
// here were removed together with the admin maps.)

import type { AreaMode } from "./areaMode";

export type AreaStatus = "active" | "waiting" | "disabled";

/**
 * One definition of "what state is this area in". `waiting` = a scheduled area
 * whose start time is still in the future; a scheduled area whose time has
 * already passed counts as live.
 */
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
