"use client";

import { useState, useTransition } from "react";
import { AreaForm, type AreaInitial, type AreaMode } from "./AreaForm";

type RowDict = {
  edit: string;
  delete: string;
  // mode switch button labels (also reused as the badge text)
  modeActive: string;
  modeScheduled: string;
  modeDisabled: string;
  // status badge text: מופעל / בהמתנה / מושבת
  statusActive: string;
  statusWaiting: string;
  statusDisabled: string;
  startsNow: string;
  startsFuture: string;
  confirmDelete: string;
  // passed straight through to the edit AreaForm
  form: React.ComponentProps<typeof AreaForm>["dict"];
};

export function AreaRow({
  area,
  dict,
  lang,
  updateAction,
  deleteAction,
  setModeAction,
}: {
  area: AreaInitial;
  dict: RowDict;
  lang: string;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  setModeAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  // Captured once at mount (lazy state init keeps the impure read out of the
  // render path). The label only needs to be right at paint time.
  const [now] = useState(() => Date.now());

  const starts = new Date(area.starts_at);
  const future = starts.getTime() > now;

  // Effective status: active = live now; scheduled = enabled but waiting for
  // its start time (בהמתנה); disabled = off. A scheduled area whose time has
  // already passed is effectively live, so it reads as active.
  const status: "active" | "waiting" | "disabled" =
    area.mode === "disabled"
      ? "disabled"
      : area.mode === "active"
        ? "active"
        : future
          ? "waiting"
          : "active";

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
      <div className="rounded-2xl border border-border bg-background p-5">
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

  const modeBtn = (mode: AreaMode, label: string) => (
    <button
      key={mode}
      type="button"
      onClick={() => runSetMode(mode)}
      disabled={pending || area.mode === mode}
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:cursor-default ${
        area.mode === mode
          ? "border-primary bg-primary/10 font-medium text-foreground"
          : "border-border text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{area.label}</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.pill}`}
          >
            <span
              className={`size-1.5 rounded-full ${badge.dot}`}
              aria-hidden
            />
            {badge.text}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {area.lat.toFixed(5)}, {area.lng.toFixed(5)} · {area.radius_m} m
          {area.mode === "scheduled"
            ? ` · ${future ? `${dict.startsFuture} ${starts.toLocaleString()}` : dict.startsNow}`
            : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {modeBtn("active", dict.modeActive)}
        {modeBtn("scheduled", dict.modeScheduled)}
        {modeBtn("disabled", dict.modeDisabled)}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted/60"
        >
          {dict.edit}
        </button>
        <button
          type="button"
          onClick={runDelete}
          disabled={pending}
          className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:hover:bg-rose-950/40"
        >
          {dict.delete}
        </button>
      </div>
    </div>
  );
}
