"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { AreaForm, type AreaInitial, type AreaMode } from "./AreaForm";
import { AreaMenu, type MenuItem } from "./AreaMenu";
import { areaStatus } from "./geo";

type RowDict = {
  edit: string;
  delete: string;
  // kebab-menu mode labels (reused as the only place these strings render now)
  modeActive: string;
  modeScheduled: string;
  modeDisabled: string;
  // kebab trigger aria-label
  menu: string;
  // status badge text: מופעל / בהמתנה / מושבת
  statusActive: string;
  statusWaiting: string;
  statusDisabled: string;
  confirmDelete: string;
  // passed straight through to the edit AreaForm
  form: React.ComponentProps<typeof AreaForm>["dict"];
};

export function AreaRow({
  area,
  dict,
  lang,
  now,
  selected,
  containerRef,
  updateAction,
  deleteAction,
  setModeAction,
}: {
  area: AreaInitial;
  dict: RowDict;
  lang: string;
  /** Shared clock from the board so the badge and the map circle agree. */
  now: number;
  /** Driven by the map: clicking a circle highlights its row here. */
  selected: boolean;
  containerRef?: (el: HTMLDivElement | null) => void;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  setModeAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Single source of truth for effective status (shared with the map).
  const { status } = areaStatus(area.mode, area.starts_at, now);
  // Thousands-separated, locale-aware (he/en both group with commas).
  const radius = `${area.radius_m.toLocaleString(lang)} m`;

  const badge = {
    active: {
      text: dict.statusActive,
      pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
      dot: "bg-emerald-500",
    },
    waiting: {
      text: dict.statusWaiting,
      pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      dot: "bg-amber-500",
    },
    disabled: {
      text: dict.statusDisabled,
      pill: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
      dot: "bg-zinc-400",
    },
  }[status];

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
      <div
        ref={containerRef}
        className="scroll-mt-24 rounded-2xl border border-border bg-background p-5"
      >
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
      ref={containerRef}
      className={cn(
        "relative scroll-mt-24 rounded-2xl border bg-background p-5 transition-colors",
        // While the menu is open, lift this row above later siblings so the
        // dropdown is never painted under the next card.
        menuOpen ? "z-30" : "z-0",
        selected
          ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "border-border",
      )}
    >
      {/* Whole-card edit affordance: an absolute button BEHIND the content so
          we avoid nesting the kebab <button> inside another button. */}
      <button
        type="button"
        aria-label={dict.edit}
        onClick={() => setEditing(true)}
        className="absolute inset-0 z-0 cursor-pointer rounded-2xl outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary"
      />

      <div className="pointer-events-none relative z-10 flex items-center gap-3">
        {/* address · status · radius, one line — wraps only when there's no
            room (long label truncates first to keep it single-line). */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate font-medium">{area.label}</span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.pill}`}
          >
            <span
              className={`size-1.5 rounded-full ${badge.dot}`}
              aria-hidden
            />
            {badge.text}
          </span>
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
