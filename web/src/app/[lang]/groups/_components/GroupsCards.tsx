"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { CardGrid } from "../../_components/ui";

/**
 * The circles listing: one card per circle carrying every fact the panel knows
 * about it — name, invite code, owner, approvers, member count — over ONE
 * search box that matches any of them.
 *
 * It was a table with a filter under each column for an hour (user, 2026-08-02,
 * and reverted the same day). What the table was right about is kept: the five
 * facts. What it was wrong about is that a circle is a THING, not a row of
 * measurements — the operator recognises it by name and then wants the rest of
 * it in one place, and five narrow columns spent most of the width on empty
 * approver cells.
 *
 * The single box searches every field, which is what a per-column filter was
 * really for: an operator types "Dana" or "6629" or "אופיר" and does not first
 * decide which column that string lives in.
 */

export type GroupRow = {
  id: string;
  name: string;
  inviteCode: string;
  ownerName: string | null;
  /** Everyone who can approve joins for this circle, owner excluded. */
  approvers: string[];
  members: number;
};

export type GroupsCardsDict = {
  searchPlaceholder: string;
  owner: string;
  approvers: string;
  members: string;
  /** Shown where a circle has nothing to say (no owner row, no approvers). */
  empty: string;
  noSearchResults: string;
};

/** Everything a card paints, as the one string the search reads — so a circle
 * can never match on something its card does not show. */
function haystack(g: GroupRow): string {
  return [g.name, g.inviteCode, g.ownerName ?? "", ...g.approvers, String(g.members)]
    .join(" ")
    .toLowerCase();
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-xs">{value}</span>
    </div>
  );
}

export function GroupsCards({
  groups,
  dict,
}: {
  groups: GroupRow[];
  dict: GroupsCardsDict;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    // Every whitespace-separated word must appear somewhere on the card, so
    // "dana 6" narrows rather than widening — one box, still precise.
    const words = q.split(/\s+/);
    return groups.filter((g) => {
      const hay = haystack(g);
      return words.every((w) => hay.includes(w));
    });
  }, [groups, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-y-0 my-auto ms-3 size-4 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={dict.searchPlaceholder}
          className="w-full rounded-lg border border-border bg-background py-2.5 pe-3 ps-9 text-sm outline-none transition-colors focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
          {dict.noSearchResults}
        </p>
      ) : (
        <CardGrid min="15rem">
          {filtered.map((g) => (
            <div
              key={g.id}
              className="rounded-xl border border-border bg-background p-3.5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-start gap-2">
                <Link
                  href={`/groups/${g.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold underline-offset-2 transition-colors hover:text-primary hover:underline"
                >
                  {g.name}
                </Link>
                {/* An invite code is typed and read aloud, so it is pinned LTR
                    and selectable as one word whatever the page's direction. */}
                <span
                  dir="ltr"
                  className="shrink-0 select-all rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums tracking-[0.15em]"
                >
                  {g.inviteCode}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <Fact label={dict.owner} value={g.ownerName ?? dict.empty} />
                <Fact
                  label={dict.approvers}
                  value={
                    g.approvers.length > 0 ? g.approvers.join(", ") : dict.empty
                  }
                />
                <Fact label={dict.members} value={String(g.members)} />
              </div>
            </div>
          ))}
        </CardGrid>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- AddForm -- */

export type AddFormDict = {
  namePlaceholder: string;
  save: string;
  duplicate: string;
};

function reason(err: unknown, dict: AddFormDict): string {
  const m = err instanceof Error ? err.message : String(err);
  if (m === "duplicate_name") return dict.duplicate;
  return m;
}

export function GroupAddForm({
  action,
  dict,
}: {
  action: (fd: FormData) => Promise<void>;
  dict: AddFormDict;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          try {
            await action(fd);
            formRef.current?.reset();
          } catch (e) {
            setError(reason(e, dict));
          }
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        name="name"
        required
        maxLength={64}
        placeholder={dict.namePlaceholder}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
      >
        {dict.save}
      </button>
      {error ? (
        <p className="basis-full text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
