"use client";

import { useMemo, useState, useTransition } from "react";
import type { ResetResult } from "../actions";

type Role = { id: string; name: string; enabled: boolean };

type Dict = {
  label: string;
  confirm: string;
  busy: string;
  done: string;
  fail: string;
  title: string;
  hint: string;
  selectAll: string;
  deselectAll: string;
  noRoles: string;
  noneSelected: string;
  apply: string;
  cancel: string;
  disabledTag: string;
};

/**
 * Role-scoped "reset users" control. Opens a popup with a checklist of every
 * role plus a select-all / deselect-all toggle; only users assigned to the
 * ticked roles are reset. Still guards the irreversible action with a final
 * confirm, runs the server action in a transition, and reports inline.
 */
export function ResetAllButton({
  action,
  roles,
  dict,
}: {
  action: (roleIds: string[]) => Promise<ResetResult>;
  roles: Role[];
  dict: Dict;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const allSelected = useMemo(
    () => roles.length > 0 && selected.size === roles.length,
    [roles.length, selected.size],
  );

  function openPopup() {
    setMsg(null);
    setSelected(new Set());
    setOpen(true);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(roles.map((r) => r.id)));
  }

  function apply() {
    if (pending || selected.size === 0) return;
    if (!window.confirm(dict.confirm)) return;
    const ids = [...selected];
    startTransition(async () => {
      try {
        const res = await action(ids);
        if (res.ok) {
          setMsg({ ok: true, text: `${dict.done} (${res.users})` });
          setOpen(false);
        } else {
          setMsg({ ok: false, text: dict.fail });
        }
      } catch {
        setMsg({ ok: false, text: dict.fail });
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {msg ? (
        <span
          className={
            msg.ok
              ? "text-xs text-emerald-600 dark:text-emerald-400"
              : "text-xs text-rose-600 dark:text-rose-400"
          }
        >
          {msg.text}
        </span>
      ) : null}
      <button
        type="button"
        onClick={openPopup}
        disabled={pending}
        className="shrink-0 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-default disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
      >
        {pending ? dict.busy : dict.label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl">
            <h2 className="text-base font-semibold">{dict.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{dict.hint}</p>

            {roles.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {dict.noRoles}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="mt-4 text-xs font-medium text-primary transition-colors hover:underline"
                >
                  {allSelected ? dict.deselectAll : dict.selectAll}
                </button>
                <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {roles.map((role) => (
                    <li key={role.id} className="bg-background">
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={selected.has(role.id)}
                          onChange={() => toggle(role.id)}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {role.name}
                        </span>
                        {!role.enabled ? (
                          <span className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {dict.disabledTag}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
              >
                {dict.cancel}
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={pending || selected.size === 0}
                title={selected.size === 0 ? dict.noneSelected : undefined}
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                {pending ? dict.busy : `${dict.apply} (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
