"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ArrowUpDown } from "lucide-react";

type Option = { value: string; label: string };

type Dict = {
  searchPlaceholder: string;
  sortLabel: string;
  sortOptions: Option[];
};

/**
 * URL-backed filter bar for the Bugs screen — search text on the reporter's
 * name / email plus a sort knob. Preserves every other query param (notably
 * the Open / Handled tab's `status`) so changing one knob never loses the
 * others.
 */
export function BugsFilters({ dict }: { dict: Dict }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [sort, setSort] = useState(sp.get("sort") ?? "newest");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      if (sort && sort !== "newest") params.set("sort", sort);
      else params.delete("sort");
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort, pathname, router]);

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
