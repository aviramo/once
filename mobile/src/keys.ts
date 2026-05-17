// Central registry for keys/strings that are referenced by symbol (storage,
// AsyncStorage, route paths, etc.). Don't write a bare string key at a call
// site — add it here and import the constant.

// ── AsyncStorage keys ──────────────────────────────────────────────────────

export const STORAGE = {
  pushToken: 'once_push_token',
  selfAvatar: 'self-avatar-filename',
  seenFlags: 'seen_flags',
} as const

// Per-conversation cache key for chat messages list.
export function chatCacheKey(otherId: string): string {
  return `chatCache_${otherId}`
}

// Per-conversation read-receipt persisted timestamp.
export function chatLastReadKey(otherId: string): string {
  return `chatLastRead_${otherId}`
}
