"use client";

import { useTransition, useState } from "react";

export type PermissionRow = {
  key: string;
  /** Localized label from the i18n dict, or null to fall back to the raw key. */
  label: string | null;
};

export type GroupPermissionsDict = {
  hint: string;
  /** Shown above the checklist when the viewer is not an owner. */
  ownerOnlyHint: string;
  noPermissions: string;
  fail: string;
};

/**
 * Per-group permissions checklist. Renders one checkbox per known permission;
 * toggling fires `assignAction(fd)`. The catalog comes from the server (a
 * select on public.permissions); the assignedKeys set is the subset this
 * group currently has.
 *
 * `readOnly`: when true (viewer lacks the `owner` permission), the checklist
 * renders the same rows but disabled, with a hint that only owners can
 * change assignments. The server action `setGroupPermission` is owner-gated
 * too, so even a forged form submission fails — this UI just makes the
 * constraint visible upfront.
 */
export function GroupPermissions({
  groupId,
  catalog,
  assignedKeys,
  readOnly = false,
  dict,
  assignAction,
}: {
  groupId: string;
  catalog: PermissionRow[];
  assignedKeys: string[];
  readOnly?: boolean;
  dict: GroupPermissionsDict;
  assignAction: (fd: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assigned = new Set(assignedKeys);

  function toggle(key: string) {
    if (pending || readOnly) return;
    const fd = new FormData();
    fd.set("groupId", groupId);
    fd.set("key", key);
    fd.set("assigned", String(!assigned.has(key)));
    setError(null);
    setBusyKey(key);
    startTransition(async () => {
      try {
        await assignAction(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : dict.fail);
      } finally {
        setBusyKey(null);
      }
    });
  }

  if (catalog.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
        {dict.noPermissions}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{dict.hint}</p>
      {readOnly && dict.ownerOnlyHint ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {dict.ownerOnlyHint}
        </p>
      ) : null}
      <div className="space-y-1.5">
        {catalog.map((p) => {
          const isOn = assigned.has(p.key);
          const isBusy = busyKey === p.key;
          const disabled = pending || readOnly;
          return (
            <label
              key={p.key}
              className={[
                "flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
                isOn
                  ? "border-primary/60"
                  : readOnly
                    ? "border-border"
                    : "border-border hover:border-primary/40",
                isBusy ? "opacity-60" : "",
                readOnly ? "opacity-80" : "",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => toggle(p.key)}
                disabled={disabled}
                className="size-4 shrink-0 accent-primary"
              />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{p.label ?? p.key}</span>
                {p.label ? (
                  <span className="ms-2 text-[11px] tabular-nums text-muted-foreground">
                    {p.key}
                  </span>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}
