"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

export type EditorGroup = { id: string; name: string };

export type UserGroupsDict = {
  groups: string;
  groupsHint: string;
  noGroups: string;
};

/**
 * Per-user group checklist. Every group in the catalog is a checkbox; ticked =
 * assigned. Toggling is optimistic (the box flips instantly) and reconciled by
 * the server action's revalidate; a failure reverts the box and shows why.
 * Membership is organisational — it doesn't change availability.
 */
export function UserGroupsEditor({
  userId,
  groups,
  assigned,
  dict,
  action,
}: {
  userId: string;
  groups: EditorGroup[];
  assigned: string[];
  dict: UserGroupsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  const [on, setOn] = useState<Set<string>>(() => new Set(assigned));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(groupId: string) {
    const next = !on.has(groupId);
    setError(null);
    setPendingId(groupId);
    setOn((prev) => {
      const s = new Set(prev);
      if (next) s.add(groupId);
      else s.delete(groupId);
      return s;
    });
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("userId", userId);
        fd.set("groupId", groupId);
        fd.set("assigned", String(next));
        await action(fd);
      } catch (e) {
        // revert
        setOn((prev) => {
          const s = new Set(prev);
          if (next) s.delete(groupId);
          else s.add(groupId);
          return s;
        });
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPendingId(null);
      }
    });
  }

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">{dict.noGroups}</p>;
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">{dict.groupsHint}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {groups.map((group) => {
          const checked = on.has(group.id);
          const busy = pendingId === group.id;
          return (
            <li key={group.id} className="bg-background">
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                  busy && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={() => toggle(group.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {group.name}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}
