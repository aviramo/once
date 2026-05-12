import { useEffect, useRef } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter, useRootNavigationState } from 'expo-router'
import { useAuthStore } from '../src/stores/authStore'
import { PRIMARY, WHITE } from '../src/colors'

// Magic-link landing route. The Supabase email links to
// `once://login-callback#access_token=...&refresh_token=...`. The deep
// link handler in _layout.tsx parses the URL and calls setSession, which
// fires onAuthStateChange and updates the auth store. This screen waits
// for auth state to resolve, then bounces to /home or /login.
//
// (We need this route only because expo-router would otherwise show a
// "Not Found" screen for the unknown path.)
export default function LoginCallback() {
  const { user, loading } = useAuthStore()
  const router = useRouter()
  const rootState = useRootNavigationState()
  const navigatorReady = !!rootState?.key
  const navigated = useRef(false)

  useEffect(() => {
    if (loading || !navigatorReady || navigated.current) return
    navigated.current = true
    requestAnimationFrame(() => {
      try { router.replace(user ? '/home' : '/login') }
      catch { navigated.current = false }
    })
  }, [user, loading, navigatorReady])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE }}>
      <ActivityIndicator size="large" color={PRIMARY} />
    </View>
  )
}
