"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type { ResetResult } from "../../users/actions";
import { CardGrid, StatusBadge } from "../../_components/ui";

export type RoleRow = {
  id: string;
  name: string;
  enabled: boolean;
  members: number;
};

export type RolesDict = {
  title: string;
  subtitle: string;
  add: string;
  namePlaceholder: string;
  save: string;
  cancel: string;
  enable: string;
  disable: string;
  statusActive: string;
  statusDisabled: string;
  members: string;
  none: string;
  duplicate: string;
  disabledHint: string;
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

export function RoleAddForm({
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
  role,
  selected,
  onToggle,
  dict,
}: {
  role: RoleRow;
  selected: boolean;
  onToggle: () => void;
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
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={role.name}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/roles/${role.id}`}
            className="block min-w-0 truncate text-sm font-semibold underline-offset-2 transition-colors hover:text-primary hover:underline"
          >
            {role.name}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge tone={role.enabled ? "ok" : "idle"}>
              {role.enabled ? dict.statusActive : dict.statusDisabled}
            </StatusBadge>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {role.members} {dict.members}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Manager -- */

/**
 * Groups listing. Compact card grid with per-card selection; the bottom
 * sticky bar surfaces bulk enable / disable / reset (the role-scoped reset
 * popup used to live on the users dashboard — moved here, where the
 * selection naturally lives). Rename and delete moved to the group detail
 * page; this screen no longer carries them.
 */
export function RolesManager({
  roles,
  dict,
  setEnabledAction,
  setGroupsEnabledAction,
  resetGroupMembersAction,
}: {
  roles: RoleRow[];
  dict: RolesDict;
  setEnabledAction: (fd: FormData) => Promise<void>;
  setGroupsEnabledAction: (
    groupIds: string[],
    enabled: boolean,
  ) => Promise<{ ok: boolean; count: number }>;
  resetGroupMembersAction: (groupIds: string[]) => Promise<ResetResult>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(q));
  }, [roles, query]);

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

  function toggleSingle(role: RoleRow) {
    if (pending) return;
    const fd = new FormData();
    fd.set("id", role.id);
    fd.set("enabled", String(!role.enabled));
    startTransition(async () => {
      try {
        await setEnabledAction(fd);
      } catch (e) {
        setMsg({ ok: false, text: reason(e, dict) });
      }
    });
  }

  function runBulkEnable(enabled: boolean) {
    if (pending || selectedVisible.length === 0) return;
    setMsg(null);
    const ids = [...selectedVisible];
    startTransition(async () => {
      try {
        const res = await setGroupsEnabledAction(ids, enabled);
        if (res.ok) setSelected(new Set());
        else setMsg({ ok: false, text: dict.bulkFail });
      } catch {
        setMsg({ ok: false, text: dict.bulkFail });
      }
    });
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
        <button
          type="button"
          onClick={allVisibleSelected ? deselectAll : selectAll}
          disabled={visibleIds.length === 0}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-40"
        >
          {allVisibleSelected ? dict.deselectAll : dict.selectAll}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
          {dict.noSearchResults}
        </p>
      ) : (
        <CardGrid min="11rem">
          {filtered.map((role) => (
            <GroupTile
              key={role.id}
              role={role}
              selected={selected.has(role.id)}
              onToggle={() => toggle(role.id)}
              dict={dict}
            />
          ))}
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
          onEnable={() => runBulkEnable(true)}
          onDisable={() => runBulkEnable(false)}
          onReset={runBulkReset}
          onClear={deselectAll}
          // Per-tile enable/disable shortcut wired via a hidden form on each
          // tile would re-introduce the row chrome — the bulk bar handles a
          // single selection just as well (count = 1).
          singleToggleHint={
            selectedVisible.length === 1
              ? roles.find((r) => r.id === selectedVisible[0])
              : null
          }
          onSingleToggle={toggleSingle}
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
  onEnable,
  onDisable,
  onReset,
  onClear,
  singleToggleHint,
  onSingleToggle,
}: {
  count: number;
  dict: RolesDict;
  pending: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onReset: () => void;
  onClear: () => void;
  /** If exactly one row is selected we still show enable/disable; this lets
   * the bar's "enable" button know whether the selected row is currently
   * disabled (so it reads correctly) without coupling state. */
  singleToggleHint: RoleRow | null | undefined;
  onSingleToggle: (role: RoleRow) => void;
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
        {singleToggleHint ? (
          <button
            type="button"
            onClick={() => onSingleToggle(singleToggleHint)}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {singleToggleHint.enabled ? dict.disable : dict.enable}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onEnable}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              {dict.enable}
            </button>
            <button
              type="button"
              onClick={onDisable}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              {dict.disable}
            </button>
          </>
        )}
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
