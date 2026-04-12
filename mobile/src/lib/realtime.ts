import { supabase } from './supabase'
import { useUserStore } from '../stores/userStore'

// Supabase realtime subscription on the current user's `users` row. Every
// DB UPDATE fans out through postgres_changes and is merged into the
// in-memory profile via applyServerUser — the same entry point invoke()
// uses, so the store stays authoritative whether the change originated from
// the device, another device, or a server-side background job.
//
// Module-level singleton: one active channel per app instance. Re-subscribing
// for the same userId is a no-op, switching userId tears down the old channel
// before opening the new one.

let activeChannel: ReturnType<typeof supabase.channel> | null = null
let activeUserId: string | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = 2000
const MAX_RETRY_DELAY = 30_000

function clearRetry() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
}

function teardown() {
  clearRetry()
  if (activeChannel) {
    supabase.removeChannel(activeChannel)
    activeChannel = null
  }
}

function connect(userId: string) {
  // If the user id changed while we were queued, abandon.
  if (activeUserId !== userId) return
  teardown()

  const channel = supabase
    .channel(`user-state:${userId}`)
    .on(
      // `postgres_changes` is a named event in the Supabase realtime API —
      // TS types don't always recognize it, hence the cast.
      'postgres_changes' as any,
      { event: 'UPDATE', schema: 'public', table: 'users', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        const row = payload?.new
        // Source: 'realtime' — a DB UPDATE has committed, so this is fully
        // authoritative and overrides any local optimistic state.
        if (row) useUserStore.getState().applyServerUser(row, 'realtime')
      },
    )
    .subscribe((status) => {
      // Stale callback from a channel that's already been replaced — ignore.
      if (channel !== activeChannel) return
      if (status === 'SUBSCRIBED') {
        retryDelay = 2000  // reset backoff on a healthy subscription
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        // Already queued or user switched — don't stack retries.
        if (retryTimer || activeUserId !== userId) return
        retryTimer = setTimeout(() => {
          retryTimer = null
          retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY)
          connect(userId)
        }, retryDelay)
      }
    })

  activeChannel = channel
}

/** Subscribe to live updates for this user. Idempotent — safe to call on every
 *  auth state change; only triggers a reconnect if the userId actually changed. */
export function subscribeToUserChanges(userId: string) {
  if (activeUserId === userId && activeChannel) return
  activeUserId = userId
  connect(userId)
}

/** Tear down the current subscription. Call on sign-out. */
export function unsubscribeFromUserChanges() {
  activeUserId = null
  teardown()
  retryDelay = 2000
}
