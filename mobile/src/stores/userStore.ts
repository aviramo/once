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
}

interface UserStore {
  profile: UserProfile | null
  loading: boolean
  fetch: (userId: string) => Promise<void>
  update: (patch: Partial<UserProfile>) => void
  // Apply an authoritative user record coming from the server — either an
  // invoke response or a realtime postgres_changes payload. Shallow-merges
  // over the existing profile so any keys the server omitted stay intact.
  // This is the single entry point for server → client sync.
  //
  // `source` distinguishes the two callers: realtime payloads always reflect
  // a committed DB UPDATE and are fully authoritative. Invoke responses can
  // carry stale values for client-authored fields (images/message/etc.) —
  // e.g. a concurrent message-blur invoke whose server-side handler loaded
  // the user BEFORE our just-scheduled photo-reorder autosave committed,
  // returning the old images and clobbering the optimistic swap. For those
  // fields we only merge from the realtime path.
  applyServerUser: (data: Record<string, unknown> | null | undefined, source?: 'invoke' | 'realtime') => void
  clear: () => void
}

// Fields the client can mutate locally (via user actions + useAutoSave). An
// invoke response may carry a stale version of any of these if another
// request was mid-flight when we issued ours — so we skip them on the invoke
// path and rely on realtime (post-commit) to deliver the truth.
const CLIENT_AUTHORED: ReadonlyArray<keyof UserProfile> = [
  'images', 'message', 'is_for_kids',
  'is_for_male', 'is_for_female',
  'age_from', 'age_to', 'range',
  'units',
]

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
    set({ profile: { ...prev, ...patch } })
  },

  applyServerUser: (data, source = 'invoke') => {
    if (!data || typeof data !== 'object') return
    const prev = get().profile
    if (!prev) { set({ profile: data as UserProfile }); return }
    const merged: Record<string, unknown> = { ...prev, ...data }
    if (source === 'invoke') {
      // Preserve client-authored fields from getting overwritten by a stale
      // response racing against a local optimistic change.
      for (const k of CLIENT_AUTHORED) {
        if ((prev as Record<string, unknown>)[k] !== undefined) merged[k] = (prev as Record<string, unknown>)[k]
      }
    }
    set({ profile: merged as UserProfile })
  },

  clear: () => set({ profile: null }),
}))
