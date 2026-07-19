// Central registry for keys/strings that are referenced by symbol (storage,
// AsyncStorage, route paths, etc.). Don't write a bare string key at a call
// site — add it here and import the constant.

// ── AsyncStorage keys ──────────────────────────────────────────────────────

export const STORAGE = {
  pushToken: 'once_push_token',
  selfAvatar: 'self-avatar-filename',
  groups: 'my_groups',
  seenFlags: 'seen_flags',
} as const

// One-time "seen" flag names stored inside the STORAGE.seenFlags JSON map
// (see src/lib/seenFlags.ts). Referenced by symbol — never a bare string at
// a call site.
export const SEEN_FLAGS = {
  /** Home pull-to-skip first-run demo choreography. */
  homeDemo: 'home_demo',
  /** Page2 pull-to-decline first-run demo choreography. */
  page2Demo: 'page2_demo',
  /** The watching "not now" → skip-hint popup has been acknowledged via its
   * "got it" button. Once set, "not now" skips directly (no popup). */
  skipHintAck: 'skip_hint_ack',
} as const

// Per-conversation cache key for chat messages list.
export function chatCacheKey(otherId: string): string {
  return `chatCache_${otherId}`
}

// Per-conversation read-receipt persisted timestamp.
export function chatLastReadKey(otherId: string): string {
  return `chatLastRead_${otherId}`
}
