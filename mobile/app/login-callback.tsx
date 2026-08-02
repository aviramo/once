import { useEffect, useRef } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter, useRootNavigationState } from 'expo-router'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore, selectNeedsAccount } from '../src/stores/userStore'
import { INK, PAGE } from '../src/colors'

// Magic-link landing route. The Supabase email links to
// `once://login-callback#access_token=...&refresh_token=...`. The deep
// link handler in _layout.tsx parses the URL and calls setSession, which
// fires onAuthStateChange and updates the auth store. This screen waits
// for auth state to resolve, then bounces to /onboarding, /home or /login.
//
// (We need this route only because expo-router would otherwise show a
// "Not Found" screen for the unknown path.)
//
// It owns its first navigation exactly as the boot route does, and for the same
// reason: the routing guard in _layout.tsx bails here (see the note there), so
// nothing else will correct this decision. Which is why the profile fetch is
// AWAITED rather than routed past — an authenticated user's destination depends
// on whether he has an account, and a profile that has not landed yet says
// nothing about that. One definition of the question (selectNeedsAccount),
// shared with index.tsx.
export default function LoginCallback() {
  const { user, loading } = useAuthStore()
  const profile = useUserStore(s => s.profile)
  const profileFetched = useUserStore(s => s.fetched)
  const router = useRouter()
  const rootState = useRootNavigationState()
  const navigatorReady = !!rootState?.key
  const navigated = useRef(false)

  useEffect(() => {
    if (loading || !navigatorReady || navigated.current) return
    if (user && !profileFetched) return
    navigated.current = true
    const target = !user
      ? '/login'
      : selectNeedsAccount(profile) ? '/onboarding' : '/home'
    requestAnimationFrame(() => {
      try { router.replace(target) }
      catch { navigated.current = false }
    })
  }, [user, loading, navigatorReady, profileFetched, profile])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PAGE }}>
      <ActivityIndicator size="large" color={INK} />
    </View>
  )
}
