"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar, StatusBadge } from "../../_components/ui";

export type ReportItem = {
  id: string;
  createdAt: string;
  context: string | null;
  note: string | null;
  handled: boolean;
  reportedId: string;
  reportedName: string;
  reportedImage: string | null;
};

export type Reporter = {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  reports: ReportItem[];
  /** Latest report time across this reporter's items — used by the page for
   * sorting + (optionally) as a card subtitle. */
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
    ? dict.contextValues?.[row.context] ?? row.context
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
        href={`/admin/users/${row.reportedId}`}
        className="shrink-0"
        aria-label={row.reportedName}
      >
        <Avatar src={row.reportedImage} name={row.reportedName} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/users/${row.reportedId}`}
          className="block min-w-0 truncate text-sm font-medium underline-offset-2 transition-colors hover:text-primary hover:underline"
        >
          {row.reportedName}
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

function ReporterCard({
  reporter,
  dict,
  action,
}: {
  reporter: Reporter;
  dict: ReportsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Link
          href={`/admin/users/${reporter.id}`}
          className="shrink-0"
          aria-label={reporter.name}
        >
          <Avatar src={reporter.image} name={reporter.name} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/users/${reporter.id}`}
            className="block min-w-0 truncate text-sm font-semibold underline-offset-2 transition-colors hover:text-primary hover:underline"
          >
            {reporter.name}
          </Link>
          {reporter.email ? (
            <p className="truncate text-xs text-muted-foreground">
              {reporter.email}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          {fill(dict.reportCount, { count: reporter.reports.length })}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {reporter.reports.map((r) => (
          <ReportRow key={r.id} row={r} dict={dict} action={action} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Reporters list — one card per reporter, with their reports stacked inside.
 * The page does the heavy lifting (filtering, search, sort, grouping); this
 * component is presentational.
 */
export function ReportsList({
  reporters,
  dict,
  action,
}: {
  reporters: Reporter[];
  dict: ReportsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {reporters.map((reporter) => (
        <ReporterCard
          key={reporter.id}
          reporter={reporter}
          dict={dict}
          action={action}
        />
      ))}
    </div>
  );
}
