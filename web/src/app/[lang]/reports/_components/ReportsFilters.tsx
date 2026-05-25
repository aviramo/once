"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ArrowUpDown } from "lucide-react";

type Option = { value: string; label: string };

type Dict = {
  searchPlaceholder: string;
  contextLabel: string;
  contextAny: string;
  contextOptions: Option[];
  sortLabel: string;
  sortOptions: Option[];
};

/**
 * URL-backed filter bar for the Reporters screen — search text on the
 * reporter's name / email, context filter on the underlying reports, and a
 * sort knob over reporter groups. Preserves every other query param (notably
 * the Pending / Handled tab's `status`) so changing one knob never loses the
 * others.
 */
export function ReportsFilters({ dict }: { dict: Dict }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [ctx, setCtx] = useState(sp.get("ctx") ?? "");
  const [sort, setSort] = useState(sp.get("sort") ?? "newest");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      if (ctx) params.set("ctx", ctx);
      else params.delete("ctx");
      if (sort && sort !== "newest") params.set("sort", sort);
      else params.delete("sort");
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    }, 200);
    return () => clearTimeout(handle);
    // `sp` is intentionally NOT a dep — the effect's job is to mirror local
    // state into the URL; URL-driven changes propagate via state, not here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ctx, sort, pathname, router]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute inset-y-0 my-auto ms-3 size-4 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          placeholder={dict.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg border border-border bg-background py-2.5 ps-9 pe-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </div>
      <label className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background ps-3">
        <span className="text-xs font-medium text-muted-foreground">
          {dict.contextLabel}
        </span>
        <select
          value={ctx}
          onChange={(e) => setCtx(e.target.value)}
          aria-label={dict.contextLabel}
          className="cursor-pointer bg-transparent py-2 pe-3 text-sm font-medium outline-none"
        >
          <option value="">{dict.contextAny}</option>
          {dict.contextOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background ps-3">
        <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-medium text-muted-foreground">
          {dict.sortLabel}
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label={dict.sortLabel}
          className="cursor-pointer bg-transparent py-2 pe-3 text-sm font-semibold outline-none"
        >
          {dict.sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
