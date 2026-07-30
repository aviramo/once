import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE } from '../keys'

// One-time "seen" flags persisted as a JSON map under STORAGE.seenFlags.
// Used for first-run tutorials / one-shot acknowledgements (the home & page2
// pull demos, the watching skip-hint "got it", the dock's first-visit dot on
// Circles). ONE read-merge-write helper pair so that logic is never duplicated
// at a call site, and markSeenFlag always merges (never clobbers a sibling
// flag).

type FlagValue = boolean | number | string

async function readFlags(): Promise<Record<string, FlagValue>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE.seenFlags)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** True iff `flag` has been marked seen. Resolves false on any read error. */
export async function hasSeenFlag(flag: string): Promise<boolean> {
  return !!(await readFlags())[flag]
}

/** Mark `flag` seen (idempotent, merge-safe). Swallows storage errors —
 * a failed persist just means the one-time UI may show again, never a crash. */
export async function markSeenFlag(flag: string): Promise<void> {
  try {
    const flags = await readFlags()
    if (flags[flag]) return
    flags[flag] = true
    await AsyncStorage.setItem(STORAGE.seenFlags, JSON.stringify(flags))
  } catch {
    /* best-effort */
  }
}
