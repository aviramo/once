import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Animated, Keyboard, TextInput as RNTextInput, Platform, PanResponder, BackHandler, Dimensions } from 'react-native'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { AppStatusBar } from '../src/components/AppStatusBar'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore } from '../src/stores/userStore'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { BIO_MIN, BIO_MAX, normalizeBio } from '../src/lib/bio'
import { t, tg, lang } from '../src/i18n'
import { Button } from '../src/components/Button'
import { PhotoEditor, PhotoEditorRef, MIN_PHOTOS } from '../src/components/PhotoEditor'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { CakeIcon } from '../src/components/icons'
import { WHITE, WHITE_SOFT, WHITE_MID, WHITE_STRONG, DESTRUCTIVE, PRIMARY, SELECTION_ON_DARK } from '../src/colors'
import { SM, MD, LG, XL, RADIUS, TEXT, WEIGHT, MOTION } from '../src/tokens'

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
          {icon(WHITE)}
          <Text style={styles.cardLabel}>{label}</Text>
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.cardActive, { opacity: activeOpacity }]}
        >
          {icon(PRIMARY)}
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

  const initialStep =
    profile?.name && profile?.birth_date && !profile.bio
      ? ((profile.images?.length ?? 0) >= 2 ? 5 : 4)
      : 1
  const [step, setStep] = useState(initialStep)
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

  // Estimate the pager height for first paint so the initial step renders
  // immediately (rather than flashing an empty background until onLayout fires).
  const initialPagerH = Math.max(100, Dimensions.get('window').height - insets.top - insets.bottom)
  const [containerH, setContainerH] = useState(initialPagerH)
  const measuredOnceRef = useRef(false)
  const slideY = useRef(new Animated.Value(-(initialStep - 1) * initialPagerH)).current
  const keyboardOffset = useRef(new Animated.Value(0)).current
  const stepRef = useRef(step)
  const containerHRef = useRef(containerH)
  const bioSubmittingRef = useRef(false)
  useEffect(() => { stepRef.current = step }, [step])
  useEffect(() => { containerHRef.current = containerH }, [containerH])

  const canGoBack = (s: number) => s === 2 || s === 3 || s === 5
  const goBack = () => setStep(s => canGoBack(s) ? s - 1 : s)
  const overlayY = useRef(new Animated.Value(initialStep === 5 ? 0 : initialPagerH)).current

  useEffect(() => {
    const onBack = () => {
      if (canGoBack(stepRef.current)) {
        goBack()
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
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (e) => {
      const duration = e.duration ?? 250
      // Subtract bottom safe-area inset: SafeAreaView already reserves it,
      // and the keyboard frame on iOS extends through the home-indicator area.
      const h = Math.max(0, e.endCoordinates.height - insets.bottom)
      // Only shrink the viewport from the bottom (paddingBottom). The content
      // is top-aligned, so the focused input sits above the keyboard with no
      // upward translate needed; translating up would push the header
      // off-screen. (Step 5's bio lives in the absolute-fill overlay, which
      // shrinks with the viewport via this same paddingBottom.)
      Animated.timing(keyboardOffset, { toValue: h, duration, useNativeDriver: false }).start()
    })
    const hide = Keyboard.addListener(hideEvent, (e) => {
      if (bioSubmittingRef.current) return
      const duration = (e as any).duration ?? 250
      Animated.timing(keyboardOffset, { toValue: 0, duration, useNativeDriver: false }).start()
    })
    return () => { show.remove(); hide.remove() }
  }, [insets.bottom])

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

  const seededFromProfileRef = useRef(initialStep !== 1)
  useEffect(() => {
    if (seededFromProfileRef.current) return
    if (!profile?.name || !profile?.birth_date || profile.bio) return
    seededFromProfileRef.current = true
    setIsMale(profile.is_male ?? null)
    setName(profile.name ?? '')
    setBio(profile.bio ?? '')
    setStep((profile.images?.length ?? 0) >= 2 ? 5 : 4)
  }, [profile])

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
  const bioValid = bio.trim().length >= BIO_MIN
  const canContinue =
    step === 1 ? isMale !== null :
    step === 2 ? nameValid :
    step === 3 ? dateValid && !submitting :
    step === 4 ? totalPhotoCount >= MIN_PHOTOS :
    step === 5 ? bioValid && !bioSubmitting :
    false

  const submitAccount = async () => {
    if (submitting) return
    setSubmitting(true)
    setDateError(null)
    try {
      seededFromProfileRef.current = true
      await invoke('app/account', { birth_date: birthdate, name: name.trim(), is_male: isMale })
      setStep(s => Math.min(TOTAL_STEPS, s + 1))
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
    setPhotoError(t('photo.uploadFailed'))
    setStep(4)
    bioSubmittingRef.current = false
    setBioSubmitting(false)
  }

  // Final onboarding submit, fired from step 5. Awaits the photo flush, saves
  // the bio, and finally flips the local userStore.bio — which is what
  // `_layout.tsx` watches to redirect to /home. Holding bio in local state
  // until here keeps onboarding self-contained: if anything in here fails, the
  // user is still on /onboarding because the persisted profile has no bio.
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
      // Second guard: the flush can also resolve into an EMPTY images list (the
      // parent unmount safety net already ran and dropped every file, a stale
      // deferred set, etc.). Never save the bio without at least one photo --
      // bio is the only thing _layout.tsx gates the /home redirect on, so
      // saving it here is exactly what makes a photo-less profile permanent.
      if ((useUserStore.getState().profile?.images?.length ?? 0) < 1) {
        failToPhotoStep()
        return
      }
      const bioValue = normalizeBio(bio)
      await invoke('app/profile', { bio: bioValue })
      useUserStore.getState().update({ bio: bioValue })
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
            cursorColor={WHITE}
            selectionColor={SELECTION_ON_DARK}
          />
        </View>

        <View style={styles.ctaWrap}>
          <Button
            label={t('ob.next')}
            onPress={onContinue}
            disabled={!canContinue}
            variant="onPrimary"
            size="lg"
          />
        </View>
      </View>
    )

    if (s === 3) {
      const unitValue: Record<DateUnit, string> = { dd, mm, yyyy }
      const unitPlaceholder: Record<DateUnit, string> = { dd: 'DD', mm: 'MM', yyyy: 'YYYY' }
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
                <View style={[styles.fieldShell, styles.dateBox]}>
                  <TextInput
                    ref={unitRefs[unit]}
                    style={styles.dateInput}
                    value={unitValue[unit]}
                    onChangeText={handleUnit(unit)}
                    keyboardType="number-pad"
                    maxLength={unit === 'yyyy' ? 4 : 2}
                    selectTextOnFocus
                    cursorColor={WHITE}
                    selectionColor={SELECTION_ON_DARK}
                  />
                  {/* Custom placeholder overlay: a TextInput shares one font
                      size for placeholder + value, but the typed digits should
                      stay large while the hint reads smaller. Render the hint
                      as a separate, smaller Text shown only while empty; the
                      input keeps TEXT.xl so the box height is identical whether
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
              variant="onPrimary"
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
            variant="onPrimary"
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
              // The min-chars note is a second line of the placeholder rather
              // than its own element. Composed from the two existing strings,
              // both of which the MatchCard bio editor still uses separately.
              placeholder={`${t('bio.placeholder')}\n${t('bio.min')}`}
              placeholderTextColor={WHITE_MID}
              cursorColor={WHITE}
              selectionColor={SELECTION_ON_DARK}
              editable={!bioSubmitting}
            />
          </View>

          <View style={[styles.ctaWrap, { marginBottom: MD }]}>
            <Button
              label={t('bio.submit')}
              onPress={onContinue}
              disabled={!bioValid}
              loading={bioSubmitting}
              variant="onPrimary"
              size="lg"
            />
          </View>
        </View>
      )
    }

    return <View style={styles.page} />
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Deep-wine PRIMARY surface: the app-wide white status-bar chrome
          (AppStatusBar default) blends into the screen. */}
      <AppStatusBar />
      <Animated.View style={{ flex: 1, paddingBottom: keyboardOffset }}>
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
                { backgroundColor: PRIMARY, transform: [{ translateY: overlayY }] },
              ]}
              pointerEvents={step === 5 ? 'auto' : 'none'}
            >
              {renderStep(5)}
            </Animated.View>
          )}
        </View>
      </Animated.View>

      <ConfirmDialog
        visible={birthConfirmOpen}
        icon={<CakeIcon color={PRIMARY} size={32} />}
        title={tg('ob.birthConfirm', isMale === true)
          .replace('{date}', birthdateInWords(yyyy, mm, dd))
          .replace('{age}', String(age ?? ''))}
        confirmLabel={tg('ob.createAccount', isMale === true)}
        cancelLabel={t('ob.birthConfirmFix')}
        // The popup closes on the tap; the spinner lives on the Create-account
        // button underneath, so the in-flight state is shown in one place
        // rather than freezing the sheet open on top of it.
        onConfirm={() => { setBirthConfirmOpen(false); submitAccount() }}
        onCancel={() => setBirthConfirmOpen(false)}
      />
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PRIMARY },

  pagerWrap: { flex: 1, overflow: 'hidden' },
  page: { flex: 1, paddingHorizontal: LG, paddingTop: XL },
  // The bio step's page. Its LG top padding is deliberately tighter than
  // `page`'s XL: those steps open on a title, this one opens straight onto the
  // field, which needs no headroom above it.
  pageStretched: { flex: 1, paddingHorizontal: LG, paddingTop: LG, paddingBottom: LG },

  title: {
    fontSize: TEXT.xxl,
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
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
    backgroundColor: WHITE_SOFT,
    overflow: 'hidden',
  },
  cardInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: MD,
  },
  cardActive: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: MD,
  },
  cardLabel: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
  },
  cardLabelActive: { color: PRIMARY },

  ctaWrap: { marginTop: LG },

  photoWrap: {
    marginTop: XL,
    zIndex: 2, elevation: 2,
  },

  // The onboarding field skin: no fill, white hairline border, white glyphs.
  // Shared by the name box and the three date boxes so the two steps can't
  // drift apart — each caller adds only its own padding/metrics on top.
  fieldShell: {
    borderWidth: 1,
    borderColor: WHITE,
    borderRadius: RADIUS,
  },
  inputWrap: {
    marginTop: XL,
    paddingHorizontal: MD,
    paddingVertical: MD,
  },
  input: {
    fontSize: TEXT.md,
    color: WHITE,
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
  dateSegmentYear: { flex: 1.6 },
  dateSegmentGap: { marginLeft: SM },
  dateBox: {
    alignSelf: 'stretch',
    paddingVertical: MD,
    paddingHorizontal: SM,
  },
  dateInput: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
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
    fontWeight: WEIGHT.semibold,
    color: WHITE_MID,
    textAlign: 'center',
  },
  errorText: {
    marginTop: MD,
    fontSize: TEXT.sm,
    color: DESTRUCTIVE,
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
    color: WHITE,
    padding: 0,
    minHeight: 96,
    textAlign: 'center',
  },
})
