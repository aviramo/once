"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type GroupDangerDict = {
  deleteTitle: string;
  deleteDesc: string;
  deleteButton: string;
  /** "Cannot delete — N members still assigned" (when members > 0). */
  deleteBlocked: string;
  deleteConfirmTitle: string;
  /** Confirm body — {name} interpolated. */
  deleteConfirmBody: string;
  deleteBusy: string;
  fail: string;
  cancel: string;
};

/**
 * Group detail "danger zone" — currently delete only. Mirrors the user-detail
 * UserDangerZone shape so the two pages read the same. Delete is allowed only
 * when the group has zero members (the role_in_use FK also blocks it server-
 * side); a populated group shows the disabled button with a "remove members
 * first" explainer.
 */
export function GroupDangerZone({
  groupId,
  groupName,
  members,
  dict,
  deleteAction,
  compact = false,
}: {
  groupId: string;
  groupName: string;
  members: number;
  dict: GroupDangerDict;
  deleteAction: (fd: FormData) => Promise<void>;
  /** When true, render only the delete button inline (no rose-bordered card,
   * no title/desc rows). Used when the zone sits inside the group header. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const blocked = members > 0;
  const name = groupName || groupId.slice(0, 8);

  function run() {
    if (pending || blocked) return;
    const fd = new FormData();
    fd.set("id", groupId);
    startTransition(async () => {
      try {
        await deleteAction(fd);
        router.push("/admin/roles");
      } catch {
        setMsg(dict.fail);
        setModal(false);
      }
    });
  }

  const modalRoot = modal ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) setModal(false);
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl">
        <h2 className="text-base font-semibold">{dict.deleteConfirmTitle}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
          {dict.deleteConfirmBody.replace("{name}", name)}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setModal(false)}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {dict.cancel}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="rounded-lg border border-rose-300 bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-default disabled:opacity-60 dark:border-rose-900"
          >
            {pending ? dict.deleteBusy : dict.deleteButton}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setModal(true);
          }}
          disabled={pending || blocked}
          title={blocked ? dict.deleteBlocked : undefined}
          className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-default disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
        >
          {dict.deleteButton}
        </button>
        {msg ? (
          <span className="text-xs text-rose-600 dark:text-rose-400">
            {msg}
          </span>
        ) : null}
        {modalRoot}
      </>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-200 dark:border-rose-900/60">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-rose-50/40 px-4 py-3.5 dark:bg-rose-950/20">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{dict.deleteTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {blocked ? dict.deleteBlocked : dict.deleteDesc}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setModal(true);
          }}
          disabled={pending || blocked}
          className="shrink-0 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-default disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
        >
          {dict.deleteButton}
        </button>
      </div>
      {msg ? (
        <p className="border-t border-rose-200 px-4 py-2.5 text-xs text-rose-600 dark:border-rose-900/60 dark:text-rose-400">
          {msg}
        </p>
      ) : null}
      {modalRoot}
    </div>
  );
}
