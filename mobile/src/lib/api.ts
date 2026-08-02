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
// them made every Circles read mint a fresh profile object carrying the
// list it had just fetched, which re-renders every consumer of the store (home
// and its match card, the menu, the whole Circles stack) and rewrites the
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

// One in-flight run per operation, shared by every caller that asks for it while
// that run is still going. The app's startup volley is 4-6 requests fired in the
// same frame (start + location + my_groups + find), so a session that went stale
// while the device slept fails them ALL at once — and without this each failure
// would spend the refresh token again (the rotated token races the spend before
// it, and the server can legitimately refuse the loser) and each would sign the
// user out on its own. One refresh and one sign-out serve the whole volley.
function shared<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null
  return () => {
    if (!inflight) inflight = fn().finally(() => { inflight = null })
    return inflight
  }
}

/** A fresh access token, or null when one can't be had right now.
 *  NEVER read that null as "signed out". auth-js KEEPS the stored session when a
 *  refresh fails on the NETWORK — the normal case on a device that just woke
 *  with its radio still coming up — and deletes it only when the server actually
 *  REFUSES the refresh token, in which case auth-js emits SIGNED_OUT itself and
 *  the app is already on its way to /login without us having to guess. */
const refreshAccessToken = shared(async (): Promise<string | null> => {
  try {
    const { data } = await supabase.auth.refreshSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
})

/** scope 'local': the token being signed out on is already invalid, so a global
 *  /logout would 401 and revoke nothing — but when it DOES have a live token it
 *  revokes every session this user has on every other device. */
const signOutLocal = shared(async () => {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
})

// Set when a call could not be attempted at all for want of a usable token. It
// is the one cost of failing quietly instead of signing out: the server is now
// missing something the app believed it had sent, and `app/start` — fired ONCE
// per mount of /home — is the case that matters, because nothing would ever
// retry it on its own and without it the user is not marked available. So the
// skip is remembered, and the moment auth comes back the caller replays.
let authSkipped = false

/** Runs `cb` once auth recovers after a call was skipped for want of a token.
 *  Returns an unsubscribe. Nothing fires when no call was skipped — a plain
 *  token rotation is not a recovery and must not replay anything. */
export function onAuthRecovered(cb: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event !== 'TOKEN_REFRESHED' && event !== 'SIGNED_IN') return
    if (!authSkipped) return
    authSkipped = false
    cb()
  })
  return () => data.subscription.unsubscribe()
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

  // Each attempt owns its own timeout budget, so a retry gets a full one.
  const send = (bearer: string) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    return fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
  }

  // NEVER fire a request with no token. `Bearer ` with an empty string is not a
  // credential, so there is nothing the server can answer but 401 — and that
  // MANUFACTURED 401 is what used to log people out of the app. getSession()
  // answers with no session at all whenever the stored one needs a refresh it
  // cannot complete; the access token itself lives 7 days (the project's
  // `jwt_exp`), so that is a device waking into a genuinely stale session, or any
  // moment the refresh call cannot reach the network. The startup volley behind
  // it then fired 4-6 credential-less requests in the same frame, took 4-6 401s,
  // and each one called signOut — which DELETES the stored session, throwing away
  // the one thing that recovers by itself (auth-js retries the refresh every 30s,
  // and a success re-routes the app to home) and leaving the user to log in again.
  // Reproduced on an emulator 2026-07-30: clock moved past the 7-day expiry with
  // the network cut, the refresh fails with AuthRetryableFetchError, and the
  // session SURVIVES on disk — 46s after the network came back the whole volley
  // landed 200. Failing quietly is what makes that recovery possible, and the
  // skip is remembered so /home can replay what never went out.
  if (!token) {
    authSkipped = true
    return null as any
  }

  let res = await send(token)

  // A 401 WITH a token in hand is a different claim: the credential we sent was
  // refused. Usually that is an access token that expired between the session
  // read and the request (auth-js hands out tokens up to EXPIRY_MARGIN — 90s —
  // from expiry), so refresh once and send it again. Only a SECOND refusal, of a
  // token minted seconds earlier, means the session is genuinely dead — that is
  // the one case that still signs out. A refresh that couldn't complete returns
  // null and we simply fail the call (see refreshAccessToken).
  //
  // Re-sending is only safe because the server's ONLY 401 is its auth gate
  // (`User.getByRequest` → `unauthenticated`, app/index.ts), which runs before
  // any RPC — a request refused there never reached one, so nothing can
  // half-apply and a replay cannot double-apply. That is a property of the
  // server, not of the status code, so the retry is gated on the CODE: a 401
  // introduced later with some other meaning (one a handler reached) falls
  // through to the ordinary throw instead of being replayed or signed out on.
  if (res.status === 401) {
    const refusal = await res.text()
    if (serverErrorCode(refusal) !== 'unauthenticated') throw new Error(refusal)
    const fresh = await refreshAccessToken()
    if (!fresh) {
      authSkipped = true
      return null as any
    }
    res = await send(fresh)
    if (res.status === 401) {
      const again = await res.text()
      if (serverErrorCode(again) !== 'unauthenticated') throw new Error(again)
      await signOutLocal()
      return null as any
    }
  }

  if (!res.ok) {
    // 401 ONLY, handled above. 403 means "we know who you are and the answer is
    // no", which the server uses for ordinary business rules: the presence gate
    // (`unavailable`, app/index.ts) and the chat validators
    // (schedule_not_allowed / invalid_image_key / invalid_audio_key). Signing
    // out on those logged the user clean out of the app for tapping play while
    // geo-gated.
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

/** The code an `app/*` call was REFUSED with, or null when the failure wasn't a
 *  refusal (no network, a timeout, a 500 with a stack in it). The edge function
 *  answers a rejected precondition with `log.error(task, code, status)`, whose
 *  body is the bare code JSON-encoded — so what `invoke` throws is `"bad_link"`,
 *  quotes and all. One parser for it here, so no caller re-invents the quotes.
 *  Single source: `Log.error` in supabase/functions/log.ts. */
export function serverErrorCode(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const m = msg.trim().match(/^"?([a-z][a-z0-9_]*)"?$/)
  return m ? m[1] : null
}

export function publicImageUrl(userId: string, folder: 'normal' | 'blur', filename: string) {
  // `encodeURI` preserves already-safe chars like `-`, `_`, `.` and slashes
  // in case the filename accidentally carries a path, while still escaping
  // spaces and unicode that RN's Image loader won't normalize on its own.
  return `${supabaseUrl}/storage/v1/object/public/users/${userId}/${folder}/${encodeURI(filename)}`
}
