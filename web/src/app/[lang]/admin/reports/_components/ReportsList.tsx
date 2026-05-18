"use client";

import { useState, useTransition } from "react";
import { StatusBadge } from "../../_components/ui";

export type ReportRow = {
  id: string;
  createdAt: string;
  context: string | null;
  reason: string | null;
  note: string | null;
  handled: boolean;
  reporterId: string;
  reportedId: string;
  reporterName: string;
  reportedName: string;
};

export type ReportsDict = {
  none: string;
  reporter: string;
  reported: string;
  context: string;
  reason: string;
  note: string;
  when: string;
  markHandled: string;
  handled: string;
};

function Row({
  row,
  dict,
  action,
}: {
  row: ReportRow;
  dict: ReportsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{row.reportedName}</span>
            <StatusBadge tone={row.handled ? "idle" : "ok"}>
              {row.context ?? "unknown"}
            </StatusBadge>
            {row.handled ? (
              <StatusBadge tone="idle">{dict.handled}</StatusBadge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {dict.reporter}: {row.reporterName} · {dict.when}:{" "}
            {new Date(row.createdAt).toLocaleString()}
          </p>
          {row.reason ? (
            <p className="text-xs text-muted-foreground">
              {dict.reason}: {row.reason}
            </p>
          ) : null}
          {row.note ? (
            <p className="break-words text-sm">
              {dict.note}: {row.note}
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
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}

export function ReportsList({
  rows,
  dict,
  action,
}: {
  rows: ReportRow[];
  dict: ReportsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Row key={r.id} row={r} dict={dict} action={action} />
      ))}
    </div>
  );
}
