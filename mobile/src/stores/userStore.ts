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

export interface Page1 {
  profile?: Profile
  state: string | null
  event: string
  invited_at?: string
  expires_at?: string
  extended?: boolean
}

export type Page2Invite = Profile & {
  state: 'pending' | 'missed' | 'fail'
  invited_at?: string
  expires_at?: string
  extended?: boolean
}

export interface Pages {
  page1?: Page1
  page2: Profile[] | Page2Invite
}

/**
 * Pages as the client sees them after applyServerUser runs. Carries
 * synthetic `match` and `watchers` fields for back-compat with UI code that
 * predates the two-board rewrite.
 */
export interface PagesCompat extends Pages {
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
  /** Raw page1.state from the server: 'watching' | 'waiting' | 'chat' | 'missed' | 'fail' | null */
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

function deriveCompat(relations: Pages | null | undefined) {
  const page1 = relations?.page1
  const page2 = relations?.page2

  const state: string | null = page1?.state ?? null

  const watchers = Array.isArray(page2) ? (page2 as Profile[]) : []
  const match: Profile | null = page1?.profile ? (page1.profile as Profile) : null

  return { state, watchers, match }
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
    // ── DEBUG: trace every applyServerUser to find where page1.profile flips null
    try {
      const incomingRelations = d.relations as { page1?: { state?: string; profile?: { user_id?: string } | null }; page2?: unknown } | undefined
      const prevProfile = get().profile as { state?: string; relations?: { page1?: { state?: string; profile?: { user_id?: string } | null } } } | null
      console.log('[applyServerUser]', {
        source,
        ts: lastSeen,
        incoming_state: incomingRelations?.page1?.state ?? null,
        incoming_p1_profile: incomingRelations?.page1?.profile?.user_id ?? null,
        prev_state: prevProfile?.state ?? null,
        prev_p1_profile: prevProfile?.relations?.page1?.profile?.user_id ?? null,
      })
    } catch {}
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
    } else {
      // Inject derived state + synthesized watchers/match into the relations
      // namespace so existing UI reading profile.state / profile.relations.watchers
      // / profile.relations.match continues to work against the new Pages shape.
      const relations = d.relations as Pages | null | undefined
      const compat = deriveCompat(relations)
      ;(d as Record<string, unknown>).state = compat.state
      const relationsWithCompat: Record<string, unknown> = { ...(relations ?? {}) }
      ;(relationsWithCompat as Record<string, unknown>).watchers = compat.watchers
      ;(relationsWithCompat as Record<string, unknown>).match = compat.match
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
