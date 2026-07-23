import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { STORAGE } from '../keys'
import type { Group } from './groups'

// Persists the caller's group list so the settings "My groups" row renders its
// names on the FIRST paint of the screen, instead of popping in once
// `app/my_groups` returns. Same problem — and the same content-cached answer —
// as selfAvatar.ts: a value the server owns, needed synchronously at mount.
//
// The server stays the source of truth. The cache only decides what is painted
// during the round trip; every response (`my_groups`, `redeem_invite`,
// `leave_group`) overwrites it, so a stale list survives exactly one frame.

const STORAGE_KEY = STORAGE.groups

let cache: Group[] | null = null
let loaded = false
let loadPromise: Promise<void> | null = null
const subscribers = new Set<() => void>()

function notify() { subscribers.forEach(fn => fn()) }

async function ensureLoaded(): Promise<void> {
  if (loaded) return
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) cache = parsed
        }
      } catch {}
      loaded = true
      notify()
    })()
  }
  await loadPromise
}

/** Overwrite the cache from a server response. */
export function setCachedGroups(groups: Group[]): void {
  cache = groups
  loaded = true
  notify()
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(groups)).catch(() => {})
}

export async function clearCachedGroups(): Promise<void> {
  try { await AsyncStorage.removeItem(STORAGE_KEY) } catch {}
  cache = null
  loaded = true
  notify()
}

/**
 * Last known group list, or null while the first read off disk is in flight
 * (and on a cold install with nothing cached). Callers keep treating null as
 * "unknown" — it just resolves a frame after mount now, not a round trip.
 */
export function useCachedGroups(): Group[] | null {
  const [, setTick] = useState(0)
  useEffect(() => {
    ensureLoaded()
    const fn = () => setTick(t => t + 1)
    subscribers.add(fn)
    return () => { subscribers.delete(fn) }
  }, [])
  return cache
}
