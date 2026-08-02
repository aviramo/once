"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { RANGES, DEFAULT_RANGE, type Range } from "@/lib/range";

/**
 * The period every activity figure on the dashboard is read against — a day, a
 * week, a month, or the whole history. It is a segmented pill next to the
 * section heading rather than a dropdown, because the four options are the
 * whole vocabulary and an operator compares them by tapping across: "5 this
 * week, 40 all time" is the reading, and a dropdown hides one number behind a
 * click every time.
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
        "flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5",
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
            "rounded-md px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5",
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
