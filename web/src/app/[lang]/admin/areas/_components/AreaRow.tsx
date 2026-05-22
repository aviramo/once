"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/humanize";
import { formatDistance } from "@/lib/userLocation";
import { AreaForm, type AreaInitial, type AreaMode } from "./AreaForm";
import { AreaMenu, type MenuItem } from "./AreaMenu";
import { areaStatus, type AreaStatus } from "../../_components/geo";
import { StatusBadge } from "../../_components/ui";

type RowDict = {
  edit: string;
  delete: string;
  // kebab-menu mode labels
  modeActive: string;
  modeScheduled: string;
  modeDisabled: string;
  // kebab trigger aria-label
  menu: string;
  // status badge text
  statusActive: string;
  statusWaiting: string;
  statusDisabled: string;
  confirmDelete: string;
  // passed straight through to the edit AreaForm
  form: React.ComponentProps<typeof AreaForm>["dict"];
};

const STATUS_TONE: Record<AreaStatus, Tone> = {
  active: "ok",
  waiting: "busy",
  disabled: "idle",
};

/**
 * One area as a compact card: tap the card to edit inline, the kebab menu to
 * switch mode (active / scheduled / disabled) or delete. No map — the area is
 * managed entirely as a list row.
 */
export function AreaRow({
  area,
  dict,
  lang,
  now,
  updateAction,
  deleteAction,
  setModeAction,
}: {
  area: AreaInitial;
  dict: RowDict;
  lang: string;
  /** Shared clock from the board so every scheduled badge agrees. */
  now: number;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  setModeAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const { status } = areaStatus(area.mode, area.starts_at, now);
  const statusText = {
    active: dict.statusActive,
    waiting: dict.statusWaiting,
    disabled: dict.statusDisabled,
  }[status];
  const radius = formatDistance(area.radius_m / 1000, lang);

  function runSetMode(mode: AreaMode) {
    if (mode === area.mode) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", area.id);
      fd.set("mode", mode);
      await setModeAction(fd);
    });
  }

  function runDelete() {
    if (!window.confirm(dict.confirmDelete)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", area.id);
      await deleteAction(fd);
    });
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
        <AreaForm
          action={updateAction}
          initial={area}
          dict={dict.form}
          lang={lang}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  const modeItem = (mode: AreaMode, label: string): MenuItem => ({
    key: mode,
    label,
    onSelect: () => runSetMode(mode),
    disabled: pending || area.mode === mode,
    current: area.mode === mode,
  });

  const items: MenuItem[] = [
    modeItem("active", dict.modeActive),
    modeItem("scheduled", dict.modeScheduled),
    modeItem("disabled", dict.modeDisabled),
    {
      key: "delete",
      label: dict.delete,
      onSelect: runDelete,
      disabled: pending,
      danger: true,
      separated: true,
    },
  ];

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-background shadow-sm transition-colors",
        // Lift above later siblings while the menu is open so the dropdown is
        // never painted under the next card.
        menuOpen ? "z-30" : "z-0",
      )}
    >
      {/* Whole-card edit affordance, painted behind the content. */}
      <button
        type="button"
        aria-label={dict.edit}
        onClick={() => setEditing(true)}
        className="absolute inset-0 z-0 cursor-pointer rounded-xl outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary"
      />

      <div className="pointer-events-none relative z-10 flex items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-sm font-semibold">
            {area.label}
          </span>
          <StatusBadge tone={STATUS_TONE[status]}>{statusText}</StatusBadge>
          <span className="shrink-0 text-xs text-muted-foreground">
            {radius}
          </span>
        </div>
        <div className="pointer-events-auto shrink-0">
          <AreaMenu
            ariaLabel={dict.menu}
            items={items}
            onOpenChange={setMenuOpen}
          />
        </div>
      </div>
    </div>
  );
}
