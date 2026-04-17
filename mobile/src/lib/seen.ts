import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Persistent flags for "don't show again" / first-time explanations.
 * Add a new key here whenever a new one-time prompt is introduced.
 */
export type SeenKey =
  | 'reveal_confirm'   // WATCHING → pull-down confirm dialog

const STORAGE_KEY = 'seen_flags'

let cache: Partial<Record<SeenKey, true>> | null = null

async function load(): Promise<Partial<Record<SeenKey, true>>> {
  if (cache) return cache
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    cache = raw ? JSON.parse(raw) : {}
  } catch {
    cache = {}
  }
  return cache!
}

export async function hasSeen(key: SeenKey): Promise<boolean> {
  const flags = await load()
  return !!flags[key]
}

export async function markSeen(key: SeenKey): Promise<void> {
  const flags = await load()
  flags[key] = true
  cache = flags
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
  } catch {}
}
