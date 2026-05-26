"use client";

import { useState, useTransition } from "react";

export type GroupEnableToggleDict = {
  statusEnabled: string;
  statusDisabled: string;
  enableButton: string;
  disableButton: string;
  enableBusy: string;
  disableBusy: string;
  /** Confirm copy, {name} interpolated. */
  disableConfirm: string;
  enableConfirm: string;
  fail: string;
};

/**
 * Enable/disable toggle for a single group, rendered in the group-detail
 * header alongside the delete button. Disabling means the group's members
 * become `unavailable` UNLESS they also hold ≥1 other enabled group (the
 * `group_blocked` SQL predicate). The action fires `triggerResync` on the
 * server so the gate flip propagates to affected users immediately.
 */
export function GroupEnableToggle({
  groupId,
  groupName,
  enabled,
  dict,
  action,
}: {
  groupId: string;
  groupName: string;
  enabled: boolean;
  dict: GroupEnableToggleDict;
  action: (fd: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (pending) return;
    const msg = enabled ? dict.disableConfirm : dict.enableConfirm;
    if (!window.confirm(msg.replace("{name}", groupName || groupId.slice(0, 8))))
      return;
    setError(null);
    const fd = new FormData();
    fd.set("id", groupId);
    fd.set("enabled", enabled ? "false" : "true");
    startTransition(async () => {
      try {
        await action(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : dict.fail);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={[
          "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
          enabled
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
            : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400",
        ].join(" ")}
      >
        {enabled ? dict.statusEnabled : dict.statusDisabled}
      </span>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={[
          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-60",
          enabled
            ? "border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40",
        ].join(" ")}
      >
        {pending
          ? enabled
            ? dict.disableBusy
            : dict.enableBusy
          : enabled
            ? dict.disableButton
            : dict.enableButton}
      </button>
      {error ? (
        <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>
      ) : null}
    </div>
  );
}
