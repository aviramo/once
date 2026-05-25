"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type { ResetResult } from "../../users/actions";
import { CardGrid } from "../../_components/ui";

export type GroupRow = {
  id: string;
  name: string;
  inviteCode: string;
  members: number;
};

export type RolesDict = {
  title: string;
  subtitle: string;
  add: string;
  namePlaceholder: string;
  save: string;
  cancel: string;
  members: string;
  none: string;
  duplicate: string;
  /** Listing controls. */
  searchPlaceholder: string;
  noSearchResults: string;
  selectAll: string;
  deselectAll: string;
  /** Selection counter — "{count} selected". */
  selectedCount: string;
  /** Confirms before the bulk reset (irreversible). */
  bulkResetButton: string;
  bulkResetConfirm: string;
  bulkResetBusy: string;
  bulkResetDone: string;
  /** Generic fail message for bulk actions. */
  bulkFail: string;
};

function reason(err: unknown, dict: RolesDict): string {
  const m = err instanceof Error ? err.message : String(err);
  if (m === "duplicate_name") return dict.duplicate;
  return m;
}

/* --------------------------------------------------------------- AddForm -- */

export function GroupAddForm({
  action,
  dict,
}: {
  action: (fd: FormData) => Promise<void>;
  dict: RolesDict;
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

/* --------------------------------------------------------- GroupTile -- */

function GroupTile({
  group,
  selected,
  onToggle,
  readOnly,
  dict,
}: {
  group: GroupRow;
  selected: boolean;
  onToggle: () => void;
  /** Hides the row's checkbox (manager view: no mutations). */
  readOnly?: boolean;
  dict: RolesDict;
}) {
  return (
    <div
      className={[
        "group relative rounded-xl border bg-background p-3 shadow-sm transition-all",
        selected
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-primary/40 hover:shadow-md",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        {readOnly ? null : (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={group.name}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/groups/${group.id}`}
            className="block min-w-0 truncate text-sm font-semibold underline-offset-2 transition-colors hover:text-primary hover:underline"
          >
            {group.name}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {group.members} {dict.members}
            </span>
            <span
              dir="ltr"
              className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums tracking-[0.15em] text-foreground select-all"
            >
              {group.inviteCode}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- NoGroupTile -- */

/**
 * Virtual "ללא קבוצה" tile that links to the existing users-list filter
 * (`/users?group=__none__`). Same visual language as `GroupTile`, but no
 * checkbox / selection — it isn't a real group, so bulk actions don't apply.
 * Dashed border distinguishes it from real groups at a glance.
 */
function NoGroupTile({
  label,
  count,
  href,
  membersLabel,
}: {
  label: string;
  count: number;
  href: string;
  membersLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group relative block rounded-xl border border-dashed border-border bg-background p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="min-w-0">
        <span className="block min-w-0 truncate text-sm font-semibold text-muted-foreground transition-colors group-hover:text-primary">
          {label}
        </span>
        <div className="mt-1.5">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {count} {membersLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------- Manager -- */

/**
 * Groups listing. Compact card grid with per-card selection; the bottom
 * sticky bar surfaces the group-scoped bulk reset. Rename and delete moved
 * to the group detail page; this screen no longer carries them.
 *
 * The optional `noGroup` prop appends a virtual "ללא קבוצה" tile at the end
 * of the grid — clicking it opens the existing users-list filter for users
 * with no group memberships. Not a real DB row; not selectable; not part of
 * any bulk action.
 */
export function GroupsManager({
  groups,
  dict,
  readOnly = false,
  resetGroupMembersAction,
  noGroup,
}: {
  groups: GroupRow[];
  dict: RolesDict;
  /** Manager view: render the listing but hide every mutation (per-row
   * checkbox, bulk action bar). The select-all toggle and BulkActionBar are
   * suppressed by ensuring `selected` stays empty. */
  readOnly?: boolean;
  resetGroupMembersAction: (groupIds: string[]) => Promise<ResetResult>;
  /** Virtual "no group" tile (admin only). When set, appended after the
   * real groups. Links to the users-list with the no-group filter applied. */
  noGroup?: { count: number; label: string; href: string };
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.inviteCode.toLowerCase().includes(q),
    );
  }, [groups, query]);

  // Selection is scoped to the *visible* tiles: select-all ticks every
  // currently filtered row, and the bulk-action counter reflects the
  // selection intersected with the filter — actions act on what the user
  // sees, not on hidden rows.
  const visibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const selectedVisible = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  function toggle(id: string) {
    setMsg(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setMsg(null);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }

  function deselectAll() {
    setMsg(null);
    setSelected(new Set());
  }

  function runBulkReset() {
    if (pending || selectedVisible.length === 0) return;
    if (!window.confirm(dict.bulkResetConfirm)) return;
    setMsg(null);
    const ids = [...selectedVisible];
    startTransition(async () => {
      try {
        const res = await resetGroupMembersAction(ids);
        if (res.ok) {
          setMsg({
            ok: true,
            text: dict.bulkResetDone.replace("{count}", String(res.users)),
          });
          setSelected(new Set());
        } else {
          setMsg({ ok: false, text: dict.bulkFail });
        }
      } catch {
        setMsg({ ok: false, text: dict.bulkFail });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={dict.searchPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {readOnly ? null : (
          <button
            type="button"
            onClick={allVisibleSelected ? deselectAll : selectAll}
            disabled={visibleIds.length === 0}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-40"
          >
            {allVisibleSelected ? dict.deselectAll : dict.selectAll}
          </button>
        )}
      </div>

      {filtered.length === 0 && !noGroup ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
          {dict.noSearchResults}
        </p>
      ) : (
        <CardGrid min="11rem">
          {filtered.map((group) => (
            <GroupTile
              key={group.id}
              group={group}
              selected={selected.has(group.id)}
              onToggle={() => toggle(group.id)}
              readOnly={readOnly}
              dict={dict}
            />
          ))}
          {noGroup ? (
            <NoGroupTile
              label={noGroup.label}
              count={noGroup.count}
              href={noGroup.href}
              membersLabel={dict.members}
            />
          ) : null}
        </CardGrid>
      )}

      {msg ? (
        <p
          className={
            msg.ok
              ? "text-xs text-emerald-600 dark:text-emerald-400"
              : "text-xs text-rose-600 dark:text-rose-400"
          }
        >
          {msg.text}
        </p>
      ) : null}

      {selectedVisible.length > 0 ? (
        <BulkActionBar
          count={selectedVisible.length}
          dict={dict}
          pending={pending}
          onReset={runBulkReset}
          onClear={deselectAll}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- BulkActionBar -- */

function BulkActionBar({
  count,
  dict,
  pending,
  onReset,
  onClear,
}: {
  count: number;
  dict: RolesDict;
  pending: boolean;
  onReset: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {dict.selectedCount.replace("{count}", String(count))}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={pending}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {dict.deselectAll}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onReset}
          disabled={pending}
          className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-default disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
        >
          {pending ? dict.bulkResetBusy : dict.bulkResetButton}
        </button>
      </div>
    </div>
  );
}
