import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '../src/lib/supabase'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore } from '../src/stores/userStore'
import { subscribeToUserChanges, unsubscribeFromUserChanges } from '../src/lib/realtime'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 30 },
  },
})

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser } = useAuthStore()
  const { fetch: fetchProfile, clear } = useUserStore()

  useEffect(() => {
    const timeout = setTimeout(() => setUser(null), 5000)

    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(timeout)
      const user = data.session?.user ?? null
      setUser(user)
      if (user) {
        fetchProfile(user.id)
        subscribeToUserChanges(user.id)
      }
    }).catch(() => {
      clearTimeout(timeout)
      setUser(null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timeout)
      const user = session?.user ?? null
      setUser(user)
      if (user) {
        fetchProfile(user.id)
        subscribeToUserChanges(user.id)
      } else {
        clear()
        unsubscribeFromUserChanges()
      }
    })

    return () => {
      clearTimeout(timeout)
      listener.subscription.unsubscribe()
      unsubscribeFromUserChanges()
    }
  }, [])

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
