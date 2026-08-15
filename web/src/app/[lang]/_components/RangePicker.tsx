"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { RANGES, DEFAULT_RANGE, type Range } from "@/lib/range";

/**
 * The period EVERY figure on the dashboard is read against — a day, a week, a
 * month, or the whole history. It is a segmented pill rather than a dropdown,
 * because the four options are the whole vocabulary and an operator compares
 * them by tapping across: "5 this week, 40 all time" is the reading, and a
 * dropdown hides one number behind a click every time.
 *
 * It stands in the HEADER beside the environment switch (user directive
 * 2026-08-15), which is what the shape above is really for: it used to sit
 * against the activity section's heading, where it read as that section's own
 * filter, and it bounds the whole screen now. Same segmented pill, same four
 * words — only the two selectors are together, and a section that is subject
 * to the period no longer has to say so.
 *
 * The values and the parser live in `lib/range.ts`, not here: every export of
 * a `"use client"` module becomes a client reference in the server graph, so
 * the page could not call them from this file.
 */

export function RangePicker({
  range,
  labels,
}: {
  range: Range;
  labels: Record<Range, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pick(next: Range) {
    if (next === range) return;
    const params = new URLSearchParams(sp.toString());
    if (next === DEFAULT_RANGE) params.delete("range");
    else params.set("range", next);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <div
      role="group"
      className={cn(
        // `shrink-0` for the same reason EnvSwitch has it: on a narrow phone
        // the header yields at the wordmark, never at a selector.
        "flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5",
        pending && "opacity-70",
      )}
    >
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => pick(r)}
          aria-pressed={range === r}
          className={cn(
            // Tighter than EnvSwitch's cell on a phone: four cells against its
            // two, and the header holds both now.
            "rounded-md px-1.5 py-1 text-xs font-semibold transition-colors sm:px-2.5",
            range === r
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[r]}
        </button>
      ))}
    </div>
  );
}
