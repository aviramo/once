import { createPersistedValue, isArrayOf } from './persistedCache'
import { STORAGE } from '../keys'
import type { Group } from './groups'

// Persists the caller's group list so the settings "My groups" row renders its
// names on the FIRST paint of the screen, instead of popping in once
// `app/my_groups` returns.
//
// The server stays the source of truth. The cache only decides what is painted
// during the round trip; every response (`my_groups`, `redeem_invite`,
// `leave_group`) overwrites it, so a stale list survives exactly one frame.
//
// The machinery lives in persistedCache.ts — shared with the group/friend
// roster caches. This module is just the typed instance plus the names its
// call sites already import.

const groups = createPersistedValue<Group[]>(STORAGE.groups, isArrayOf)

/** Overwrite the cache from a server response. */
export const setCachedGroups = (list: Group[]): void => groups.set(list)

export const clearCachedGroups = (): Promise<void> => groups.clear()

/**
 * Last known group list, or null while the first read off disk is in flight
 * (and on a cold install with nothing cached). Callers keep treating null as
 * "unknown" — it just resolves a frame after mount now, not a round trip.
 */
export const useCachedGroups = (): Group[] | null => groups.useValue()
