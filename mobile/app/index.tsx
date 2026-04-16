import { useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../src/stores/authStore'
import { BootScreen } from '../src/components/BootScreen'

// Boot route — shown while the auth session resolves. Renders the branded
// boot screen (pulsing logo + tagline) and routes to /home or /login when
// auth is done.

export default function Index() {
  const { user, loading } = useAuthStore()
  const router = useRouter()
  const navigated = useRef(false)

  useEffect(() => {
    if (loading || navigated.current) return
    navigated.current = true
    router.replace(user ? '/home' : '/login')
  }, [user, loading])

  return <BootScreen />
}
