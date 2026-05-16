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
      <div className="rounded-xl border border-border bg-background p-4">
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{area.label}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              area.enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
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
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {area.enabled ? dict.disable : dict.enable}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          {dict.edit}
        </button>
        <button
          type="button"
          onClick={runDelete}
          disabled={pending}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-60"
        >
          {dict.delete}
        </button>
      </div>
    </div>
  );
}
