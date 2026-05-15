"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type StateOption = { value: string; label: string };

type Props = {
  searchPlaceholder: string;
  p1Label: string;
  p2Label: string;
  anyLabel: string;
  p1States: StateOption[];
  p2States: StateOption[];
};

export function SearchControls({
  searchPlaceholder,
  p1Label,
  p2Label,
  anyLabel,
  p1States,
  p2States,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [p1, setP1] = useState(sp.get("p1") ?? "");
  const [p2, setP2] = useState(sp.get("p2") ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (p1) params.set("p1", p1);
      if (p2) params.set("p2", p2);
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [q, p1, p2, pathname, router]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        placeholder={searchPlaceholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{p1Label}</span>
        <select
          value={p1}
          onChange={(e) => setP1(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">{anyLabel}</option>
          {p1States.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{p2Label}</span>
        <select
          value={p2}
          onChange={(e) => setP2(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">{anyLabel}</option>
          {p2States.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
