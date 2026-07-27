import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'

// The app's ONE "last known answer" cache: a value the server owns, mirrored to
// AsyncStorage so a screen paints it on its FIRST frame instead of holding a
// placeholder for the length of a round trip. The server stays the source of
// truth — every response overwrites the cache, so a stale value survives
// exactly one paint (stale-while-revalidate).
//
// This module is the machinery only (memory copy + lazy disk read + subscriber
// fan-out + the re-render hook). It was duplicated verbatim in groupsCache.ts
// and selfAvatar.ts before the roster cache would have made it a third copy.
// selfAvatar keeps its own: its payload is a content-addressed FILE with a
// directory sweep, not a JSON blob, so it shares the shape but not the work.

export type PersistedMap<T> = {
  /** Last known value for `id`, re-rendering when it lands or changes. null
   *  until the disk read resolves (a frame after mount) and on a cold miss. */
  useValue(id: string): T | null
  /** Same read, outside React. */
  get(id: string): T | null
  /** Overwrite from a server response. */
  set(id: string, value: T): void
  /** Forget one entry (the group was left or deleted). */
  drop(id: string): void
  /** Start the disk read for ids a screen is ABOUT to need, so tapping into
   *  one of them finds the value already in memory — no first-frame gap. */
  prime(ids: string[]): void
  /** Wipe every entry, memory and disk. Sign-out. */
  clearAll(): Promise<void>
}

/** Array/objec guard shared by callers that only need "it parsed into the
 *  right container" — the server owns the element shape, and a mismatched
 *  element is overwritten by the response landing a moment later anyway. */
export const isArrayOf = <T,>(v: unknown): v is T[] => Array.isArray(v)

/**
 * A cache keyed by id, stored one AsyncStorage entry per id under `prefix`
 * (so `clearAll` can find them all without keeping an index).
 */
export function createPersistedMap<T>(
  prefix: string,
  isValid: (v: unknown) => v is T,
): PersistedMap<T> {
  const mem = new Map<string, T>()
  const loaded = new Set<string>()
  const loading = new Map<string, Promise<void>>()
  const subscribers = new Map<string, Set<() => void>>()

  const notify = (id: string) => subscribers.get(id)?.forEach(fn => fn())

  function ensureLoaded(id: string): Promise<void> {
    if (loaded.has(id)) return Promise.resolve()
    const running = loading.get(id)
    if (running) return running
    const p = (async () => {
      try {
        const raw = await AsyncStorage.getItem(prefix + id)
        if (raw) {
          const parsed: unknown = JSON.parse(raw)
          if (isValid(parsed)) mem.set(id, parsed)
        }
      } catch {}
      loaded.add(id)
      loading.delete(id)
      notify(id)
    })()
    loading.set(id, p)
    return p
  }

  return {
    useValue(id: string): T | null {
      const [, setTick] = useState(0)
      useEffect(() => {
        void ensureLoaded(id)
        const fn = () => setTick(t => t + 1)
        let set = subscribers.get(id)
        if (!set) { set = new Set(); subscribers.set(id, set) }
        set.add(fn)
        return () => {
          const s = subscribers.get(id)
          if (!s) return
          s.delete(fn)
          if (s.size === 0) subscribers.delete(id)
        }
      }, [id])
      return mem.get(id) ?? null
    },

    get: (id) => mem.get(id) ?? null,

    set(id, value) {
      mem.set(id, value)
      loaded.add(id)
      notify(id)
      AsyncStorage.setItem(prefix + id, JSON.stringify(value)).catch(() => {})
    },

    drop(id) {
      mem.delete(id)
      // Still "loaded": the entry is known to be absent, so a later read must
      // not go back to disk for a key we just removed.
      loaded.add(id)
      notify(id)
      AsyncStorage.removeItem(prefix + id).catch(() => {})
    },

    prime(ids) { ids.forEach(id => { void ensureLoaded(id) }) },

    async clearAll() {
      mem.clear()
      loaded.clear()
      loading.clear()
      try {
        const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(prefix))
        if (keys.length) await AsyncStorage.multiRemove(keys)
      } catch {}
      subscribers.forEach((_, id) => notify(id))
    },
  }
}

export type PersistedValue<T> = {
  useValue(): T | null
  get(): T | null
  set(value: T): void
  clear(): Promise<void>
}

/**
 * The single-value shape of the same cache — the whole key IS the entry. Built
 * on the map with one empty id (`prefix + '' === prefix`), so there is one
 * implementation of the machinery, not two.
 */
export function createPersistedValue<T>(
  key: string,
  isValid: (v: unknown) => v is T,
): PersistedValue<T> {
  const map = createPersistedMap<T>(key, isValid)
  const ONLY = ''
  return {
    useValue: () => map.useValue(ONLY),
    get: () => map.get(ONLY),
    set: (value) => map.set(ONLY, value),
    clear: () => map.clearAll(),
  }
}
