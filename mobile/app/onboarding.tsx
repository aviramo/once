import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Animated, Keyboard, TextInput as RNTextInput, Platform, PanResponder, BackHandler } from 'react-native'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
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
import { PhotoEditor, PhotoEditorRef } from '../src/components/PhotoEditor'
import { TEXT, WHITE, RED, GREEN, GRAY_50 } from '../src/colors'
import { SINGLE } from '../src/fonts'

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
          {icon(TEXT)}
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
      ? ((profile.images?.length ?? 0) >= 1 ? 5 : 4)
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
  const [savingImages, setSavingImages] = useState(false)
  const [totalPhotoCount, setTotalPhotoCount] = useState(profile?.images?.length ?? 0)
  const photoEditorRef = useRef<PhotoEditorRef>(null)

  const [containerH, setContainerH] = useState(0)
  const slideY = useRef(new Animated.Value(0)).current
  const keyboardOffset = useRef(new Animated.Value(0)).current
  const keyboardShift = useRef(new Animated.Value(0)).current
  const totalY = useRef(Animated.add(slideY, keyboardShift)).current
  const stepRef = useRef(step)
  const containerHRef = useRef(containerH)
  useEffect(() => { stepRef.current = step }, [step])
  useEffect(() => { containerHRef.current = containerH }, [containerH])

  const canGoBack = (s: number) => s === 2 || s === 3 || s === 5
  const goBack = () => setStep(s => canGoBack(s) ? s - 1 : s)
  const overlayY = useRef(new Animated.Value(9999)).current

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
      Animated.parallel([
        Animated.timing(keyboardOffset, { toValue: h, duration, useNativeDriver: false }),
        Animated.timing(keyboardShift, { toValue: -h / 2, duration, useNativeDriver: true }),
      ]).start()
    })
    const hide = Keyboard.addListener(hideEvent, (e) => {
      const duration = (e as any).duration ?? 250
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
    setStep((profile.images?.length ?? 0) >= 1 ? 5 : 4)
  }, [profile])

  useEffect(() => {
    if (step === 2) {
      const id = requestAnimationFrame(() => nameInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
    if (step === 3) {
      const first = dateOrder[0]
      const id = requestAnimationFrame(() => unitRefs[first].current?.focus())
      return () => cancelAnimationFrame(id)
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
    step === 4 ? totalPhotoCount >= 1 && !savingImages :
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

  const saveImagesAndContinue = () => {
    if (savingImages) return
    setSavingImages(true)
    photoEditorRef.current?.flush().catch(e => console.error('storage upload failed', e))
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
    setSavingImages(false)
  }

  const submitBio = async () => {
    if (bioSubmitting) return
    setBioSubmitting(true)
    try {
      const images = useUserStore.getState().profile?.images
      await invoke('app/profile', {
        bio: bio.trim().replace(/\n{3,}/g, '\n\n'),
        images,
      })
    } catch {
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
    Keyboard.dismiss()
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
                <CountBadge value={age ?? 0} color="#1AC944" />
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
                    placeholderTextColor="rgba(0,0,0,0.35)"
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
            disabled={totalPhotoCount < 1}
            loading={savingImages}
            variant="primary"
            tone="positive"
            size="lg"
          />
          <Text style={styles.almostDone}>{t('photo.almostDone')}</Text>
        </View>
      </View>
    )

    if (s === 5) {
      const bioLen = bio.trim().length
      const belowMin = bioLen < BIO_MIN
      return (
        <View style={styles.pageStretched}>
          <Text style={styles.title}>{t('bio.title')}</Text>
          <Text style={styles.subtitle}>{t('bio.emphasis')}</Text>

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
              placeholderTextColor="rgba(0,0,0,0.3)"
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
              disabled={!bioValid}
              loading={bioSubmitting}
              variant="primary"
              tone="positive"
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

      <Animated.View style={{ flex: 1, paddingBottom: keyboardOffset }}>
        <View
          {...panResponder.panHandlers}
          style={styles.pagerWrap}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height
            if (h > 0 && containerH === 0) {
              setContainerH(h)
              slideY.setValue(-(step - 1) * h)
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
                { backgroundColor: GRAY_50, transform: [{ translateY: overlayY }] },
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
  root: { flex: 1, backgroundColor: GRAY_50 },

  pagerWrap: { flex: 1, overflow: 'hidden' },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  pageCentered: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  pageStretched: { flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },

  title: {
    fontSize: 32,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
  },
  subtitleRow: {
    marginTop: 10,
    alignItems: 'center',
  },
  subtitleAnchor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  cardRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 32,
  },
  card: {
    aspectRatio: 1,
    borderRadius: SINGLE,
    backgroundColor: 'rgba(0,0,0,0.06)',
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
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
  },
  cardLabelActive: { color: WHITE },

  ctaWrap: { marginTop: 32 },
  almostDone: {
    marginTop: 12,
    fontSize: 13,
    color: 'rgba(0,0,0,0.45)',
    textAlign: 'center',
  },

  photoWrap: {
    marginTop: 24,
    zIndex: 2, elevation: 2,
  },

  inputWrap: {
    marginTop: 32,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  input: {
    fontSize: 16,
    color: TEXT,
    textAlign: 'center',
    padding: 0,
  },

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
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  dateInput: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
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
    color: RED,
    textAlign: 'center',
  },

  bioEmphasis: {
    marginTop: 14,
    fontSize: 15,
    color: TEXT,
    fontWeight: '700',
    textAlign: 'center',
  },
  bioField: {
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    minHeight: 140,
  },
  bioInput: {
    fontSize: 16,
    color: TEXT,
    padding: 0,
    minHeight: 96,
    textAlign: 'center',
  },
  bioCounter: {
    position: 'absolute',
    end: 12,
    bottom: 8,
    fontSize: 12,
    color: 'rgba(0,0,0,0.5)',
  },
  bioCounterWarn: { color: RED },
  bioTip: {
    marginTop: 14,
    fontSize: 13,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
})
