"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AreaRow } from "./AreaRow";
import { AreasMap, type MapArea, type MapDict } from "./AreasMap";
import { areaStatus } from "./geo";
import type { AreaInitial } from "./AreaForm";

// Owns the one piece of shared state between the overview map and the list:
// the selected area id, plus a single `now` clock so the map circle and the
// row badge can never disagree on a scheduled area's status. Clicking a circle
// on the map highlights its row here and scrolls it into view. (Row clicks now
// open the editor instead — see AreaRow.)
export function AreasBoard({
  areas,
  rowDict,
  mapDict,
  lang,
  updateAction,
  deleteAction,
  setModeAction,
}: {
  areas: AreaInitial[];
  rowDict: React.ComponentProps<typeof AreaRow>["dict"];
  mapDict: MapDict;
  lang: string;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  setModeAction: (fd: FormData) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Captured once at mount (lazy init keeps the impure read out of render).
  const [now] = useState(() => Date.now());
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());

  const mapAreas = useMemo<MapArea[]>(
    () =>
      areas.map((a) => ({
        id: a.id,
        label: a.label,
        lat: a.lat,
        lng: a.lng,
        radius_m: a.radius_m,
        status: areaStatus(a.mode, a.starts_at, now).status,
      })),
    [areas, now],
  );

  // Remount the interactive map only when the geometry actually changes
  // (added / removed / moved / resized). A pure mode toggle from the kebab
  // must NOT reset the admin's current zoom/pan — the circle just recolours
  // in place on the next render.
  const mapKey = useMemo(
    () =>
      areas
        .map((a) => `${a.id}:${a.lat}:${a.lng}:${a.radius_m}`)
        .sort()
        .join("|"),
    [areas],
  );

  // Scroll the chosen row into view whenever the selection changes (from a
  // map click). `nearest` → no jump if it's already visible.
  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current
      .get(selectedId)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <AreasMap
        key={mapKey}
        areas={mapAreas}
        selectedId={selectedId}
        onSelect={setSelectedId}
        lang={lang}
        dict={mapDict}
      />

      <div className="space-y-3">
        {areas.map((area) => (
          <AreaRow
            key={area.id}
            area={area}
            dict={rowDict}
            lang={lang}
            now={now}
            selected={area.id === selectedId}
            containerRef={(el) => {
              if (el) rowRefs.current.set(area.id, el);
              else rowRefs.current.delete(area.id);
            }}
            updateAction={updateAction}
            deleteAction={deleteAction}
            setModeAction={setModeAction}
          />
        ))}
      </div>
    </div>
  );
}
