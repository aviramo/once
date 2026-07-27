import AsyncStorage from '@react-native-async-storage/async-storage'
import { CHAT_KEY_PREFIX, chatCacheKey, chatLastOpenedKey, chatLastReadKey } from '../keys'

// Lifetime of the local chat transcript: it exists so the chat sheet paints its
// history from disk instead of the network, and it is meaningful only while the
// conversation is live. Once the chat ends the sheet is unreachable for good,
// so the entries here can only accumulate — one dead transcript per past
// partner. These two sweeps are the only places that remove them.

/** Drop every local trace of ONE conversation. Called from home.tsx the moment
 *  `state` leaves 'chat'. The server keeps the `chat` rows, so a pair that
 *  matches again simply re-fetches — nothing is lost. */
export async function clearChatCache(otherId: string): Promise<void> {
  if (!otherId) return
  try {
    await AsyncStorage.multiRemove([
      chatCacheKey(otherId),
      chatLastReadKey(otherId),
      chatLastOpenedKey(otherId),
    ])
  } catch {}
}

/** Sign-out sweep: every conversation this account left behind on the device. */
export async function clearAllChatCaches(): Promise<void> {
  try {
    const prefixes = Object.values(CHAT_KEY_PREFIX)
    const keys = (await AsyncStorage.getAllKeys())
      .filter(k => prefixes.some(p => k.startsWith(p)))
    if (keys.length) await AsyncStorage.multiRemove(keys)
  } catch {}
}
