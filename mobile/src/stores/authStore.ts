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
    await supabase.auth.signOut()
    try { await GoogleSignin.signOut() } catch {}
    set({ user: null })
  },
}))
