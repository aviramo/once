// Central registry for keys/strings that are referenced by symbol (storage,
// AsyncStorage, route paths, etc.). Don't write a bare string key at a call
// site — add it here and import the constant.

// ── AsyncStorage keys ──────────────────────────────────────────────────────

export const STORAGE = {
  pushToken: 'once_push_token',
  selfAvatar: 'self-avatar-filename',
  groups: 'my_groups',
  seenFlags: 'seen_flags',
  /** Set once the install referrer has been claimed (or found to be absent),
   *  so the Play Install Referrer round trip runs once per install and not on
   *  every launch. See src/lib/referral.ts. */
  referralClaimed: 'referral_claimed',
  /** PREFIX, not a key: one entry per group, `roster_<groupId>`. The member
   *  list a group screen paints before `app/group_members` answers. Everything
   *  under this prefix is wiped together on sign-out. See rosterCache.ts. */
  rosterPrefix: 'roster_',
  /** PREFIX: one entry per group, the pending join requests a staff member
   *  paints before `app/group_requests` answers. */
  joinRequestsPrefix: 'join_requests_',
  /** The caller's own friends list + incoming requests (`app/my_friends`). */
  friends: 'my_friends_roster',
  /** An invite link opened before there was a session to redeem it with. It
   *  waits here — through sign-up, onboarding, and an app kill in the middle of
   *  either — until the first flush that finds a session. See communities.ts. */
  pendingInvite: 'pending_invite',
  /** PREFIX, not a key: one entry per user_id, the last server snapshot of the
   *  signed-in user's OWN row. Read on boot so /home paints (and the chat sheet
   *  mounts) from disk instead of waiting out the `users` round trip. Wiped on
   *  sign-out. See stores/userStore.ts. */
  profilePrefix: 'profile_',
  /** The user_id the caches on this disk belong to. Most of them are keyed by
   *  what they HOLD (`my_groups`, `roster_<groupId>`, `chat_<otherId>`) and not
   *  by whose device state they are, so the wipe cannot hang off an auth event
   *  — it hangs off this id changing. See the auth listener in app/_layout.tsx. */
  lastUserId: 'last_user_id',
} as const

// One-time "seen" flag names stored inside the STORAGE.seenFlags JSON map
// (see src/lib/seenFlags.ts). Referenced by symbol — never a bare string at
// a call site.
export const SEEN_FLAGS = {
  /** Home pull-to-skip first-run demo choreography. */
  homeDemo: 'home_demo',
  /** Page2 pull-to-decline first-run demo choreography. */
  page2Demo: 'page2_demo',
  /** The Communities awareness nudge home raises once, after the first few
   *  profiles a built-profile user has watched (see COMMUNITIES_NUDGE_AFTER). */
  communitiesNudge: 'communities_nudge',
} as const

// Non-boolean entries kept in that SAME map (counters, last-seen ids) — one
// storage key for every one-shot bookkeeping value, read/written through
// lib/seenFlags. Referenced by symbol, never a bare string at a call site.
export const SEEN_VALUES = {
  /** How many distinct page1 profiles have been watched since the profile was
   *  built. Feeds the Communities nudge. */
  watchedCount: 'watched_count',
  /** The last profile counted into `watchedCount`, so a relaunch that re-shows
   *  the very same candidate doesn't count that person twice. */
  watchedLastId: 'watched_last_id',
} as const

// ── Per-conversation chat storage ─────────────────────────────────────────
// Every local trace of one conversation, defined once as a prefix so the
// sign-out sweep can find them all without re-typing the strings (see
// lib/chatCache.ts).
export const CHAT_KEY_PREFIX = {
  /** The message list itself — what the chat paints on its first frame. */
  cache: 'chatCache_',
  /** Read-receipt timestamp: how far the PARTNER has read. */
  lastRead: 'chatLastRead_',
  /** When this device last opened the chat — decides which messages get the
   *  "new messages" separator on the next open. */
  lastOpened: 'chatLastOpened_',
} as const

// Per-conversation cache key for chat messages list.
export function chatCacheKey(otherId: string): string {
  return CHAT_KEY_PREFIX.cache + otherId
}

// Per-conversation read-receipt persisted timestamp.
export function chatLastReadKey(otherId: string): string {
  return CHAT_KEY_PREFIX.lastRead + otherId
}

// Per-conversation last-opened stamp.
export function chatLastOpenedKey(otherId: string): string {
  return CHAT_KEY_PREFIX.lastOpened + otherId
}
