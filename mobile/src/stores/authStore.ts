import { create } from 'zustand'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  loading: boolean
  setUser: (user: User | null) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  signOut: async () => {
    // scope 'local' — "log out" means THIS device, the universal convention.
    // The default 'global' revokes every session the account has anywhere, so
    // logging out on one device silently killed the others; the next launch
    // there ran on a dead token. Signing out everywhere is a separate,
    // explicit affordance if it's ever wanted.
    await supabase.auth.signOut({ scope: 'local' })
    try { await GoogleSignin.signOut() } catch {}
    set({ user: null })
  },
}))
