import { useEffect } from 'react'
import { Text, TextInput, AppState, View, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { LayoutAnimationConfig } from 'react-native-reanimated'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppStatusBar } from '../src/components/AppStatusBar'
import { StatusBarBand, BottomEdgeShade } from '../src/components/ScreenEdgeShade'
import * as Linking from 'expo-linking'
import { useFonts } from 'expo-font'
import {
  NotoSansHebrew_400Regular,
  NotoSansHebrew_500Medium,
  NotoSansHebrew_700Bold,
  NotoSansHebrew_900Black,
} from '@expo-google-fonts/noto-sans-hebrew'
import {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
} from '@expo-google-fonts/noto-sans'
import { supabase } from '../src/lib/supabase'
import { consumeMagicLinkUrl } from '../src/lib/authRedirect'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore, selectNeedsAccount } from '../src/stores/userStore'
import { subscribeToUserChanges, unsubscribeFromUserChanges } from '../src/lib/realtime'
import { unregisterPushNotifications, dismissAllNotifications } from '../src/lib/notifications'
import { clearSelfAvatar } from '../src/lib/selfAvatar'
import { clearCachedGroups } from '../src/lib/groupsCache'
import { clearRosterCaches } from '../src/lib/rosterCache'
import { clearAllChatCaches } from '../src/lib/chatCache'
import { clearBrowseAllowance } from '../src/lib/browseGate'
import { stashInviteUrl } from '../src/lib/circles'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE } from '../src/keys'
import { DEFAULT_FAMILY, FONT_SCALE, TEXT_START } from '../src/fonts'
import { KeyboardProvider, useKeyboardResizeMode } from '../src/hooks/useKeyboard'
import { PAGE } from '../src/colors'

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
  Text.defaultProps.maxFontSizeMultiplier = FONT_SCALE
  // @ts-expect-error
  Text.defaultProps.style = [{ fontFamily: DEFAULT_FAMILY, ...TEXT_START }, Text.defaultProps.style]

  // @ts-expect-error
  TextInput.defaultProps = TextInput.defaultProps || {}
  // @ts-expect-error
  TextInput.defaultProps.maxFontSizeMultiplier = FONT_SCALE
  // @ts-expect-error
  const prevStyle = TextInput.defaultProps.style
  // @ts-expect-error
  TextInput.defaultProps.style = [
    { fontFamily: DEFAULT_FAMILY, ...TEXT_START },
    prevStyle,
  ]
}

let globalFontApplied = false

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 30 },
  },
})

// Reading the stored session at launch (see `probe` below): how many times to
// ask before an unreadable answer is allowed to mean "signed out", the first wait
// between asks (it doubles each time — 600 / 1200 / 2400ms, so a network that
// comes up a moment late costs no /login flash), and how long one attempt may
// leave the boot route undecided before the splash gives up on it.
const SESSION_PROBE_TRIES = 4
const SESSION_PROBE_BACKOFF_MS = 600
const SESSION_PROBE_VALVE_MS = 5000

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, setUser } = useAuthStore()
  const { profile, loading: profileLoading, fetched: profileFetched, fetch: fetchProfile, hydrate: hydrateProfile, clear } = useUserStore()
  const router = useRouter()
  const segments = useSegments()

  // The !profileLoading guard in each routing condition prevents redirecting
  // while the fetch is still in flight. index.tsx owns the *first* decision
  // (this effect bails while segments is empty) — see selectNeedsAccount.
  // Only the ACCOUNT (not a built profile) gates /home: a user with an account
  // but no photos belongs on /home, browsing.
  const needsAccount = selectNeedsAccount(profile)

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
    // BOTH BOOT ROUTES OWN THEIR OWN FIRST NAVIGATION, and this guard keeps its
    // hands off both: index.tsx above (segments empty) and the magic link's
    // landing route here. /login-callback was a route like any other to this
    // effect — it is not /login, so an authenticated user standing on it fell
    // through to the needsAccount branch below and was replaced to /onboarding
    // with `profile` still null, because the auth event setSession fires is what
    // STARTS the profile fetch. A user with a full account was handed step 1,
    // the gender picker, and nothing ever brought him back (there is
    // deliberately no reactive "account exists → /home" branch; see below).
    if (current === 'login-callback') return
    const onAuthScreen = current === 'login'
    const onOnboarding = current === 'onboarding'

    // NOTHING IS DECIDED OFF A PROFILE NOBODY HAS ANSWERED FOR YET. Every branch
    // below that reads `needsAccount` is asking "does this user have an
    // account", and a null profile is not an answer to that until the fetch (or
    // the disk hydrate) has landed — an unanswered one reads exactly like a
    // brand-new signup. Stated ONCE, so no branch can be written without it.
    if (user && (profileLoading || !profileFetched)) return

    let target: string | null = null

    if (!user && !onAuthScreen) {
      target = '/login'
    } else if (user && onAuthScreen) {
      target = needsAccount ? '/onboarding' : '/home'
    } else if (user && needsAccount && !onOnboarding) {
      target = '/onboarding'
    }
    // NOTE: there is deliberately NO reactive "account exists && on onboarding
    // → /home" branch. Once the account exists the user may VOLUNTARILY reopen
    // /onboarding (the dock's profile key) to add the photos that build it;
    // onboarding.tsx routes itself to /home when they finish or back out. A
    // reactive redirect here would bounce them straight out of that flow.

    if (!target) return
    const targetSeg = target.replace(/^\//, '')
    if (current === targetSeg) return             // already there
    router.replace(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, needsAccount, profileLoading, profileFetched])

  useEffect(() => {
    let cancelled = false
    let probeTimer: ReturnType<typeof setTimeout> | undefined
    let valve: ReturnType<typeof setTimeout> | undefined

    // Splash safety valve. The boot route waits on `user` being decided either
    // way, and reading the session can HANG rather than fail: auth-js takes a
    // lock on the storage key and the refresh fetch behind it carries no timeout
    // of its own. Re-armed per attempt (rather than once for the whole sequence),
    // so the retries below can never keep the splash up longer than one window.
    const armValve = () => {
      clearTimeout(valve)
      valve = setTimeout(() => setUser(null), SESSION_PROBE_VALVE_MS)
    }

    // Everything on this disk that belongs to ONE identity. Awaited by both of
    // its callers — a sign-out, and a different account arriving on the device —
    // because what comes next reads these caches back.
    const wipeDeviceData = async () => {
      clear()
      await Promise.all([
        clearSelfAvatar().catch(() => {}),
        clearCachedGroups().catch(() => {}),
        clearRosterCaches().catch(() => {}),
        clearAllChatCaches().catch(() => {}),
        clearBrowseAllowance().catch(() => {}),
      ])
    }

    // The stored session is what says whether this person is signed in — and
    // reading it can fail for a reason that has nothing to do with being signed
    // in. The access token lives 7 days (the project's `jwt_exp`); once it does
    // need replacing, auth-js refreshes it here, and that refresh needs the
    // network — which on a cold start is often not up yet. getSession() then
    // answers `session: null`, and taking that at face value bounces a perfectly
    // signed-in user to /login (measured on an emulator 2026-07-30: clock past
    // the expiry with the network cut lands exactly here). `error` is what tells the two apart: there is no error when there
    // is simply nothing stored, and auth-js KEEPS the session on disk through a
    // network failure (it deletes it only when the server refuses the refresh
    // token — and then the next read answers null with no error, so this settles
    // on "signed out" one probe later). So an undecided answer is retried with
    // the wait doubling, and only an empty one means signed out. Nothing here is
    // destructive either way: the fallback is a route to /login, and a refresh
    // that lands later emits TOKEN_REFRESHED into the listener below, which
    // routes the user back to /home on its own.
    const probe = async (attempt: number) => {
      armValve()
      let result: Awaited<ReturnType<typeof supabase.auth.getSession>> | null = null
      try { result = await supabase.auth.getSession() } catch {}
      if (cancelled) return
      const session = result?.data.session ?? null
      const undecided = !session && (!result || !!result.error)
      if (undecided && attempt + 1 < SESSION_PROBE_TRIES) {
        probeTimer = setTimeout(() => probe(attempt + 1), SESSION_PROBE_BACKOFF_MS * 2 ** attempt)
        return
      }
      clearTimeout(valve)
      const user = session?.user ?? null
      setUser(user)
      if (user) {
        // Disk first, network second — both in flight at once. Whichever lands
        // first paints; hydrate stands down if the fetch beat it. This is what
        // lets a relaunch reach /home (and mount the chat sheet, which then
        // reads its own cached transcript) without waiting on the round trip.
        hydrateProfile(user.id)
        fetchProfile(user.id)
        subscribeToUserChanges(user.id)
        // Push registration is handled by the home screen notification flow
      }
    }
    probe(0)

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null
      if (user) {
        clearTimeout(valve)
        setUser(user)
        // Whose data is on this disk is its own question, and the answer is not
        // an auth event: the caches are keyed by what they HOLD (`my_groups`,
        // `roster_<groupId>`, `chat_<otherId>`, the self avatar), so a second
        // account arriving here would read the first one's. The wipe therefore
        // hangs off the IDENTITY changing, which no missed event can hide — a
        // switch that never emitted SIGNED_OUT leaked them before this too. It is
        // awaited before the hydrate, since that is what reads them back.
        void (async () => {
          let previous: string | null = null
          try { previous = await AsyncStorage.getItem(STORAGE.lastUserId) } catch {}
          const switched = !!previous && previous !== user.id
          if (switched) await wipeDeviceData()
          AsyncStorage.setItem(STORAGE.lastUserId, user.id).catch(() => {})
          // Disk first, network second — both in flight at once. Whichever lands
          // first paints; hydrate stands down if the fetch beat it. This is what
          // lets a relaunch reach /home (and mount the chat sheet, which then
          // reads its own cached transcript) without waiting on the round trip.
          // Nothing to hydrate when the disk was just wiped for a new identity.
          if (!switched) hydrateProfile(user.id)
          fetchProfile(user.id)
          subscribeToUserChanges(user.id)
          // Push registration is handled by the home screen notification flow
        })()
        return
      }
      // A null session is NOT automatically a sign-out. Only two events can carry
      // one, and they mean opposite things: SIGNED_OUT is the session genuinely
      // going away (an explicit sign-out, or a refresh the server REFUSED — the
      // one case where auth-js drops the stored session itself), while
      // INITIAL_SESSION reports null both for "nothing is stored" and for "the
      // stored session could not be read or refreshed right now" (see `probe`).
      // Treating the second as a sign-out wiped every local cache — transcripts,
      // roster, groups, the self avatar — and unregistered push, for nothing
      // worse than a launch with no network yet. So the teardown hangs off
      // SIGNED_OUT alone, and the undecided case belongs to the probe, which is
      // the only thing that settles it.
      if (event !== 'SIGNED_OUT') return
      clearTimeout(valve)
      setUser(null)
      // These two are the live connection rather than the disk, so they belong to
      // a sign-out and NOT to the identity switch above (which has already
      // subscribed the arriving user and owes them their push registration).
      unsubscribeFromUserChanges()
      unregisterPushNotifications()
      AsyncStorage.removeItem(STORAGE.lastUserId).catch(() => {})
      void wipeDeviceData()
    })

    return () => {
      cancelled = true
      clearTimeout(valve)
      clearTimeout(probeTimer)
      listener.subscription.unsubscribe()
      unsubscribeFromUserChanges()
    }
  }, [])

  // Inbound deep-link handler — the ONE place every URL the app is opened with
  // is read (cold-start URL + in-session events). Expo Router routes the same
  // URLs through its own tree; the invite links match no screen there, so
  // app/+not-found.tsx only bounces them to the boot route.
  //  · Magic-link return: the Supabase email link redirects to
  //    `once://login-callback#access_token=...&refresh_token=...`.
  //    consumeMagicLinkUrl calls supabase.auth.setSession, which fires
  //    onAuthStateChange above and routes the user past /login.
  //  · Group / friend invites (`once://g/<TOKEN>`, `once://f/<CODE>`):
  //    stashInviteUrl parks the code and redeems it as soon as there is a
  //    session (see the deep-link invite section in lib/circles).
  useEffect(() => {
    let cancelled = false
    Linking.getInitialURL().then(url => {
      if (!cancelled && url) { consumeMagicLinkUrl(url); stashInviteUrl(url) }
    })
    const sub = Linking.addEventListener('url', ({ url }) => {
      consumeMagicLinkUrl(url)
      stashInviteUrl(url)
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
  // with a full-bleed PAGE layer — the same page tint as login and home, so
  // login → hold → destination reads as one
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
        <View style={[StyleSheet.absoluteFill, { backgroundColor: PAGE }]} />
      )}
    </>
  )
}

// THE ROOT DOES NOT SHRINK ANY MORE — A KEYBOARD BELONGS TO A PAGE (user
// directive 2026-08-03). This wrapper padded the WHOLE app by the keyboard's
// height, which meant every page moved for a keyboard, including the ones that
// cannot be typed into at all. Home is the one that showed it: a chat put away
// with its IME still coming down left home laid out in the shorter box — the
// card cropped and the dock parked halfway up the screen, over a keyboard
// belonging to nothing (emulator, 2026-08-03).
//
// What the shrink IS has not changed, only where it is declared: each surface
// with a text field wraps itself in `KeyboardSurface` (src/hooks/useKeyboard),
// and a `BottomSheet` — its own native window — lifts itself by the same value.
// Home declares nothing and is always the whole screen.
//
// What stays here is the one thing that genuinely belongs to the app rather than
// to a page: Android's `adjustResize` mode, which must be set exactly once, by a
// component that never unmounts (the library restores the default on unmount).
function KeyboardMode({ children }: { children: React.ReactNode }) {
  useKeyboardResizeMode()
  return <>{children}</>
}

export default function RootLayout() {
  // The app has ONE emphasis weight — 500 (WEIGHT.medium in tokens.ts) — so a
  // face nobody can ask for is dead weight in the bundle. That took out ExtraBold
  // with the 800 token, and SemiBold on 2026-07-29 when the emphasis tier moved
  // 600 → 500: a stray '600' now lands on the Medium file (WEIGHT_TO_FAMILY in
  // src/fonts.ts), so nothing asks for a face that is not here. Bold stays as the
  // landing spot for a `fontWeight: 'bold'` the app itself never writes.
  const [fontsLoaded, fontError] = useFonts({
    NotoSansHebrew_400Regular,
    NotoSansHebrew_500Medium,
    NotoSansHebrew_700Bold,
    // The one face nothing but the wordmark asks for: the app's name is drawn
    // at 900, a weight no label in the UI has.
    NotoSansHebrew_900Black,
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
  })

  useEffect(() => {
    if (fontError) console.warn('[fonts] load error:', fontError)
  }, [fontsLoaded, fontError])

  useEffect(() => {
    dismissAllNotifications()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        dismissAllNotifications()
        // Re-fetch the profile on every foreground: fetch is authoritative and
        // carries the full server `relations` (invoke responses strip it), so
        // this keeps denormalized fields like relations.communities — and the
        // settings "Circles" summary that reads them — current without the
        // user having to relaunch.
        const uid = useAuthStore.getState().user?.id
        if (uid) useUserStore.getState().fetch(uid)
      }
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
    <SafeAreaProvider>
    {/* NO FLAGS HERE. `statusBarTranslucent` / `navigationBarTranslucent` /
        `preserveEdgeToEdge` used to be passed explicitly, to make the reported
        keyboard height the FULL `WindowInsets.ime()` inset (navigation bar
        included) rather than the bar-subtracted one. The app draws edge-to-edge
        (`edgeToEdgeEnabled` in app.json), and the library forces all three ON by
        itself in that mode (`IS_EDGE_TO_EDGE || prop`) — so stating them changed
        nothing and only earned a warning on every launch. What guarantees the
        full inset is the edge-to-edge flag, not a prop here. */}
    <KeyboardProvider>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: PAGE }}>
      {/* Global status bar: white glyphs over the purple band, everywhere. The
          OS restores the system default when backgrounded — every app owns its
          own status bar style. */}
      <AppStatusBar style="light" />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* Reanimated layout-animations (entering/exiting) race with Fabric's
              initial mount on Android — "Failed to insert view ... must call
              removeView() on child's parent first". Skipping entering on the
              first paint side-steps the race; subsequent mounts animate as
              normal. Keep this wrapper at the root so it covers every screen. */}
          <LayoutAnimationConfig skipEntering>
            <KeyboardMode>
              <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
                {/* ONBOARDING IS A LAYER OVER HOME, NOT A PAGE THAT REPLACES IT.
                    A stack screen is opaque by default and react-native-screens
                    stops drawing whatever is beneath it, so dragging onboarding
                    down (its build-profile steps close by the app's one dismiss
                    gesture) revealed nothing but its own empty background — a
                    layer over a void. The transparent presentation is what keeps
                    home on screen underneath it.

                    It is declared HERE, on the navigator, and not in the route:
                    `presentation` is read when the native screen is CREATED, so
                    the same options passed from an in-route <Stack.Screen> — a
                    setOptions on a screen that already exists — are silently
                    dropped (measured on the emulator, 2026-07-31).

                    CONTAINED is load-bearing rather than a detail: it keeps the
                    screen inside the app's one native window
                    (UIModalPresentationOverCurrentContext on iOS, the same
                    fragment container on Android), so it still lays out inside
                    the keyboard shrink above. A plain 'transparentModal' presents
                    its OWN window on iOS, which inherits none of that and would
                    put onboarding's bio field back under the keyboard — the app
                    has exactly two native windows (see useKeyboard.ts) and this
                    must not become a third.

                    `animation: 'none'` is inherited on purpose: the ROUTE must
                    not animate, because the surface inside it does. It rises on
                    RisingCard, the app's one bottom-up entrance, so onboarding
                    arrives exactly as every other page in the app does. */}
                <Stack.Screen
                  name="onboarding"
                  options={{
                    presentation: 'containedTransparentModal',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
              </Stack>
            </KeyboardMode>
          </LayoutAnimationConfig>
        </AuthProvider>
      </QueryClientProvider>
      {/* Last children so they paint above every screen — and OUTSIDE the
          shrink, so the app's two edges belong to the SCREEN and never move
          with the keyboard. This is the whole app's pair; no page draws one. */}
      <StatusBarBand />
      <BottomEdgeShade />
    </GestureHandlerRootView>
    </KeyboardProvider>
    </SafeAreaProvider>
  )
}

