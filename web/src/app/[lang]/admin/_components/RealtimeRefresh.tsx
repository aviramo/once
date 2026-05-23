"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Keeps an admin screen live without rebuilding its data flow: subscribes to
 * postgres_changes on the given tables and re-runs the server component
 * (router.refresh) on any change, debounced so a burst collapses into one
 * refresh. Renders nothing.
 *
 * `tables` is a comma-separated string (not an array) so the prop stays
 * referentially stable across refreshes — an array literal would be a new
 * reference every server render and re-subscribe on every refresh.
 *
 * `filter` (optional, e.g. "user_id=eq.<uuid>") narrows the subscription to a
 * single row — the user-detail screen uses it so it only refreshes for its own
 * user, not every users-table change.
 *
 * `pollMs` (optional) adds an interval-based fallback refresh. Some Realtime
 * deployments take a while to pick up a freshly-added publication / RLS
 * change, and some networks drop the WebSocket. Polling guarantees the page
 * still catches new rows on a bounded delay even if the live channel never
 * fires. Use sparingly — only on screens where missing an update is bad.
 *
 * Realtime only delivers rows the browser may SELECT under RLS; the admin-read
 * policies (migration admin_realtime_read_policies) are what make this work.
 */
export function RealtimeRefresh({
  tables,
  channel,
  filter,
  pollMs,
}: {
  tables: string;
  channel: string;
  filter?: string;
  pollMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const list = tables
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (list.length === 0) return;

    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    let ch = supabase.channel(channel);
    for (const table of list) {
      ch = ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        refresh,
      );
    }
    ch.subscribe();

    // Belt-and-suspenders polling fallback. Only enabled when caller opts in
    // — most admin screens are fine with pure realtime. setInterval timer
    // runs independently of the channel; even if the channel never connects,
    // the page refetches on schedule.
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    if (pollMs && pollMs > 0) {
      pollTimer = setInterval(() => router.refresh(), pollMs);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (pollTimer) clearInterval(pollTimer);
      void supabase.removeChannel(ch);
    };
  }, [tables, channel, filter, pollMs, router]);

  return null;
}
