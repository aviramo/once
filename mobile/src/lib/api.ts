import { Image } from 'expo-image'
import { supabase } from './supabase'
import { useUserStore } from '../stores/userStore'
import { getLastKnownLocation } from './location'
import { matchImageUrls } from './profileImages'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!

// Set to true once app/start has been sent. Before that, invoke does not
// auto-attach location — the caller is responsible for including it explicitly.
let startupComplete = false
export function markStartupComplete() { startupComplete = true }

// Hard ceiling on a single edge-function round trip. Single source of truth:
// the request abort below uses it, and the home-pane search watchdog derives
// its hang timeout from it (no candidate/Realtime change can legitimately
// take longer than the request itself).
export const API_TIMEOUT_MS = 15_000

export async function invoke<T = any>(fn: string, body?: object): Promise<T> {

  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token

  // Attach the device's last known location to every request so the server
  // always has a reasonably fresh position. getLastKnownLocation is instant
  // (cached by the OS) so it won't slow down any call.
  // Only auto-attach after startup has completed — before app/start fires the
  // caller passes location explicitly, so there's nothing to fill in here.
  const loc = startupComplete ? await getLastKnownLocation() : null
  const payload = {
    ...(body ?? {}),
    ...(loc && !(body as any)?.location ? { location: { latitude: loc.lat, longitude: loc.lng } } : {}),
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token ?? ''}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      await supabase.auth.signOut()
      return null as any
    }
    throw new Error(await res.text())
  }

  // Some endpoints (e.g. app/reset) return an empty body when there is no
  // user record to serialize. Parsing `await res.json()` on "" throws a
  // SyntaxError, so read as text and only parse when non-empty.
  const text = await res.text()
  const data = (text ? JSON.parse(text) : null) as T
  // Iron rule: the `app` edge function returns the authoritative user record
  // on every call. Merge it straight into the store so no component needs to
  // fetch after invoking. Realtime covers the rest (changes from other
  // sources), and both funnels flow through the same applyServerUser entry.
  // find/ignore are tagged 'invoke:find' so the store trusts the response's
  // page1 immediately (no Realtime round-trip wait); every other call stays
  // 'invoke' so client-authored / game state defers to Realtime.
  const isFind = fn === 'app/find' || fn === 'app/ignore'
  if (fn === 'app' || fn.startsWith('app/')) {
    useUserStore.getState().applyServerUser(data as any, isFind ? 'invoke:find' : 'invoke')
  }
  // Look-ahead: app_find/app_ignore return the next 1-2 ranked candidates.
  // Warm expo-image's disk cache now so the on-arrival prefetch for the
  // user's NEXT skip is a cache hit. Fire-and-forget, never awaited, never
  // stored; same exact URLs MatchCard requests (matchImageUrls).
  if (isFind) {
    const la = (data as { lookahead?: { user_id: string; images?: any[] }[] } | null)?.lookahead
    if (Array.isArray(la) && la.length) {
      const urls = la.flatMap(p => matchImageUrls(p))
      if (urls.length) Image.prefetch(urls).catch(() => {})
    }
  }
  return data
}

export function publicImageUrl(userId: string, folder: 'normal' | 'blur', filename: string) {
  // `encodeURI` preserves already-safe chars like `-`, `_`, `.` and slashes
  // in case the filename accidentally carries a path, while still escaping
  // spaces and unicode that RN's Image loader won't normalize on its own.
  return `${supabaseUrl}/storage/v1/object/public/users/${userId}/${folder}/${encodeURI(filename)}`
}
