import { useCallback, useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Animated, Keyboard, TextInput as RNTextInput, PanResponder, BackHandler, Dimensions } from 'react-native'
// Named hooks only, deliberately: the pager below runs on RN's own `Animated`,
// which is imported under that very name.
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBottomInset } from '../src/hooks/useBottomInset'
import { KeyboardSurface } from '../src/hooks/useKeyboard'
import { useRouter } from 'expo-router'
import { AppStatusBar } from '../src/components/AppStatusBar'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore, selectNeedsAccount, selectProfileBuilt } from '../src/stores/userStore'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { BIO_MAX, normalizeBio } from '../src/lib/bio'
import { MIN_PHOTOS } from '../src/lib/photos'
import { t, tg, genderize, lang } from '../src/i18n'
import { Button } from '../src/components/Button'
import { UserPlusIcon, CheckIcon } from '../src/components/icons'
import { PullPane, usePullBehavior } from '../src/components/PullPane'
import { RisingCard } from '../src/components/RisingCard'
import { PhotoEditor, PhotoEditorRef } from '../src/components/PhotoEditor'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { PAGE, INK, INK_HINT, INK_WASH, NEGATIVE, WHITE, SELECTION } from '../src/colors'
import { FIELD_SKIN } from '../src/field'
import { XS, SM, MD, LG, XL, RADIUS, TEXT, WEIGHT, MOTION, INPUT_MIN_HEIGHT, bottomGap, BOTTOM_AIR, CARD_SHADOW } from '../src/tokens'

const TOTAL_STEPS = 5

// "13 באוקטובר" / "October 13" — the birthdate spelled out in words for the
// confirmation popup, so a digit transposition in the DD/MM boxes reads as an
// obviously wrong month rather than another pair of digits. Intl carries the
// month names per language (the app already relies on full ICU for the
// credits grant day), so this needs no month table of its own.
function birthdateInWords(yyyy: string, mm: string, dd: string): string {
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  // The title is built on every render, including while the boxes are still
  // half-typed and the popup is closed. Without this the formatter yields the
  // literal "Invalid Date".
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang, { day: 'numeric', month: 'long' })
}

// The birth-confirmation body, with the day/month and the age rendered bold so
// the two things the user is actually verifying stand out from the sentence
// around them. The template carries {date}/{age} placeholders; we split on them
// and wrap only those spans (nested <Text> inherits the desc size/colour and
// overrides weight only).
function birthConfirmBody(template: string, date: string, age: string) {
  return template.split(/(\{date\}|\{age\})/).map((part, i) => {
    if (part === '{date}') return <Text key={i} style={{ fontWeight: WEIGHT.medium, color: INK }}>{date}</Text>
    if (part === '{age}') return <Text key={i} style={{ fontWeight: WEIGHT.medium, color: INK }}>{age}</Text>
    return part
  })
}

// Delay before auto-focusing a step's input after navigating to it. The step
// transition slides the pager over MOTION.base; focusing an input that is
// still mid-slide / offscreen makes Android silently drop the soft-keyboard
// request, so every auto-focus waits for the slide to (nearly) finish. This
// is a focus *gate*, NOT an animation duration — per tokens.ts it must not be
// a MOTION value (retuning the slide must not silently retune this delay).
const STEP_FOCUS_DELAY_MS = 280

type DateUnit = 'dd' | 'mm' | 'yyyy'
const DATE_ORDER: Record<string, DateUnit[]> = {
  he: ['dd', 'mm', 'yyyy'],
  en: ['mm', 'dd', 'yyyy'],
}
const dateOrder: DateUnit[] = DATE_ORDER[lang] ?? DATE_ORDER.he

// ── Gender icons ───────────────────────────────────────────────────────────

function MaleSymbol({ color }: { color: string }) {
  return (
    <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={10} cy={14} r={5} />
      <Line x1={14} y1={10} x2={20} y2={4} />
      <Path d="M15 4h5v5" />
    </Svg>
  )
}

function FemaleSymbol({ color }: { color: string }) {
  return (
    <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={9} r={5} />
      <Line x1={12} y1={14} x2={12} y2={21} />
      <Line x1={9} y1={18} x2={15} y2={18} />
    </Svg>
  )
}

// ── Gender card ────────────────────────────────────────────────────────────

function GenderCard({
  icon, label, selected, onPress,
}: {
  icon: (color: string) => React.ReactNode
  label: string
  selected: boolean
  onPress: () => void
}) {
  const activeOpacity = useRef(new Animated.Value(selected ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(activeOpacity, {
      toValue: selected ? 1 : 0,
      duration: MOTION.base,
      useNativeDriver: true,
    }).start()
  }, [selected])

  const handlePress = () => {
    tap()
    onPress()
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={styles.card}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handlePress}
      >
        <View style={styles.cardInner}>
          {icon(INK)}
          <Text style={styles.cardLabel}>{label}</Text>
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.cardActive, { opacity: activeOpacity }]}
        >
          {icon(WHITE)}
          <Text style={[styles.cardLabel, styles.cardLabelActive]}>{label}</Text>
        </Animated.View>
      </View>
    </View>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user } = useAuthStore()
  const { profile } = useUserStore()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const bottomInset = useBottomInset()

  // WHERE A RE-ENTRY RESUMES. Steps 1-3 CREATE THE ACCOUNT, so an account that
  // already exists never sees them: whatever brought such a user here, the only
  // thing left to do on this screen is the photos, and step 4 is where they are
  // (user directive 2026-07-31: MIN_PHOTOS photos ARE the definition of a built
  // profile, the bio is optional — so there is one resume point, not two. It
  // used to also land on the bio step for a profile that had its photos but no
  // bio, back when an empty bio was what "unfinished" meant).
  //
  // The question is `selectNeedsAccount`, the same one the routing guard and the
  // boot routes ask, rather than a photo count of its own: a profile that is
  // already BUILT used to fall through this test to step 1 and be shown the
  // gender picker, which is the one thing a user with an account may never be
  // handed — pressing on through it overwrites his real name, gender and
  // birthdate. Nothing routes a built profile here, and if anything ever does it
  // now lands on a photo step it can simply swipe away from.
  const initialStep: number = selectNeedsAccount(profile) ? 1 : 4
  const [step, setStep] = useState(initialStep)
  // DID THIS SCREEN ARRIVE OVER ANOTHER PAGE? An account that already exists at
  // MOUNT means one thing only: home pushed us here (the dock's profile key,
  // which routes to onboarding while the profile is unfinished) — a user with an
  // account always boots to /home, so this can never be a cold-start first
  // paint. That is the one entry that is a layer arriving over a page, so it is
  // the one that rises. The linear signup (steps 1-3, entered by a route REPLACE
  // off /login) is simply the screen the app is on and does not.
  //
  // Frozen at mount deliberately: `initialStep` is recomputed from the profile
  // on every render and moves as the flow saves photos and bio under it.
  const openedOverHome = useRef(initialStep >= 4).current
  const [renderedSteps, setRenderedSteps] = useState(() => new Set([initialStep]))
  const [isMale, setIsMale] = useState<boolean | null>(profile?.is_male ?? null)
  const [name, setName] = useState(profile?.name ?? '')
  const [dd, setDd] = useState('')
  const [mm, setMm] = useState('')
  const [yyyy, setYyyy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [birthConfirmOpen, setBirthConfirmOpen] = useState(false)
  const [dateError, setDateError] = useState<string | null>(null)
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [bioSubmitting, setBioSubmitting] = useState(false)
  const [totalPhotoCount, setTotalPhotoCount] = useState(profile?.images?.length ?? 0)
  // Set when the deferred photo upload fails at submit time and the flow is
  // bounced back to step 4. Rendered on the photo step (where the user acts on
  // it), cleared as soon as they pick a photo again.
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoEditorRef = useRef<PhotoEditorRef>(null)

  // The air under every step's last control (the CTA), taken out of the pager's
  // frame so no step declares one of its own. The app's one bottom air, same on
  // every device — see bottomGap in tokens.ts.
  const pagerBottomAir = bottomGap(bottomInset, BOTTOM_AIR)

  // Estimate the pager height for first paint so the initial step renders
  // immediately (rather than flashing an empty background until onLayout fires).
  const initialPagerH = Math.max(100, Dimensions.get('window').height - insets.top - pagerBottomAir)
  const [containerH, setContainerH] = useState(initialPagerH)
  const measuredOnceRef = useRef(false)
  const slideY = useRef(new Animated.Value(-(initialStep - 1) * initialPagerH)).current
  const stepRef = useRef(step)
  const containerHRef = useRef(containerH)
  const bioSubmittingRef = useRef(false)
  useEffect(() => { stepRef.current = step }, [step])
  useEffect(() => { containerHRef.current = containerH }, [containerH])

  const canGoBack = (s: number) => s === 2 || s === 3 || s === 5
  const goBack = () => setStep(s => canGoBack(s) ? s - 1 : s)
  // WHERE A DOWN-DRAG TAKES THE WHOLE SCREEN INSTEAD OF ONE STEP. The gesture
  // means one thing throughout — BACK — and this is the step where there is no
  // step behind: 4 is the first of the two build-profile steps, and it is
  // reached either from home (the dock's profile key) or straight off the
  // account being created, neither of which is a step to return to. Exactly
  // what hardware back already does here, so the two can never disagree: on 5
  // both go back to the photos, on 4 both leave for home.
  const canLeave = (s: number) => s === 4
  const overlayY = useRef(new Animated.Value(initialStep === 5 ? 0 : initialPagerH)).current

  // THE WAY OUT IS THE APP'S ONE DISMISS GESTURE (user directive 2026-07-31),
  // in place of the close X that stood in the top-START corner of steps 4 and
  // 5. This screen is a surface the user OPENED over home, so it leaves the way
  // every other one does — the swipe, and hardware back through it — and a
  // button repeating that said what the gesture already says. Same machinery as
  // every sheet (PullPane + usePullBehavior); nothing here is hand-rolled.
  //
  // 'sheet' arbitration, like every page-shaped surface in the app: there is no
  // scroll on these steps, so the pan is free to take any downward drag, and it
  // leaves the photo tiles' own taps (and PhotoEditor's long-press reorder)
  // alone.
  //
  // A PAGE LEAVES BY RIDING OFF, AND ONLY THEN STOPS EXISTING. The commit does
  // not navigate: it flags `leaving`, and the reaction below routes home once
  // the surface has actually reached the bottom edge — a `router.replace` fired
  // from the commit would cut the ride-off mid-flight and jump-cut to home.
  // BOTH facts are read inside the prepare, and the LAST of the two to arrive is
  // what fires it: `onCommit` is a runOnJS out of the gesture's onEnd, so on a
  // busy JS thread the flag can land after pullY has already stopped at
  // screenSpan, and a prepare watching pullY alone would never fire again —
  // leaving the screen parked off-screen and unreachable. Same rule, same
  // reason, as the Circles page stack (see CLAUDE.md).
  const leaving = useSharedValue(false)
  const pull = usePullBehavior({

    enabled: canLeave(step),
    onCommit: useCallback(() => { leaving.value = true }, [leaving]),
  })
  const { pullY, screenSpan } = pull
  // POP, don't replace: home is already drawn under this screen and already
  // painted, so popping lands on the very page the ride-off just revealed. A
  // `replace` would mount a SECOND home on top of that one — the card, the dock
  // and the art all rebuilding over an identical page that was already there.
  // The replace is kept for the one entry that has nothing to pop back to: the
  // linear signup, which arrives here by a replace off /login.
  const leaveForHome = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/home')
  }, [router])
  useAnimatedReaction(
    () => leaving.value && pullY.value >= screenSpan,
    (gone, was) => {
      if (gone && !was) { leaving.value = false; runOnJS(leaveForHome)() }
    },
    [screenSpan, leaveForHome],
  )

  // How the screen leaves when the finger is not the one taking it off: it rides
  // off exactly as a finger would (`commit` is the gesture's own onEnd, fired by
  // hand), so hardware back and the swipe are one motion and not two. Read
  // through a ref because this listener is registered once, with [] deps, while
  // `commit` changes identity as the pull is enabled and disabled per step.
  const commitRef = useRef(pull.commit)
  commitRef.current = pull.commit
  useEffect(() => {
    const onBack = () => {
      if (canGoBack(stepRef.current)) {
        goBack()
        return true
      }
      if (canLeave(stepRef.current)) {
        commitRef.current()
        return true
      }
      return false
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack)
    return () => sub.remove()
  }, [])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        canGoBack(stepRef.current)
        && g.dy > 12
        && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderGrant: () => Keyboard.dismiss(),
      onPanResponderMove: (_, g) => {
        const h = containerHRef.current
        if (g.dy > 0 && h > 0) {
          slideY.setValue(-(stepRef.current - 1) * h + g.dy)
          if (stepRef.current === 5) overlayY.setValue(g.dy)
        }
      },
      onPanResponderRelease: (_, g) => {
        const h = containerHRef.current
        if (h === 0) return
        if (g.dy > h * 0.25 || g.vy > 0.5) {
          goBack()
        } else {
          Animated.spring(slideY, {
            toValue: -(stepRef.current - 1) * h,
            useNativeDriver: true,
          }).start()
          if (stepRef.current === 5) {
            Animated.spring(overlayY, { toValue: 0, useNativeDriver: true }).start()
          }
        }
      },
      onPanResponderTerminate: () => {
        const h = containerHRef.current
        if (h === 0) return
        Animated.spring(slideY, {
          toValue: -(stepRef.current - 1) * h,
          useNativeDriver: true,
        }).start()
        if (stepRef.current === 5) {
          Animated.spring(overlayY, { toValue: 0, useNativeDriver: true }).start()
        }
      },
    })
  ).current

  useEffect(() => {
    setRenderedSteps(prev => {
      const next = new Set(prev)
      next.add(step)
      if (step >= 4) {
        next.delete(1)
        next.delete(2)
        next.delete(3)
      }
      return next
    })
    if (containerH === 0) return
    Animated.timing(slideY, {
      toValue: -(step - 1) * containerH,
      duration: MOTION.base,
      useNativeDriver: true,
    }).start()
    Animated.timing(overlayY, {
      toValue: step === 5 ? 0 : containerH,
      duration: MOTION.base,
      useNativeDriver: true,
    }).start()
  }, [step, containerH])

  const nameInputRef = useRef<RNTextInput>(null)
  const ddRef = useRef<RNTextInput>(null)
  const mmRef = useRef<RNTextInput>(null)
  const yyyyRef = useRef<RNTextInput>(null)
  const bioInputRef = useRef<RNTextInput>(null)
  const unitRefs: Record<DateUnit, React.RefObject<RNTextInput | null>> = {
    dd: ddRef, mm: mmRef, yyyy: yyyyRef,
  }
  const focusNextUnit = (current: DateUnit) => {
    const idx = dateOrder.indexOf(current)
    const next = dateOrder[idx + 1]
    if (next) unitRefs[next].current?.focus()
  }

  const clampUnit = (unit: DateUnit, s: string): string => {
    if (s.length === 0) return s
    const d0 = parseInt(s[0])
    if (unit === 'mm') {
      if (d0 > 1) return s.slice(0, -1)           // first digit 2-9 → reject
      if (s.length === 2) {
        const n = parseInt(s)
        if (n < 1 || n > 12) return s.slice(0, 1) // second digit makes month > 12 → reject
      }
    }
    if (unit === 'dd') {
      if (d0 > 3) return s.slice(0, -1)           // first digit 4-9 → reject
      if (s.length === 2) {
        const n = parseInt(s)
        if (n < 1 || n > 31) return s.slice(0, 1)
      }
    }
    return s
  }

  const handleUnit = (unit: DateUnit) => (v: string) => {
    const max = unit === 'yyyy' ? 4 : 2
    const raw = v.replace(/\D/g, '').slice(0, max)
    const clean = clampUnit(unit, raw)
    if (unit === 'dd') setDd(clean)
    else if (unit === 'mm') setMm(clean)
    else setYyyy(clean)
    setDateError(null)
    if (clean.length === max) focusNextUnit(unit)
  }

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user])

  // AN ACCOUNT THAT ARRIVES AFTER MOUNT TAKES THE USER OFF STEPS 1-3. The same
  // resume decision as initialStep, for a profile that lands later — the fetch
  // resolving under a cold start, or a launch that reached this screen with the
  // profile question still unanswered. Same condition, so the two can never send
  // the user to different steps.
  //
  // A BUILT profile has nothing to do here at all and leaves for home, which is
  // the way back out of the gender picker for a user who should never have been
  // shown it. One shot, held by the same ref the account submit sets: once the
  // user is working in this flow (or has just created his account through it) a
  // profile changing underneath — the photos flushing on the way to step 5 makes
  // it BUILT while he is still writing his bio — may not move him.
  const seededFromProfileRef = useRef(initialStep !== 1)
  useEffect(() => {
    if (seededFromProfileRef.current) return
    if (selectNeedsAccount(profile)) return
    seededFromProfileRef.current = true
    if (selectProfileBuilt(profile)) { leaveForHome(); return }
    setIsMale(profile?.is_male ?? null)
    setName(profile?.name ?? '')
    setBio(profile?.bio ?? '')
    setStep(4)
  }, [profile, leaveForHome])

  useEffect(() => {
    if (step === 2) {
      const id = setTimeout(() => nameInputRef.current?.focus(), STEP_FOCUS_DELAY_MS)
      return () => clearTimeout(id)
    }
    if (step === 3) {
      const first = dateOrder[0]
      const id = setTimeout(() => unitRefs[first].current?.focus(), STEP_FOCUS_DELAY_MS)
      return () => clearTimeout(id)
    }
    if (step === 5) {
      const id = setTimeout(() => bioInputRef.current?.focus(), STEP_FOCUS_DELAY_MS)
      return () => clearTimeout(id)
    }
    Keyboard.dismiss()
  }, [step])

  const nameValid = name.trim().length >= 2
  const dateComplete = dd.length === 2 && mm.length === 2 && yyyy.length === 4
  const birthdate = dateComplete ? `${yyyy}-${mm}-${dd}` : ''
  const age = (() => {
    if (!birthdate) return null
    const b = new Date(birthdate)
    if (Number.isNaN(b.getTime())) return null
    if (b.getUTCFullYear() !== Number(yyyy) || b.getUTCMonth() + 1 !== Number(mm) || b.getUTCDate() !== Number(dd)) return null
    const today = new Date()
    let a = today.getFullYear() - b.getUTCFullYear()
    const m = today.getMonth() - b.getUTCMonth()
    if (m < 0 || (m === 0 && today.getDate() < b.getUTCDate())) a--
    return a
  })()
  const dateValid = age !== null && age >= 18 && age <= 120
  // Step 5 asks for nothing (user directive 2026-07-31): the bio is optional,
  // so Finish is live from the moment the step opens and an empty field is a
  // valid answer. The photos on step 4 are the last thing onboarding requires.
  const canContinue =
    step === 1 ? isMale !== null :
    step === 2 ? nameValid :
    step === 3 ? dateValid && !submitting :
    step === 4 ? totalPhotoCount >= MIN_PHOTOS :
    step === 5 ? !bioSubmitting :
    false

  const submitAccount = async () => {
    if (submitting) return
    setSubmitting(true)
    setDateError(null)
    try {
      seededFromProfileRef.current = true
      await invoke('app/account', { birth_date: birthdate, name: name.trim(), is_male: isMale })
      // Account created (row + derived matching fields). That is the only hard
      // gate before /home: the user lands on home and browses immediately. The
      // photo + bio steps are no longer forced here — they are reached later,
      // on demand, via the menu's purple build-profile CTA (which re-enters
      // this screen at step 4 through `initialStep`).
      router.replace('/home')
    } catch (e: any) {
      setDateError(e?.message ?? 'error')
    } finally {
      setSubmitting(false)
      setBirthConfirmOpen(false)
    }
  }

  const flushPromiseRef = useRef<Promise<void> | null>(null)
  const saveImagesAndContinue = () => {
    const p = photoEditorRef.current?.flush()
    if (p) {
      // Keep the REJECTION intact on the stored promise so finishOnboarding can
      // block on it. The extra no-op catch only silences the unhandled-rejection
      // warning for the steps in between; it is a SEPARATE branch, not the
      // stored one. (Storing `p.catch(...)` is what used to swallow the failure
      // and let a photo-less profile finish onboarding.)
      p.catch(() => {})
      flushPromiseRef.current = p
    }
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
  }

  // Send the user back to the photo step with an explanation. Used for both
  // failure modes below — an outright upload error and an upload that "succeeds"
  // into an empty list. Step 4's own `totalPhotoCount < 2` guard re-engages on
  // its own (PhotoEditor reports the count via onTotalCountChange), so the user
  // simply re-picks and continues.
  const failToPhotoStep = () => {
    setPhotoError(genderize(t('photo.uploadFailed'), isMale))
    setStep(4)
    bioSubmittingRef.current = false
    setBioSubmitting(false)
  }

  // Final onboarding submit, fired from step 5. Awaits the photo flush and
  // saves the bio if there is one.
  //
  // THE PHOTOS ARE THE PROFILE (user directive 2026-07-31), so the flush is the
  // whole of what this has to get right: the bio may be empty and finishing
  // with an empty one is a valid answer, while a profile that lands here with
  // fewer than MIN_PHOTOS photos is not built at all — which is why both
  // failure branches below bounce back to step 4 rather than letting the user
  // out. It used to be the other way round: the bio was saved last and WAS the
  // marker, so this guard existed to stop a photo-less profile being made
  // permanent by it.
  const finishOnboarding = async () => {
    if (bioSubmittingRef.current) return
    bioSubmittingRef.current = true
    setBioSubmitting(true)
    try {
      if (flushPromiseRef.current) {
        try {
          await flushPromiseRef.current
        } catch {
          flushPromiseRef.current = null
          failToPhotoStep()
          return
        }
        flushPromiseRef.current = null
      }
      // Second guard: the flush can also resolve into a SHORT images list (the
      // parent unmount safety net already ran and dropped files, a stale
      // deferred set, etc.). Never leave step 5 under MIN_PHOTOS — that count
      // is the whole definition of a built profile, so a user let out here
      // would land on home with the profile dot still lit and no idea why.
      if ((useUserStore.getState().profile?.images?.length ?? 0) < MIN_PHOTOS) {
        failToPhotoStep()
        return
      }
      // The bio is optional, so an empty field is saved as an empty bio rather
      // than skipped: the user may have opened this step to CLEAR a bio they
      // had, and a save that silently does nothing would leave the old text.
      const bioValue = normalizeBio(bio)
      await invoke('app/profile', { bio: bioValue })
      useUserStore.getState().update({ bio: bioValue.length === 0 ? null : bioValue })
      // Profile is now built (the photos are flushed). The routing guard no
      // longer reacts to this, so navigate home explicitly. Works for both
      // entry paths: the linear first-time flow AND a later visit opened from
      // the dock's profile key.
      router.replace('/home')
    } catch {
      bioSubmittingRef.current = false
      setBioSubmitting(false)
    }
  }

  const selectGender = (male: boolean) => {
    setIsMale(male)
    if (step === 1) setStep(2)
  }

  const onContinue = () => {
    if (!canContinue) return
    tap()
    if (step !== 2) Keyboard.dismiss()
    // The birthdate is uneditable after onboarding and drives matching, so it
    // is read back in words for confirmation before the account is created.
    if (step === 3) { setBirthConfirmOpen(true); return }
    if (step === 4) { saveImagesAndContinue(); return }
    if (step === 5) { finishOnboarding(); return }
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
  }
  const renderStep = (s: number) => {
    if (s === 1) return (
      <View style={styles.page}>
        <Text style={styles.title}>{t('ob.whoAreYou')}</Text>

        <View style={styles.cardRow}>
          <GenderCard
            icon={(c) => <MaleSymbol color={c} />}
            label={t('ob.male')}
            selected={isMale === true}
            onPress={() => selectGender(true)}
          />
          <GenderCard
            icon={(c) => <FemaleSymbol color={c} />}
            label={t('ob.female')}
            selected={isMale === false}
            onPress={() => selectGender(false)}
          />
        </View>
      </View>
    )

    if (s === 2) return (
      <View style={styles.page}>
        <Text style={styles.title}>{t('ob.nicknameStep')}</Text>

        <View style={[styles.fieldShell, styles.inputWrap]}>
          <TextInput
            ref={nameInputRef}
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={onContinue}
            cursorColor={INK}
            selectionColor={SELECTION}
          />
        </View>

        <View style={styles.ctaWrap}>
          <Button
            label={t('ob.next')}
            onPress={onContinue}
            disabled={!canContinue}
            variant="primary"
            size="lg"
          />
        </View>
      </View>
    )

    if (s === 3) {
      const unitValue: Record<DateUnit, string> = { dd, mm, yyyy }
      const unitPlaceholder: Record<DateUnit, string> = { dd: 'DD', mm: 'MM', yyyy: 'YYYY' }
      const unitCaption: Record<DateUnit, string> = {
        dd: t('ob.dateDay'), mm: t('ob.dateMonth'), yyyy: t('ob.dateYear'),
      }
      const showMinAge = dateComplete && age !== null && age < 18
      return (
        <View style={styles.page}>
          <Text style={styles.title}>{t('ob.birthdate')}</Text>

          <View style={styles.dateRow}>
            {dateOrder.map((unit, i) => (
              <View
                key={unit}
                style={[
                  styles.dateSegment,
                  unit === 'yyyy' && styles.dateSegmentYear,
                  i > 0 && styles.dateSegmentGap,
                ]}
              >
                <Text style={styles.dateCaption}>{unitCaption[unit]}</Text>
                <View style={[styles.fieldShell, styles.dateBox]}>
                  <TextInput
                    ref={unitRefs[unit]}
                    style={styles.dateInput}
                    value={unitValue[unit]}
                    onChangeText={handleUnit(unit)}
                    keyboardType="number-pad"
                    maxLength={unit === 'yyyy' ? 4 : 2}
                    selectTextOnFocus
                    cursorColor={INK}
                    selectionColor={SELECTION}
                  />
                  {/* Custom placeholder overlay: a TextInput shares one font
                      size for placeholder + value, but the typed digits should
                      stay large while the hint reads smaller. Render the hint
                      as a separate, smaller Text shown only while empty; the
                      input keeps TEXT.lg so the box height is identical whether
                      empty or filled. */}
                  {unitValue[unit] === '' && (
                    <View style={styles.datePlaceholder} pointerEvents="none">
                      <Text style={styles.datePlaceholderText}>{unitPlaceholder[unit]}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>

          {showMinAge && <Text style={styles.errorText}>{t('ob.minAge')}</Text>}
          {dateError && <Text style={styles.errorText}>{dateError}</Text>}

          <View style={styles.ctaWrap}>
            <Button
              label={tg('ob.createAccount', isMale === true)}
              onPress={onContinue}
              disabled={!dateValid}
              loading={submitting}
              iconStart={<UserPlusIcon color={WHITE} />}
              variant="primary"
              size="lg"
            />
          </View>
        </View>
      )
    }

    if (s === 4) return (
      <View style={styles.page}>
        <Text style={styles.title}>{tg('photo.sub', isMale === true)}</Text>

        <View style={styles.photoWrap} pointerEvents="box-none">
          <PhotoEditor
            ref={photoEditorRef}
            deferUpload
            onTotalCountChange={(n) => {
              setTotalPhotoCount(n)
              if (n > 0) setPhotoError(null)
            }}
          />
        </View>

        {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}

        <View style={styles.ctaWrap}>
          <Button
            label={t('ob.next')}
            onPress={onContinue}
            disabled={totalPhotoCount < MIN_PHOTOS}
            variant="primary"
            size="lg"
          />
        </View>
      </View>
    )

    if (s === 5) {
      // The step is the field and the button, nothing else. The surrounding
      // copy used to be dropped only below a ~500dp height budget, which meant
      // the layout differed by device and still squeezed the field on the
      // screens in between.
      return (
        <View style={styles.pageStretched}>

          <View style={[styles.fieldShell, styles.bioField, { flex: 1, minHeight: 0 }]}>
            <TextInput
              ref={bioInputRef}
              style={[styles.bioInput, { flex: 1, minHeight: 0 }]}
              value={bio}
              onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
              multiline
              textAlignVertical="top"
              // One line, and it is an invitation rather than a requirement:
              // the bio is optional now, so there is no minimum to announce
              // under it (the 'bio.min' second line is deleted).
              placeholder={genderize(t('bio.placeholder'), isMale)}
              placeholderTextColor={INK_HINT}
              cursorColor={INK}
              selectionColor={SELECTION}
              editable={!bioSubmitting}
            />
          </View>

          <View style={[styles.ctaWrap, { marginBottom: MD }]}>
            <Button
              label={t('bio.submit')}
              onPress={onContinue}
              disabled={bioSubmitting}
              loading={bioSubmitting}
              iconStart={<CheckIcon color={WHITE} />}
              variant="primary"
              size="lg"
            />
          </View>
        </View>
      )
    }

    return <View style={styles.page} />
  }

  return (
    <View style={styles.rootWrap}>
    {/* THE PAGE UNDER THIS ONE IS HOME, AND IT GOES ON BEING DRAWN. That is the
        screen's PRESENTATION, and it is declared in the navigator (_layout.tsx)
        rather than here: `presentation` is read when the native screen is
        CREATED, so an in-route <Stack.Screen> — which is a setOptions on a screen
        that already exists — is silently ignored (measured on the emulator,
        2026-07-31: the drag still revealed an empty page).

        Nothing shows through at rest: the card below covers the screen and is
        opaque. What the transparency is for is the moment the card is moving. */}
    {/* THE SCREEN IS A LAYER, AND IT WEARS THE EDGE THAT SAYS SO. Everything
        below rides in the app's one rising surface — RisingCard, which is where
        RISE_SHADOW is declared and the only place it may be — so this page marks
        its arrival with exactly the mark a Circles page, a chat and the
        match card do. It matters here for the same reason it matters there: this
        page and the page under it are the same PAGE tint, so without that edge
        nothing at all says a surface came over another one. Only the top edge is
        ever on screen (at rest the card covers the screen), which is the moment
        the shadow exists for: while it arrives, and while a finger drags it back
        down.

        NO exit animation — a screen dragged off has already ridden off under the
        finger, and animating an unmount a gesture just held is the Fabric mount
        race RisingCard warns about. */}
    <PullPane
      gesture={pull.gesture}
      pullY={pull.pullY}
      leaving={pull.leaving}
      style={StyleSheet.absoluteFill}
    >
    <RisingCard style={styles.layerCard} animateEnter={openedOverHome} animateExit={false}>
    {/* Top edge only. It used to take the bottom one too — the ONE surface in the
        app still letting the device's band be its bottom air — so every step's CTA
        ended 34 above the screen edge on an iPhone and 16–24 on an Android, plus
        the bio step's own LG on top of that. The frame below states the app's one
        air instead (bottomGap), which is the same on every device. */}
    {/* The step carries text fields (the name, the three date boxes, the bio),
        so THIS page is what ends at the top of the keyboard — the app's root no
        longer shrinks anything (user directive 2026-08-03, KeyboardSurface). It
        wraps INSIDE the rising card, so the card stays the whole screen and only
        the content it carries gives way. */}
    <KeyboardSurface>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* The shared purple band with white glyphs, as on every other screen. */}
      <AppStatusBar />
      {/* The page already ends at the top of the keyboard (KeyboardSurface above), so this
          is just the pager's frame. `measuredOnceRef` below is what keeps the
          steps at their full height inside it: the content is top-aligned, so a
          shorter frame simply crops the bottom and the focused field stays put,
          rather than every step resizing and the pager jumping mid-typing.
          Its paddingBottom is the air under every step's last control — declared
          HERE, once, rather than in the six step styles, so no step can differ. */}
      <View style={{ flex: 1, paddingBottom: pagerBottomAir }}>
        <View
          {...panResponder.panHandlers}
          style={styles.pagerWrap}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height
            if (h > 0 && !measuredOnceRef.current) {
              measuredOnceRef.current = true
              if (h !== containerH) {
                setContainerH(h)
                slideY.setValue(-(stepRef.current - 1) * h)
              }
            }
          }}
        >
          {containerH > 0 && (
            <Animated.View style={{ transform: [{ translateY: slideY }] }}>
              {[1, 2, 3, 4, 5].map(s => (
                <View key={String(s)} style={{ height: containerH }}>
                  {s !== 5 && renderedSteps.has(s) ? renderStep(s) : null}
                </View>
              ))}
            </Animated.View>
          )}
          {containerH > 0 && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: PAGE, transform: [{ translateY: overlayY }] },
              ]}
              pointerEvents={step === 5 ? 'auto' : 'none'}
            >
              {renderStep(5)}
            </Animated.View>
          )}
        </View>
      </View>

      <ConfirmDialog
        visible={birthConfirmOpen}
        title={t('ob.birthConfirmTitle')}
        description={birthConfirmBody(
          tg('ob.birthConfirm', isMale === true),
          birthdateInWords(yyyy, mm, dd),
          String(age ?? ''),
        )}
        confirmLabel={tg('ob.createAccount', isMale === true)}
        confirmIconStart={<UserPlusIcon color={WHITE} />}
        // ONE button, like every other popup in the app: the date is right
        // there on the page behind, so putting the popup away (swipe down /
        // backdrop) IS the fix, and a button repeating that said the same thing
        // twice. `onCancel` is that dismiss.
        // The popup closes on the tap; the spinner lives on the Create-account
        // button underneath, so the in-flight state is shown in one place
        // rather than freezing the sheet open on top of it.
        onConfirm={() => { setBirthConfirmOpen(false); submitAccount() }}
        onCancel={() => setBirthConfirmOpen(false)}
      />
    </SafeAreaView>
    </KeyboardSurface>
    </RisingCard>
    </PullPane>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // NO background: what the card rides off over is HOME, still drawn under this
  // screen (see the Stack.Screen presentation above). A tint here would be a
  // page painted over the page this is a layer on.
  rootWrap: { flex: 1 },
  root: { flex: 1, backgroundColor: PAGE },
  // The rising layer: opaque, so the page it covers never shows through. Its
  // lift is deliberately NOT stated here — it is RisingCard's own RISE_SHADOW,
  // the one every surface that rises wears. Same card the Circles stack
  // pushes over its hub.
  layerCard: { flex: 1, backgroundColor: PAGE },

  pagerWrap: { flex: 1, overflow: 'hidden' },
  // The build-profile steps used to add a `withClose` on top of this, clearing
  // the close X that stood in the top-START gutter. There is no X, so every step
  // opens on the page's own headroom again.
  page: { flex: 1, paddingHorizontal: LG, paddingTop: XL },
  // The bio step's page. Its LG top padding is deliberately tighter than
  // `page`'s XL: those steps open on a title, this one opens straight onto the
  // field, which needs no headroom above it.
  // No paddingBottom: the pager's frame already holds the air under the CTA, for
  // this step exactly as for the other five (see pagerBottomAir). It used to add
  // its own LG on top of the safe-area band the frame was reserving.
  pageStretched: { flex: 1, paddingHorizontal: LG, paddingTop: LG },

  title: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.medium,
    color: INK,
    textAlign: 'center',
    letterSpacing: -0.5,
  },

  cardRow: {
    flexDirection: 'row',
    gap: MD,
    marginTop: XL,
  },
  card: {
    aspectRatio: 1,
    borderRadius: RADIUS,
    backgroundColor: INK_WASH,
    overflow: 'hidden',
    // A filled tile on the page: the app's one lift (user directive
    // 2026-08-03). It is on the card and not on `cardActive`, which is a fill
    // laid INSIDE this box — a shadow there would be clipped by it.
    boxShadow: CARD_SHADOW,
  },
  cardInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: MD,
  },
  // Selected = the regular brand-purple card carrying WHITE content, against the
  // light purple of the unselected ones. Same inversion the primary Button and the
  // home centre button use. The unselected card is the faint brand wash above, so
  // the two states differ by fill AND by ink, not by a subtle change of shade.
  cardActive: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    gap: MD,
  },
  cardLabel: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.medium,
    color: INK,
  },
  // White ink, because the selected card's fill is the solid purple.
  cardLabelActive: { color: WHITE },

  ctaWrap: { marginTop: LG },

  photoWrap: {
    marginTop: XL,
    zIndex: 2, elevation: 2,
  },

  // The one typing surface, shared with the login email field and the empty
  // photo slot. Worn here by the name box, the three date boxes and the bio
  // box; each adds only its own metrics below.
  fieldShell: FIELD_SKIN,
  inputWrap: {
    marginTop: XL,
    height: INPUT_MIN_HEIGHT,
    paddingHorizontal: MD,
    justifyContent: 'center',
  },
  input: {
    fontSize: TEXT.md,
    color: INK,
    textAlign: 'center',
    padding: 0,
  },

  dateRow: {
    flexDirection: 'row',
    direction: 'ltr',
    marginTop: XL,
    alignItems: 'flex-start',
  },
  dateSegment: { flex: 1, alignItems: 'center' },
  // What the box holds, said in words: the DD/MM/YYYY hint inside a box is gone
  // the moment a digit lands in it, so the caption over it is the one thing that
  // keeps saying which box is which while the date is being typed. Footnote rank
  // (TEXT.sm / INK_HINT) so the digits stay the line being read.
  dateCaption: {
    marginBottom: XS,
    fontSize: TEXT.sm,
    color: INK_HINT,
  },
  dateSegmentYear: { flex: 1.6 },
  dateSegmentGap: { marginLeft: SM },
  dateBox: {
    alignSelf: 'stretch',
    height: INPUT_MIN_HEIGHT,
    paddingHorizontal: SM,
    justifyContent: 'center',
  },
  dateInput: {
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.medium,
    color: INK,
    textAlign: 'center',
    padding: 0,
  },
  datePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePlaceholderText: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.medium,
    color: INK_HINT,
    textAlign: 'center',
  },
  errorText: {
    marginTop: MD,
    fontSize: TEXT.md,
    color: NEGATIVE,
    textAlign: 'center',
  },

  // No top margin: `pageStretched`'s padding is the whole gap above the field.
  bioField: {
    paddingHorizontal: MD,
    paddingTop: MD,
    paddingBottom: LG,
    minHeight: 140,
  },
  bioInput: {
    fontSize: TEXT.md,
    color: INK,
    padding: 0,
    minHeight: 96,
    textAlign: 'center',
  },
})
