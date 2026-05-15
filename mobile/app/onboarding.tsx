import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Animated, Keyboard, TextInput as RNTextInput, Platform, PanResponder, BackHandler, Dimensions } from 'react-native'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { useAuthStore } from '../src/stores/authStore'
import { useUserStore } from '../src/stores/userStore'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { t, tg, lang } from '../src/i18n'
import { Button } from '../src/components/Button'
import { CountBadge } from '../src/components/CountBadge'
import { CheckIcon } from '../src/components/icons'
import { PhotoEditor, PhotoEditorRef } from '../src/components/PhotoEditor'
import { BLACK, WHITE, DESTRUCTIVE, PRIMARY, PRIMARY_LIGHT, BLACK_MID, BLACK_STRONG } from '../src/colors'
import { XS, SM, MD, LG, XL, RADIUS, TEXT, WEIGHT } from '../src/tokens'

const TOTAL_STEPS = 5
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
          {icon(BLACK)}
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
    </Animated.View>
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
  const [dateError, setDateError] = useState<string | null>(null)
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [bioSubmitting, setBioSubmitting] = useState(false)
  const [totalPhotoCount, setTotalPhotoCount] = useState(profile?.images?.length ?? 0)
  const photoEditorRef = useRef<PhotoEditorRef>(null)

  // Estimate the pager height for first paint so the initial step renders
  // immediately (rather than flashing an empty background until onLayout fires).
  const initialPagerH = Math.max(100, Dimensions.get('window').height - insets.top - insets.bottom)
  const [containerH, setContainerH] = useState(initialPagerH)
  const measuredOnceRef = useRef(false)
  const slideY = useRef(new Animated.Value(-(initialStep - 1) * initialPagerH)).current
  const keyboardOffset = useRef(new Animated.Value(0)).current
  const keyboardShift = useRef(new Animated.Value(0)).current
  const [keyboardH, setKeyboardH] = useState(0)
  const totalY = useRef(Animated.add(slideY, keyboardShift)).current
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
      setKeyboardH(h)
      Animated.parallel([
        Animated.timing(keyboardOffset, { toValue: h, duration, useNativeDriver: false }),
        Animated.timing(keyboardShift, { toValue: -h / 2, duration, useNativeDriver: true }),
      ]).start()
    })
    const hide = Keyboard.addListener(hideEvent, (e) => {
      if (bioSubmittingRef.current) return
      const duration = (e as any).duration ?? 250
      setKeyboardH(0)
      Animated.parallel([
        Animated.timing(keyboardOffset, { toValue: 0, duration, useNativeDriver: false }),
        Animated.timing(keyboardShift, { toValue: 0, duration, useNativeDriver: true }),
      ]).start()
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
      duration: 300,
      useNativeDriver: true,
    }).start()
    Animated.timing(overlayY, {
      toValue: step === 5 ? 0 : containerH,
      duration: 300,
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
      const id = setTimeout(() => nameInputRef.current?.focus(), 0)
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
  const BIO_MAX = 150
  const BIO_MIN = 20
  const bioRemaining = BIO_MAX - bio.length
  const bioValid = bio.trim().length >= BIO_MIN
  const canContinue =
    step === 1 ? isMale !== null :
    step === 2 ? nameValid :
    step === 3 ? dateValid && !submitting :
    step === 4 ? totalPhotoCount >= 2 :
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
    }
  }

  const flushPromiseRef = useRef<Promise<void> | null>(null)
  const saveImagesAndContinue = () => {
    const p = photoEditorRef.current?.flush()
    if (p) flushPromiseRef.current = p.catch(e => { console.error('storage upload failed', e) })
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
  }

  const submitBio = async () => {
    if (bioSubmittingRef.current) return
    bioSubmittingRef.current = true
    setBioSubmitting(true)
    try {
      if (flushPromiseRef.current) {
        await flushPromiseRef.current
        flushPromiseRef.current = null
      }
      const bioValue = bio.trim().replace(/\n{3,}/g, '\n\n')
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
    if (step === 3) { submitAccount(); return }
    if (step === 4) { saveImagesAndContinue(); return }
    if (step === 5) { submitBio(); return }
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
  }
  const renderStep = (s: number) => {
    if (s === 1) return (
      <View style={styles.pageCentered}>
        <Text style={styles.title}>{t('ob.welcome')}</Text>
        <Text style={styles.subtitle}>{t('ob.whoAreYou')}</Text>

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
      <View style={styles.pageCentered}>
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
            placeholder={t('ob.nicknameField')}
            placeholderTextColor={BLACK_MID}
          />
        </View>

        <View style={styles.ctaWrap}>
          <Button
            label={t('ob.next')}
            onPress={onContinue}
            disabled={!canContinue}
            variant="primary"
            tone="positive"
            size="lg"
            iconStart={<CheckIcon color={WHITE} size={22} />}
          />
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
        <View style={styles.pageCentered}>
          <Text style={styles.title}>{t('ob.birthdate')}</Text>
          <View style={styles.subtitleRow}>
            <View style={styles.subtitleAnchor}>
              <Text style={[styles.subtitle, { marginTop: 0 }]}>{tg('ob.howOld', isMale === true)}</Text>
              <View style={{ opacity: dateValid ? 1 : 0 }}>
                <CountBadge value={age ?? 0} color={PRIMARY} />
              </View>
            </View>
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
                    placeholderTextColor={BLACK_MID}
                    selectTextOnFocus
                  />
                </View>
                <Text style={styles.dateUnit}>{unitLabel[unit]}</Text>
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
              variant="primary"
              tone="positive"
              size="lg"
              iconStart={<CheckIcon color={WHITE} size={22} />}
            />
          </View>
        </View>
      )
    }

    if (s === 4) return (
      <View style={styles.pageCentered}>
        <Text style={styles.title}>{t('photo.title')}</Text>
        <Text style={styles.subtitle}>{t('photo.sub')}</Text>

        <View style={styles.photoWrap} pointerEvents="box-none">
          <PhotoEditor
            ref={photoEditorRef}
            deferUpload
            onTotalCountChange={setTotalPhotoCount}
          />
        </View>

        <View style={styles.ctaWrap}>
          <Button
            label={t('photo.confirm')}
            onPress={onContinue}
            disabled={totalPhotoCount < 2}
            variant="primary"
            tone="positive"
            size="lg"
            iconStart={<CheckIcon color={WHITE} size={22} />}
          />
          <Text style={styles.almostDone}>{t('photo.almostDone')}</Text>
        </View>
      </View>
    )

    if (s === 5) {
      const bioLen = bio.trim().length
      const belowMin = bioLen < BIO_MIN
      // On short screens (or any device whose remaining content height after
      // the keyboard pops up is below ~500dp) the bio textbox gets squeezed by
      // the subtitle. Drop the subtitle in that case so the field stays usable.
      const tightSpace = keyboardH > 0 && (containerH - keyboardH) < 500
      return (
        <View style={styles.pageStretched}>
          <Text style={styles.title}>{t('bio.title')}</Text>
          {!tightSpace && <Text style={styles.subtitle}>{t('bio.emphasis')}</Text>}

          <View style={[styles.bioField, { flex: 1, minHeight: 0 }]}>
            <TextInput
              ref={bioInputRef}
              style={[styles.bioInput, { flex: 1, minHeight: 0 }]}
              value={bio}
              onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
              multiline
              textAlignVertical="top"
              placeholder={t('bio.placeholder')}
              placeholderTextColor={BLACK_MID}
              editable={!bioSubmitting}
            />
            <Text style={[styles.bioCounter, !belowMin && bioRemaining < 20 && styles.bioCounterWarn]}>
              {belowMin ? t('bio.min') : bioRemaining}
            </Text>
          </View>

          <Text style={styles.bioTip}>{t('bio.tip')}</Text>

          <View style={[styles.ctaWrap, { marginBottom: MD }]}>
            <Button
              label={t('bio.submit')}
              onPress={onContinue}
              disabled={!bioValid}
              loading={bioSubmitting}
              variant="primary"
              tone="positive"
              size="lg"
              iconStart={<CheckIcon color={WHITE} size={22} />}
            />
          </View>
        </View>
      )
    }

    return <View style={styles.page} />
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Status bar matches the onboarding surface so it blends with the
          screen instead of contrasting against it. Dark icons because the
          background is light coral, not the saturated PRIMARY used inside
          the home shell (where the status bar is light-on-coral). */}
      <StatusBar style="dark" backgroundColor={PRIMARY_LIGHT} translucent={false} />
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
            <Animated.View style={{ transform: [{ translateY: totalY }] }}>
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
                { backgroundColor: PRIMARY_LIGHT, transform: [{ translateY: overlayY }] },
              ]}
              pointerEvents={step === 5 ? 'auto' : 'none'}
            >
              {renderStep(5)}
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PRIMARY_LIGHT },

  pagerWrap: { flex: 1, overflow: 'hidden' },
  page: { flex: 1, paddingHorizontal: LG, paddingTop: XL },
  pageCentered: { flex: 1, paddingHorizontal: LG, justifyContent: 'center' },
  pageStretched: { flex: 1, paddingHorizontal: LG, paddingTop: XL, paddingBottom: LG },

  title: {
    fontSize: TEXT.xxl,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: SM,
    fontSize: TEXT.md,
    color: BLACK_STRONG,
    textAlign: 'center',
  },
  subtitleRow: {
    marginTop: SM,
    alignItems: 'center',
  },
  subtitleAnchor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },

  cardRow: {
    flexDirection: 'row',
    gap: MD,
    marginTop: XL,
  },
  card: {
    aspectRatio: 1,
    borderRadius: RADIUS,
    backgroundColor: WHITE,
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
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    gap: MD,
  },
  cardLabel: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
  },
  cardLabelActive: { color: WHITE },

  ctaWrap: { marginTop: XL },
  almostDone: {
    marginTop: MD,
    fontSize: TEXT.sm,
    color: BLACK_STRONG,
    textAlign: 'center',
  },

  photoWrap: {
    marginTop: LG,
    zIndex: 2, elevation: 2,
  },

  inputWrap: {
    marginTop: XL,
    backgroundColor: WHITE,
    borderRadius: RADIUS,
    paddingHorizontal: MD,
    paddingVertical: MD,
  },
  input: {
    fontSize: TEXT.md,
    color: BLACK,
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
    backgroundColor: WHITE,
    borderRadius: RADIUS,
    paddingVertical: MD,
    paddingHorizontal: SM,
  },
  dateInput: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
    textAlign: 'center',
    padding: 0,
  },
  dateUnit: {
    marginTop: SM,
    fontSize: TEXT.sm,
    color: BLACK_STRONG,
  },
  errorText: {
    marginTop: MD,
    fontSize: TEXT.sm,
    color: DESTRUCTIVE,
    textAlign: 'center',
  },

  bioEmphasis: {
    marginTop: MD,
    fontSize: TEXT.md,
    color: BLACK,
    fontWeight: WEIGHT.extrabold,
    textAlign: 'center',
  },
  bioField: {
    marginTop: MD,
    backgroundColor: WHITE,
    borderRadius: RADIUS,
    paddingHorizontal: MD,
    paddingTop: MD,
    paddingBottom: LG,
    minHeight: 140,
  },
  bioInput: {
    fontSize: TEXT.md,
    color: BLACK,
    padding: 0,
    minHeight: 96,
    textAlign: 'center',
  },
  bioCounter: {
    position: 'absolute',
    end: 12,
    bottom: 8,
    fontSize: TEXT.sm,
    color: BLACK_STRONG,
  },
  bioCounterWarn: { color: DESTRUCTIVE },
  bioTip: {
    marginTop: MD,
    fontSize: TEXT.sm,
    color: BLACK_STRONG,
    textAlign: 'center',
  },
})
