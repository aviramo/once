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
  state: string | null
  units: string | null
  appearance: string | null
  data?: { push_token?: { type: string; token: string } | null; role?: string | null; [key: string]: unknown } | null
  relations?: { match: Profile | null; watchers: Profile[] } | null
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

let lastAppliedLastSeen = 0

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
    if (source === 'realtime' && ts && ts < lastAppliedLastSeen) return
    if (ts > lastAppliedLastSeen) lastAppliedLastSeen = ts
    // Promote name/bio/images/units from the data JSONB column to top-level
    // so CLIENT_AUTHORED protection and component reads work uniformly.
    if (d.data && typeof d.data === 'object') {
      const dd = d.data as Record<string, unknown>
      if ('name' in dd) (d as Record<string, unknown>).name = dd.name
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
        pending.delete(k)
      } else {
        merged[k as string] = pendingVal
      }
    }
    set({ profile: merged as unknown as UserProfile })
  },

  clear: () => { pending.clear(); lastAppliedLastSeen = 0; set({ profile: null }) },
}))
