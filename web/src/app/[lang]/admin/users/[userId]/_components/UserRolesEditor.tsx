"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

export type EditorRole = { id: string; name: string; enabled: boolean };

export type UserRolesDict = {
  roles: string;
  rolesHint: string;
  noRoles: string;
  disabledTag: string;
};

/**
 * Per-user role checklist. Every role in the catalog is a checkbox; ticked =
 * assigned. Toggling is optimistic (the box flips instantly) and reconciled by
 * the server action's revalidate; a failure reverts the box and shows why.
 * Assigning a DISABLED role gates the user exactly like geo-unavailability —
 * the section hint says so and disabled roles carry a tag.
 */
export function UserRolesEditor({
  userId,
  roles,
  assigned,
  dict,
  action,
}: {
  userId: string;
  roles: EditorRole[];
  assigned: string[];
  dict: UserRolesDict;
  action: (fd: FormData) => Promise<void>;
}) {
  const [on, setOn] = useState<Set<string>>(() => new Set(assigned));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(roleId: string) {
    const next = !on.has(roleId);
    setError(null);
    setPendingId(roleId);
    setOn((prev) => {
      const s = new Set(prev);
      if (next) s.add(roleId);
      else s.delete(roleId);
      return s;
    });
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("userId", userId);
        fd.set("roleId", roleId);
        fd.set("assigned", String(next));
        await action(fd);
      } catch (e) {
        // revert
        setOn((prev) => {
          const s = new Set(prev);
          if (next) s.delete(roleId);
          else s.add(roleId);
          return s;
        });
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPendingId(null);
      }
    });
  }

  if (roles.length === 0) {
    return <p className="text-sm text-muted-foreground">{dict.noRoles}</p>;
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">{dict.rolesHint}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {roles.map((role) => {
          const checked = on.has(role.id);
          const busy = pendingId === role.id;
          return (
            <li key={role.id} className="bg-background">
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
          );
        })}
      </ul>
      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}
