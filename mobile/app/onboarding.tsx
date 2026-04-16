import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Animated, Keyboard, Dimensions, I18nManager, TextInput as RNTextInput, Pressable } from 'react-native'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore } from '../src/stores/userStore'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { t, tg, lang } from '../src/i18n'
import { Button } from '../src/components/Button'
import { CountBadge } from '../src/components/CountBadge'
import { PhotoEditor } from '../src/components/PhotoEditor'

const TOTAL_STEPS = 5
const isRTL = I18nManager.isRTL

// Date segment order keyed by UI language. Hebrew → DD/MM/YYYY (standard in
// Israel). English → MM/DD/YYYY (US convention; the app's other English
// surfaces target a US audience). Add more locales here as they land.
type DateUnit = 'dd' | 'mm' | 'yyyy'
const DATE_ORDER: Record<string, DateUnit[]> = {
  he: ['dd', 'mm', 'yyyy'],
  en: ['mm', 'dd', 'yyyy'],
}
const dateOrder: DateUnit[] = DATE_ORDER[lang] ?? DATE_ORDER.he

// ── Progress bar ───────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  // Dots + flex-1 connecting lines so the bar fills the container edge-to-edge
  // evenly. The final dot sits flush against the end, so the first and last
  // steps anchor both edges of the row. Only the first TOTAL_STEPS-1 segments
  // carry a stretching line — the last is the closing dot with no flex.
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const stepNum = i + 1
        const active = stepNum <= step
        const isLast = i === TOTAL_STEPS - 1
        return (
          <View key={stepNum} style={isLast ? undefined : styles.progressSegment}>
            <View style={[styles.progressDot, active && styles.progressDotActive]} />
            {!isLast && <View style={styles.progressLine} />}
          </View>
        )
      })}
    </View>
  )
}

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
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.timing(activeOpacity, {
      toValue: selected ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [selected])

  const handlePress = () => {
    tap()
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start()
    onPress()
  }

  return (
    <Animated.View style={[{ flex: 1, transform: [{ scale }] }]}>
      <View
        style={styles.card}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handlePress}
      >
        <View style={styles.cardInner}>
          {icon('#111')}
          <Text style={styles.cardLabel}>{label}</Text>
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.cardActive, { opacity: activeOpacity }]}
        >
          {icon('#fff')}
          <Text style={[styles.cardLabel, styles.cardLabelActive]}>{label}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user } = useAuthStore()
  const { profile } = useUserStore()
  const router = useRouter()

  // Resume-point picker — if the user already has a profile row but state is
  // still null, the account insert from step 3 already landed. Pick the
  // furthest step they haven't completed: photo step (4) if no photos yet,
  // bio step (5) if at least one photo is on file. Computed only on first
  // render so the user can still navigate back via the Back button if desired.
  const initialStep =
    profile && profile.state == null
      ? ((profile.images?.normal?.length ?? 0) >= 1 ? 5 : 4)
      : 1
  const [step, setStep] = useState(initialStep)
  const [isMale, setIsMale] = useState<boolean | null>(profile?.is_male ?? null)
  const [name, setName] = useState(profile?.name ?? '')
  const [dd, setDd] = useState('')
  const [mm, setMm] = useState('')
  const [yyyy, setYyyy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dateError, setDateError] = useState<string | null>(null)
  const [photosEditMode, setPhotosEditMode] = useState(false)
  const [bio, setBio] = useState(profile?.message ?? '')
  const [bioSubmitting, setBioSubmitting] = useState(false)
  const [savingImages, setSavingImages] = useState(false)
  const [photosUploading, setPhotosUploading] = useState(false)

  // Pager layout — every step renders in parallel inside the strip so the
  // transition is a single native-driven translateX, the same pattern used by
  // the home/settings shell. Initial width comes from Dimensions so the first
  // render lands on step 1 without a frame of empty layout before onLayout.
  const [width, setWidth] = useState(() => Dimensions.get('window').width)
  const translate = useRef(new Animated.Value(0)).current
  const nameInputRef = useRef<RNTextInput>(null)
  const ddRef = useRef<RNTextInput>(null)
  const mmRef = useRef<RNTextInput>(null)
  const yyyyRef = useRef<RNTextInput>(null)
  const bioInputRef = useRef<RNTextInput>(null)
  // Focus the next segment in the locale-specific order, not a hard-coded
  // DD→MM→YYYY chain — otherwise en (MM/DD/YYYY) auto-advances into the wrong
  // box.
  const unitRefs: Record<DateUnit, React.RefObject<RNTextInput | null>> = {
    dd: ddRef, mm: mmRef, yyyy: yyyyRef,
  }
  const focusNextUnit = (current: DateUnit) => {
    const idx = dateOrder.indexOf(current)
    const next = dateOrder[idx + 1]
    if (next) unitRefs[next].current?.focus()
  }

  const handleUnit = (unit: DateUnit) => (v: string) => {
    const max = unit === 'yyyy' ? 4 : 2
    const clean = v.replace(/\D/g, '').slice(0, max)
    if (unit === 'dd') setDd(clean)
    else if (unit === 'mm') setMm(clean)
    else setYyyy(clean)
    setDateError(null)
    if (clean.length === max) focusNextUnit(unit)
  }

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user])

  // Profile arrives asynchronously: on cold boot the screen mounts first,
  // then the store hydrates. Once we learn the user already has a row with
  // state==null, jump them forward to the photo step — the gender/name/dob
  // fields are already on the server and re-asking would be a dead end.
  // Only fires while we're still on the seed (step 1, untouched) so back
  // navigation after this point still works.
  const seededFromProfileRef = useRef(initialStep !== 1)
  useEffect(() => {
    if (seededFromProfileRef.current) return
    if (!profile || profile.state != null) return
    seededFromProfileRef.current = true
    setIsMale(profile.is_male ?? null)
    setName(profile.name ?? '')
    setBio(profile.message ?? '')
    setStep((profile.images?.normal?.length ?? 0) >= 1 ? 5 : 4)
  }, [profile])

  // Slide the strip whenever the step changes. Spring with damped friction so
  // the end state matches the other pagers in the app. Width changes (initial
  // Dimensions → onLayout) snap instantly to avoid a visible bounce on mount.
  const prevStepRef = useRef(step)
  useEffect(() => {
    if (!width) return
    const target = (isRTL ? 1 : -1) * (step - 1) * width
    if (step !== prevStepRef.current) {
      prevStepRef.current = step
      Animated.spring(translate, {
        toValue: target,
        tension: 68,
        friction: 14,
        useNativeDriver: true,
      }).start()
    } else {
      translate.setValue(target)
    }
  }, [step, width])

  // Focus the nickname input only when step 2 is active — autoFocus would fire
  // on mount across all pages simultaneously, so we control focus by step.
  useEffect(() => {
    if (step === 2) {
      const id = setTimeout(() => nameInputRef.current?.focus(), 280)
      return () => clearTimeout(id)
    }
    if (step === 3) {
      const first = dateOrder[0]
      const id = setTimeout(() => unitRefs[first].current?.focus(), 280)
      return () => clearTimeout(id)
    }
    if (step === 5) {
      const id = setTimeout(() => bioInputRef.current?.focus(), 280)
      return () => clearTimeout(id)
    }
    if (step !== 4 && photosEditMode) setPhotosEditMode(false)
    Keyboard.dismiss()
  }, [step])

  const nameValid = name.trim().length >= 2
  // Date is "complete" only once every segment is filled to its full width.
  // Partial input (e.g. 1-digit day) shouldn't count as valid — the Date
  // constructor happily accepts it and returns a spurious age.
  const dateComplete = dd.length === 2 && mm.length === 2 && yyyy.length === 4
  const birthdate = dateComplete ? `${yyyy}-${mm}-${dd}` : ''
  const age = (() => {
    if (!birthdate) return null
    const b = new Date(birthdate)
    if (Number.isNaN(b.getTime())) return null
    // Reject segments that normalize to a different date (e.g. 31/02) — the
    // JS Date wraps, so we verify the round-trip.
    if (b.getUTCFullYear() !== Number(yyyy) || b.getUTCMonth() + 1 !== Number(mm) || b.getUTCDate() !== Number(dd)) return null
    const today = new Date()
    let a = today.getFullYear() - b.getUTCFullYear()
    const m = today.getMonth() - b.getUTCMonth()
    if (m < 0 || (m === 0 && today.getDate() < b.getUTCDate())) a--
    return a
  })()
  const dateValid = age !== null && age >= 18 && age <= 120
  const photoCount = profile?.images?.normal?.length ?? 0
  const BIO_MAX = 150
  const BIO_MIN = 20
  const bioRemaining = BIO_MAX - bio.length
  const bioValid = bio.trim().length >= BIO_MIN
  const canContinue =
    step === 1 ? isMale !== null :
    step === 2 ? nameValid :
    step === 3 ? dateValid && !submitting :
    step === 4 ? photoCount >= 1 && !savingImages && !photosUploading :
    step === 5 ? bioValid && !bioSubmitting :
    false

  const submitAccount = async () => {
    if (submitting) return
    setSubmitting(true)
    setDateError(null)
    try {
      await invoke('app/account', { birth_date: birthdate, name: name.trim(), is_male: isMale })
      setStep(s => Math.min(TOTAL_STEPS, s + 1))
    } catch (e: any) {
      setDateError(e?.message ?? 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const saveImagesAndContinue = async () => {
    if (savingImages) return
    setSavingImages(true)
    try {
      // Photos are already in storage (PhotoEditor uploads each immediately and
      // mutates the local userStore optimistically), but the user row's images
      // column still points at the pre-onboarding state. Persist the current
      // local view before moving to bio so the server has the references.
      const images = useUserStore.getState().profile?.images
      if (images) await invoke('app/update', { images })
      setStep(s => Math.min(TOTAL_STEPS, s + 1))
    } catch (e) {
      console.error('save images failed', e)
    } finally {
      setSavingImages(false)
    }
  }

  const submitBio = async () => {
    if (bioSubmitting) return
    setBioSubmitting(true)
    try {
      // app/profile finalizes onboarding server-side: it picks up `message`
      // via the updatable allowlist and runs search(), which transitions
      // state away from null. _layout.tsx's routing then no longer treats
      // the user as needing onboarding, but it only auto-redirects from the
      // auth screen — we still need an explicit push to /home from here.
      await invoke('app/profile', { message: bio.trim() })
      router.replace('/home')
    } catch {
      setBioSubmitting(false)
    }
  }

  const onContinue = () => {
    if (!canContinue) return
    tap()
    Keyboard.dismiss()
    if (step === 3) { submitAccount(); return }
    if (step === 4) { saveImagesAndContinue(); return }
    if (step === 5) { submitBio(); return }
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
  }

  const onBack = () => {
    tap()
    Keyboard.dismiss()
    setStep(s => Math.max(1, s - 1))
  }

  // Per-step page renderer — each page owns its own title/body/CTA so the
  // pager can lay them out side by side.
  const renderStep = (s: number) => {
    if (s === 1) return (
      <View style={styles.page}>
        <Text style={styles.title}>{t('ob.welcome')}</Text>
        <Text style={styles.subtitle}>{t('ob.whoAreYou')}</Text>

        <View style={styles.cardRow}>
          <GenderCard
            icon={(c) => <MaleSymbol color={c} />}
            label={t('ob.male')}
            selected={isMale === true}
            onPress={() => setIsMale(true)}
          />
          <GenderCard
            icon={(c) => <FemaleSymbol color={c} />}
            label={t('ob.female')}
            selected={isMale === false}
            onPress={() => setIsMale(false)}
          />
        </View>

        <View style={styles.ctaWrap}>
          <Button
            label={t('ob.next')}
            onPress={onContinue}
            disabled={!canContinue}
            variant="primary"
            tone="visible"
            size="lg"
          />
        </View>
      </View>
    )

    if (s === 2) return (
      <View style={styles.page}>
        <Text style={styles.title}>{t('ob.nicknameStep')}</Text>
        <Text style={styles.subtitle}>{t('ob.nicknamePlaceholder')}</Text>

        <View style={styles.inputWrap}>
          <TextInput
            ref={nameInputRef}
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={onContinue}
          />
        </View>

        <View style={styles.ctaRow}>
          <View style={styles.backSlot}>
            <Button
              label={t('ob.back')}
              onPress={onBack}
              variant="secondary"
              size="lg"
            />
          </View>
          <View style={styles.continueSlot}>
            <Button
              label={t('ob.next')}
              onPress={onContinue}
              disabled={!canContinue}
              variant="primary"
              tone="visible"
              size="lg"
            />
          </View>
        </View>
      </View>
    )

    if (s === 3) {
      const unitValue: Record<DateUnit, string> = { dd, mm, yyyy }
      const unitLabel: Record<DateUnit, string> = {
        dd: t('ob.day'), mm: t('ob.month'), yyyy: t('ob.year'),
      }
      const unitPlaceholder: Record<DateUnit, string> = { dd: 'DD', mm: 'MM', yyyy: 'YYYY' }
      const showMinAge = dateComplete && age !== null && age < 18
      return (
        <View style={styles.page}>
          <Text style={styles.title}>{t('ob.birthdate')}</Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>{tg('ob.howOld', isMale === true)}</Text>
            {dateValid && (
              <View style={styles.ageBadgeSlot}>
                <CountBadge value={age!} color="#6d28d9" />
              </View>
            )}
          </View>

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
                <View style={styles.dateBox}>
                  <TextInput
                    ref={unitRefs[unit]}
                    style={styles.dateInput}
                    value={unitValue[unit]}
                    onChangeText={handleUnit(unit)}
                    keyboardType="number-pad"
                    maxLength={unit === 'yyyy' ? 4 : 2}
                    placeholder={unitPlaceholder[unit]}
                    placeholderTextColor="rgba(0,0,0,0.25)"
                  />
                </View>
                <Text style={styles.dateUnit}>{unitLabel[unit]}</Text>
              </View>
            ))}
          </View>

          {showMinAge && <Text style={styles.errorText}>{t('ob.minAge')}</Text>}
          {dateError && <Text style={styles.errorText}>{dateError}</Text>}

          <View style={styles.ctaRow}>
            <View style={styles.backSlot}>
              <Button
                label={t('ob.back')}
                onPress={onBack}
                variant="secondary"
                size="lg"
                disabled={submitting}
              />
            </View>
            <View style={styles.continueSlot}>
              <Button
                label={tg('ob.createAccount', isMale === true)}
                onPress={onContinue}
                disabled={!canContinue}
                variant="primary"
                tone="visible"
                size="lg"
              />
            </View>
          </View>
        </View>
      )
    }

    if (s === 4) return (
      <View style={styles.page}>
        <Text style={styles.title}>{t('photo.title')}</Text>
        <Text style={styles.subtitle}>{t('photo.sub')}</Text>

        {/* Dim overlay matches the settings pattern: sits under the photo
            section (higher zIndex on the grid) and catches taps anywhere
            outside the grid to exit jiggle mode. */}
        {photosEditMode && (
          <Pressable
            style={styles.photoEditOverlay}
            onPress={() => { tap(); setPhotosEditMode(false) }}
          />
        )}

        <View style={styles.photoWrap} pointerEvents="box-none">
          <PhotoEditor
            editMode={photosEditMode}
            onEnterEditMode={() => setPhotosEditMode(true)}
            onUploadingChange={setPhotosUploading}
          />
        </View>

        <View style={styles.ctaWrap}>
          <Button
            label={t('photo.confirm')}
            onPress={onContinue}
            disabled={!canContinue}
            variant="primary"
            tone="visible"
            size="lg"
          />
        </View>
      </View>
    )

    if (s === 5) {
      const bioLen = bio.trim().length
      const belowMin = bioLen < BIO_MIN
      return (
        <View style={styles.page}>
          <Text style={styles.title}>{t('bio.title')}</Text>
          <Text style={styles.subtitle}>{tg('bio.sub', isMale === true)}</Text>
          <Text style={styles.bioEmphasis}>{t('bio.emphasis')}</Text>

          <View style={styles.bioField}>
            <TextInput
              ref={bioInputRef}
              style={styles.bioInput}
              value={bio}
              onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
              multiline
              textAlignVertical="top"
            />
            <Text style={[styles.bioCounter, !belowMin && bioRemaining < 20 && styles.bioCounterWarn]}>
              {belowMin ? t('bio.min') : bioRemaining}
            </Text>
          </View>

          <Text style={styles.bioTip}>{t('bio.tip')}</Text>

          <View style={styles.ctaWrap}>
            <Button
              label={t('bio.submit')}
              onPress={onContinue}
              disabled={!canContinue}
              variant="primary"
              tone="visible"
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
      <StatusBar style="dark" />

      <View style={styles.header}>
        <ProgressBar step={step} />
      </View>

      <View
        style={styles.pagerWrap}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View style={{ flex: 1, transform: [{ translateX: translate }] }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
            const s = i + 1
            // `start: i * width` is RTL-aware — maps to right in RTL. Combined
            // with the translateX sign flip in the effect above, page s lands
            // on-screen when step === s in both directions.
            return (
              <View
                key={s}
                pointerEvents={step === s ? 'auto' : 'none'}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  start: i * width,
                  width,
                }}
              >
                {renderStep(s)}
              </View>
            )
          })}
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef0f3' },

  header: { paddingHorizontal: 40, paddingTop: 16, paddingBottom: 8 },

  progressRow: { flexDirection: 'row', alignItems: 'center' },
  progressSegment: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  progressDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  progressDotActive: { backgroundColor: '#6d28d9' },
  progressLine: {
    flex: 1, height: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginHorizontal: 4,
  },

  pagerWrap: { flex: 1, overflow: 'hidden' },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },

  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
  },
  // Subtitle row hosts the subtitle text (still carrying its own marginTop)
  // plus an absolutely positioned age badge pinned to the end edge. Absolute
  // keeps the subtitle visually centered whether or not the badge is present,
  // so the layout doesn't jump when the date validates.
  subtitleRow: { justifyContent: 'center' },
  ageBadgeSlot: {
    position: 'absolute',
    end: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  cardRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 32,
  },
  card: {
    aspectRatio: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  cardInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  cardActive: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  cardLabelActive: { color: '#fff' },

  ctaWrap: { marginTop: 32 },

  photoWrap: {
    marginTop: 24,
    // Sits above the dim overlay so taps on photo cells hit the grid (not
    // the overlay), while taps outside the grid's bounds drop through to
    // the overlay below.
    zIndex: 2, elevation: 2,
  },
  photoEditOverlay: {
    position: 'absolute',
    start: -40, end: -40, top: -2000, bottom: -2000,
    backgroundColor: 'rgba(0,0,0,0.22)',
    zIndex: 1, elevation: 1,
  },

  inputWrap: {
    marginTop: 32,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  input: {
    fontSize: 16,
    color: '#111',
    textAlign: 'center',
    padding: 0,
  },

  ctaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    alignItems: 'stretch',
  },
  backSlot: { flexBasis: 110 },
  continueSlot: { flex: 1 },

  // Date row: DD and MM share equal flex, YYYY gets ~2x so "1990" fits without
  // being cramped relative to the two-digit boxes. Laid out in the locale's
  // native order via `dateOrder.map`, so Hebrew gets DD-MM-YYYY and English
  // gets MM-DD-YYYY. `direction: 'ltr'` pins the visual flow left-to-right
  // even under RTL — numeric dates read LTR everywhere, and `marginLeft`
  // (not `marginStart`) keeps the gap on the left where we want it.
  dateRow: {
    flexDirection: 'row',
    direction: 'ltr',
    marginTop: 32,
    alignItems: 'flex-start',
  },
  dateSegment: { flex: 1, alignItems: 'center' },
  dateSegmentYear: { flex: 1.6 },
  dateSegmentGap: { marginLeft: 10 },
  dateBox: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  dateInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    padding: 0,
  },
  dateUnit: {
    marginTop: 8,
    fontSize: 13,
    color: 'rgba(0,0,0,0.5)',
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: '#c0392b',
    textAlign: 'center',
  },

  // Bio (step 5): textarea-style box with a counter pinned to the bottom-end
  // corner. Counter swaps to red once remaining drops below 20 to nudge the
  // user before they hit the 150-char cap; below the min it shows the floor
  // requirement instead of a number.
  bioEmphasis: {
    marginTop: 14,
    fontSize: 15,
    color: '#111',
    fontWeight: '700',
    textAlign: 'center',
  },
  bioField: {
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    minHeight: 140,
  },
  bioInput: {
    fontSize: 16,
    color: '#111',
    padding: 0,
    minHeight: 96,
    textAlign: 'center',
  },
  bioCounter: {
    position: 'absolute',
    end: 12,
    bottom: 8,
    fontSize: 12,
    color: 'rgba(0,0,0,0.45)',
  },
  bioCounterWarn: { color: '#c0392b' },
  bioTip: {
    marginTop: 14,
    fontSize: 13,
    color: 'rgba(0,0,0,0.55)',
    textAlign: 'center',
  },
})
