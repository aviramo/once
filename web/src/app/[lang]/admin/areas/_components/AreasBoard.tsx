"use client";

import { useState } from "react";
import { AreaRow } from "./AreaRow";
import type { AreaInitial } from "./AreaForm";

// The areas list. Each row is self-contained (edit / mode / delete); a single
// `now` clock captured once at mount keeps every scheduled-area status badge in
// sync without each row reading the clock independently.
export function AreasBoard({
  areas,
  rowDict,
  lang,
  updateAction,
  deleteAction,
  setModeAction,
}: {
  areas: AreaInitial[];
  rowDict: React.ComponentProps<typeof AreaRow>["dict"];
  lang: string;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  setModeAction: (fd: FormData) => Promise<void>;
}) {
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-3">
      {areas.map((area) => (
        <AreaRow
          key={area.id}
          area={area}
          dict={rowDict}
          lang={lang}
          now={now}
          updateAction={updateAction}
          deleteAction={deleteAction}
          setModeAction={setModeAction}
        />
      ))}
    </div>
  );
}
