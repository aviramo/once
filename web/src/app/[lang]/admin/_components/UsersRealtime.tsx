"use client";

import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { UserCard, type UserRow } from "./UserCard";

/**
 * Live users list. The list itself is rendered exactly once from the
 * server-ordered array and is never re-sorted or re-rendered — realtime
 * updates flow through an external per-user store, so a change to one user
 * notifies only that user's card (via useSyncExternalStore) and re-renders
 * that card in place. Order and membership only change on a server fetch
 * (search / filter), never from a realtime event.
 */

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

export function UsersRealtime({
  initial,
  dict,
  locale,
}: {
  initial: Item[];
  dict: Dictionary["admin"];
  locale: Locale;
}) {
  const [store] = useState(createStore);

  useEffect(() => {
    const ids = new Set(initial.map((i) => i.row.user_id));
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("admin-users-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        (payload) => {
          const row = payload.new as UserRow;
          if (row?.user_id && ids.has(row.user_id)) store.set(row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initial, store]);

  return (
    // grid-cols-1 (= minmax(0,1fr)) is load-bearing: without an explicit base
    // track the implicit mobile column is `auto` = max-content, so a long
    // unbroken email widened the grid past the viewport (the cards' `truncate`
    // can't shrink an auto track). minmax(0,1fr) lets the track — and the
    // truncation — collapse to the container width.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {initial.map(({ row, email }) => (
        <LiveUserCard
          key={row.user_id}
          store={store}
          initialRow={row}
          email={email}
          dict={dict}
          locale={locale}
        />
      ))}
    </div>
  );
}

const LiveUserCard = memo(function LiveUserCard({
  store,
  initialRow,
  email,
  dict,
  locale,
}: {
  store: Store;
  initialRow: UserRow;
  email: string | null;
  dict: Dictionary["admin"];
  locale: Locale;
}) {
  const id = initialRow.user_id;
  const live = useSyncExternalStore(
    (cb) => store.subscribe(id, cb),
    () => store.get(id),
    () => undefined,
  );
  return (
    <UserCard
      row={live ?? initialRow}
      email={email}
      dict={dict}
      locale={locale}
    />
  );
});
