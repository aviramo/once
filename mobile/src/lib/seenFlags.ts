import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE } from '../keys'

// One-time "seen" flags persisted as a JSON map under STORAGE.seenFlags.
// Used for first-run tutorials / one-shot acknowledgements (the home & page2
// pull demos, the watching skip-hint "got it"). ONE read-merge-write helper
// pair so that logic is never duplicated at a call site, and markSeenFlag
// always merges (never clobbers a sibling flag).
//
// The same map also carries the non-boolean bookkeeping a one-shot needs
// before it fires — a counter, the id it last counted (see SEEN_VALUES) —
// through readSeenValue/writeSeenValues, so there is still exactly one storage
// key and one merge implementation.

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

/** One stored bookkeeping value, or undefined when it was never written (or
 * the read failed). Same map, same key as the flags above. */
export async function readSeenValue<T extends FlagValue>(key: string): Promise<T | undefined> {
  return (await readFlags())[key] as T | undefined
}

/** Merge-write bookkeeping values. Like markSeenFlag it never clobbers a
 * sibling entry, and it swallows storage errors — a failed persist only means
 * a one-shot may count from scratch, never a crash. */
export async function writeSeenValues(entries: Record<string, FlagValue>): Promise<void> {
  try {
    const flags = await readFlags()
    await AsyncStorage.setItem(STORAGE.seenFlags, JSON.stringify({ ...flags, ...entries }))
  } catch {
    /* best-effort */
  }
}
