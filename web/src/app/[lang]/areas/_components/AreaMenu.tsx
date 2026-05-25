"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  /** Greyed-out, non-selectable (e.g. the mode the area is already in). */
  disabled?: boolean;
  /** Rose styling — the destructive item (delete). */
  danger?: boolean;
  /** The currently-active choice — shows a check so the row's state is legible. */
  current?: boolean;
  /** Draw a divider above this item (separates delete from the mode group). */
  separated?: boolean;
};

// The single kebab (⋮) menu used by every area row. Owns its open/close,
// outside-click + Escape dismissal, and focus return. Logical positioning
// (`end-0`) so it anchors correctly in both RTL (he) and LTR (en) admin.
export function AreaMenu({
  ariaLabel,
  items,
  onOpenChange,
}: {
  ariaLabel: string;
  items: MenuItem[];
  /** Lets the row lift its stacking context so the panel paints over siblings. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  // Open upward when the row is near the bottom of the viewport (the last
  // row's menu was otherwise clipped off-screen and unreachable). Decided at
  // open time from the trigger's position so there's no post-mount flicker.
  const [dropUp, setDropUp] = useState(false);

  function change(next: boolean) {
    if (next) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        // Generous per-item estimate (item + the delete divider/padding) so a
        // borderline case still flips up and stays fully reachable.
        const estimated = items.length * 44 + 24;
        const below = window.innerHeight - r.bottom;
        setDropUp(below < estimated && r.top > below);
      }
    }
    setOpen(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) change(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        change(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
    // `change` is stable enough for this lifecycle; deps kept minimal on
    // purpose so the listeners attach once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => change(!open)}
        className={cn(
          "flex size-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors",
          open
            ? "border-primary bg-muted/60 text-foreground"
            : "border-border hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          className={cn(
            "absolute end-0 z-30 min-w-44 overflow-hidden rounded-xl border border-border bg-background py-1 shadow-lg",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                change(false);
                it.onSelect();
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition-colors",
                it.separated && "mt-1 border-t border-border pt-2",
                it.disabled
                  ? "cursor-default text-muted-foreground"
                  : it.danger
                    ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    : "text-foreground hover:bg-muted",
              )}
            >
              <span>{it.label}</span>
              {it.current ? (
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 shrink-0 text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
