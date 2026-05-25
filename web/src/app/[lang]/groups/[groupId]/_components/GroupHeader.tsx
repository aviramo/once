"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Card } from "../../../_components/ui";

export type GroupHeaderDict = {
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
 * Group detail header: name + inline rename icon (opposite side of the title
 * line) + the invite-code row + the danger-zone delete button. Everything
 * that identifies and configures the group sits in this one card so the
 * layout has a single "group identity" block instead of separate sections.
 * The member count is intentionally NOT shown here — it lives on the
 * "חברי הקבוצה" section header below, so duplicating it would be noise.
 * Rename is shown when `canRename`; the danger zone delete (admin only) is
 * appended via `extraActions` underneath.
 */
export function GroupHeader({
  groupId,
  initialName,
  canRename = false,
  dict,
  renameAction,
  inviteCode,
  extraActions,
}: {
  groupId: string;
  initialName: string;
  /** True for admins and for a manager of this group. False = read-only. */
  canRename?: boolean;
  dict: GroupHeaderDict;
  renameAction: (fd: FormData) => Promise<void>;
  /** Per-group invite-code row (rendered by `GroupInviteCode`) — sits inside
   * this header card directly under the title block, NOT as its own
   * section, so name + code read as one identity unit. */
  inviteCode?: ReactNode;
  /** Extra actions rendered under the invite-code row — e.g. the admin-only
   * delete button (rendered by GroupDangerZone in compact mode). */
  extraActions?: ReactNode;
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
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate text-lg font-bold leading-tight">
                {initialName}
              </h1>
              {canRename ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  disabled={pending}
                  title={dict.rename}
                  aria-label={dict.rename}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                >
                  <Pencil className="size-3.5" />
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {!editing && inviteCode ? (
        <div className="mt-3 border-t border-border pt-3">
          {inviteCode}
        </div>
      ) : null}

      {!editing && extraActions ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {extraActions}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </Card>
  );
}
