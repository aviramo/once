"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AreaRow } from "./AreaRow";
import { AreasMap, type MapArea, type MapDict } from "./AreasMap";
import { areaStatus } from "./geo";
import type { AreaInitial } from "./AreaForm";

// Owns the one piece of shared state between the overview map and the list:
// the selected area id, plus a single `now` clock so the map circle and the
// row badge can never disagree on a scheduled area's status. Selecting from
// either side highlights the other and scrolls the row into view.
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

  // Scroll the chosen row into view whenever the selection changes (from a
  // map click or a row click). `nearest` → no jump if it's already visible.
  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current
      .get(selectedId)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const toggle = (id: string) =>
    setSelectedId((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-6">
      <AreasMap
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
            onSelect={() => toggle(area.id)}
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
