import "server-only";

/**
 * Fire-and-forget edge availability resync. After ANY admin mutation that can
 * change a user's effective availability — area create/update/delete/mode, or
 * role enable-disable / assignment — kick the edge /ext/resync so every
 * affected user is recomputed immediately: it flips relations.availability
 * (Realtime → open apps update instantly) and fires area-open / area-closed
 * pushes (closed apps). Best-effort: the per-minute cron resync is the safety
 * net, so a slow/failed edge call never blocks or fails the admin action.
 *
 * Single source of truth — both areas/actions and roles/actions import this;
 * neither re-implements the fetch.
 */
export async function triggerResync(): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    await fetch(`${base}/functions/v1/ext/resync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
  } catch {
    /* cron resync will reconcile within ~60s */
  }
}
