import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { useEffect, useState } from 'react'
import { publicImageUrl } from './api'

// Persists the user's first profile photo to a stable local file so the home
// avatar renders instantly on every cold start, instead of waiting on a
// network fetch (or hitting an opaque expo-image disk-cache miss).
//
// The file lives at documentDirectory/self-avatar.webp; the filename it
// represents is mirrored to AsyncStorage so we can detect a stale cache after
// the user swaps their primary photo.

const FILE_PATH = FileSystem.documentDirectory + 'self-avatar.webp'
const STORAGE_KEY = 'self-avatar-filename'

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
          const info = await FileSystem.getInfoAsync(FILE_PATH)
          if (info.exists) {
            cache = { filename, uri: FILE_PATH }
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY)
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
  cache = { filename, uri: FILE_PATH }
  loaded = true
  notify()
}

export function getSelfAvatar(): Cache {
  return cache
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
    await FileSystem.deleteAsync(FILE_PATH, { idempotent: true })
    await FileSystem.copyAsync({ from: sourceUri, to: FILE_PATH })
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
    await FileSystem.deleteAsync(FILE_PATH, { idempotent: true })
    const dl = await FileSystem.downloadAsync(url, FILE_PATH)
    if (dl.status === 200) await commit(filename)
  } catch (e) {
    console.error('setSelfAvatarFromRemote failed', e)
  }
}

export async function clearSelfAvatar(): Promise<void> {
  try {
    await FileSystem.deleteAsync(FILE_PATH, { idempotent: true })
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch {}
  cache = null
  loaded = true
  notify()
}
