import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface MatchData {
  image: string
  images?: string | string[] | null
  user_id: string
  title: string
  bio: string
  distance: number
  located_at?: string | null
  last_seen?: string | null
  subscribed: boolean
  is_for_kids?: boolean | null
  age?: number
  is_male?: boolean | null
  units?: string | null
}

export interface WatcherInfo {
  user_id: string
  image: string
  title: string
  name: string
  created_at?: string | null
  distance?: number | null
  last_seen?: string | null
  is_male?: boolean | null
  bio?: string | null
  subscribed?: boolean | null
  is_for_kids?: boolean | null
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
  range: number
  bio: string | null
  is_for_kids: boolean | null
  images: { normal: string[]; blur: string[] }
  state: string | null
  units: string | null
  appearance: string | null
  role: string | null
  data?: { push_token?: { type: string; token: string } | null; [key: string]: unknown } | null
  match?: MatchData | null
  watchers?: Record<string, WatcherInfo> | null
}

interface UserStore {
  profile: UserProfile | null
  loading: boolean
  fetch: (userId: string) => Promise<void>
  update: (patch: Partial<UserProfile>) => void
  applyServerUser: (data: Record<string, unknown> | null | undefined, source?: 'invoke' | 'realtime') => void
  clear: () => void
}

// Fields the client mutates locally (via user actions + useAutoSave). Server
// writes for these fields can arrive via invoke response or realtime, and
// either path can carry a *stale* value if a concurrent request loaded the
// user row before our latest optimistic change committed. The dirty-field
// map below protects against that race on both paths.
const CLIENT_AUTHORED: ReadonlyArray<keyof UserProfile> = [
  'images', 'bio', 'is_for_kids',
  'is_for_male', 'is_for_female',
  'age_from', 'age_to', 'range',
  'units',
  'appearance',
]

// Monotonic gate on realtime snapshots. The server fires several
// EdgeRuntime.waitUntil(user.update) tasks after the HTTP response, so
// postgres_changes events can land out of order — and a stale one arriving
// after a fresher invoke response would flicker the UI back to the old
// state. We remember the newest `last_seen` ms we've applied from any
// source and drop realtime events whose snapshot is same-or-older (both
// the exact echo of our invoke and the tail of earlier writes still in
// flight).
//
// Compared as epoch ms via Date.parse rather than string equality: postgrest
// (`...+00:00`) and realtime/WAL (`...` / `...Z`) format the same timestamp
// slightly differently, so string equality misses echoes it should catch.
let lastAppliedLastSeen = 0

// Pending local values for client-authored fields that haven't yet been
// confirmed by a server response carrying the same value. While a field is
// pending, incoming server data for that field is ignored unless it matches
// the pending value (meaning our write landed) — protects the optimistic UI
// from being clobbered by stale invoke responses or realtime events that
// were emitted before our write hit the DB.
const pending = new Map<keyof UserProfile, unknown>()

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

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
      // Route through applyServerUser so the realtime gate + pending map
      // stay consistent with the snapshot we just pulled. Otherwise the
      // very next realtime event can be judged stale (or the inverse)
      // against a lastAppliedLastSeen that wasn't updated.
      if (data) get().applyServerUser(data as Record<string, unknown>, 'invoke')
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
    // Strict `<`: same-timestamp events are legitimate (server-side writes
    // can commit without bumping last_seen), so we must let them through.
    // `<=` was dropping valid state transitions when last_seen stayed put.
    if (source === 'realtime' && ts && ts < lastAppliedLastSeen) return
    if (ts > lastAppliedLastSeen) lastAppliedLastSeen = ts
    // Compatibility: server still sends top-level `message` — map to `bio`.
    // Also promote `data.bio/images/units` if the server sends them inside the
    // `data` JSON column (new storage path).
    if ('message' in d && !('bio' in d)) (d as Record<string, unknown>).bio = d.message
    if (d.data && typeof d.data === 'object') {
      const dd = d.data as Record<string, unknown>
      if ('bio' in dd) (d as Record<string, unknown>).bio = dd.bio
      if ('images' in dd) (d as Record<string, unknown>).images = dd.images
      if ('units' in dd) (d as Record<string, unknown>).units = dd.units
    }
    const prev = get().profile
    if (!prev) { set({ profile: data as unknown as UserProfile }); return }
    const merged: Record<string, unknown> = { ...prev, ...data }
    for (const k of CLIENT_AUTHORED) {
      if (!pending.has(k)) continue
      const pendingVal = pending.get(k)
      if (equal(d[k as string], pendingVal)) {
        // Server caught up with our local write — accept server value, clear pending.
        pending.delete(k)
      } else {
        // Server value is stale (predates our latest local write) — keep optimistic value.
        merged[k as string] = pendingVal
      }
    }
    set({ profile: merged as unknown as UserProfile })
  },

  clear: () => { pending.clear(); lastAppliedLastSeen = 0; set({ profile: null }) },
}))
