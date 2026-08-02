"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, StatusBadge } from "../../_components/ui";

/**
 * THE QUEUE IS ABOUT THE PERSON BEING REPORTED, NOT THE ONE REPORTING.
 *
 * It used to group the other way round — a card per reporter, their targets
 * inside — which answers "who complains a lot" and buries the question
 * moderation actually opens this screen with: is there somebody several
 * different people have flagged. Grouped by the reported user, that fact is
 * the card's own count chip, and the reporters are the evidence inside it.
 */

/** One report, from the point of view of the person it is ABOUT: who filed it
 * and in what circumstance. */
export type ReportItem = {
  id: string;
  createdAt: string;
  context: string | null;
  note: string | null;
  handled: boolean;
  reporterId: string;
  reporterName: string;
  reporterImage: string | null;
};

/** One card: a reported person and everyone who has reported them. */
export type ReportedUser = {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  reports: ReportItem[];
  /** Latest report time across this person's items — the page sorts on it. */
  latest: string;
};

export type ReportsDict = {
  none: string;
  note: string;
  markHandled: string;
  handled: string;
  unknownUser: string;
  reportCount: string;
  contextValues?: Partial<Record<string, string>>;
};

const fill = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

function ReportRow({
  row,
  dict,
  action,
}: {
  row: ReportItem;
  dict: ReportsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const contextLabel = row.context
    ? (dict.contextValues?.[row.context] ?? row.context)
    : null;

  function toggle() {
    setError(null);
    const fd = new FormData();
    fd.set("id", row.id);
    fd.set("handled", String(!row.handled));
    startTransition(async () => {
      try {
        await action(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <li className="flex flex-wrap items-start gap-3 p-3">
      <Link
        href={`/users/${row.reporterId}`}
        className="shrink-0"
        aria-label={row.reporterName}
      >
        <Avatar src={row.reporterImage} name={row.reporterName} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/users/${row.reporterId}`}
          className="block min-w-0 truncate text-sm font-medium underline-offset-2 transition-colors hover:text-primary hover:underline"
        >
          {row.reporterName}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {contextLabel ? (
            <StatusBadge tone={row.handled ? "idle" : "ok"}>
              {contextLabel}
            </StatusBadge>
          ) : null}
          <span>{new Date(row.createdAt).toLocaleString()}</span>
          {row.handled ? (
            <StatusBadge tone="idle">{dict.handled}</StatusBadge>
          ) : null}
        </div>
        {row.note ? (
          <p className="mt-1.5 break-words text-xs">
            <span className="font-medium text-foreground">{dict.note}:</span>{" "}
            {row.note}
          </p>
        ) : null}
        {error ? (
          <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
      >
        {row.handled ? dict.markHandled + " ✓" : dict.markHandled}
      </button>
    </li>
  );
}

function ReportedCard({
  reported,
  dict,
  action,
}: {
  reported: ReportedUser;
  dict: ReportsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  // Collapsed by default: the count chip is the fact that matters at a glance
  // (one complaint or five), and the operator opens the ones worth reading.
  const [open, setOpen] = useState(false);
  const panelId = `reported-${reported.id}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <Link
          href={`/users/${reported.id}`}
          className="shrink-0"
          aria-label={reported.name}
        >
          <Avatar src={reported.image} name={reported.name} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/users/${reported.id}`}
            className="block min-w-0 truncate text-sm font-semibold underline-offset-2 transition-colors hover:text-primary hover:underline"
          >
            {reported.name}
          </Link>
          {reported.email ? (
            <p className="truncate text-xs text-muted-foreground">
              {reported.email}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <span className="rounded-md bg-muted px-2 py-0.5 font-semibold tabular-nums">
            {fill(dict.reportCount, { count: reported.reports.length })}
          </span>
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>
      {open ? (
        <ul
          id={panelId}
          className="divide-y divide-border border-t border-border"
        >
          {reported.reports.map((r) => (
            <ReportRow key={r.id} row={r} dict={dict} action={action} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The moderation queue — one card per reported person, with everyone who
 * reported them stacked inside. The page does the heavy lifting (filtering,
 * search, sort, grouping); this component is presentational.
 */
export function ReportsList({
  reported,
  dict,
  action,
}: {
  reported: ReportedUser[];
  dict: ReportsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {reported.map((person) => (
        <ReportedCard
          key={person.id}
          reported={person}
          dict={dict}
          action={action}
        />
      ))}
    </div>
  );
}
