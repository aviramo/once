import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

// SecureStore rejects values > 2048 bytes (silently fails to persist on
// Android). A Google OAuth session (id/access/refresh + provider tokens)
// blows past that, so the session never saves and login hangs. Split large
// values into sub-2KB chunks keyed `<key>.<n>`, tracked by a `<key>` manifest.
const CHUNK_SIZE = 2000
const chunkKey = (key: string, i: number) => `${key}.${i}`

async function readCount(key: string): Promise<number | null> {
  const manifest = await SecureStore.getItemAsync(key)
  if (manifest == null) return null
  const n = Number(manifest)
  return Number.isInteger(n) && n > 0 ? n : null
}

const secureStoreAdapter = {
  getItem: async (key: string) => {
    const count = await readCount(key)
    // Legacy / small value stored directly under the key (pre-chunking).
    if (count == null) return SecureStore.getItemAsync(key)
    const parts: string[] = []
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i))
      if (part == null) return null // torn write, treat as absent
      parts.push(part)
    }
    return parts.join('')
  },
  setItem: async (key: string, value: string) => {
    // Clear any prior representation (chunked or legacy) before writing.
    await secureStoreAdapter.removeItem(key)
    const count = Math.ceil(value.length / CHUNK_SIZE) || 1
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        chunkKey(key, i),
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      )
    }
    await SecureStore.setItemAsync(key, String(count))
  },
  removeItem: async (key: string) => {
    const count = await readCount(key)
    await SecureStore.deleteItemAsync(key)
    if (count != null) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(chunkKey(key, i))
      }
    }
  },
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: secureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
