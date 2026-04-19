import { useEffect, useRef } from 'react'
import { useRouter, useRootNavigationState } from 'expo-router'
import { useAuthStore } from '../src/stores/authStore'
import { BootScreen } from '../src/components/BootScreen'

// Boot route — shown while the auth session resolves. Renders the branded
// boot screen (pulsing logo + tagline) and routes to /home or /login when
// auth is done.

export default function Index() {
  const { user, loading } = useAuthStore()
  const router = useRouter()
  const rootState = useRootNavigationState()
  const navigatorReady = !!rootState?.key
  const navigated = useRef(false)

  useEffect(() => {
    if (loading || !navigatorReady || navigated.current) return
    navigated.current = true
    // Defer by one frame so the Root Layout's navigator is fully committed
    // before we navigate. Without this, rapid back-navigations to the index
    // route cause "Attempted to navigate before mounting the Root Layout".
    requestAnimationFrame(() => {
      try {
        router.replace(user ? '/home' : '/login')
      } catch {
        // Navigator not ready yet — reset flag so the next effect run retries.
        navigated.current = false
      }
    })
  }, [user, loading, navigatorReady])

  return <BootScreen />
}
