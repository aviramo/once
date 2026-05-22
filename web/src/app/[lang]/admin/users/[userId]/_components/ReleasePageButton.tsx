"use client";

import { useState, useTransition } from "react";
import { Eraser } from "lucide-react";
import { releaseUserPage } from "../../actions";

/**
 * Releases page1 or page2 of this user to its default state (via
 * app_admin_release_page1 / app_admin_release_page2) — a state-aware teardown
 * that repairs the counterparty too. Confirms first; reports inline.
 */
export function ReleasePageButton({
  userId,
  page,
  label,
  confirmText,
  busyLabel,
}: {
  userId: string;
  page: 1 | 2;
  label: string;
  confirmText: string;
  busyLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<"ok" | "fail" | null>(null);

  function run() {
    if (pending) return;
    if (!window.confirm(confirmText)) return;
    setDone(null);
    startTransition(async () => {
      try {
        const r = await releaseUserPage(userId, page);
        setDone(r.ok ? "ok" : "fail");
      } catch {
        setDone("fail");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
    >
      <Eraser className="size-3.5" />
      {pending ? busyLabel : label}
      {done === "ok" ? (
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          ✓
        </span>
      ) : null}
      {done === "fail" ? (
        <span className="font-bold text-rose-600 dark:text-rose-400">✕</span>
      ) : null}
    </button>
  );
}
