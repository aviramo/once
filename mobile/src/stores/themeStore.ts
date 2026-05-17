import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE } from '../keys'

// The three user-selectable theme modes (settings: מערכת / כהה / בהיר).
// 'system' follows the device color scheme; 'light'/'dark' force it.
export type ThemeMode = 'system' | 'light' | 'dark'

const MODES: readonly ThemeMode[] = ['system', 'light', 'dark']
export const isThemeMode = (v: unknown): v is ThemeMode =>
  typeof v === 'string' && (MODES as readonly string[]).includes(v)

// Non-reactive flag: true once a value exists locally (read on boot or set by
// the user). Gates the one-time server seed so a local choice always wins.
let hasLocal = false

interface ThemeStore {
  mode: ThemeMode
  /** True once the persisted preference has been read from disk. Until then
   * the UI uses the default ('system') — no theme flash for system users. */
  hydrated: boolean
  /** User picked a mode in settings. Persists locally (authoritative) and
   * applies live everywhere via useColors(). */
  setMode: (mode: ThemeMode) => void
  /** Read the persisted preference once on app boot. */
  hydrate: () => Promise<void>
  /** Seed from a server-provided value (data.appearance) ONLY when no local
   * preference exists yet — local is the source of truth. */
  adoptServer: (value: string | null | undefined) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  mode: 'system',
  hydrated: false,

  setMode: (mode) => {
    hasLocal = true
    set({ mode })
    AsyncStorage.setItem(STORAGE.themeMode, mode).catch(() => {})
  },

  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(STORAGE.themeMode)
      if (isThemeMode(v)) { hasLocal = true; set({ mode: v }) }
    } catch {
      // ignore — fall back to the default 'system'
    } finally {
      set({ hydrated: true })
    }
  },

  adoptServer: (value) => {
    if (!hasLocal && isThemeMode(value)) {
      hasLocal = true
      set({ mode: value })
      AsyncStorage.setItem(STORAGE.themeMode, value).catch(() => {})
    }
  },
}))
