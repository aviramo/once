import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { useEffect, useState } from 'react'
import { publicImageUrl } from './api'
import { STORAGE } from '../keys'

// Persists the user's first profile photo to a stable local file so the home
// avatar renders instantly on every cold start, instead of waiting on a
// network fetch (or hitting an opaque expo-image disk-cache miss).
//
// The on-disk copy is CONTENT-ADDRESSED: the file path embeds the filename it
// represents (self-avatar-<filename>). expo-image keys its memory/disk cache
// on the source URI string, so a fixed path would keep serving the stale
// bitmap after the user swaps their primary photo (the file content changes
// but the URI does not). Encoding the filename into the path makes the URI
// change with the content, which invalidates expo-image's cache for free and
// keeps the home avatar in sync with the profile's main photo. The committed
// filename is mirrored to AsyncStorage so the cache survives cold start.

const DIR = FileSystem.documentDirectory ?? ''
const PREFIX = 'self-avatar-'
const STORAGE_KEY = STORAGE.selfAvatar

function pathFor(filename: string): string {
  return DIR + PREFIX + filename
}

// Delete every self-avatar-* file except the one we're keeping. Best-effort:
// sweeps orphans left by crashes mid-swap so the directory never accumulates.
async function sweepOthers(keep: string | null): Promise<void> {
  try {
    const names = await FileSystem.readDirectoryAsync(DIR)
    await Promise.all(
      names
        .filter(n => n.startsWith(PREFIX) && n !== PREFIX + keep)
        .map(n => FileSystem.deleteAsync(DIR + n, { idempotent: true }))
    )
  } catch {}
}

type Cache = { filename: string; uri: string } | null

let cache: Cache = null
let loaded = false
let loadPromise: Promise<void> | null = null
const subscribers = new Set<() => void>()

function notify() { subscribers.forEach(fn => fn()) }

async function ensureLoaded(): Promise<void> {
  if (loaded) return
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const filename = await AsyncStorage.getItem(STORAGE_KEY)
        if (filename) {
          const info = await FileSystem.getInfoAsync(pathFor(filename))
          if (info.exists) {
            cache = { filename, uri: pathFor(filename) }
            sweepOthers(filename).catch(() => {})
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY)
            sweepOthers(null).catch(() => {})
          }
        }
      } catch {}
      loaded = true
      notify()
    })()
  }
  await loadPromise
}

async function commit(filename: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, filename)
  cache = { filename, uri: pathFor(filename) }
  loaded = true
  notify()
  // Drop the previous content-addressed copy (and any orphans) now that the
  // new one is committed.
  sweepOthers(filename).catch(() => {})
}

export function useSelfAvatar(): Cache {
  const [, setTick] = useState(0)
  useEffect(() => {
    ensureLoaded()
    const fn = () => setTick(t => t + 1)
    subscribers.add(fn)
    return () => { subscribers.delete(fn) }
  }, [])
  return cache
}

export async function setSelfAvatarFromLocal(filename: string, sourceUri: string): Promise<void> {
  await ensureLoaded()
  if (cache?.filename === filename) return
  try {
    const dest = pathFor(filename)
    await FileSystem.deleteAsync(dest, { idempotent: true })
    await FileSystem.copyAsync({ from: sourceUri, to: dest })
    await commit(filename)
  } catch (e) {
    console.error('setSelfAvatarFromLocal failed', e)
  }
}

export async function setSelfAvatarFromRemote(filename: string, userId: string): Promise<void> {
  await ensureLoaded()
  if (cache?.filename === filename) return
  try {
    const url = publicImageUrl(userId, 'normal', filename)
    const dest = pathFor(filename)
    await FileSystem.deleteAsync(dest, { idempotent: true })
    const dl = await FileSystem.downloadAsync(url, dest)
    if (dl.status === 200) await commit(filename)
  } catch (e) {
    console.error('setSelfAvatarFromRemote failed', e)
  }
}

export async function clearSelfAvatar(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
    await sweepOthers(null)
  } catch {}
  cache = null
  loaded = true
  notify()
}
