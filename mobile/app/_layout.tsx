import { useEffect } from 'react'
import { Text, TextInput } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
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

SplashScreen.preventAutoHideAsync().catch(() => {})

// Map RN's fontWeight values to the matching Rubik face. Applied globally so
// every <Text> across the app renders in Rubik without per-component work.
const WEIGHT_TO_FAMILY: Record<string, string> = {
  '400': 'Rubik_400Regular',
  '500': 'Rubik_500Medium',
  '600': 'Rubik_600SemiBold',
  '700': 'Rubik_700Bold',
  '800': 'Rubik_800ExtraBold',
  normal: 'Rubik_400Regular',
  bold: 'Rubik_700Bold',
}

function applyGlobalFont() {
  const flatten = (style: any): any => {
    if (!style) return {}
    if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
    return style
  }
  const pickFamily = (style: any) => {
    const flat = flatten(style)
    const w = flat?.fontWeight != null ? String(flat.fontWeight) : '400'
    return WEIGHT_TO_FAMILY[w] ?? 'Rubik_400Regular'
  }
  // @ts-expect-error — defaultProps is the documented RN hook for global text defaults
  Text.defaultProps = Text.defaultProps || {}
  const origTextRender = Text.render
  // Override render to inject fontFamily based on the resolved fontWeight.
  // @ts-expect-error
  Text.render = function (...args: any[]) {
    const el = origTextRender.apply(this, args)
    const family = pickFamily(el.props.style)
    return {
      ...el,
      props: { ...el.props, style: [{ fontFamily: family }, el.props.style] },
    }
  }
  // @ts-expect-error
  TextInput.defaultProps = TextInput.defaultProps || {}
  // @ts-expect-error
  TextInput.defaultProps.style = [{ fontFamily: 'Rubik_400Regular' }, TextInput.defaultProps.style]
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
  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    Rubik_800ExtraBold,
  })

  useEffect(() => {
    if (fontsLoaded && !globalFontApplied) {
      applyGlobalFont()
      globalFontApplied = true
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
