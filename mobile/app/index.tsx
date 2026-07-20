import { useEffect, useRef } from 'react'
import { useRouter, useRootNavigationState } from 'expo-router'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore, selectNeedsOnboarding } from '../src/stores/userStore'

// Boot route — shown while the auth session resolves, then redirects to
// /onboarding, /home or /login.
//
// This route owns the *first* navigation decision: the routing guard in
// _layout.tsx returns early while `segments.length === 0` and is deliberately
// not subscribed to `segments`, so whatever this route picks is final unless
// the auth/profile state itself changes afterwards. That is why the profile
// fetch is awaited here (`profileFetched`) rather than routed past — sending
// an authenticated user to /home before the profile resolved parked
// half-onboarded users on a blank home screen with nothing left to re-fire
// the guard.

export default function Index() {
  const { user, loading } = useAuthStore()
  const profile = useUserStore(s => s.profile)
  const profileFetched = useUserStore(s => s.fetched)
  const router = useRouter()
  const rootState = useRootNavigationState()
  const navigatorReady = !!rootState?.key
  const navigated = useRef(false)

  useEffect(() => {
    if (loading || !navigatorReady || navigated.current) return
    // An authenticated user's destination depends on the profile, so wait for
    // the fetch. Signed-out users go to /login without it.
    if (user && !profileFetched) return
    navigated.current = true
    const target = !user
      ? '/login'
      : selectNeedsOnboarding(profile) ? '/onboarding' : '/home'
    requestAnimationFrame(() => {
      try {
        router.replace(target)
      } catch {
        navigated.current = false
      }
    })
  }, [user, loading, navigatorReady, profileFetched, profile])

  return null
}
