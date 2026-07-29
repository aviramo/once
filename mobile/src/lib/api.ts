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

// Keys the edge function merges onto the response body ALONGSIDE the user row
// (app/index.ts's `rpcGroups` + `rpcExtra`, and find/ignore's `lookahead`).
// They are the ENDPOINT'S ANSWER — a roster, a queue, a page of search results
// — not columns of the user, and they must never reach the profile: merging
// them made every communities read mint a fresh profile object carrying the
// list it had just fetched, which re-renders every consumer of the store (home
// and its match card, the menu, the whole communities stack) and rewrites the
// profile to disk. Stripped here, in the one place that already knows this
// response shape. A key added to the sidecar later and not listed here costs an
// extra render, nothing worse.
const SIDECAR_KEYS = [
  'groups', 'group', 'owned', 'members', 'requests', 'friends',
  'results', 'has_more', 'join_status', 'status', 'notify', 'lookahead',
] as const

/** The user row inside an `app/*` response — the sidecar keys removed. */
function userRowOf(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const row = { ...(data as Record<string, unknown>) }
  for (const k of SIDECAR_KEYS) delete row[k]
  return row
}

export async function invoke<T = any>(fn: string, body?: object): Promise<T> {

  // The session and the position are independent, so they are awaited TOGETHER
  // rather than one after the other: both sit on the critical path of every
  // single request, and serialising them charged each call the sum of two
  // waits for no reason. getLastKnownLocation is normally instant (the OS hands
  // back a cached fix), but on a device with no fix yet it is not, and that
  // wait used to be spent before the token lookup had even started.
  const [session, loc] = await Promise.all([
    supabase.auth.getSession(),
    // Attach the device's last known location to every request so the server
    // always has a reasonably fresh position. Only after startup has completed
    // — before app/start fires the caller passes location explicitly, so there
    // is nothing to fill in here.
    startupComplete ? getLastKnownLocation() : Promise.resolve(null),
  ])
  const token = session.data.session?.access_token
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
    // 401 ONLY. 401 means "we don't know who you are" — the session is dead
    // and signing out is the correct recovery. 403 means "we know who you are
    // and the answer is no", which the server uses for ordinary business
    // rules: the presence gate (`unavailable`, app/index.ts) and the chat
    // validators (schedule_not_allowed / invalid_image_key /
    // invalid_audio_key). Signing out on those logged the user clean out of
    // the app for tapping play while geo-gated.
    //
    // scope 'local': the token is already invalid, so the global /logout call
    // would 401 and revoke nothing — but when it DOES have a live token it
    // revokes every session this user has on every other device.
    if (res.status === 401) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
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
  // find / ignore / pause / resume are the actor's OWN deterministic state
  // transitions — the response IS the authoritative result and carries the
  // resulting page1, so they are tagged 'invoke:self' and the store trusts
  // that page1 immediately (no Realtime round-trip wait). pause/resume used
  // to be plain 'invoke' (page1 deferred to Realtime); a lost or mis-ordered
  // Realtime event then stranded the client on stale page1 — the reported
  // "press pause then play -> stuck with a name, no card" bug. Every other
  // call stays 'invoke' so client-authored / game state defers to Realtime.
  const isSelfTransition =
    fn === 'app/find' || fn === 'app/ignore' || fn === 'app/pause' || fn === 'app/resume'
  if (fn === 'app' || fn.startsWith('app/')) {
    useUserStore.getState().applyServerUser(userRowOf(data), isSelfTransition ? 'invoke:self' : 'invoke')
  }
  // Look-ahead: app_find/app_ignore return the next 1-2 ranked candidates.
  // Warm expo-image's disk cache now so the on-arrival prefetch for the
  // user's NEXT skip is a cache hit. Fire-and-forget, never awaited, never
  // stored; same exact URLs MatchCard requests (matchImageUrls).
  const isFind = fn === 'app/find' || fn === 'app/ignore'
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
