"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The single expand-on-demand primitive. Screens stay minimal by default and
 * push every secondary detail behind one of these — never a second
 * hand-rolled toggle.
 */

export function Disclosure({
  label,
  openLabel,
  children,
  defaultOpen = false,
  tone = "muted",
}: {
  label: string;
  openLabel?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** "muted" = quiet inline link (technical detail). "button" = bordered. */
  tone?: "muted" | "button";
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm transition-colors",
          tone === "button"
            ? "rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted/60"
            : "font-medium text-muted-foreground hover:text-foreground",
        )}
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            "size-4 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
        {open ? (openLabel ?? label) : label}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * Shows the first `initial` rows of a long list and reveals the rest behind a
 * single toggle. Keeps activity / interaction lists short by default.
 */
export function RevealList({
  items,
  initial = 6,
  moreLabel,
  lessLabel,
}: {
  items: ReactNode[];
  initial?: number;
  moreLabel: string;
  lessLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const hidden = items.length - initial;
  const shown = open ? items : items.slice(0, initial);
  return (
    <div>
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {shown.map((node, i) => (
          <li key={i} className="bg-background">
            {node}
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
          {open ? lessLabel : `${moreLabel} (${hidden})`}
        </button>
      ) : null}
    </div>
  );
}
