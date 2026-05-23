"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Search, UserPlus, X } from "lucide-react";
import { userImageUrl } from "@/lib/userImage";
import { Avatar } from "../../../_components/ui";

type Member = { user_id: string; name: string | null; image: string | null };

type GroupOption = { id: string; name: string; enabled: boolean };

type Dict = {
  noMembers: string;
  remove: string;
  addTitle: string;
  searchPlaceholder: string;
  searching: string;
  noResults: string;
  add: string;
  // Multi-select / bulk move
  bulkSelectedCount: string; // "{count} נבחרו"
  bulkClear: string; // "ניקוי"
  bulkMoveLabel: string; // "העברה לקבוצה"
  bulkMoveChoose: string; // "בחר קבוצת יעד…"
  bulkMoveButton: string; // "העבר"
  bulkMoveBusy: string; // "מעביר…"
  bulkMoveDone: string; // "הועברו {count} משתמשים ל{name}"
  bulkMoveFail: string; // "ההעברה נכשלה"
  groupDisabledTag: string; // "מושבת"
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
  allGroups,
  dict,
  assignAction,
  searchAction,
  moveAction,
}: {
  groupId: string;
  members: Member[];
  allGroups: GroupOption[];
  dict: Dict;
  assignAction: (fd: FormData) => Promise<void>;
  searchAction: (groupId: string, q: string) => Promise<Member[]>;
  moveAction: (
    userIds: string[],
    targetGroupId: string,
    fromGroupId: string | null,
  ) => Promise<{ ok: boolean; moved: number }>;
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [target, setTarget] = useState<string>("");
  const [moveMsg, setMoveMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [moving, startMove] = useTransition();
  const [, startTransition] = useTransition();

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

  // Other groups available as a move target (this group can't be its own
  // destination).
  const moveTargets = allGroups.filter((g) => g.id !== groupId);

  function assign(user: Member, add: boolean) {
    setPendingId(user.user_id);
    if (add) setMembers((m) => [user, ...m]);
    else {
      setMembers((m) => m.filter((u) => u.user_id !== user.user_id));
      setSelected((s) => {
        if (!s.has(user.user_id)) return s;
        const n = new Set(s);
        n.delete(user.user_id);
        return n;
      });
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

  function toggleSelected(userId: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setMoveMsg(null);
  }

  function runMove() {
    if (moving || selected.size === 0 || !target) return;
    const ids = [...selected];
    const targetGroup = moveTargets.find((g) => g.id === target);
    if (!targetGroup) return;
    const movedUsers = members.filter((m) => ids.includes(m.user_id));
    // Optimistic removal — the move strips them from this group.
    setMembers((m) => m.filter((u) => !ids.includes(u.user_id)));
    setMoveMsg(null);
    startMove(async () => {
      try {
        const res = await moveAction(ids, target, groupId);
        if (res.ok) {
          setMoveMsg({
            ok: true,
            text: dict.bulkMoveDone
              .replace("{count}", String(res.moved))
              .replace("{name}", targetGroup.name),
          });
          setSelected(new Set());
          setTarget("");
        } else {
          // Roll back the optimistic removal.
          setMembers((m) => [...movedUsers, ...m]);
          setMoveMsg({ ok: false, text: dict.bulkMoveFail });
        }
      } catch {
        setMembers((m) => [...movedUsers, ...m]);
        setMoveMsg({ ok: false, text: dict.bulkMoveFail });
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Bulk action bar — visible only when at least one member is ticked. */}
      {selected.size > 0 ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 shadow-sm backdrop-blur">
          <span className="text-sm font-semibold">
            {dict.bulkSelectedCount.replace(
              "{count}",
              String(selected.size),
            )}
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {dict.bulkClear}
          </button>
          <span className="ms-2 text-xs text-muted-foreground">
            {dict.bulkMoveLabel}
          </span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="">{dict.bulkMoveChoose}</option>
            {moveTargets.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {!g.enabled ? ` (${dict.groupDisabledTag})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={runMove}
            disabled={moving || !target}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
          >
            <ArrowRight className="size-3.5 ltr:-scale-x-100" />
            {moving ? dict.bulkMoveBusy : dict.bulkMoveButton}
          </button>
        </div>
      ) : null}
      {moveMsg ? (
        <p
          className={
            moveMsg.ok
              ? "text-xs text-emerald-600 dark:text-emerald-400"
              : "text-xs text-rose-600 dark:text-rose-400"
          }
        >
          {moveMsg.text}
        </p>
      ) : null}

      {/* Add members */}
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

      {/* Current members */}
      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          {dict.noMembers}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visibleMembers.map((m) => {
            const checked = selected.has(m.user_id);
            return (
              <li
                key={m.user_id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5 transition-colors hover:border-primary/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSelected(m.user_id)}
                  aria-label={m.name ?? m.user_id}
                  className="size-4 shrink-0 accent-primary"
                />
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
                </Link>
                <button
                  type="button"
                  disabled={pendingId === m.user_id}
                  onClick={() => assign(m, false)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-600 disabled:opacity-50 dark:hover:border-rose-900"
                >
                  <X className="size-3.5" />
                  {dict.remove}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
