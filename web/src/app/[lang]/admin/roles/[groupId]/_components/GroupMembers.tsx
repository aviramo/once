"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { userImageUrl } from "@/lib/userImage";
import { Avatar, StatusBadge } from "../../../_components/ui";

type Member = {
  user_id: string;
  name: string | null;
  image: string | null;
  /** ISO grant timestamp if this member is a manager of THIS group; null
   * otherwise. Server-side, the list is already sorted with managers first
   * by earliest grant — the client preserves that order. */
  managerSince: string | null;
};

type Dict = {
  noMembers: string;
  remove: string;
  addTitle: string;
  searchPlaceholder: string;
  searching: string;
  noResults: string;
  add: string;
  // Group-manager actions
  managerBadge: string; // "מנהל"
  promote: string; // "מינוי כמנהל"
  demote: string; // "ביטול ניהול"
};

/**
 * In-group member management with bulk multi-select. Each row is a checkbox +
 * a link to the user's admin detail page (so you can drill in with one click)
 * and a per-row remove button. Selecting one or more rows shows a sticky
 * action bar at the top with a target-group dropdown + Move button; the move
 * goes through moveUsersToGroup (add to target, remove from this group).
 */
export function GroupMembers({
  groupId,
  members: initialMembers,
  dict,
  canMutate,
  canPromote,
  canDemote,
  assignAction,
  searchAction,
  promoteAction,
  demoteAction,
}: {
  groupId: string;
  members: Member[];
  dict: Dict;
  /** Admin only: enables add-members + per-row remove. */
  canMutate: boolean;
  /** Admin OR a manager of THIS group: can promote a fellow member to
   * group_manager. */
  canPromote: boolean;
  /** Admin only: can demote a manager back to plain member (the user
   * deliberately scoped demote to admin to avoid peer power struggles). */
  canDemote: boolean;
  assignAction: (fd: FormData) => Promise<void>;
  searchAction: (groupId: string, q: string) => Promise<Member[]>;
  promoteAction: (fd: FormData) => Promise<void>;
  demoteAction: (fd: FormData) => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [mgrBusyId, setMgrBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [, startMgrTransition] = useTransition();

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const r = await searchAction(groupId, query);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q, groupId, searchAction]);

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members],
  );
  const visibleResults = results.filter((u) => !memberIds.has(u.user_id));

  const memberQuery = q.trim().toLowerCase();
  const visibleMembers = memberQuery
    ? members.filter((m) =>
        (m.name ?? "").toLowerCase().includes(memberQuery),
      )
    : members;

  function assign(user: Member, add: boolean) {
    setPendingId(user.user_id);
    if (add) setMembers((m) => [user, ...m]);
    else {
      setMembers((m) => m.filter((u) => u.user_id !== user.user_id));
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("userId", user.user_id);
        fd.set("roleId", groupId);
        fd.set("assigned", String(add));
        await assignAction(fd);
      } catch {
        if (add)
          setMembers((m) => m.filter((u) => u.user_id !== user.user_id));
        else setMembers((m) => [user, ...m]);
      } finally {
        setPendingId(null);
      }
    });
  }

  /**
   * Optimistic promote/demote. On promote, stamp `managerSince` with now() and
   * re-sort so the new manager slides up under the existing managers (they
   * land at the end of the manager run since their grant is the latest).
   * On demote, clear `managerSince` and re-sort. Server-side the order is the
   * source of truth and a re-fetch via Realtime will reconcile any drift.
   */
  function setManager(user: Member, on: boolean) {
    setMgrBusyId(user.user_id);
    setMembers((m) => {
      const stamped = m.map((x) =>
        x.user_id === user.user_id
          ? { ...x, managerSince: on ? new Date().toISOString() : null }
          : x,
      );
      stamped.sort((a, b) => {
        if (a.managerSince && !b.managerSince) return -1;
        if (!a.managerSince && b.managerSince) return 1;
        if (a.managerSince && b.managerSince)
          return a.managerSince.localeCompare(b.managerSince);
        return (a.name ?? "").localeCompare(b.name ?? "");
      });
      return stamped;
    });
    const action = on ? promoteAction : demoteAction;
    startMgrTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("groupId", groupId);
        fd.set("userId", user.user_id);
        await action(fd);
      } catch {
        // Roll back the optimistic flip on failure.
        setMembers((m) =>
          m.map((x) =>
            x.user_id === user.user_id
              ? { ...x, managerSince: on ? null : user.managerSince }
              : x,
          ),
        );
      } finally {
        setMgrBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Bulk move was removed 2026-05-25 (user request) — multi-select +
          assign/remove is now done from the /admin/users screen instead. */}

      {/* Add members — admin only. Managers don't add or remove members;
          they only promote existing members to fellow managers. */}
      {canMutate ? (
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {dict.addTitle}
        </p>
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 my-auto ms-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              if (v.trim().length >= 2) setSearching(true);
            }}
            placeholder={dict.searchPlaceholder}
            className="w-full rounded-lg border border-border bg-background py-2.5 ps-9 pe-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
        {q.trim().length >= 2 ? (
          <div className="mt-2 space-y-1.5">
            {searching ? (
              <p className="px-1 text-xs text-muted-foreground">
                {dict.searching}
              </p>
            ) : visibleResults.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                {dict.noResults}
              </p>
            ) : (
              visibleResults.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5"
                >
                  <Avatar
                    src={userImageUrl(u.user_id, u.image)}
                    name={u.name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {u.name ?? "—"}
                  </span>
                  <button
                    type="button"
                    disabled={pendingId === u.user_id}
                    onClick={() => assign(u, true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <UserPlus className="size-3.5" />
                    {dict.add}
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
      ) : null}

      {/* Managers (and only managers) get a name-search filter for the member
          list — the admin search input above doubles as a member filter, so
          we only add a standalone search bar when that input is hidden. */}
      {!canMutate ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 my-auto ms-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={dict.searchPlaceholder}
            className="w-full rounded-lg border border-border bg-background py-2.5 ps-9 pe-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
      ) : null}

      {/* Current members */}
      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          {dict.noMembers}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visibleMembers.map((m) => {
            const isManager = m.managerSince != null;
            const mgrBusy = mgrBusyId === m.user_id;
            return (
              <li
                key={m.user_id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5 transition-colors hover:border-primary/40"
              >
                <Link
                  href={`/admin/users/${m.user_id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar
                    src={userImageUrl(m.user_id, m.image)}
                    name={m.name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                    {m.name ?? "—"}
                  </span>
                  {isManager ? (
                    <StatusBadge tone="chat">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="size-3" aria-hidden />
                        {dict.managerBadge}
                      </span>
                    </StatusBadge>
                  ) : null}
                </Link>
                {canPromote && !isManager ? (
                  <button
                    type="button"
                    disabled={mgrBusy}
                    onClick={() => setManager(m, true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sky-300 hover:text-sky-700 disabled:opacity-50 dark:hover:border-sky-900"
                  >
                    <ShieldCheck className="size-3.5" />
                    {dict.promote}
                  </button>
                ) : null}
                {canDemote && isManager ? (
                  <button
                    type="button"
                    disabled={mgrBusy}
                    onClick={() => setManager(m, false)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-amber-300 hover:text-amber-700 disabled:opacity-50 dark:hover:border-amber-900"
                  >
                    <X className="size-3.5" />
                    {dict.demote}
                  </button>
                ) : null}
                {canMutate ? (
                  <button
                    type="button"
                    disabled={pendingId === m.user_id}
                    onClick={() => assign(m, false)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-600 disabled:opacity-50 dark:hover:border-rose-900"
                  >
                    <X className="size-3.5" />
                    {dict.remove}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
