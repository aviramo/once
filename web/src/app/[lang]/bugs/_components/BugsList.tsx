"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, StatusBadge } from "../../_components/ui";

export type BugItem = {
  id: string;
  createdAt: string;
  text: string;
  attachmentUrl: string | null;
  handled: boolean;
  reporterId: string;
  reporterName: string;
  reporterEmail: string | null;
  reporterImage: string | null;
};

export type BugsDict = {
  when: string;
  markHandled: string;
  handled: string;
  attachment: string;
  openAttachment: string;
  noText: string;
};

function BugCard({
  bug,
  dict,
  action,
}: {
  bug: BugItem;
  dict: BugsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Collapsed by default: the board is a scannable queue. Clicking the header
  // (or the chevron) reveals the full text + attachment.
  const [open, setOpen] = useState(false);
  const panelId = `bug-${bug.id}`;

  function toggleHandled() {
    setError(null);
    const fd = new FormData();
    fd.set("id", bug.id);
    fd.set("handled", String(!bug.handled));
    startTransition(async () => {
      try {
        await action(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <Link
          href={`/users/${bug.reporterId}`}
          className="shrink-0"
          aria-label={bug.reporterName}
        >
          <Avatar src={bug.reporterImage} name={bug.reporterName} size="md" />
        </Link>
        {/* The whole middle area is the expand toggle so the row is a big,
            obvious hit target — the name link is the only nested exception. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="min-w-0 flex-1 text-start"
        >
          <Link
            href={`/users/${bug.reporterId}`}
            onClick={(e) => e.stopPropagation()}
            className="block min-w-0 truncate text-sm font-semibold underline-offset-2 transition-colors hover:text-primary hover:underline"
          >
            {bug.reporterName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{new Date(bug.createdAt).toLocaleString()}</span>
            {bug.attachmentUrl ? (
              <StatusBadge tone="chat">{dict.attachment}</StatusBadge>
            ) : null}
            {bug.handled ? (
              <StatusBadge tone="idle">{dict.handled}</StatusBadge>
            ) : null}
          </div>
          {!open ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {bug.text || dict.noText}
            </p>
          ) : null}
        </button>
        <button
          type="button"
          onClick={toggleHandled}
          disabled={pending}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
        >
          {bug.handled ? dict.markHandled + " ✓" : dict.markHandled}
        </button>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </div>

      {open ? (
        <div id={panelId} className="border-t border-border px-4 py-3">
          <p className="whitespace-pre-wrap break-words text-sm">
            {bug.text || (
              <span className="italic text-muted-foreground">{dict.noText}</span>
            )}
          </p>
          {bug.attachmentUrl ? (
            <a
              href={bug.attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block w-fit"
              aria-label={dict.openAttachment}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bug.attachmentUrl}
                alt={dict.attachment}
                className="max-h-64 rounded-lg border border-border object-contain"
              />
            </a>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bugs list — one card per submitted bug report. The page handles filtering,
 * search, sort, and signed-URL resolution; this component is presentational.
 */
export function BugsList({
  bugs,
  dict,
  action,
}: {
  bugs: BugItem[];
  dict: BugsDict;
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {bugs.map((bug) => (
        <BugCard key={bug.id} bug={bug} dict={dict} action={action} />
      ))}
    </div>
  );
}
