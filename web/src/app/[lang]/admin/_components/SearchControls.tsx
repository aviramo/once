"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

type StateOption = { value: string; label: string; count?: number };

// "label (n)" when the option carries a facet count, else just the label.
function optionLabel(label: string, count?: number): string {
  return typeof count === "number" ? `${label} (${count})` : label;
}

type Props = {
  searchPlaceholder: string;
  advancedLabel: string;
  clearLabel: string;
  p1Label: string;
  p2Label: string;
  roleLabel: string;
  anyLabel: string;
  /** Total user count shown next to the "any" (no-filter) option. */
  anyCount?: number;
  p1States: StateOption[];
  p2States: StateOption[];
  roleOptions: StateOption[];
};

export function SearchControls({
  searchPlaceholder,
  advancedLabel,
  clearLabel,
  p1Label,
  p2Label,
  roleLabel,
  anyLabel,
  anyCount,
  p1States,
  p2States,
  roleOptions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [p1, setP1] = useState(sp.get("p1") ?? "");
  const [p2, setP2] = useState(sp.get("p2") ?? "");
  const [role, setRole] = useState(sp.get("role") ?? "");
  const [, startTransition] = useTransition();
  const activeFilters = (p1 ? 1 : 0) + (p2 ? 1 : 0) + (role ? 1 : 0);
  const [open, setOpen] = useState(activeFilters > 0);

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (p1) params.set("p1", p1);
      if (p2) params.set("p2", p2);
      if (role) params.set("role", role);
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [q, p1, p2, role, pathname, router]);

  const selectCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 my-auto ms-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-xl border border-border bg-background py-2.5 ps-9 pe-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
            open || activeFilters > 0
              ? "border-primary/40 bg-primary/5 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          aria-expanded={open}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">{advancedLabel}</span>
          {activeFilters > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {activeFilters}
            </span>
          ) : null}
        </button>
      </div>

      {open ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <label className="flex-1 space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {p1Label}
            </span>
            <select
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              className={selectCls}
            >
              <option value="">{optionLabel(anyLabel, anyCount)}</option>
              {p1States.map((s) => (
                <option key={s.value} value={s.value}>
                  {optionLabel(s.label, s.count)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {p2Label}
            </span>
            <select
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              className={selectCls}
            >
              <option value="">{optionLabel(anyLabel, anyCount)}</option>
              {p2States.map((s) => (
                <option key={s.value} value={s.value}>
                  {optionLabel(s.label, s.count)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {roleLabel}
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={selectCls}
            >
              <option value="">{optionLabel(anyLabel, anyCount)}</option>
              {roleOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {optionLabel(s.label, s.count)}
                </option>
              ))}
            </select>
          </label>
          {activeFilters > 0 ? (
            <button
              type="button"
              onClick={() => {
                setP1("");
                setP2("");
                setRole("");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
              {clearLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
