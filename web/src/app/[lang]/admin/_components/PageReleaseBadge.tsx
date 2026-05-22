"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Tone } from "@/lib/humanize";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./ui";
import { releaseUserPage } from "../users/actions";

type Dict = {
  /** Already-interpolated confirm prompt — the caller fills {target}. */
  confirmText: string;
  cancel: string;
  confirm: string;
  busy: string;
  done: string;
  fail: string;
};

/**
 * A status badge that doubles as the trigger for "release this page". Clicking
 * the badge opens a small confirm popover anchored to it; confirming calls
 * `releaseUserPage(userId, page)` (the same state-aware teardown RPC the
 * user-detail screen uses). Used on the users-list card so an operator can
 * release a single page directly from the badge — no detour through the ⋯
 * actions menu (which keeps release only for the BULK sheet).
 *
 * Exception: when `tone === "ok"` the page is already discoverable (page1 free,
 * or page2 free) so there is nothing meaningful to release — the badge then
 * renders inert (no button, no popover) per the user's "green = hands off" rule.
 *
 * `onOpenChange` lets the parent card lift its z-index while the popover is
 * open, so sibling cards' avatars never paint over it (the popover lives inside
 * the card's local stacking context).
 */
type BadgeProps = {
  userId: string;
  page: 1 | 2;
  tone: Tone;
  text: string;
  dict: Dict;
  onOpenChange?: (open: boolean) => void;
};

/** Outer gate: green tone means the page is already discoverable, so release
 * would be a no-op — render an inert badge with no hooks at all. Otherwise
 * mount the interactive variant. Split this way (instead of an early return
 * before the hooks) so the hook order stays stable across renders. */
export function PageReleaseBadge(props: BadgeProps) {
  if (props.tone === "ok") {
    return <StatusBadge tone={props.tone}>{props.text}</StatusBadge>;
  }
  return <InteractiveBadge {...props} />;
}

function InteractiveBadge({
  userId,
  page,
  tone,
  text,
  dict,
  onOpenChange,
}: BadgeProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"ok" | "fail" | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Notify the parent card so it can lift its z-index while we're open.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) {
        setOpen(false);
      }
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

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    // Open upward when the trigger is near the viewport bottom (decided once
    // at open time, so the panel never flickers after mount).
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      setDropUp(below < 180 && r.top > below);
    }
    setResult(null);
    setOpen(true);
  }

  function run(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        const res = await releaseUserPage(userId, page);
        setResult(res.ok ? "ok" : "fail");
        if (res.ok) {
          // Brief success flash, then dismiss — Realtime updates the card.
          setTimeout(() => setOpen(false), 700);
        }
      } catch {
        setResult("fail");
      }
    });
  }

  return (
    <span className="pointer-events-auto relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
      >
        <StatusBadge tone={tone}>{text}</StatusBadge>
      </button>
      {open ? (
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute end-0 z-40 w-64 rounded-xl border border-border bg-background p-3 shadow-xl",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          <p className="text-xs leading-relaxed">{dict.confirmText}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
              disabled={pending}
              className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {dict.cancel}
            </button>
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50",
                result === "ok"
                  ? "bg-emerald-600 text-white"
                  : result === "fail"
                    ? "bg-rose-600 text-white"
                    : "bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {pending
                ? dict.busy
                : result === "ok"
                  ? dict.done
                  : result === "fail"
                    ? dict.fail
                    : dict.confirm}
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
