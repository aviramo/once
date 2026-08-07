"use client";

import {
  memo,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CheckSquare, ChevronDown, Square } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import type { LngLat } from "@/lib/userLocation";
import { cn } from "@/lib/utils";
import { UserCard, type UserRow } from "./UserCard";
import { Sheet } from "./Sheet";
import { UserActionMenu } from "./UserActionMenu";
import type { BulkAction } from "../users/actions";

/**
 * The live users list and its action surface. The list renders once from the
 * server-ordered array and is never re-sorted on the client — realtime updates
 * flow through an external per-user store so a change to one user re-renders
 * only that card. This component also owns multi-selection, the bulk action
 * bar, and the per-user / bulk action sheet.
 */

type Group = { id: string; name: string };
type Item = { row: UserRow; email: string | null };

type Store = {
  get: (id: string) => UserRow | undefined;
  subscribe: (id: string, cb: () => void) => () => void;
  set: (row: UserRow) => void;
};

function createStore(): Store {
  const data = new Map<string, UserRow>();
  const subs = new Map<string, Set<() => void>>();
  return {
    get: (id) => data.get(id),
    subscribe: (id, cb) => {
      let set = subs.get(id);
      if (!set) {
        set = new Set();
        subs.set(id, set);
      }
      set.add(cb);
      return () => set.delete(cb);
    },
    set: (row) => {
      data.set(row.user_id, row);
      subs.get(row.user_id)?.forEach((cb) => cb());
    },
  };
}

const fill = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/**
 * Cards painted before the first "show more". The SERVER no longer cuts the
 * list — every user matching the filters is in `initial`, which is what makes
 * the distance sort and the count line true — so the only thing left to bound
 * is the DOM: a card carries a menu, popovers and a photo, and a few thousand
 * of them at once is a frozen tab. Growing is local (the rows are already
 * here), so it costs a render and no round trip.
 */
const CHUNK = 100;

type SheetState = {
  ids: string[];
  title: string;
  label: string;
  singleId?: string;
  /** Set by the bulk bar's "reset" button — opens the sheet at its confirm. */
  initialAction?: BulkAction;
};

export function UsersRealtime({
  initial,
  dict,
  locale,
  adminLoc,
  groups,
  isAdmin = true,
}: {
  initial: Item[];
  dict: Dictionary["admin"];
  locale: Locale;
  adminLoc: LngLat | null;
  groups: Group[];
  /** Admin viewers see full cards (page state, distance, action menu, bulk
   * selection). Group managers see identity + group chips only and have no
   * selection/bulk-action UI. */
  isAdmin?: boolean;
}) {
  const [store] = useState(createStore);
  const router = useRouter();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const a = dict.actions;

  useEffect(() => {
    const ids = new Set(initial.map((i) => i.row.user_id));
    // The postgres_changes payload for `users` never carries the separately
    // joined watch status, so re-attach the last known one on every merge.
    const watchById = new Map(initial.map((i) => [i.row.user_id, i.row.watch]));
    const supabase = createSupabaseBrowserClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    // A new signup or a deletion changes list membership / counts — re-fetch
    // the server-rendered list (debounced) so the row appears / disappears.
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 500);
    };
    const channel = supabase
      .channel("admin-users-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        (payload) => {
          const row = payload.new as UserRow;
          if (!row?.user_id || !ids.has(row.user_id)) return;
          const prev = store.get(row.user_id);
          store.set({
            ...row,
            watch: prev?.watch ?? watchById.get(row.user_id),
          });
          // The status is DERIVED (admin_watch_states over the `watch` table),
          // so a payload carrying the new `relations` cannot recompute it —
          // only the server can. page1 changing is exactly what moves a watch
          // row (it is the condition on the users_watch_sync trigger), so that
          // is the one change worth a re-render of the server component;
          // last_seen heartbeats, which are most of this traffic, are not.
          const before = JSON.stringify(
            (prev as { relations?: { page1?: unknown } } | undefined)?.relations
              ?.page1 ?? null,
          );
          const after = JSON.stringify(
            (row as unknown as { relations?: { page1?: unknown } }).relations
              ?.page1 ?? null,
          );
          if (prev && before !== after) scheduleRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "users" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "users" },
        scheduleRefresh,
      )
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [initial, store, router]);

  const [shown, setShown] = useState(CHUNK);
  const visible = useMemo(
    () => (initial.length <= shown ? initial : initial.slice(0, shown)),
    [initial, shown],
  );
  const remaining = initial.length - visible.length;

  // "Select all" means the cards on the screen, never rows the operator has
  // not seen: what the bulk bar leads to is a reset, and a destructive action
  // may not reach further than the list it was taken on.
  const allIds = useMemo(() => visible.map((i) => i.row.user_id), [visible]);
  const allSelected = selected.size > 0 && selected.size === allIds.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds),
    );
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelected(new Set());
  }

  function openBulk() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSheet({
      ids,
      title: fill(a.bulkTitle, { count: ids.length }),
      label: fill(a.targetUsers, { count: ids.length }),
    });
  }

  // The bulk bar's dedicated reset button — straight to the reset confirm.
  function openBulkReset() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSheet({
      ids,
      title: fill(a.bulkTitle, { count: ids.length }),
      label: fill(a.targetUsers, { count: ids.length }),
      initialAction: { kind: "reset" },
    });
  }

  const toolbarBtn =
    "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors";

  return (
    <div>
      {/* Selection toolbar — admin only (managers have no bulk actions). */}
      {isAdmin ? (
      <div className="mb-3 flex items-center justify-between gap-2">
        {selectionMode ? (
          <>
            <button
              type="button"
              onClick={toggleAll}
              className={cn(
                toolbarBtn,
                allSelected
                  ? "border-primary/40 bg-primary/5 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {allSelected ? (
                <CheckSquare className="size-4" />
              ) : (
                <Square className="size-4" />
              )}
              {a.selectAll}
            </button>
            <button
              type="button"
              onClick={exitSelection}
              className="text-sm font-semibold text-primary"
            >
              {a.exitSelect}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSelectionMode(true)}
            className={cn(
              toolbarBtn,
              "text-muted-foreground hover:text-foreground",
            )}
          >
            <CheckSquare className="size-4" />
            {a.select}
          </button>
        )}
      </div>
      ) : null}

      {/* grid-cols-1 (= minmax(0,1fr)) is load-bearing: an `auto` track is
          max-content, so a long unbroken email would widen the grid past the
          viewport. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ row, email }) => (
          <LiveUserCard
            key={row.user_id}
            store={store}
            initialRow={row}
            email={email}
            dict={dict}
            locale={locale}
            adminLoc={adminLoc}
            selectionMode={selectionMode}
            selected={selected.has(row.user_id)}
            onToggle={toggle}
            groups={groups}
            isAdmin={isAdmin}
          />
        ))}
      </div>

      {remaining > 0 ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((s) => s + CHUNK)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className="size-4" aria-hidden />
            {fill(dict.loadMore, { count: remaining })}
          </button>
        </div>
      ) : null}

      {/* Bulk action bar — overlays the bottom nav while a selection is live
          (a focused mode: the nav is not needed mid-selection). */}
      {selectionMode && selected.size > 0 ? (
        <div
          className="admin-fade fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background shadow-[0_-4px_16px_rgba(15,23,42,0.08)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
            <span className="text-sm font-semibold tabular-nums">
              {fill(a.selectedCount, { count: selected.size })}
            </span>
            <button
              type="button"
              onClick={openBulk}
              className="ms-auto inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              {a.menuTitle}
            </button>
            <button
              type="button"
              onClick={openBulkReset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground tabular-nums transition-opacity hover:opacity-90"
            >
              {a.reset} ({selected.size})
            </button>
          </div>
        </div>
      ) : null}

      {/* Per-user / bulk action sheet */}
      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.title ?? ""}
      >
        {sheet ? (
          <UserActionMenu
            ids={sheet.ids}
            targetLabel={sheet.label}
            singleUserId={sheet.singleId}
            groups={groups}
            dict={a}
            initialAction={sheet.initialAction}
            onClose={() => setSheet(null)}
            onDone={exitSelection}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

const LiveUserCard = memo(function LiveUserCard({
  store,
  initialRow,
  email,
  dict,
  locale,
  adminLoc,
  selectionMode,
  selected,
  onToggle,
  groups,
  isAdmin,
}: {
  store: Store;
  initialRow: UserRow;
  email: string | null;
  dict: Dictionary["admin"];
  locale: Locale;
  adminLoc: LngLat | null;
  selectionMode: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  groups: Group[];
  isAdmin: boolean;
}) {
  const id = initialRow.user_id;
  const live = useSyncExternalStore(
    (cb) => store.subscribe(id, cb),
    () => store.get(id),
    () => undefined,
  );
  const row = live ?? initialRow;
  return (
    <UserCard
      row={row}
      email={email}
      dict={dict}
      locale={locale}
      adminLoc={adminLoc}
      selectionMode={selectionMode}
      selected={selected}
      onToggle={() => onToggle(id)}
      groups={groups}
      isAdmin={isAdmin}
    />
  );
});
