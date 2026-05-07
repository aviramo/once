import { useEffect, useRef } from 'react'
import { useRouter, useRootNavigationState } from 'expo-router'
import { useAuthStore } from '../src/stores/authStore'

// Boot route — shown while the auth session resolves, then redirects to /home or /login.

export default function Index() {
  const { user, loading } = useAuthStore()
  const router = useRouter()
  const rootState = useRootNavigationState()
  const navigatorReady = !!rootState?.key
  const navigated = useRef(false)

  useEffect(() => {
    if (loading || !navigatorReady || navigated.current) return
    navigated.current = true
    requestAnimationFrame(() => {
      try {
        router.replace(user ? '/home' : '/login')
      } catch {
        navigated.current = false
      }
    })
  }, [user, loading, navigatorReady])

  return null
}
