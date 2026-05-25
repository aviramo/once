"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  UserGroupsEditor,
  type EditorGroup,
  type UserGroupsDict,
} from "./UserGroupsEditor";

/**
 * Inline group chips for the identity card. Each assigned group is a small
 * pill. Clicking ANY chip — or the trailing "+" affordance — opens a
 * popover-attached version of the existing UserGroupsEditor checklist so the
 * operator can toggle group membership in place. Clicking outside the wrapper,
 * or Escape, closes the popover.
 *
 * Replaces the standalone "Groups" section on the user-detail page: the
 * source-of-truth checklist still exists, just gated behind a chip.
 */
export function UserGroupsChips({
  userId,
  groups,
  assigned,
  dict,
  emptyLabel,
  manageLabel,
  readOnly = false,
  action,
}: {
  userId: string;
  groups: EditorGroup[];
  assigned: string[];
  dict: UserGroupsDict;
  /** Tag shown when the user belongs to zero groups (clickable to open the
   * checklist so the operator can assign one). */
  emptyLabel: string;
  /** Sub-label on the "+" affordance / popover header — e.g. "ניהול קבוצות". */
  manageLabel: string;
  /** When true the chips render as inert badges with no popover / add
   * affordance — used in read-only contexts (group-manager view). */
  readOnly?: boolean;
  action: (fd: FormData) => Promise<void>;
}) {
  const assignedSet = new Set(assigned);
  const assignedGroups = groups.filter((r) => assignedSet.has(r.id));

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  if (readOnly) {
    const tag =
      "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium";
    if (assignedGroups.length === 0) {
      return (
        <span className={cn(tag, "bg-muted text-muted-foreground")}>
          {emptyLabel}
        </span>
      );
    }
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {assignedGroups.map((r) => (
          <span key={r.id} className={cn(tag, "bg-primary/10 text-primary")}>
            {r.name}
          </span>
        ))}
      </span>
    );
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tag =
    "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors";

  return (
    <div ref={wrapRef} className="relative inline-flex flex-wrap items-center gap-1">
      {assignedGroups.length === 0 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            tag,
            "border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {emptyLabel}
        </button>
      ) : (
        assignedGroups.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              tag,
              "bg-primary/10 text-primary hover:bg-primary/15",
            )}
          >
            {r.name}
          </button>
        ))
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={manageLabel}
        className={cn(
          tag,
          "border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
        )}
      >
        <Plus className="size-3" />
      </button>

      {open ? (
        <div className="absolute end-0 top-full z-40 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-background p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold">{manageLabel}</p>
          <UserGroupsEditor
            userId={userId}
            groups={groups}
            assigned={assigned}
            dict={dict}
            action={action}
          />
        </div>
      ) : null}
    </div>
  );
}
