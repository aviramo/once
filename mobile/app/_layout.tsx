import { useEffect, useRef } from 'react'
import { Text, TextInput } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import {
  NotoSansHebrew_400Regular,
  NotoSansHebrew_500Medium,
  NotoSansHebrew_600SemiBold,
  NotoSansHebrew_700Bold,
  NotoSansHebrew_800ExtraBold,
} from '@expo-google-fonts/noto-sans-hebrew'
import {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
  NotoSans_800ExtraBold,
} from '@expo-google-fonts/noto-sans'
import { supabase } from '../src/lib/supabase'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore } from '../src/stores/userStore'
import { subscribeToUserChanges, unsubscribeFromUserChanges } from '../src/lib/realtime'
import { unregisterPushNotifications } from '../src/lib/notifications'
import { DEFAULT_FAMILY, FONT_SCALE } from '../src/fonts'

SplashScreen.preventAutoHideAsync().catch(() => {})

// Noto Sans Hebrew covers both Latin and Hebrew, with real weighted faces 400–800.
// Font application happens through the AppText wrapper in src/components/AppText.tsx,
// which is used in place of RN's Text throughout the UI. Text.defaultProps.style
// below is a safety net for stray RN Text usages (e.g., from third-party libraries).

function applyGlobalFont() {
  // @ts-expect-error — defaultProps is still the documented RN hook for
  // global Text/TextInput defaults, and RN's Text reads this internally
  // (not via React's deprecated defaultProps machinery).
  Text.defaultProps = Text.defaultProps || {}
  // @ts-expect-error
  Text.defaultProps.maxFontSizeMultiplier = FONT_SCALE.body
  // @ts-expect-error
  Text.defaultProps.style = [{ fontFamily: DEFAULT_FAMILY }, Text.defaultProps.style]

  // @ts-expect-error
  TextInput.defaultProps = TextInput.defaultProps || {}
  // @ts-expect-error
  TextInput.defaultProps.maxFontSizeMultiplier = FONT_SCALE.body
  // @ts-expect-error
  const prevStyle = TextInput.defaultProps.style
  // @ts-expect-error
  TextInput.defaultProps.style = [
    { fontFamily: DEFAULT_FAMILY },
    prevStyle,
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
  const { profile, loading: profileLoading, fetch: fetchProfile, clear } = useUserStore()
  const router = useRouter()
  const segments = useSegments()

  // Derive a stable boolean so the effect doesn't re-fire on every profile
  // object-reference change (realtime / invoke / fetch all create new objs).
  const needsOnboarding = !profile || profile.state == null

  // ── Routing guard ─────────────────────────────────────────────────────
  // `segments` is intentionally excluded from the dependency array.
  // Including it creates a feedback loop: effect → router.replace →
  // segments changes → effect re-fires → router.replace … → crash.
  //
  // The effect only needs to run when the *auth / profile* state changes;
  // it reads segments at call-time to decide whether a redirect is needed,
  // but navigation itself must not re-trigger it.
  useEffect(() => {
    if (loading) return
    const segs = segments as readonly string[]
    if (segs.length === 0) return                 // index.tsx handles root
    const current = segs[0]
    const onAuthScreen = current === 'login'
    const onOnboarding = current === 'onboarding'

    let target: string | null = null

    if (!user && !onAuthScreen) {
      target = '/login'
    } else if (user && onAuthScreen) {
      if (profileLoading) return                  // wait for profile fetch
      target = needsOnboarding ? '/onboarding' : '/home'
    } else if (user && !profileLoading && needsOnboarding && !onOnboarding && !onAuthScreen) {
      target = '/onboarding'
    } else if (user && !profileLoading && !needsOnboarding && onOnboarding) {
      target = '/home'
    }

    if (!target) return
    const targetSeg = target.replace(/^\//, '')
    if (current === targetSeg) return             // already there
    router.replace(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, needsOnboarding, profileLoading])

  useEffect(() => {
    const timeout = setTimeout(() => setUser(null), 5000)

    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(timeout)
      const user = data.session?.user ?? null
      setUser(user)
      if (user) {
        fetchProfile(user.id)
        subscribeToUserChanges(user.id)
        // Push registration is handled by the home screen notification flow
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
        // Push registration is handled by the home screen notification flow
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
    NotoSansHebrew_400Regular,
    NotoSansHebrew_500Medium,
    NotoSansHebrew_600SemiBold,
    NotoSansHebrew_700Bold,
    NotoSansHebrew_800ExtraBold,
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
    NotoSans_800ExtraBold,
  })

  useEffect(() => {
    if (fontError) console.warn('[fonts] load error:', fontError)
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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#6d28d9' }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
