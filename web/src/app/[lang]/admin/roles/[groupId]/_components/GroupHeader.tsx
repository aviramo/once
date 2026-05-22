"use client";

import { useState, useTransition } from "react";
import { Card, StatusBadge } from "../../../_components/ui";

export type GroupHeaderDict = {
  members: string;
  statusActive: string;
  statusDisabled: string;
  enable: string;
  disable: string;
  rename: string;
  save: string;
  cancel: string;
  duplicate: string;
  fail: string;
};

function reason(err: unknown, dict: GroupHeaderDict): string {
  const m = err instanceof Error ? err.message : String(err);
  if (m === "duplicate_name") return dict.duplicate;
  return m;
}

/**
 * Group detail header: name (with inline rename), status badge, member count,
 * enable/disable toggle. Rename was moved off the groups list onto this page —
 * a group's name is part of its identity, edited where you are already in
 * context, not from a bulk listing.
 */
export function GroupHeader({
  groupId,
  initialName,
  enabled,
  members,
  dict,
  renameAction,
  setEnabledAction,
}: {
  groupId: string;
  initialName: string;
  enabled: boolean;
  members: number;
  dict: GroupHeaderDict;
  renameAction: (fd: FormData) => Promise<void>;
  setEnabledAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submitRename(fd: FormData) {
    fd.set("id", groupId);
    setError(null);
    startTransition(async () => {
      try {
        await renameAction(fd);
        setEditing(false);
      } catch (e) {
        setError(reason(e, dict));
      }
    });
  }

  function toggleEnabled() {
    if (pending) return;
    const fd = new FormData();
    fd.set("id", groupId);
    fd.set("enabled", String(!enabled));
    setError(null);
    startTransition(async () => {
      try {
        await setEnabledAction(fd);
      } catch (e) {
        setError(reason(e, dict));
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              action={submitRename}
              className="flex min-w-0 flex-wrap items-center gap-2"
            >
              <input
                name="name"
                required
                maxLength={64}
                defaultValue={initialName}
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-base font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button
                type="submit"
                disabled={pending}
                className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {dict.save}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
              >
                {dict.cancel}
              </button>
            </form>
          ) : (
            <h1 className="truncate text-lg font-bold leading-tight">
              {initialName}
            </h1>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {members} {dict.members}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge tone={enabled ? "ok" : "idle"}>
            {enabled ? dict.statusActive : dict.statusDisabled}
          </StatusBadge>
        </div>
      </div>

      {!editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {dict.rename}
          </button>
          <button
            type="button"
            onClick={toggleEnabled}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {enabled ? dict.disable : dict.enable}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </Card>
  );
}
