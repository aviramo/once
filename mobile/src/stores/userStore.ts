import { create } from 'zustand'
import { supabase } from '../lib/supabase'

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
  message: string | null
  is_for_kids: boolean | null
  images: { normal: string[]; blur: string[] }
  state: string | null
  units: string | null
  role: string | null
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
  'images', 'message', 'is_for_kids',
  'is_for_male', 'is_for_female',
  'age_from', 'age_to', 'range',
  'units',
]

// Every invoke bumps the user's `last_seen` on the server. The same value
// then echoes back on realtime — identical DB write, two delivery paths.
// We remember the last_seen we applied from invoke responses and drop the
// matching realtime echo to avoid a redundant re-render.
let lastInvokeLastSeen: string | null = null

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
      set({ profile: data ?? null })
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
    if (source === 'realtime' && lastSeen && lastSeen === lastInvokeLastSeen) return
    if (source === 'invoke' && lastSeen) lastInvokeLastSeen = lastSeen
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

  clear: () => { pending.clear(); lastInvokeLastSeen = null; set({ profile: null }) },
}))
