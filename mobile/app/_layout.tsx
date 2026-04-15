import { useEffect } from 'react'
import { Text, TextInput } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  Rubik_800ExtraBold,
} from '@expo-google-fonts/rubik'
import { supabase } from '../src/lib/supabase'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore } from '../src/stores/userStore'
import { subscribeToUserChanges, unsubscribeFromUserChanges } from '../src/lib/realtime'
import { registerForPushNotifications, unregisterPushNotifications } from '../src/lib/notifications'
import { DEFAULT_FAMILY } from '../src/fonts'

SplashScreen.preventAutoHideAsync().catch(() => {})

// Rubik covers both Latin and Hebrew, with real weighted faces 400–800. Font application happens through the
// AppText wrapper in src/components/AppText.tsx, which is used in place of
// RN's Text throughout the UI. Text.defaultProps.style below is a safety
// net for stray RN Text usages (e.g., from third-party libraries).

function applyGlobalFont() {
  // @ts-expect-error — defaultProps is still the documented RN hook for
  // global Text/TextInput defaults, and RN's Text reads this internally
  // (not via React's deprecated defaultProps machinery).
  Text.defaultProps = Text.defaultProps || {}
  // @ts-expect-error
  Text.defaultProps.maxFontSizeMultiplier = 1.25
  // @ts-expect-error
  Text.defaultProps.style = [{ fontFamily: DEFAULT_FAMILY }, Text.defaultProps.style]

  // @ts-expect-error
  TextInput.defaultProps = TextInput.defaultProps || {}
  // @ts-expect-error
  TextInput.defaultProps.maxFontSizeMultiplier = 1.25
  // @ts-expect-error
  TextInput.defaultProps.style = [
    { fontFamily: DEFAULT_FAMILY },
    TextInput.defaultProps.style,
  ]
}

let globalFontApplied = false

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 30 },
  },
})

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, setUser } = useAuthStore()
  const { fetch: fetchProfile, clear } = useUserStore()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (loading) return
    const segs = segments as readonly string[]
    const onAuthScreen = segs[0] === 'login' || segs.length === 0
    if (!user && !onAuthScreen) router.replace('/login')
    if (user && onAuthScreen) router.replace('/home')
  }, [user, loading, segments])

  useEffect(() => {
    const timeout = setTimeout(() => setUser(null), 5000)

    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(timeout)
      const user = data.session?.user ?? null
      setUser(user)
      if (user) {
        fetchProfile(user.id)
        subscribeToUserChanges(user.id)
        registerForPushNotifications().catch(() => {})
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
        registerForPushNotifications().catch(() => {})
      } else {
        clear()
        unsubscribeFromUserChanges()
        unregisterPushNotifications()
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
  const [fontsLoaded, fontError] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    Rubik_800ExtraBold,
  })

  useEffect(() => {
    if (fontError) console.warn('[fonts] load error:', fontError)
    if (fontsLoaded) console.log('[fonts] loaded successfully, default family:', DEFAULT_FAMILY)
  }, [fontsLoaded, fontError])

  useEffect(() => {
    if (fontsLoaded && !globalFontApplied) {
      applyGlobalFont()
      globalFontApplied = true
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
