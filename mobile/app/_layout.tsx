import { useEffect } from 'react'
import { Text, TextInput, AppState, View, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { LayoutAnimationConfig } from 'react-native-reanimated'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppStatusBar } from '../src/components/AppStatusBar'
import * as Linking from 'expo-linking'
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
import { consumeMagicLinkUrl } from '../src/lib/authRedirect'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore } from '../src/stores/userStore'
import { subscribeToUserChanges, unsubscribeFromUserChanges } from '../src/lib/realtime'
import { unregisterPushNotifications, dismissAllNotifications } from '../src/lib/notifications'
import { clearSelfAvatar } from '../src/lib/selfAvatar'
import { DEFAULT_FAMILY, FONT_SCALE } from '../src/fonts'
import { useColors } from '../src/colors'
import { useThemeStore } from '../src/stores/themeStore'

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
  const { profile, loading: profileLoading, fetched: profileFetched, fetch: fetchProfile, clear } = useUserStore()
  const router = useRouter()
  const segments = useSegments()
  const c = useColors()

  // Seed the theme from the server's data.appearance the first time the
  // profile arrives — but only if the user has no local choice yet (local is
  // authoritative; see themeStore.adoptServer).
  useEffect(() => {
    useThemeStore.getState().adoptServer(profile?.appearance)
  }, [profile?.appearance])

  // Onboarding is needed when profile is absent (new user not yet in DB) or
  // when it exists but bio is empty (partially completed). The !profileLoading
  // guard in each routing condition prevents redirecting while the fetch is
  // still in flight.
  const needsOnboarding = !profile || !profile.bio

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
      if (profileLoading || !profileFetched) return  // wait for profile fetch to complete
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
  }, [user, loading, needsOnboarding, profileLoading, profileFetched])

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
        clearSelfAvatar().catch(() => {})
      }
    })

    return () => {
      clearTimeout(timeout)
      listener.subscription.unsubscribe()
      unsubscribeFromUserChanges()
    }
  }, [])

  // Magic-link return handler. The Supabase email link redirects to
  // `once://login-callback#access_token=...&refresh_token=...`. Both the
  // cold-start URL and any in-session URL are funnelled through
  // consumeMagicLinkUrl, which calls supabase.auth.setSession — that fires
  // onAuthStateChange above, which routes the user past /login.
  useEffect(() => {
    let cancelled = false
    Linking.getInitialURL().then(url => {
      if (!cancelled && url) consumeMagicLinkUrl(url)
    })
    const sub = Linking.addEventListener('url', ({ url }) => {
      consumeMagicLinkUrl(url)
    })
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [])

  // After sign-in succeeds, the routing effect above still has to wait for
  // the profile fetch (a blocking `users` round-trip) before it can decide
  // home-vs-onboarding and `router.replace` off `/login`. Leaving the
  // fully-mounted login screen visible during that wait makes it linger and
  // repaint ("flicker") before the hard `animation: 'none'` cut. Cover it
  // with a full-bleed PRIMARY layer — the same wine as the login background
  // and the home header, so login → hold → destination reads as one
  // continuous surface. It stays up only while the user is authenticated but
  // still sitting on `/login` (or the profile hasn't loaded yet), and drops
  // the instant the route changes, with the destination already painted
  // underneath. The `seg0 === 'login'` term keeps it through the gap between
  // the profile-fetched render and the post-render `replace` effect (no
  // one-frame flash). The Stack is never unmounted, so the documented
  // Fabric/Reanimated mount race is untouched.
  const seg0 = (segments as readonly string[])[0]
  const authHandoff = !!user && (!profileFetched || seg0 === 'login')

  return (
    <>
      {children}
      {authHandoff && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} />
      )}
    </>
  )
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

  const c = useColors()

  // Read the persisted theme preference once on app boot (before this the UI
  // uses 'system', so system users never flash).
  useEffect(() => {
    useThemeStore.getState().hydrate()
  }, [])

  useEffect(() => {
    if (fontError) console.warn('[fonts] load error:', fontError)
  }, [fontsLoaded, fontError])

  useEffect(() => {
    dismissAllNotifications()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') dismissAllNotifications()
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (fontsLoaded && !globalFontApplied) {
      applyGlobalFont()
      globalFontApplied = true
    }
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Global status bar: white text whenever the app is in the foreground.
          The OS automatically restores the system default when the app is
          backgrounded or closed — every app owns its own status bar style. */}
      <AppStatusBar />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* Reanimated layout-animations (entering/exiting) race with Fabric's
              initial mount on Android — "Failed to insert view ... must call
              removeView() on child's parent first". Skipping entering on the
              first paint side-steps the race; subsequent mounts animate as
              normal. Keep this wrapper at the root so it covers every screen. */}
          <LayoutAnimationConfig skipEntering>
            <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
          </LayoutAnimationConfig>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
