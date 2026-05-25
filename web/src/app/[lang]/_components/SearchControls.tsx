"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
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
  groupLabel: string;
  availLabel: string;
  tierLabel: string;
  genderLabel: string;
  osLabel: string;
  segLabel: string;
  anyLabel: string;
  /** Total user count shown next to the "any" (no-filter) option. */
  anyCount?: number;
  sortLabel: string;
  sortOptions: StateOption[];
  p1States: StateOption[];
  p2States: StateOption[];
  roleOptions: StateOption[];
  availOptions: StateOption[];
  tierOptions: StateOption[];
  genderOptions: StateOption[];
  osOptions: StateOption[];
  segOptions: StateOption[];
};

const selectCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";

/** One labelled <select> — the single source for every advanced filter
 * dropdown. Variants are just different option lists, never a forked
 * component. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  anyLabel,
  anyCount,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: StateOption[];
  anyLabel: string;
  anyCount?: number;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectCls}
      >
        <option value="">{optionLabel(anyLabel, anyCount)}</option>
        {options.map((s) => (
          <option key={s.value} value={s.value}>
            {optionLabel(s.label, s.count)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchControls({
  searchPlaceholder,
  advancedLabel,
  clearLabel,
  p1Label,
  p2Label,
  groupLabel,
  availLabel,
  tierLabel,
  genderLabel,
  osLabel,
  segLabel,
  anyLabel,
  anyCount,
  sortLabel,
  sortOptions,
  p1States,
  p2States,
  roleOptions,
  availOptions,
  tierOptions,
  genderOptions,
  osOptions,
  segOptions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [p1, setP1] = useState(sp.get("p1") ?? "");
  const [p2, setP2] = useState(sp.get("p2") ?? "");
  const [role, setRole] = useState(sp.get("group") ?? "");
  const [avail, setAvail] = useState(sp.get("avail") ?? "");
  const [tier, setTier] = useState(sp.get("tier") ?? "");
  const [gender, setGender] = useState(sp.get("gender") ?? "");
  const [os, setOs] = useState(sp.get("os") ?? "");
  const [seg, setSeg] = useState(sp.get("seg") ?? "");
  const [sort, setSort] = useState(sp.get("sort") ?? "recent");
  const [, startTransition] = useTransition();

  // One declarative list drives every dropdown + the active-count + clear.
  const filters = [
    { key: "p1", label: p1Label, value: p1, set: setP1, options: p1States },
    { key: "p2", label: p2Label, value: p2, set: setP2, options: p2States },
    {
      key: "role",
      label: groupLabel,
      value: role,
      set: setRole,
      options: roleOptions,
    },
    {
      key: "avail",
      label: availLabel,
      value: avail,
      set: setAvail,
      options: availOptions,
    },
    {
      key: "tier",
      label: tierLabel,
      value: tier,
      set: setTier,
      options: tierOptions,
    },
    {
      key: "gender",
      label: genderLabel,
      value: gender,
      set: setGender,
      options: genderOptions,
    },
    {
      key: "os",
      label: osLabel,
      value: os,
      set: setOs,
      options: osOptions,
    },
    {
      key: "seg",
      label: segLabel,
      value: seg,
      set: setSeg,
      options: segOptions,
    },
  ] as const;

  const activeFilters = filters.reduce((n, f) => n + (f.value ? 1 : 0), 0);
  const [open, setOpen] = useState(activeFilters > 0);

  // One URL owner for q + the eight filters + sort, so no control clobbers
  // another's param.
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (p1) params.set("p1", p1);
      if (p2) params.set("p2", p2);
      if (role) params.set("group", role);
      if (avail) params.set("avail", avail);
      if (tier) params.set("tier", tier);
      if (gender) params.set("gender", gender);
      if (os) params.set("os", os);
      if (seg) params.set("seg", seg);
      if (sort && sort !== "recent") params.set("sort", sort);
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [q, p1, p2, role, avail, tier, gender, os, seg, sort, pathname, router]);

  return (
    <div className="space-y-2.5">
      {/* Search + advanced-filters toggle */}
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
            className="w-full rounded-lg border border-border bg-background py-2.5 ps-9 pe-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
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

      {/* Sort — always visible, one tap from the list */}
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background ps-3">
        <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-medium text-muted-foreground">
          {sortLabel}
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label={sortLabel}
          className="cursor-pointer bg-transparent py-2 pe-3 text-sm font-semibold outline-none"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Advanced filter grid */}
      {open ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          {/* Fixed 2-up grid at every width — readable on a phone, never a
           * single unreadable cram. */}
          <div className="grid grid-cols-2 gap-3">
            {filters.map((f) => (
              <FilterSelect
                key={f.key}
                label={f.label}
                value={f.value}
                onChange={f.set}
                options={f.options}
                anyLabel={anyLabel}
                anyCount={anyCount}
              />
            ))}
          </div>
          {activeFilters > 0 ? (
            <button
              type="button"
              onClick={() => filters.forEach((f) => f.set(""))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
