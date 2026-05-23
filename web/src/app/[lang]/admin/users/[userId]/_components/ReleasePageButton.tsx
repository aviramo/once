"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { releaseUserPage } from "../../actions";

/**
 * Releases page1 or page2 of this user to its default state (via
 * app_admin_release_page1 / app_admin_release_page2) — a state-aware teardown
 * that repairs the counterparty too.
 *
 * Interaction model (matches PageReleaseBadge on the users-list cards): one
 * click on the button reveals a small "release" confirmation button next to
 * it; clicking that second button actually runs the release. Clicking
 * anywhere else collapses the reveal — no modal, no native confirm prompt.
 *
 * `confirmText` is kept as a prop for backward-compat with existing callers
 * but is no longer rendered (the reveal IS the confirmation step).
 */
export function ReleasePageButton({
  userId,
  page,
  label,
  busyLabel,
  confirmLabel = "שחרור",
}: {
  userId: string;
  page: 1 | 2;
  label: string;
  /** Unused now — kept for back-compat. The reveal is the confirmation. */
  confirmText?: string;
  busyLabel: string;
  /** Label of the revealed confirm button. Defaults to "שחרור". */
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<"ok" | "fail" | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // Click outside the wrapper (or Escape) collapses the reveal — popup-style
  // dismiss without an actual popup.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t)) setOpen(false);
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

  function toggle() {
    if (pending) return;
    setDone(null);
    setOpen((v) => !v);
  }

  function run() {
    if (pending) return;
    startTransition(async () => {
      try {
        const r = await releaseUserPage(userId, page);
        setDone(r.ok ? "ok" : "fail");
        if (r.ok) setTimeout(() => setOpen(false), 700);
      } catch {
        setDone("fail");
      }
    });
  }

  return (
    <span ref={wrapRef} className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-expanded={open}
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
      {open ? (
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-opacity disabled:opacity-50",
            done === "ok"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white hover:opacity-90",
          )}
        >
          {pending ? busyLabel : confirmLabel}
        </button>
      ) : null}
    </span>
  );
}
