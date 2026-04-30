import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface Image {
  normal?: string
  hash: string
}

export interface Profile {
  created_at?: string | null
  user_id: string
  title: string
  name: string
  images: Image[]
  bio?: string | null
  is_male?: boolean | null
  is_for_kids?: boolean | null
  last_seen?: string | null
  push_enabled?: boolean | null
  distance?: number | null
}

// Server-side v3 page shapes. page2 is always an object (never an array).
export type ServerPage1State = 'free' | 'watching' | 'waiting' | 'chat' | 'locked'
export type ServerPage2State = 'free' | 'pending' | 'chat' | 'locked'

export interface Page1 {
  state: ServerPage1State
  profile?: Profile
  message?: string
  invited_at?: string
  expires_at?: string
  extended?: boolean
  /** Legacy synth: applyServerUser mirrors `message` (translated via MESSAGE_TO_LEGACY_EVENT) here so existing UI i18n lookups keep working. */
  event?: string
}

export interface Page2 {
  state: ServerPage2State
  profile?: Profile
  profiles?: Profile[]
  message?: string
  invited_at?: string
  expires_at?: string
  extended?: boolean
}

export interface Pages {
  page1: Page1
  page2: Page2
}

// Legacy synthesized invite-card shape for the page2 incoming invitation UI.
// Predates v3; the store derives it from the new page2 object so existing UI
// branches continue to work without per-component rewrites.
export type Page2Invite = Profile & {
  state: 'pending' | 'missed' | 'fail'
  invited_at?: string
  expires_at?: string
  extended?: boolean
  message?: string
}

/**
 * Pages as the client sees them after applyServerUser runs. Carries
 * synthetic `match`, `watchers`, and a legacy-shaped `page2` (Profile[] |
 * Page2Invite) for back-compat with UI code that predates v3.
 */
export interface PagesCompat {
  page1?: Page1
  page2: Profile[] | Page2Invite
  match?: Profile | null
  watchers?: Profile[]
}

export interface UserProfile {
  user_id: string
  name: string | null
  birth_date: string | null
  is_male: boolean | null
  is_for_male: boolean
  is_for_female: boolean
  age_from: number
  age_to: number
  range: number | null
  bio: string | null
  is_for_kids: boolean | null
  images: Image[]
  units: string | null
  appearance: string | null
  data?: { push_token?: { type: string; token: string } | null; role?: string | null; [key: string]: unknown } | null
  relations?: PagesCompat | null
  /** Synthesized legacy page1 state: 'watching' | 'waiting' | 'chat' | 'missed' | 'fail' | null. Derived from server's v3 page1.state + message via deriveCompat. */
  state: string | null
}

interface UserStore {
  profile: UserProfile | null
  loading: boolean
  fetch: (userId: string) => Promise<void>
  update: (patch: Partial<UserProfile>) => void
  applyServerUser: (data: Record<string, unknown> | null | undefined, source?: 'fetch' | 'invoke' | 'realtime') => void
  clear: () => void
}

const CLIENT_AUTHORED: ReadonlyArray<keyof UserProfile> = [
  'images', 'bio', 'is_for_kids',
  'is_for_male', 'is_for_female',
  'age_from', 'age_to', 'range',
  'units',
  'appearance',
]

let lastAppliedLastSeen = 0

const pending = new Map<keyof UserProfile, unknown>()

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Messages whose page1 lock represents a failed action the user themselves
// initiated (so the UI shows it as 'fail' rather than 'missed').
const FAIL_MESSAGES = new Set(['invite', 'approve', 'extend'])

// Maps v3 server `message` codes to the legacy event keys the UI's i18n keys
// use (`home.ended.<state>.<event>`). Pairs that match identically are omitted.
const MESSAGE_TO_LEGACY_EVENT: Record<string, string> = {
  decline: 'declined',
  delete: 'deleted',
  remove: 'removed',
  block: 'leave',
  approve: 'matched',
}

/**
 * Translates the server's v3 relations (page1.state + message, page2 with
 * state + profile/profiles/message) into the legacy shape the UI consumes:
 * - synthesized top-level `state` ('watching'|'waiting'|'chat'|'missed'|'fail'|null)
 * - synthesized `match` (chat partner profile)
 * - synthesized `watchers` (Profile[])
 * - legacy `page2` shape (array of Profile when free, Page2Invite object when pending/locked)
 */
function deriveCompat(relations: Pages | null | undefined) {
  const page1 = relations?.page1
  const page2 = relations?.page2

  let state: string | null = null
  if (page1?.state === 'free') state = null
  else if (page1?.state === 'locked') {
    // locked without message = post-clear1 (or brand-new user); UI treats as
    // null/HIDDEN so the green search button shows. With a message, distinguish
    // user-initiated failures (fail) from things that happened to them (missed).
    if (!page1.message) state = null
    else state = FAIL_MESSAGES.has(page1.message) ? 'fail' : 'missed'
  } else if (page1?.state) state = page1.state

  // Translate the server `message` into the legacy event key the i18n table
  // is keyed by, so `home.ended.<state>.<legacyEvent>` lookups keep resolving.
  const legacyEvent = page1?.message
    ? (MESSAGE_TO_LEGACY_EVENT[page1.message] ?? page1.message)
    : undefined

  const watchers: Profile[] = page2?.state === 'free' && Array.isArray(page2.profiles)
    ? (page2.profiles as Profile[])
    : []

  const match: Profile | null = page1?.profile ? (page1.profile as Profile) : null

  let legacyPage2: Profile[] | Page2Invite
  if (page2?.state === 'pending' && page2.profile) {
    legacyPage2 = {
      ...(page2.profile as Profile),
      state: 'pending',
      ...(page2.invited_at ? { invited_at: page2.invited_at } : {}),
      ...(page2.expires_at ? { expires_at: page2.expires_at } : {}),
      ...(page2.extended !== undefined ? { extended: page2.extended } : {}),
    } as Page2Invite
  } else if (page2?.state === 'locked' && page2.profile) {
    const synthState: 'missed' | 'fail' =
      page2.message && FAIL_MESSAGES.has(page2.message) ? 'fail' : 'missed'
    legacyPage2 = {
      ...(page2.profile as Profile),
      state: synthState,
      ...(page2.message ? { message: page2.message } : {}),
    } as Page2Invite
  } else {
    legacyPage2 = watchers
  }

  return { state, watchers, match, legacyPage2, legacyEvent }
}

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  loading: false,

  fetch: async (userId: string) => {
    set({ loading: true })
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (data) get().applyServerUser(data as Record<string, unknown>, 'fetch')
      else set({ profile: null })
    } finally {
      set({ loading: false })
    }
  },

  update: (patch) => {
    const prev = get().profile
    if (!prev) return
    for (const k of Object.keys(patch) as (keyof UserProfile)[]) {
      if (CLIENT_AUTHORED.includes(k)) pending.set(k, patch[k])
    }
    set({ profile: { ...prev, ...patch } })
  },

  applyServerUser: (data, source = 'invoke') => {
    if (!data || typeof data !== 'object') return
    const d = data as Record<string, unknown>
    const lastSeen = d.last_seen as string | undefined
    const ts = lastSeen ? Date.parse(lastSeen) : 0
    if (ts && ts < lastAppliedLastSeen) return
    if (ts > lastAppliedLastSeen) lastAppliedLastSeen = ts
    // Promote bio/images/units from data JSONB for CLIENT_AUTHORED protection.
    // name lives top-level on the server now; no promotion needed.
    if (d.data && typeof d.data === 'object') {
      const dd = d.data as Record<string, unknown>
      if ('bio' in dd) (d as Record<string, unknown>).bio = dd.bio
      if ('images' in dd) (d as Record<string, unknown>).images = dd.images
      if ('units' in dd) (d as Record<string, unknown>).units = dd.units
    }
    const prev = get().profile
    if (source === 'invoke' && prev) {
      // Invoke (HTTP) responses can race with Realtime events and arrive stale.
      // Realtime and explicit fetch calls are the authoritative source for game
      // state — strip relations/state from invoke responses so they cannot
      // overwrite Realtime-delivered state.
      delete (d as Record<string, unknown>).relations
      delete (d as Record<string, unknown>).state
    } else if (!('relations' in d)) {
      // Realtime payload from a partial UPDATE (REPLICA IDENTITY default sends
      // only changed columns + primary key). When `relations` isn't in the
      // payload, the row's relations didn't actually change — preserve the
      // previous state instead of overwriting with an empty derived shape.
      // Same logic applies to `state` (top-level derived field).
      delete (d as Record<string, unknown>).state
    } else {
      // Translate v3 relations into the legacy shape the UI reads:
      // - top-level `state` synth from page1.state + message
      // - relations.match / relations.watchers synthesized
      // - relations.page2 shimmed into legacy Profile[] | Page2Invite
      const relations = d.relations as Pages | null | undefined
      const compat = deriveCompat(relations)
      ;(d as Record<string, unknown>).state = compat.state
      const relationsWithCompat: Record<string, unknown> = { ...(relations ?? {}) }
      ;(relationsWithCompat as Record<string, unknown>).watchers = compat.watchers
      ;(relationsWithCompat as Record<string, unknown>).match = compat.match
      ;(relationsWithCompat as Record<string, unknown>).page2 = compat.legacyPage2
      // Mirror the v3 message into a legacy `event` field on page1 so the
      // home.tsx i18n lookup `home.ended.<state>.<page1.event>` keeps working.
      const p1 = relationsWithCompat.page1 as Record<string, unknown> | undefined
      if (p1) {
        if (compat.legacyEvent !== undefined) p1.event = compat.legacyEvent
        else delete p1.event
      }
      ;(d as Record<string, unknown>).relations = relationsWithCompat
    }
    if (!prev) { set({ profile: d as unknown as UserProfile }); return }
    const merged: Record<string, unknown> = { ...prev, ...d }
    for (const k of CLIENT_AUTHORED) {
      if (!pending.has(k)) continue
      const pendingVal = pending.get(k)
      if (equal(d[k as string], pendingVal)) {
        pending.delete(k)
      } else {
        merged[k as string] = pendingVal
      }
    }
    set({ profile: merged as unknown as UserProfile })
  },

  clear: () => { pending.clear(); lastAppliedLastSeen = 0; set({ profile: null }) },
}))
