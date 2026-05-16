"use client";

import { useState, useTransition } from "react";
import { AreaForm, type AreaInitial } from "./AreaForm";

type RowDict = {
  edit: string;
  delete: string;
  enable: string;
  disable: string;
  enabled: string;
  disabled: string;
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
  toggleAction,
}: {
  area: AreaInitial;
  dict: RowDict;
  lang: string;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
  toggleAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  // Captured once at mount (lazy state init keeps the impure read out of the
  // render path). The label only needs to be right at paint time.
  const [now] = useState(() => Date.now());

  const starts = new Date(area.starts_at);
  const future = starts.getTime() > now;

  function runToggle() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", area.id);
      fd.set("enabled", String(!area.enabled));
      await toggleAction(fd);
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{area.label}</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              area.enabled
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                area.enabled ? "bg-emerald-500" : "bg-zinc-400"
              }`}
              aria-hidden
            />
            {area.enabled ? dict.enabled : dict.disabled}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {area.lat.toFixed(5)}, {area.lng.toFixed(5)} · {area.radius_m} m ·{" "}
          {future
            ? `${dict.startsFuture} ${starts.toLocaleString()}`
            : dict.startsNow}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={runToggle}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted/60 disabled:opacity-60"
        >
          {area.enabled ? dict.disable : dict.enable}
        </button>
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
