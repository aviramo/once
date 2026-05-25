"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Tone } from "@/lib/humanize";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./ui";
import { releaseUserPage } from "../users/actions";

type Dict = {
  /** Single-word action label on the revealed button — e.g. "שחרור". */
  release: string;
  busy: string;
  done: string;
  fail: string;
};

/**
 * A status badge that doubles as the trigger for "release this page". Clicking
 * the badge REVEALS a single "release" button next to it; clicking that button
 * runs `releaseUserPage(userId, page)` (the same state-aware teardown RPC the
 * user-detail screen uses). Clicking anywhere outside the badge + revealed
 * button collapses the button back (no popup, no confirm dialog — the reveal
 * itself is the confirmation step).
 *
 * Exception: when `tone === "ok"` the page is already discoverable (page1 free,
 * or page2 free) so there is nothing meaningful to release — the badge then
 * renders inert (no button, no reveal) per the user's "green = hands off" rule.
 *
 * `onOpenChange` lets the parent card lift its z-index while the button is
 * revealed, so sibling cards' avatars never paint over it.
 */
type BadgeProps = {
  userId: string;
  page: 1 | 2;
  tone: Tone;
  text: string;
  dict: Dict;
  /** When true the badge renders as a static StatusBadge with no reveal /
   * action — used in read-only contexts (e.g. group-manager view). */
  readOnly?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function PageReleaseBadge(props: BadgeProps) {
  if (props.tone === "ok" || props.readOnly) {
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
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"ok" | "fail" | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Click outside the whole wrapper (badge + revealed button) collapses it,
  // just like a popup would dismiss on outside-click. Escape closes too.
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

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setResult(null);
    setOpen((v) => !v);
  }

  function run(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    startTransition(async () => {
      try {
        const res = await releaseUserPage(userId, page);
        setResult(res.ok ? "ok" : "fail");
        if (res.ok) {
          // Brief success flash, then collapse — Realtime updates the badge.
          setTimeout(() => setOpen(false), 700);
        }
      } catch {
        setResult("fail");
      }
    });
  }

  return (
    <span
      ref={wrapRef}
      className="pointer-events-auto relative inline-flex items-center gap-1.5"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
      >
        <StatusBadge tone={tone}>{text}</StatusBadge>
      </button>
      {open ? (
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold shadow-sm transition-opacity disabled:opacity-50",
            result === "ok"
              ? "bg-emerald-600 text-white"
              : result === "fail"
                ? "bg-rose-600 text-white"
                : "bg-rose-600 text-white hover:opacity-90",
          )}
        >
          {pending
            ? dict.busy
            : result === "ok"
              ? dict.done
              : result === "fail"
                ? dict.fail
                : dict.release}
        </button>
      ) : null}
    </span>
  );
}
