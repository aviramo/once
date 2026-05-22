"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { userImageUrl } from "@/lib/userImage";
import { Avatar } from "../../../_components/ui";

type Member = { user_id: string; name: string | null; image: string | null };

type Dict = {
  noMembers: string;
  remove: string;
  addTitle: string;
  searchPlaceholder: string;
  searching: string;
  noResults: string;
  add: string;
};

/**
 * In-group member management: a debounced user search to add members, plus the
 * current member list with one-tap removal. Both add and remove go through
 * setUserRoleAssignment (the same RPC the per-user checklist uses), so a
 * disabled-group change still resyncs availability. Updates are optimistic and
 * reconciled by the action's revalidate.
 */
export function GroupMembers({
  groupId,
  members: initialMembers,
  dict,
  assignAction,
  searchAction,
}: {
  groupId: string;
  members: Member[];
  dict: Dict;
  assignAction: (fd: FormData) => Promise<void>;
  searchAction: (groupId: string, q: string) => Promise<Member[]>;
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Debounced search. All state writes happen inside the async timeout
  // callback (never synchronously in the effect body); the spinner is turned
  // on in the input's onChange instead. `cancelled` drops a stale response.
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

  // Results that aren't already members (the server filter is a snapshot;
  // filtering again here keeps a freshly-added user out of the result list).
  const memberIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members],
  );
  const visibleResults = results.filter((u) => !memberIds.has(u.user_id));

  // The search box also filters the current member list — typing narrows both
  // the add-candidates above and the members below.
  const memberQuery = q.trim().toLowerCase();
  const visibleMembers = memberQuery
    ? members.filter((m) =>
        (m.name ?? "").toLowerCase().includes(memberQuery),
      )
    : members;

  function assign(user: Member, add: boolean) {
    setPendingId(user.user_id);
    if (add) setMembers((m) => [user, ...m]);
    else setMembers((m) => m.filter((u) => u.user_id !== user.user_id));
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("userId", user.user_id);
        fd.set("roleId", groupId);
        fd.set("assigned", String(add));
        await assignAction(fd);
      } catch {
        // revert on failure
        if (add)
          setMembers((m) => m.filter((u) => u.user_id !== user.user_id));
        else setMembers((m) => [user, ...m]);
      } finally {
        setPendingId(null);
      }
    });
  }

  const rowCls =
    "flex items-center gap-3 rounded-xl border border-border bg-background p-2.5";

  return (
    <div className="space-y-5">
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
                <div key={u.user_id} className={rowCls}>
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
          {visibleMembers.map((m) => (
            <li key={m.user_id} className={rowCls}>
              <Avatar
                src={userImageUrl(m.user_id, m.image)}
                name={m.name}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {m.name ?? "—"}
              </span>
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
          ))}
        </ul>
      )}
    </div>
  );
}
