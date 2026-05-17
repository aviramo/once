"use client";

import { useState, useTransition } from "react";
import type { ResetResult } from "../actions";

type Dict = {
  label: string;
  confirm: string;
  busy: string;
  done: string;
  fail: string;
};

/**
 * The global "reset users" control, moved out of the mobile app into the
 * admin user-management dashboard. Confirms before firing (the action is
 * irreversible), runs the server action in a transition, and reports the
 * outcome inline. The action itself recomputes geo availability, so a reset
 * no longer breaks the per-user gate.
 */
export function ResetAllButton({
  action,
  dict,
}: {
  action: () => Promise<ResetResult>;
  dict: Dict;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    if (pending) return;
    if (!window.confirm(dict.confirm)) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await action();
        setMsg(
          res.ok
            ? { ok: true, text: dict.done }
            : { ok: false, text: dict.fail },
        );
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
        onClick={run}
        disabled={pending}
        className="shrink-0 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-default disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
      >
        {pending ? dict.busy : dict.label}
      </button>
    </div>
  );
}
