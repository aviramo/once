import React, { useState, useEffect, useRef, useCallback, useMemo, createContext } from 'react'
import { View, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, I18nManager, Animated as RNAnimated, Dimensions, Keyboard, Platform, TextInput as RNTextInput } from 'react-native'
import Animated, { SharedValue, useSharedValue, FadeIn, FadeOut } from 'react-native-reanimated'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { getLocales } from 'expo-localization'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Path, Line, Circle, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap, tapWarning } from '../src/lib/haptics'
import { useUserStore } from '../src/stores/userStore'
import { useAuthStore } from '../src/stores/authStore'
import { t, tg, lang } from '../src/i18n'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { Button } from '../src/components/Button'
import { IconPressable } from '../src/components/IconPressable'
import { MatchCard, type CardAction } from '../src/components/MatchCard'
import { PullContext, type PullCtx } from '../src/components/HomeCard'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import { localPhotoUriCache, pendingDeferred, processAndUploadPhotoDeferred } from '../src/components/PhotoEditor'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '../src/lib/supabase'
import type { Profile } from '../src/stores/userStore'
import { familyEmptyWeek, familyEqual, FAMILY_MAX_KIDS, FAMILY_MAX_WEEKS, startOfDisplayedWeek, sundayOfWeek, toISODate, defaultWeekStart, weekendDays, type FamilyData, type FamilyKid } from '../src/lib/family'
import { SINGLE, DOUBLE, QUAD, BUTTON, BUTTON_MIN_HEIGHT, RADIUS, TEXT, WEIGHT, ICON, DURATION } from '../src/tokens'
import { BLACK, WHITE, PRIMARY, PRIMARY_BG, BLACK_SOFT, BLACK_STRONG, DESTRUCTIVE, DESTRUCTIVE_MUTED, DESTRUCTIVE_BG, BLACK_MID } from '../src/colors'
import { CloseIcon, SlidersIcon, MapPinIcon, GenderIcon, ResetIcon, SignOutIcon, TrashIcon, UserIcon, AddPhotoIcon, FamilyKidsIcon, ChevronUpIcon, ChevronDownIcon, PhotoReplaceIcon, PhotoTrashIcon, PlayIcon, PauseIcon, CheckIcon } from '../src/components/icons'
import { BottomSheet } from '../src/components/BottomSheet'
import { Chip } from '../src/components/Chip'
import { ScreenHeader } from '../src/components/ScreenHeader'
import { units, M_PER_MI } from '../src/lib/units'

const isRTL = I18nManager.isRTL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const TAP_SLOP = 10
// 16/9 floor for the profile card. The card is flush with the screen edges,
// so its width equals the screen width.
const PROFILE_CARD_MIN_HEIGHT = Math.round(Dimensions.get('window').width * 9 / 16)

// Provided by the shell (home.tsx) so section pages can share their inner
// sub-page slide animation with the shell. The shell hosts the SharedValue
// (so its swipe-back gesture worklet can drive it) and offers callbacks
// for the section page to register open/close state and a finalize hook
// that runs after a shell-driven swipe finishes the close animation.
export type ShellInnerNav = {
  // 0 = closed (no inner sub-page), 1 = inner sub-page fully covering section.
  slideProgress: SharedValue<number>
  // Section calls this on open/close so the shell knows whether to route
  // hardware-back and swipe-back to the inner level.
  setHandlers: (h: { isOpen: boolean; close: () => void; finalizeClose: () => void } | null) => void
}
export const ShellInnerNavContext = createContext<ShellInnerNav | null>(null)

// Returns responder props that fire `onPress` only on clean taps (movement < TAP_SLOP).
// `onPressStateChange` lets the caller drive a visual pressed-state (e.g. fade
// in a BLACK_SOFT background) without losing the raw-responder behaviour that's
// required for reliable taps inside ScrollView (Pressability cancels them on
// RN 0.81).
function useTapResponder(onPress: () => void | Promise<unknown>, onPressStateChange?: (pressed: boolean) => void) {
  const start = useRef({ x: 0, y: 0 })
  return {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (e: any) => {
      start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }
      onPressStateChange?.(true)
    },
    onResponderRelease: (e: any) => {
      const dx = Math.abs(e.nativeEvent.pageX - start.current.x)
      const dy = Math.abs(e.nativeEvent.pageY - start.current.y)
      if (dx < TAP_SLOP && dy < TAP_SLOP) {
        tap()
        const result = onPress() as void | Promise<unknown>
        // If onPress is async (e.g. opens a subPage and resolves when the
        // slide starts), keep the pressed visual until it settles so the
        // user gets feedback that something is happening.
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          ;(result as Promise<unknown>).finally(() => onPressStateChange?.(false))
        } else {
          onPressStateChange?.(false)
        }
      } else {
        onPressStateChange?.(false)
      }
    },
    onResponderTerminate: () => onPressStateChange?.(false),
  }
}

// ── Local aliases for shared icons (keep call sites unchanged) ────────────

const FIELD_ICON_STROKE = BLACK_STRONG
const DESTRUCTIVE_COLOR = DESTRUCTIVE_MUTED

// ── Select Field Types ─────────────────────────────────────────────────────

export type SelectOption = { value: string; label: string }

export type SelectFieldConfig = {
  kind: 'select'
  title: string
  options: SelectOption[]
  value: string
  onSelect: (value: string) => void | Promise<void>
  description?: string
}

export type AgeRangeFieldConfig = {
  kind: 'ageRange'
  title: string
  ageMin: number
  ageMax: number
  sliderMin: number
  sliderMax: number
  onChangeLocal: (min: number, max: number) => void
  onClose: (min: number, max: number) => void | Promise<void>
}

export type RadiusFieldConfig = {
  kind: 'radius'
  title: string
  stepCount: number
  value: number
  onChangeLocal: (v: number) => void
  onClose: (v: number) => void | Promise<void>
  formatStep: (i: number) => string
}

export type AdminFieldConfig = {
  kind: 'admin'
  title: string
  onReset: (state: 'VISIBLE' | 'HIDDEN') => Promise<void>
}

export type AccountFieldConfig = {
  kind: 'account'
  title: string
}

export type PreviewFieldConfig = {
  kind: 'preview'
  title: string
}

export type ProfileSectionFieldConfig = {
  kind: 'profileSection'
  title: string
}

export type AppSectionFieldConfig = {
  kind: 'appSection'
  title: string
}

export type SubPageConfig = SelectFieldConfig | AgeRangeFieldConfig | RadiusFieldConfig | AdminFieldConfig | AccountFieldConfig | PreviewFieldConfig | ProfileSectionFieldConfig | AppSectionFieldConfig

// ── Select Field Row ───────────────────────────────────────────────────────
// Shared tappable settings row used across Preferences, Profile, App and the
// Main Menu. Layout (logical order, flips automatically in RTL):
//   [chevron] [label / title+subtitle] ... [value] [trailing icon | avatar]
// Variants:
//   - displayValue?      → orange right-aligned value (radius/age/gender/kids)
//   - subtitle?          → small secondary text under the label (profile row)
//   - avatar?            → image URI rendered as a circular avatar at the end
//   - tone='accent'      → soft PRIMARY_BG halo behind the trailing icon
// Press feedback fades in a BLACK_SOFT background; `grouped` rows inherit
// rounding from their parent card so the press state stays inside the card.

function SelectFieldRow({
  label,
  subtitle,
  displayValue,
  onPress,
  icon,
  avatar,
  grouped,
  tone = 'default',
  size = 'default',
}: {
  label?: string
  subtitle?: string
  displayValue?: string
  onPress: () => void | Promise<unknown>
  icon?: React.ReactNode
  avatar?: string
  grouped?: boolean
  tone?: 'default' | 'accent'
  size?: 'default' | 'large'
}) {
  const press = useRef(new RNAnimated.Value(0)).current
  const tapProps = useTapResponder(onPress, (pressed) => {
    RNAnimated.timing(press, {
      toValue: pressed ? 1 : 0,
      duration: pressed ? 80 : 180,
      useNativeDriver: false,
    }).start()
  })
  const isLarge = size === 'large'
  return (
    <View
      style={[
        grouped ? styles.selectRowInner : styles.selectRow,
        isLarge && styles.selectRowLarge,
      ]}
      {...tapProps}
    >
      <RNAnimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, {
          backgroundColor: BLACK_SOFT,
          opacity: press,
          borderRadius: grouped ? 0 : RADIUS,
        }]}
      />
      {(() => {
        const renderedIcon = avatar ? (
          <Image source={{ uri: avatar }} style={styles.selectRowAvatar} />
        ) : icon ? (
          tone === 'accent' ? (
            <View style={styles.selectRowAccentIcon}>{icon}</View>
          ) : (
            <View style={styles.selectRowIconWrap}>{icon}</View>
          )
        ) : null
        return label != null ? (
          <View style={styles.selectRowTextCol}>
            <View style={styles.selectRowLabelWrap}>
              <View style={styles.selectRowLabelGroup}>
                {renderedIcon}
                <Text style={styles.selectRowLabel}>{label}</Text>
              </View>
              {displayValue != null ? (
                <Text style={styles.selectRowValue}>{displayValue}</Text>
              ) : null}
            </View>
            {subtitle ? (
              <Text style={styles.selectRowSubtitle}>{subtitle}</Text>
            ) : null}
          </View>
        ) : (
          <>
            {renderedIcon}
            <Text style={[styles.selectRowValue, { flex: 1 }]}>{displayValue ?? ''}</Text>
          </>
        )
      })()}
    </View>
  )
}

// ── Radius helpers ─────────────────────────────────────────────────────────

const RADIUS_STEPS_KM = [0, 0.5, 1, 2, 5, 10, 20, 50, 70, 100, Infinity]
// Miles steps chosen to roughly match the km steps in physical distance,
// rounded to numbers that read nicely in miles.
const RADIUS_STEPS_MI = [0, 0.3, 0.5, 1, 3, 5, 10, 30, 50, 60, Infinity]

const RADIUS_STEPS: number[] = units === 'imperial' ? RADIUS_STEPS_MI : RADIUS_STEPS_KM

function snapRadius(value: number, steps: number[]): number {
  return steps.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  )
}

function formatRadius(value: number): string {
  if (value === 0) return t('settings.rangeHere')
  if (value === Infinity) return t('settings.rangeUnlimited')
  if (units === 'imperial') return `${value} ${t('settings.miles')}`
  if (value < 1) return `${value * 1000} ${t('settings.meter')}`
  return `${value} ${t('settings.km')}`
}

function radiusToServer(value: number): number | null {
  if (value === Infinity) return null
  if (value === 0) return 250
  return units === 'imperial' ? Math.round(value * M_PER_MI) : Math.round(value * 1000)
}

// Convert stored meters into the unit the slider/format uses.
function metersToUnit(meters: number): number {
  return units === 'imperial' ? meters / M_PER_MI : meters / 1000
}

// Saves a partial data object via app/data whenever the value changes.
// Server uses lodash.merge so only the provided fields are touched.
function calcAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ── Tabs ───────────────────────────────────────────────────────────────────

type Tab = 'preferences' | 'profile' | 'app'

// Per-tab glyph used in the avatar preview row.
const TAB_ICON_SIZE = 20

function TabIcon({ tab, color }: { tab: Tab; color: string }) {
  const stroke = color
  if (tab === 'preferences') {
    // Magnifying glass
    return (
      <Svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="11" cy="11" r="7" />
        <Line x1="16.5" y1="16.5" x2="21" y2="21" />
      </Svg>
    )
  }
  if (tab === 'profile') {
    // Person — head + shoulders
    return (
      <Svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="12" cy="8" r="4" />
        <Path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </Svg>
    )
  }
  // app → 2×2 grid (app icon)
  return (
    <Svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="3" width="8" height="8" rx="2" />
      <Rect x="13" y="3" width="8" height="8" rx="2" />
      <Rect x="3" y="13" width="8" height="8" rx="2" />
      <Rect x="13" y="13" width="8" height="8" rx="2" />
    </Svg>
  )
}

// ── Animated Toggle Button ─────────────────────────────────────────────────
// Used for the gender chips (and anywhere else two-state pill buttons appear).
// Animates background color, text color, and a small scale bump on press.

function PreferencesContent({ onOpenSubPage: _onOpenSubPage }: { onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const { profile, update } = useUserStore()
  const [agePopupVisible, setAgePopupVisible] = useState(false)
  const [radiusPopupVisible, setRadiusPopupVisible] = useState(false)
  const [genderPopupVisible, setGenderPopupVisible] = useState(false)

  const age = profile?.birth_date ? calcAge(profile.birth_date) : 40
  const ageSliderMin = Math.max(18, age - 20)
  const ageSliderMax = Math.min(80, age + 20)

  if (!profile) return null

  const ageMin = Math.max(ageSliderMin, Math.min(profile.age_from, ageSliderMax))
  const ageMax = Math.max(ageMin, Math.min(ageSliderMax, Math.max(profile.age_to, ageSliderMin)))
  const STEPS = RADIUS_STEPS
  const radius = profile.range == null ? Infinity : profile.range <= 250 ? 0 : snapRadius(metersToUnit(profile.range), STEPS)
  const radiusStep = Math.max(0, STEPS.indexOf(radius))
  const forMale = profile.is_for_male
  const forFemale = profile.is_for_female
  const genderDisplayValue = forMale && forFemale ? t('settings.genderBoth') : forMale ? t('settings.genderM') : t('settings.genderF')

  return (
    <View style={styles.section}>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        <SelectFieldRow
          grouped
          label={t('settings.range')}
          displayValue={formatRadius(radius)}
          onPress={() => setRadiusPopupVisible(true)}
          icon={<MapPinIcon />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.ageRange')}
          displayValue={ageMin === ageMax ? `⁦${ageMin}⁩` : `⁦${ageMin} – ${ageMax}⁩`}
          onPress={() => setAgePopupVisible(true)}
          icon={<SlidersIcon />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.preferredGender')}
          displayValue={genderDisplayValue}
          onPress={() => setGenderPopupVisible(true)}
          icon={<GenderIcon />}
        />
      </View>
      <RadiusPopup
        visible={radiusPopupVisible}
        stepCount={STEPS.length}
        initialValue={radiusStep}
        formatStep={i => formatRadius(STEPS[i])}
        onSelect={i => {
          const meters = radiusToServer(STEPS[i])
          update({ range: meters })
          invoke('app/range', { range: meters }).catch(console.error)
        }}
        onDismiss={() => setRadiusPopupVisible(false)}
      />
      <AgeRangePopup
        visible={agePopupVisible}
        ageMin={ageMin} ageMax={ageMax}
        sliderMin={ageSliderMin} sliderMax={ageSliderMax}
        onSave={(min, max) => {
          update({ age_from: min, age_to: max })
          invoke('app/age', { age_from: min, age_to: max }).catch(console.error)
        }}
        onDismiss={() => setAgePopupVisible(false)}
      />
      <GenderPopup
        visible={genderPopupVisible}
        initialForMale={forMale ?? true}
        initialForFemale={forFemale ?? false}
        onSelect={(m, f) => {
          update({ is_for_male: m, is_for_female: f })
          invoke('app/preferred_gender', { is_for_male: m, is_for_female: f }).catch(console.error)
        }}
        onDismiss={() => setGenderPopupVisible(false)}
      />
    </View>
  )
}


// ── Account Tab ────────────────────────────────────────────────────────────
// Icons (SignOutIcon, TrashIcon, InfoIcon, UserIcon) imported from
// '../src/components/icons'.

function formatBirthDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

// ── Account Popup ──────────────────────────────────────────────────────────

function AccountPopup({ visible, onDismiss, onSignOutPress, onDeletePress }: {
  visible: boolean
  onDismiss: () => void
  onSignOutPress: () => void
  onDeletePress: () => void
}) {
  const { profile } = useUserStore()
  const { user } = useAuthStore()
  const insets = useSafeAreaInsets()

  // Two iOS Modals cannot be presented at the same parent level at once —
  // stacking a ConfirmDialog over this Modal makes the dialog never appear.
  // Defer the parent action until after this sheet's dismiss animation runs.
  const dismissThen = useCallback((after: () => void) => {
    onDismiss()
    setTimeout(after, 280)
  }, [onDismiss])

  const signOutTap = useTapResponder(() => { tap(); dismissThen(onSignOutPress) })
  const deleteTap = useTapResponder(() => { tapWarning(); dismissThen(onDeletePress) })

  if (!profile || !user) return null

  const age = profile.birth_date ? calcAge(profile.birth_date) : null
  const gender =
    profile.is_male === true  ? t('settings.male')
    : profile.is_male === false ? t('settings.female')
    : '—'

  const nameAndGender = [profile.name, gender !== '—' ? gender : null].filter(Boolean).join(', ') || '—'
  const detailRows: Array<{ label: string; value: string }> = [
    { label: 'nameGender',            value: nameAndGender },
    { label: t('settings.birthDate'), value: profile.birth_date ? `${formatBirthDate(profile.birth_date)} (${age})` : '—' },
    { label: t('settings.email'),     value: user.email ?? '—' },
  ]

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      contentStyle={{ paddingBottom: Math.max(insets.bottom, SINGLE) }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SINGLE, paddingHorizontal: DOUBLE, paddingBottom: DOUBLE }}>
        {detailRows.map(r => (
          <Chip key={r.label} text={r.value} />
        ))}
      </View>
      <View style={styles.accountActionsCard}>
        <View style={styles.accountActionRow} {...signOutTap}>
          <SignOutIcon color={BLACK_STRONG} />
          <Text style={[styles.accountActionText, { flex: 1 }]} numberOfLines={1} ellipsizeMode="clip">{tg('settings.signOut', profile.is_male)}</Text>
        </View>
        <View style={styles.accountActionDivider} />
        <View style={styles.accountActionRow} {...deleteTap}>
          <TrashIcon color={DESTRUCTIVE_MUTED} />
          <Text style={[styles.accountActionText, styles.accountActionTextDestructive, { flex: 1 }]} numberOfLines={1} ellipsizeMode="clip">{t('settings.deleteAccount')}</Text>
        </View>
      </View>
    </BottomSheet>
  )
}

// ── App Tab ────────────────────────────────────────────────────────────────
// AppCalendarIcon imported from '../src/components/icons'.

function AgeRangePopup({
  visible, ageMin, ageMax, sliderMin, sliderMax, onSave, onDismiss,
}: {
  visible: boolean
  ageMin: number; ageMax: number
  sliderMin: number; sliderMax: number
  onSave: (min: number, max: number) => void
  onDismiss: () => void
}) {
  const insets = useSafeAreaInsets()
  const [fromText, setFromText] = useState(String(ageMin))
  const [toText, setToText] = useState(String(ageMax))
  const [kbHeight, setKbHeight] = useState(0)
  const fromRef = useRef<RNTextInput>(null)
  const toRef = useRef<RNTextInput>(null)

  useEffect(() => {
    if (visible) {
      setFromText(String(ageMin))
      setToText(String(ageMax))
    }
  }, [visible, ageMin, ageMax])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, e => setKbHeight(e.endCoordinates?.height ?? 0))
    const hideSub = Keyboard.addListener(hideEvent, () => setKbHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])

  const handleDismiss = () => {
    const parsedMin = parseInt(fromText, 10)
    const parsedMax = parseInt(toText, 10)
    let nextMin = Number.isFinite(parsedMin) ? parsedMin : ageMin
    let nextMax = Number.isFinite(parsedMax) ? parsedMax : ageMax
    nextMin = Math.max(sliderMin, Math.min(sliderMax, nextMin))
    nextMax = Math.max(sliderMin, Math.min(sliderMax, nextMax))
    if (nextMin > nextMax) { const tmp = nextMin; nextMin = nextMax; nextMax = tmp }
    if (nextMin !== ageMin || nextMax !== ageMax) onSave(nextMin, nextMax)
    onDismiss()
  }

  return (
    <BottomSheet
      visible={visible}
      onDismiss={handleDismiss}
      keyboardAvoiding
      cardWrapStyle={Platform.OS !== 'ios' && kbHeight > 0 ? { marginBottom: kbHeight } : undefined}
      contentStyle={[agePopupStyles.card, { paddingBottom: Math.max(insets.bottom, SINGLE) + SINGLE }]}
    >
      <View style={agePopupStyles.row}>
        <View style={agePopupStyles.field}>
          <Text style={agePopupStyles.fieldLabel}>{t('settings.ageFrom')}</Text>
          <TextInput
            ref={fromRef}
            style={agePopupStyles.input}
            value={fromText}
            onChangeText={v => setFromText(v.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            selectTextOnFocus
            maxLength={2}
            returnKeyType="next"
            onSubmitEditing={() => toRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>
        <View style={agePopupStyles.field}>
          <Text style={agePopupStyles.fieldLabel}>{t('settings.ageTo')}</Text>
          <TextInput
            ref={toRef}
            style={agePopupStyles.input}
            value={toText}
            onChangeText={v => setToText(v.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            selectTextOnFocus
            maxLength={2}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>
      </View>
    </BottomSheet>
  )
}

const agePopupStyles = StyleSheet.create({
  card: {
    paddingHorizontal: DOUBLE,
    paddingTop: 0,
  },
  title: {
    fontSize: TEXT.subhead, fontWeight: WEIGHT.semibold, color: BLACK,
    textAlign: 'center', marginBottom: DOUBLE,
  },
  row: {
    flexDirection: 'row', gap: SINGLE,
    marginTop: SINGLE,
    marginBottom: SINGLE,
  },
  field: {
    flex: 1,
    backgroundColor: BLACK_SOFT,
    borderRadius: RADIUS,
    paddingVertical: SINGLE,
    paddingHorizontal: SINGLE,
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: TEXT.small,
    color: BLACK_STRONG,
  },
  input: {
    fontSize: TEXT.display,
    fontWeight: WEIGHT.bold,
    color: BLACK,
    textAlign: 'center',
    padding: 0,
    minWidth: 60,
  },
})

// ── Radius Popup ───────────────────────────────────────────────────────────
// Bottom-sheet modal: list of radius options, checkmark on the selected one,
// tap fires the server call in the background and closes the sheet immediately.

function RadiusPopup({
  visible, stepCount, initialValue, formatStep, onSelect, onDismiss,
}: {
  visible: boolean
  stepCount: number
  initialValue: number
  formatStep: (i: number) => string
  onSelect: (stepIndex: number) => void
  onDismiss: () => void
}) {
  // Ascending: "Right here" (0) on top, "Unlimited" at the bottom — narrow to broad.
  const items = Array.from({ length: stepCount }, (_, i) => i)
  // The ScrollView's native scroll competes with the sheet's dismiss-pan: while
  // scrolled (scrollY > 0) we want the list to scroll; at the top (scrollY = 0)
  // a downward drag should dismiss the sheet. We track scrollAtTop in a shared
  // value that BottomSheet reads on gesture begin to decide which one wins.
  const scrollGesture = Gesture.Native()
  const scrollAtTop = useSharedValue(true)
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      contentStyle={selectListStyles.card}
      scrollableGesture={scrollGesture}
      scrollAtTop={scrollAtTop}
    >
      <GestureDetector gesture={scrollGesture}>
        <ScrollView
          style={{ maxHeight: Dimensions.get('window').height * 0.6 }}
          bounces={false}
          scrollEventThrottle={16}
          onScroll={e => { scrollAtTop.value = e.nativeEvent.contentOffset.y <= 0 }}
        >
          {items.map((i, idx) => (
            <SelectListRow
              key={i}
              label={formatStep(i)}
              selected={i === initialValue}
              isLast={idx === items.length - 1}
              onPress={() => { onSelect(i); onDismiss() }}
            />
          ))}
        </ScrollView>
      </GestureDetector>
    </BottomSheet>
  )
}

// Single-select row used by RadiusPopup / GenderPopup. Label + check icon
// when selected; full-width tap target; subtle divider between rows.
function SelectListRow({ label, selected, isLast, onPress }: {
  label: string
  selected: boolean
  isLast: boolean
  onPress: () => void
}) {
  const [pressed, setPressed] = useState(false)
  const tapProps = useTapResponder(onPress, setPressed)
  return (
    <View {...tapProps}>
      <View style={[selectListStyles.row, pressed && { backgroundColor: BLACK_SOFT }]}>
        <Text style={[selectListStyles.label, selected && selectListStyles.labelSelected]}>{label}</Text>
        <View style={selectListStyles.checkSlot}>
          {selected ? <CheckIcon color={PRIMARY} /> : null}
        </View>
      </View>
      {!isLast ? <View style={selectListStyles.divider} /> : null}
    </View>
  )
}

const selectListStyles = StyleSheet.create({
  card: { padding: 0, paddingTop: 0, paddingBottom: QUAD },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: BUTTON, paddingHorizontal: DOUBLE,
  },
  label: { flex: 1, fontSize: TEXT.input, color: BLACK },
  labelSelected: { color: PRIMARY, fontWeight: WEIGHT.semibold },
  checkSlot: { width: ICON.xl, height: ICON.xl, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BLACK_SOFT, marginHorizontal: DOUBLE },
})

// ── Gender Popup ───────────────────────────────────────────────────────────
// Bottom-sheet modal: 3-option list (Men / Women / Both) with a checkmark on
// the selected row. Tap fires the server call in the background and closes
// the sheet immediately.

function GenderPopup({
  visible, initialForMale, initialForFemale, onSelect, onDismiss,
}: {
  visible: boolean
  initialForMale: boolean
  initialForFemale: boolean
  onSelect: (forMale: boolean, forFemale: boolean) => void
  onDismiss: () => void
}) {
  const current: 'M' | 'F' | 'B' =
    initialForMale && initialForFemale ? 'B' : initialForMale ? 'M' : 'F'
  const options: { key: 'M' | 'F' | 'B'; label: string; forMale: boolean; forFemale: boolean }[] = [
    { key: 'M', label: t('settings.genderM'), forMale: true, forFemale: false },
    { key: 'F', label: t('settings.genderF'), forMale: false, forFemale: true },
    { key: 'B', label: t('settings.genderBoth'), forMale: true, forFemale: true },
  ]
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} contentStyle={selectListStyles.card}>
      {options.map((opt, idx) => (
        <SelectListRow
          key={opt.key}
          label={opt.label}
          selected={opt.key === current}
          isLast={idx === options.length - 1}
          onPress={() => { onSelect(opt.forMale, opt.forFemale); onDismiss() }}
        />
      ))}
    </BottomSheet>
  )
}

// ── Option Popup (single-select) ───────────────────────────────────────────
// Generic single-select bottom sheet for one-of-N pickers.

function ageLabel(n: number): string {
  if (n <= 0) return t('family.ageUnder1')
  if (n === 1) return t('family.ageOne')
  if (n === 2) return t('family.ageTwo')
  return t('family.ageYears').replace('{n}', String(n))
}

function FamilyToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const trackBg = value ? PRIMARY : BLACK_SOFT
  // Knob travel = track width 48 - knob width 24 - padding 4 = 20px.
  // In RTL the knob's natural layout position is the right edge (start), so
  // ON sits at 0 translateX and OFF sits at -20 (visually pushed to the left
  // end). translateX is not auto-flipped in RTL — only layout is.
  const knobX = isRTL ? (value ? 0 : -20) : (value ? 20 : 0)
  return (
    <Pressable
      style={familyStyles.toggleRow}
      onPress={() => { tap(); onValueChange(!value) }}
    >
      <Text style={familyStyles.toggleLabel}>{label}</Text>
      <View style={[familyStyles.toggleTrack, { backgroundColor: trackBg }]}>
        <View style={[familyStyles.toggleKnob, { transform: [{ translateX: knobX }] }]} />
      </View>
    </Pressable>
  )
}

// Yes / No pills with deselect-to-undecided. Both unselected = null (undecided).
function FamilyTriOptionRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
}) {
  const options: { v: boolean; key: string }[] = [
    { v: true, key: 'family.isForKidsYes' },
    { v: false, key: 'family.isForKidsNo' },
  ]
  return (
    <View style={familyStyles.toggleRow}>
      <Text style={familyStyles.toggleLabel}>{label}</Text>
      <View style={familyStyles.triOptionPills}>
        {options.map(opt => {
          const selected = value === opt.v
          return (
            <Pressable
              key={String(opt.v)}
              style={[familyStyles.triOptionPill, selected && familyStyles.triOptionPillSelected]}
              onPress={() => { tap(); onChange(selected ? null : opt.v) }}
            >
              <Text style={[familyStyles.triOptionPillLabel, selected && familyStyles.triOptionPillLabelSelected]}>
                {t(opt.key as never)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// Day-cell date label uses the OS locale (not the UI language) so a Hebrew UI
// on a US device still reads month/day, and an English UI in Israel still reads
// day/month — matches the date-format the user is used to elsewhere on their
// phone. Built once at module load; locale doesn't change at runtime.
const dayMonthFormatter = new Intl.DateTimeFormat(
  getLocales()[0]?.languageTag ?? 'en-US',
  { month: 'numeric', day: 'numeric' },
)

function FamilyDayCell({
  letter, date, selected, weekend, onPress,
}: {
  letter: string
  date: Date
  selected: boolean
  weekend: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={familyStyles.dayCell} onPress={() => { tap(); onPress() }}>
      <View style={[
        familyStyles.dayBubble,
        weekend && !selected && familyStyles.dayBubbleWeekend,
        selected && familyStyles.dayBubbleSelected,
      ]}>
        <Text style={[
          familyStyles.dayLetter,
          weekend && !selected && familyStyles.dayLetterWeekend,
          selected && familyStyles.dayLetterSelected,
        ]}>{letter}</Text>
      </View>
      <Text style={familyStyles.dayDate}>{dayMonthFormatter.format(date)}</Text>
    </Pressable>
  )
}

const FAMILY_AGE_MAX = 25

// Inline picker triggered from a dropdown row. Stacks above the family sheet
// using its own Modal, dismisses by tap-outside or selection.
function FamilyValuePopup({
  visible, title, options, selected, onPick, onDismiss,
}: {
  visible: boolean
  title: string
  options: { value: number; label: string }[]
  selected: number | null
  onPick: (value: number) => void
  onDismiss: () => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      contentStyle={[familyStyles.valuePopupCard, { paddingBottom: Math.max(insets.bottom, SINGLE) }]}
    >
      <Text style={familyStyles.valuePopupTitle}>{title}</Text>
      <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
        {options.map(opt => {
          const isSelected = selected === opt.value
          return (
            <Pressable
              key={opt.value}
              style={familyStyles.valueRow}
              onPress={() => { tap(); onPick(opt.value) }}
            >
              <Text style={[familyStyles.valueRowLabel, isSelected && familyStyles.valueRowLabelSelected]}>
                {opt.label}
              </Text>
              {isSelected ? <Text style={familyStyles.valueRowCheck}>✓</Text> : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </BottomSheet>
  )
}

export function FamilyKidsPopup({
  visible, initial, initialIsForKids, saving, weekStart, isMale, onDismiss, onSave,
}: {
  visible: boolean
  initial: FamilyData | null
  initialIsForKids: boolean | null
  saving: boolean
  weekStart: number
  isMale: boolean | null
  onDismiss: () => void
  onSave: (data: FamilyData, isForKids: boolean | null) => void
}) {
  const insets = useSafeAreaInsets()
  const screenH = useRef(Dimensions.get('window').height).current
  const sheetMaxH = Math.round(screenH * 0.88)

  // Form state
  const [hasKids, setHasKids] = useState<boolean>(false)
  const [isForKids, setIsForKids] = useState<boolean | null>(null)
  // List of kid entries; count is implicitly `kids.length`. Each kid carries
  // an optional age — clearable.
  const [kids, setKids] = useState<FamilyKid[]>([])
  const [weeks, setWeeks] = useState<boolean[][]>([])

  // Picker state for the inline age dropdown. `target` indicates which kid's
  // age picker is open (by index). The picker also includes a "Not set"
  // option so the age can be cleared.
  const [pickerTarget, setPickerTarget] = useState<{ kind: 'age'; index: number } | null>(null)

  // Seed the form on the closed→open transition only. We deliberately do NOT
  // re-seed when `initial` / `initialIsForKids` change later — the user's
  // profile can update via Realtime mid-edit, and re-seeding would overwrite
  // their in-progress edits. The latest values are read through refs so the
  // open-time snapshot is always current.
  const initialRef = useRef(initial)
  const initialIsForKidsRef = useRef(initialIsForKids)
  initialRef.current = initial
  initialIsForKidsRef.current = initialIsForKids
  useEffect(() => {
    if (!visible) return
    const seed = initialRef.current
    setHasKids(seed?.hasKids ?? false)
    setIsForKids(initialIsForKidsRef.current ?? null)
    setKids(seed?.kids ?? [])
    const initWeeks = seed?.schedule?.weeks ?? []
    setWeeks(initWeeks.length > 0 ? initWeeks : [familyEmptyWeek()])
    setPickerTarget(null)
  }, [visible])

  // When user switches to "no kids", clear all dependent fields. When they
  // switch back on, ensure at least one (empty) week is present so the
  // schedule UI shows Week 1 inline.
  useEffect(() => {
    if (!hasKids) {
      setKids([])
      setWeeks([])
    } else {
      setWeeks(prev => prev.length > 0 ? prev : [familyEmptyWeek()])
    }
  }, [hasKids])

  // Schedule helpers
  // Display week starts at the user's preferred weekday; the underlying data
  // is always indexed Sunday=0..Saturday=6, so column C maps to absolute
  // weekday `(weekStart + C) % 7`.
  // "Now" snapshot: refreshed on every popup-open transition (and on
  // weekStart change). Without this the displayed dates and the saved
  // schedule.anchor would freeze to whenever the popup first mounted —
  // visible as stale dates if the app stays open across weeks.
  const [nowEpoch, setNowEpoch] = useState(() => Date.now())
  useEffect(() => { if (visible) setNowEpoch(Date.now()) }, [visible])
  const todayDisplayedStart = useMemo(
    () => startOfDisplayedWeek(new Date(nowEpoch), weekStart),
    [weekStart, nowEpoch],
  )
  const todaySundayStart = useMemo(() => sundayOfWeek(new Date(nowEpoch)), [nowEpoch])
  const weekendSet = useMemo(() => new Set(weekendDays(lang)), [])
  const absWeekdayForCol = (col: number) => (weekStart + col) % 7
  const dateForCell = (weekIdx: number, col: number) => {
    const d = new Date(todayDisplayedStart)
    d.setDate(d.getDate() + weekIdx * 7 + col)
    return d
  }
  const dayLetterForCol = (col: number) =>
    t(`family.dayShort.${absWeekdayForCol(col)}` as never)
  const isCellSelected = (wi: number, col: number) =>
    !!weeks[wi]?.[absWeekdayForCol(col)]

  const canAddAnotherWeek = weeks.length > 0 && weeks.length < FAMILY_MAX_WEEKS

  const addWeek = () => setWeeks(w => [...w, familyEmptyWeek()])
  const removeWeek = (i: number) => {
    setWeeks(w => w.filter((_, idx) => idx !== i))
  }
  const toggleCell = (wi: number, col: number) => {
    const absIdx = absWeekdayForCol(col)
    setWeeks(w => {
      const next = w.map(row => [...row])
      next[wi][absIdx] = !next[wi][absIdx]
      return next
    })
  }

  // Kids list helpers
  const addKid = () => {
    if (kids.length >= FAMILY_MAX_KIDS) return
    setKids(prev => [...prev, {}])
  }
  const removeKidAt = (index: number) => {
    setKids(prev => prev.filter((_, i) => i !== index))
  }
  const setKidAge = (index: number, age: number | undefined) => {
    setKids(prev => prev.map((k, i) => i === index ? { ...k, age } : k))
  }

  // Picker options. The first option is a "Not set" sentinel that clears
  // the kid's age; selecting it sets the kid's age back to undefined.
  const AGE_CLEAR = -1
  const ageOptions = useMemo(() => [
    { value: AGE_CLEAR, label: t('family.ageNotSet') },
    ...Array.from({ length: FAMILY_AGE_MAX + 1 }, (_, i) => ({
      value: i,
      label: ageLabel(i),
    })),
  ], [])

  // Composed family data + dirty / save gating
  const current: FamilyData = useMemo(() => {
    if (!hasKids) return { hasKids: false }
    const cleanWeeks = weeks.filter(w => w.some(d => d))
    const schedule = cleanWeeks.length > 0
      ? { weeks: cleanWeeks, anchor: toISODate(todaySundayStart) }
      : undefined
    return {
      hasKids: true,
      kids: kids.length > 0 ? kids.slice() : undefined,
      schedule,
    }
  }, [hasKids, kids, weeks, todaySundayStart])

  const dirty = !familyEqual(current, initial) || isForKids !== (initialIsForKids ?? null)
  const canSave = dirty && !saving

  const handleSavePress = () => { if (canSave) onSave(current, isForKids) }
  const onPickerDismiss = () => setPickerTarget(null)
  const onPickerPick = (value: number) => {
    if (!pickerTarget) return
    setKidAge(pickerTarget.index, value === AGE_CLEAR ? undefined : value)
    setPickerTarget(null)
  }

  const pickerTitle = !pickerTarget
    ? ''
    : t('family.kidLabel').replace('{n}', String(pickerTarget.index + 1))
  const pickerOptions = ageOptions
  const pickerSelected = !pickerTarget
    ? null
    : kids[pickerTarget.index]?.age ?? AGE_CLEAR

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      disableBackdropDismiss={saving}
      cardWrapStyle={{ maxHeight: sheetMaxH }}
      contentStyle={familyStyles.sheet}
    >
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={familyStyles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Has kids? — single toggle row. No section marginBottom so
                    it sits flush against the kids/schedule wrapper (and, when
                    hasKids is off, against the static "Interested in kids"
                    row below). */}
                <View>
                  <FamilyToggleRow
                    label={t('family.hasKidsYes')}
                    value={hasKids}
                    onValueChange={setHasKids}
                  />
                </View>

                {hasKids && (
                  <View style={familyStyles.section}>
                    {/* Kid age chips, directly under the toggle. Each chip is
                        the kid's age (or placeholder); tapping the chip body
                        opens the age picker; the × removes the kid. The last
                        item is a dashed "+ Add kid" chip. */}
                    <View style={familyStyles.kidChipsRow}>
                      {kids.map((kid, i) => (
                        <View key={i} style={familyStyles.kidChip}>
                          <Pressable
                            style={familyStyles.kidChipMain}
                            onPress={() => { tap(); setPickerTarget({ kind: 'age', index: i }) }}
                          >
                            <Text style={kid.age != null ? familyStyles.kidChipLabel : familyStyles.kidChipPlaceholder}>
                              {kid.age != null ? ageLabel(kid.age) : t('family.agePlaceholder')}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => { tapWarning(); removeKidAt(i) }}
                            hitSlop={8}
                            style={familyStyles.kidChipRemoveBtn}
                          >
                            <Text style={familyStyles.kidChipRemoveLabel}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                      {kids.length < FAMILY_MAX_KIDS && (
                        <Pressable
                          style={familyStyles.kidChipAdd}
                          onPress={() => { tap(); addKid() }}
                        >
                          <Text style={familyStyles.kidChipAddLabel}>+ {t('family.addKid')}</Text>
                        </Pressable>
                      )}
                    </View>

                    {/* Schedule. Title + weeks render inline; no collapsible
                        gray card. Week 1 is always present, Add-week appears
                        once Week N has at least one day selected. */}
                    <View style={familyStyles.scheduleWrap}>
                      {weeks.map((_wk, wi) => (
                        <View key={wi}>
                          {wi === 0 && (
                            <View style={familyStyles.weekHeader}>
                              <Text style={familyStyles.weekLabel}>
                                {t('family.scheduleWeek1LabelPrefix')}{' '}
                                <Text style={familyStyles.weekLabelEmphasis}>{t('family.scheduleWeek1LabelEmphasis')}</Text>
                                {t('family.scheduleWeek1LabelSuffix')}
                              </Text>
                              <Text style={familyStyles.weekHint}>{tg('family.scheduleWeek1Hint', isMale)}</Text>
                            </View>
                          )}
                          <View style={familyStyles.daysRow}>
                            {[0, 1, 2, 3, 4, 5, 6].map(col => {
                              const d = dateForCell(wi, col)
                              return (
                                <FamilyDayCell
                                  key={col}
                                  letter={dayLetterForCol(col)}
                                  date={d}
                                  selected={isCellSelected(wi, col)}
                                  weekend={weekendSet.has(absWeekdayForCol(col))}
                                  onPress={() => toggleCell(wi, col)}
                                />
                              )
                            })}
                          </View>
                          {wi > 0 && (
                            <View style={familyStyles.weekFooter}>
                              <Pressable onPress={() => { tap(); removeWeek(wi) }}>
                                <Text style={familyStyles.weekRemove}>{t('family.removeWeek')}</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      ))}
                      {canAddAnotherWeek && (
                        <Pressable onPress={() => { tap(); addWeek() }} style={familyStyles.addKidBtn}>
                          <Text style={familyStyles.addKidLabel}>+ {t('family.addWeek')}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Static bottom area: "Interested in kids" tri-option (yes/no/undecided) + Save button. */}
              <View style={familyStyles.interestedBar}>
                <FamilyTriOptionRow
                  label={tg(hasKids ? 'family.isForKidsMore' : 'family.isForKids', isMale)}
                  value={isForKids}
                  onChange={setIsForKids}
                />
              </View>

              <View style={[familyStyles.saveBar, { paddingBottom: Math.max(insets.bottom, SINGLE) }]}>
                <Button
                  label={t('settings.save')}
                  onPress={handleSavePress}
                  disabled={!canSave}
                  loading={saving}
                  variant="primary"
                  tone="positive"
                  size="lg"
                />
              </View>

      <FamilyValuePopup
        visible={pickerTarget != null}
        title={pickerTitle}
        options={pickerOptions}
        selected={pickerSelected}
        onPick={onPickerPick}
        onDismiss={onPickerDismiss}
      />
    </BottomSheet>
  )
}

const familyStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  shadowGradient: { height: 60, marginBottom: -1 },
  shadowLayer: { flex: 1, backgroundColor: BLACK },
  gestureWrap: { flexShrink: 1 },
  sheet: {
    backgroundColor: WHITE,
    paddingTop: RADIUS,
    paddingHorizontal: SINGLE,
    flexShrink: 1,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: BLACK_SOFT,
    marginBottom: 12,
  },
  scrollContent: { paddingTop: SINGLE, paddingBottom: SINGLE },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  toggleLabel: { fontSize: 16, color: BLACK },
  toggleTrack: {
    width: 48, height: 28, borderRadius: 14,
    padding: 2, justifyContent: 'center',
  },
  toggleKnob: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: WHITE,
    shadowColor: BLACK, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2, elevation: 2,
  },
  section: { marginBottom: DOUBLE },
  subSection: {},
  sectionTitle: { fontSize: 15, color: BLACK, marginBottom: 10 },
  subSectionTitle: { fontSize: 14, color: BLACK },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionHint: { fontSize: 12, color: BLACK_STRONG, marginTop: 2, marginBottom: 12 },
  optional: { fontSize: 12, color: BLACK_STRONG },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: BLACK_SOFT },
  pillSelected: { backgroundColor: PRIMARY },
  pillLabel: { fontSize: 14, color: BLACK },
  pillLabelSelected: { color: WHITE },
  sectionPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: PRIMARY_BG,
  },
  sectionPillDestructive: { backgroundColor: DESTRUCTIVE_BG },
  sectionPillLabel: { fontSize: 13, color: PRIMARY },
  sectionPillLabelDestructive: { color: DESTRUCTIVE },
  card: {
    backgroundColor: BLACK_SOFT,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  cardRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BLACK_SOFT },
  cardRowDividerLast: { borderBottomWidth: 0 },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14,
  },
  dropdownLabel: { fontSize: 14, color: BLACK },
  dropdownValue: { fontSize: 14, color: PRIMARY },
  dropdownPlaceholder: { fontSize: 14, color: BLACK_STRONG },

  // "Days with kids" schedule. Title + weeks render inline with the rest of
  // the form (no enclosing card). Title sits flush, weeks gap below.
  scheduleWrap: { marginTop: SINGLE, paddingHorizontal: 14, gap: 12 },

  // Kid age chips. Each chip is a pill split into a tappable label area
  // (opens age picker) and an × remove button. Wraps to multiple rows.
  kidChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, marginTop: 4 },
  kidChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 999, backgroundColor: BLACK_SOFT,
    paddingStart: 14, paddingEnd: 6,
  },
  kidChipMain: { paddingVertical: 8 },
  kidChipLabel: { fontSize: 14, color: PRIMARY },
  kidChipPlaceholder: { fontSize: 14, color: BLACK_STRONG },
  kidChipRemoveBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  kidChipRemoveLabel: { fontSize: 18, color: BLACK_STRONG, lineHeight: 18 },
  kidChipAdd: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5, borderColor: BLACK_SOFT, borderStyle: 'dashed',
  },
  kidChipAddLabel: { fontSize: 14, color: PRIMARY },

  // + Add kid / + Add week button.
  addKidBtn: { paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS, borderWidth: 1.5, borderColor: BLACK_SOFT, borderStyle: 'dashed' },
  addKidLabel: { fontSize: 14, color: PRIMARY },

  weekHeader: { marginBottom: 12, gap: 4 },
  weekFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  weekLabel: { fontSize: 13, color: BLACK },
  weekLabelEmphasis: { fontWeight: '700' },
  weekHint: { fontSize: 12, color: BLACK_STRONG },
  weekRemove: { fontSize: 13, color: DESTRUCTIVE },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: { alignItems: 'center', justifyContent: 'flex-start', gap: 4 },
  dayBubble: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: WHITE, borderWidth: 1.5, borderColor: BLACK_SOFT,
  },
  dayBubbleSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  // Weekend cells (locale-defined: Fri+Sat for he/ar, Sat+Sun otherwise)
  // get a tinted bubble + primary-colored letter when not selected, so the
  // user can orient themselves visually toward their weekend without reading.
  dayBubbleWeekend: { backgroundColor: PRIMARY_BG, borderColor: PRIMARY_BG },
  dayLetterWeekend: { color: PRIMARY },
  dayLetter: { fontSize: 13, color: BLACK },
  dayLetterSelected: { color: WHITE },
  dayDate: { fontSize: 11, color: BLACK_STRONG },
  addWeekBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: RADIUS, borderWidth: 1.5, borderColor: BLACK_SOFT, borderStyle: 'dashed' },
  addWeekLabel: { fontSize: 14, color: PRIMARY },
  // Static bottom strip housing the "Interested in kids" toggle. Sits below
  // the sheet's ScrollView so the gray cards expanding/collapsing inside
  // don't push it around. WHITE bg + same horizontal padding as the sheet
  // so the popup reads as one continuous surface.
  interestedBar: { backgroundColor: WHITE, paddingHorizontal: SINGLE },
  // Pinned at the popup bottom (sibling of the sheet). Anchored via the
  // overlay's flex-end so it stays at the screen bottom regardless of the
  // sheet's content size. WHITE bg merges with the sheet above visually.
  saveBar: { paddingTop: SINGLE, paddingHorizontal: SINGLE, backgroundColor: WHITE },

  // Inline picker (count / age) sheet
  valuePopupOverlay: { flex: 1, justifyContent: 'flex-end' },
  valuePopupCard: {
    backgroundColor: WHITE,
    paddingTop: RADIUS, paddingHorizontal: SINGLE,
  },
  valuePopupTitle: {
    fontSize: 17, fontWeight: '700', color: BLACK,
    textAlign: 'center', marginBottom: SINGLE,
  },
  valueRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BLACK_SOFT,
  },
  valueRowLabel: { fontSize: 16, color: BLACK },
  valueRowLabelSelected: { color: PRIMARY, fontWeight: '700' },
  valueRowCheck: { fontSize: 16, color: PRIMARY, fontWeight: '700' },
  triOptionPills: { flexDirection: 'row', gap: 6 },
  triOptionPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: BLACK_SOFT },
  triOptionPillSelected: { backgroundColor: PRIMARY },
  triOptionPillLabel: { fontSize: 13, color: BLACK },
  triOptionPillLabelSelected: { color: WHITE },
})

// ── Bio edit popup ──────────────────────────────────────────────────────────
// Bottom sheet shown when the user taps the bio bubble on their own profile
// preview. Reuses the same TextInput look from the onboarding bio step
// (gray pill, centered text, bottom-right counter, character-min hint), with
// a Save button anchored below.

const BIO_MAX = 150
const BIO_MIN = 20

export function BioEditPopup({
  visible, initial, saving, onDismiss, onSave,
}: {
  visible: boolean
  initial: string
  saving: boolean
  onDismiss: () => void
  onSave: (value: string) => void
}) {
  const insets = useSafeAreaInsets()
  const screenH = useRef(Dimensions.get('window').height).current
  const sheetMaxH = Math.round(screenH * 0.88)

  const [bio, setBio] = useState(initial)
  const [kbHeight, setKbHeight] = useState(0)
  const inputRef = useRef<RNTextInput>(null)

  useEffect(() => {
    if (!visible) return
    setBio(initial)
    // Match the onboarding step's auto-focus once the sheet has settled.
    const id = setTimeout(() => inputRef.current?.focus(), 280)
    return () => clearTimeout(id)
  }, [visible, initial])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, e => setKbHeight(e.endCoordinates?.height ?? 0))
    const hideSub = Keyboard.addListener(hideEvent, () => setKbHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])

  const trimmed = bio.trim().length
  const remaining = BIO_MAX - bio.length
  const belowMin = trimmed < BIO_MIN
  const valid = !belowMin
  const dirty = bio.trim() !== initial.trim()
  const canSave = valid && dirty && !saving

  const handleSavePress = () => {
    if (!canSave) return
    onSave(bio.trim().replace(/\n{3,}/g, '\n\n'))
  }

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      disableBackdropDismiss={saving}
      keyboardAvoiding
      cardWrapStyle={[
        { maxHeight: sheetMaxH },
        Platform.OS !== 'ios' && kbHeight > 0 ? { marginBottom: kbHeight } : undefined,
      ]}
      contentStyle={bioPopupStyles.sheet}
    >
      <ScrollView
        style={{ flexShrink: 1 }}
        contentContainerStyle={bioPopupStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={bioPopupStyles.field}>
          <TextInput
            ref={inputRef}
            style={bioPopupStyles.input}
            value={bio}
            onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
            multiline
            textAlignVertical="top"
            placeholder={t('bio.placeholder')}
            placeholderTextColor={BLACK_MID}
            editable={!saving}
          />
          <Text style={[bioPopupStyles.counter, !belowMin && remaining < 20 && bioPopupStyles.counterWarn]}>
            {belowMin ? t('bio.min') : remaining}
          </Text>
        </View>
        <Text style={bioPopupStyles.tip}>{t('bio.tip')}</Text>
      </ScrollView>

      <View style={[bioPopupStyles.saveBar, { paddingBottom: kbHeight > 0 ? SINGLE * 4 : Math.max(insets.bottom, SINGLE) }]}>
        <Button
          label={t('settings.save')}
          onPress={handleSavePress}
          disabled={!canSave}
          loading={saving}
          variant="primary"
          tone="positive"
          size="lg"
        />
      </View>
    </BottomSheet>
  )
}

const bioPopupStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  shadowGradient: { height: 60, marginBottom: -1 },
  shadowLayer: { flex: 1, backgroundColor: BLACK },
  sheet: {
    backgroundColor: WHITE,
    paddingTop: RADIUS,
    paddingHorizontal: SINGLE,
    flexShrink: 1,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: BLACK_SOFT,
    marginBottom: 12,
  },
  scrollContent: { paddingTop: SINGLE, paddingBottom: SINGLE },
  field: {
    backgroundColor: BLACK_SOFT,
    borderRadius: RADIUS,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    minHeight: 140,
  },
  input: {
    fontSize: 16,
    color: BLACK,
    padding: 0,
    minHeight: 96,
    textAlign: 'center',
  },
  counter: {
    position: 'absolute',
    end: 12,
    bottom: 8,
    fontSize: 12,
    color: BLACK_STRONG,
  },
  counterWarn: { color: DESTRUCTIVE },
  tip: {
    marginTop: 14,
    fontSize: 13,
    color: BLACK_STRONG,
    textAlign: 'center',
  },
  saveBar: { paddingTop: SINGLE, paddingHorizontal: 0 },
})

// ── Photo edit popup ────────────────────────────────────────────────────────
// Bottom sheet shown when the user taps a photo on their own profile preview.
// Lays out four actions in a 2-row grid: Move up / Move down on top, then a
// full-width Replace, then a destructive-tinted Delete. Up/Down are disabled
// at the photo-list boundaries.

// ChevronUpIcon, ChevronDownIcon, PhotoReplaceIcon, PhotoTrashIcon imported
// from '../src/components/icons'.

function PhotoOptionsPopup({
  visible, canMoveUp, canMoveDown, onDismiss, onMoveUp, onMoveDown, onReplace, onDelete,
}: {
  visible: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onDismiss: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onReplace: () => void
  onDelete: () => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      contentStyle={[photoOptionsStyles.sheet, { paddingBottom: Math.max(insets.bottom, SINGLE) + SINGLE }]}
    >
      <View style={photoOptionsStyles.row}>
        <Pressable
          style={[photoOptionsStyles.tile, !canMoveUp && photoOptionsStyles.tileDisabled]}
          onPress={() => { if (canMoveUp) { tap(); onMoveUp() } }}
        >
          <ChevronUpIcon color={canMoveUp ? BLACK : BLACK_STRONG} />
          <Text style={[photoOptionsStyles.tileLabel, !canMoveUp && photoOptionsStyles.tileLabelDisabled]}>
            {t('settings.photoEditMoveUp')}
          </Text>
        </Pressable>
        <Pressable
          style={[photoOptionsStyles.tile, !canMoveDown && photoOptionsStyles.tileDisabled]}
          onPress={() => { if (canMoveDown) { tap(); onMoveDown() } }}
        >
          <ChevronDownIcon color={canMoveDown ? BLACK : BLACK_STRONG} />
          <Text style={[photoOptionsStyles.tileLabel, !canMoveDown && photoOptionsStyles.tileLabelDisabled]}>
            {t('settings.photoEditMoveDown')}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={photoOptionsStyles.fullRow}
        onPress={() => { tap(); onReplace() }}
      >
        <PhotoReplaceIcon color={BLACK} />
        <Text style={photoOptionsStyles.fullRowLabel}>{t('settings.photoEditReplace')}</Text>
      </Pressable>

      <Pressable
        style={[photoOptionsStyles.fullRow, photoOptionsStyles.destructiveRow]}
        onPress={() => { tapWarning(); onDelete() }}
      >
        <PhotoTrashIcon color={DESTRUCTIVE} />
        <Text style={[photoOptionsStyles.fullRowLabel, photoOptionsStyles.destructiveLabel]}>
          {t('settings.photoEditDelete')}
        </Text>
      </Pressable>
    </BottomSheet>
  )
}

const photoOptionsStyles = StyleSheet.create({
  sheet: {
    paddingHorizontal: SINGLE,
  },
  row: {
    flexDirection: 'row',
    gap: SINGLE,
    marginBottom: SINGLE,
  },
  tile: {
    flex: 1,
    backgroundColor: BLACK_SOFT,
    borderRadius: RADIUS,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileDisabled: {
    opacity: 0.5,
  },
  tileLabel: {
    fontSize: 14, fontWeight: '600', color: BLACK,
  },
  tileLabelDisabled: {
    color: BLACK_STRONG,
  },
  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLACK_SOFT,
    borderRadius: RADIUS,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
    marginBottom: SINGLE,
  },
  fullRowLabel: {
    fontSize: 16, fontWeight: '600', color: BLACK,
  },
  destructiveRow: {
    backgroundColor: DESTRUCTIVE_BG,
  },
  destructiveLabel: {
    color: DESTRUCTIVE,
  },
})

// Full-screen pane showing the user's profile card preview, opened from the
// profile tab via the sub-page mechanism.

export function PreviewFieldPage({
  config, onBack, dismissGestureRef, onScrollAtTop, headerBottomShared, clipBottom: _clipBottom,
}: {
  config: PreviewFieldConfig
  onBack: () => void
  dismissGestureRef?: React.MutableRefObject<GestureType | undefined>
  onScrollAtTop?: (atTop: boolean) => void
  headerBottomShared?: SharedValue<number>
  clipBottom?: boolean
}) {
  const insets = useSafeAreaInsets()
  const { profile, update } = useUserStore()
  const { user } = useAuthStore()
  const [photoPopupImageIndex, setPhotoPopupImageIndex] = useState<number | null>(null)
  const [familyPopupVisible, setFamilyPopupVisible] = useState(false)
  const [familySaving, setFamilySaving] = useState(false)
  const [bioPopupVisible, setBioPopupVisible] = useState(false)
  const [bioSaving, setBioSaving] = useState(false)
  // Tracks deferred uploads in flight so persistImages can await them before
  // invoking app/profile (preventing the server from receiving a filename
  // whose upload has not yet landed in storage).
  const inFlightUploads = useRef(new Set<Promise<unknown>>())

  // Auto-save: every photo edit (move / delete / add / replace) calls this.
  // Awaits any in-flight deferred upload, then PATCHes the latest images list.
  // Concurrent calls are fine: each reads the latest store state at flush time
  // and the server is idempotent.
  const persistImages = async () => {
    try {
      if (inFlightUploads.current.size > 0) {
        await Promise.all(Array.from(inFlightUploads.current))
      }
      const finalImages = useUserStore.getState().profile?.images ?? []
      await invoke('app/profile', { images: finalImages })
    } catch (e) {
      console.error('Save images error:', e)
    }
  }

  const pullCtx = useMemo<PullCtx | null>(() => dismissGestureRef ? {
    panRef: dismissGestureRef,
    extraRefs: [],
    setScrollAtTop: onScrollAtTop ?? (() => {}),
    pulling: false,
  } : null, [dismissGestureRef, onScrollAtTop])

  const previewData: Profile | null = useMemo(() => {
    if (!profile) return null
    const userId = user?.id ?? profile.user_id
    const images = (profile.images ?? []).map(img => ({
      normal: img.normal
        ? (localPhotoUriCache.get(img.normal) ?? `${SUPABASE_URL}/storage/v1/object/public/users/${userId}/normal/${img.normal}`)
        : undefined,
      hash: img.hash,
    }))
    const name = profile.name ?? '—'
    let age: number | null = null
    if (profile.birth_date) {
      const birth = new Date(profile.birth_date)
      const now = new Date()
      age = now.getFullYear() - birth.getFullYear()
      const m = now.getMonth() - birth.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    }
    const title = age != null ? `${name}, ${age}` : name
    return {
      user_id: profile.user_id,
      title,
      name,
      images,
      bio: profile.bio ?? '',
      family: profile.family ?? null,
      is_male: profile.is_male ?? undefined,
      distance: 0,
      last_seen: new Date().toISOString(),
    }
  }, [profile, user?.id])

  const photoCount = profile?.images?.length ?? 0
  const photoAddEnabled = photoCount < 6
  const familyAddEnabled = profile?.family == null
  const canMoveUp = photoPopupImageIndex != null && photoPopupImageIndex > 0
  const canMoveDown = photoPopupImageIndex != null && photoPopupImageIndex < photoCount - 1

  const swapImages = (a: number, b: number) => {
    const images = profile?.images
    if (!images || a < 0 || b < 0 || a >= images.length || b >= images.length) return
    const next = [...images]
    ;[next[a], next[b]] = [next[b], next[a]]
    update({ images: next })
    persistImages()
  }

  const handleMoveUp = () => {
    if (photoPopupImageIndex == null || photoPopupImageIndex <= 0) return
    const from = photoPopupImageIndex
    setPhotoPopupImageIndex(null)
    swapImages(from, from - 1)
  }

  const handleMoveDown = () => {
    if (photoPopupImageIndex == null || photoPopupImageIndex >= photoCount - 1) return
    const from = photoPopupImageIndex
    setPhotoPopupImageIndex(null)
    swapImages(from, from + 1)
  }

  const handleDelete = () => {
    if (photoPopupImageIndex == null || !profile?.images) return
    if (photoCount <= 1) {
      setPhotoPopupImageIndex(null)
      return
    }
    const target = profile.images[photoPopupImageIndex]
    const filename = target?.normal
    const idx = photoPopupImageIndex
    setPhotoPopupImageIndex(null)
    if (filename) {
      localPhotoUriCache.delete(filename)
      pendingDeferred.delete(filename)
    }
    update({ images: profile.images.filter((_, i) => i !== idx) })
    persistImages()
  }

  // Pick a new photo and append it to images. The new photo appears
  // immediately (primed in localPhotoUriCache) while compression + upload run
  // in the background. persistImages() awaits the in-flight upload before
  // invoking app/profile.
  const handleAddPhoto = async () => {
    if (!user || !profile) return
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]

    const userId = user.id
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    const { filename, uploaded } = processAndUploadPhotoDeferred(asset.uri, userId, token)

    const current = useUserStore.getState().profile
    if (current) {
      useUserStore.getState().update({ images: [...current.images, { normal: filename, hash: '' }] })
    }

    const tracker = uploaded
      .then(hash => {
        const latest = useUserStore.getState().profile
        if (!latest) return
        const idx = latest.images.findIndex(img => img.normal === filename)
        if (idx < 0) return
        const next = [...latest.images]
        next[idx] = { normal: filename, hash }
        useUserStore.getState().update({ images: next })
      })
      .catch(e => {
        console.error('Photo add upload error:', e)
        const latest = useUserStore.getState().profile
        if (!latest) return
        useUserStore.getState().update({ images: latest.images.filter(img => img.normal !== filename) })
      })
    inFlightUploads.current.add(tracker)
    tracker.finally(() => inFlightUploads.current.delete(tracker))
    persistImages()
  }

  const handleReplace = async () => {
    if (photoPopupImageIndex == null || !user || !profile?.images) return
    const targetIndex = photoPopupImageIndex
    setPhotoPopupImageIndex(null)
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]

    const userId = user.id
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    const { filename, uploaded } = processAndUploadPhotoDeferred(asset.uri, userId, token)

    const current = useUserStore.getState().profile
    if (current?.images) {
      const oldFilename = current.images[targetIndex]?.normal
      const next = [...current.images]
      next[targetIndex] = { normal: filename, hash: '' }
      if (oldFilename) {
        localPhotoUriCache.delete(oldFilename)
        pendingDeferred.delete(oldFilename)
      }
      useUserStore.getState().update({ images: next })
    }

    const tracker = uploaded
      .then(hash => {
        const latest = useUserStore.getState().profile
        if (!latest) return
        const idx = latest.images.findIndex(img => img.normal === filename)
        if (idx < 0) return
        const next = [...latest.images]
        next[idx] = { normal: filename, hash }
        useUserStore.getState().update({ images: next })
      })
      .catch(e => {
        console.error('Photo replace upload error:', e)
        const latest = useUserStore.getState().profile
        if (!latest) return
        useUserStore.getState().update({ images: latest.images.filter(img => img.normal !== filename) })
      })
    inFlightUploads.current.add(tracker)
    tracker.finally(() => inFlightUploads.current.delete(tracker))
    persistImages()
  }

  const familyInitial = profile?.family ?? null
  const bioInitial = profile?.bio ?? ''

  const handleSaveBio = async (value: string) => {
    if (bioSaving) return
    setBioSaving(true)
    try {
      if (inFlightUploads.current.size > 0) {
        await Promise.all(Array.from(inFlightUploads.current))
      }
      update({ bio: value.length === 0 ? null : value })
      await invoke('app/profile', { bio: value })
      setBioPopupVisible(false)
    } catch (e) {
      console.error('Save bio error:', e)
    } finally {
      setBioSaving(false)
    }
  }

  // When both toggles are off (no kids and not interested in kids), the
  // family entry has nothing to communicate — clear it so the profile
  // doesn't show an empty "No kids" card.
  const handleSaveFamily = async (data: FamilyData, isForKids: boolean | null) => {
    if (familySaving) return
    setFamilySaving(true)
    try {
      if (inFlightUploads.current.size > 0) {
        await Promise.all(Array.from(inFlightUploads.current))
      }
      const dropEntry = !data.hasKids && isForKids == null
      const familyWithPref: FamilyData | null = dropEntry
        ? null
        : { ...data, ...(isForKids !== null ? { isForKids } : {}) }
      update({ family: familyWithPref })
      await invoke('app/profile', { family: familyWithPref })
      setFamilyPopupVisible(false)
    } catch (e) {
      console.error('Save family error:', e)
    } finally {
      setFamilySaving(false)
    }
  }

  return (
    <View style={[styles.root, dismissGestureRef ? null : { paddingTop: insets.top }]}>
      {/* In the sheet path the home shell owns the status bar (light on the
          PRIMARY strip), so declaring style="dark" here would clobber it. */}
      {dismissGestureRef ? null : <StatusBar style="dark" />}
      {dismissGestureRef ? (
        // Slide-up sheet path: the home shell's TabStrip (with the "Close
        // profile" tab) provides all the chrome and the close affordance,
        // so the card runs flush to the top of the sheet under it like the
        // page1 match card. headerBottomShared = 0 → the sheet's swipe-down
        // dismiss only fires from scroll-at-top, which is the same rule as
        // the home page.
        null
      ) : (
        <View onLayout={e => {
          if (headerBottomShared) headerBottomShared.value = e.nativeEvent.layout.y + e.nativeEvent.layout.height
        }}>
          <ScreenHeader
            title={config.title}
            trailing={<IconPressable onPress={onBack}><CloseIcon /></IconPressable>}
          />
        </View>
      )}
      {previewData ? (
        <View style={styles.previewWrap}>
          <PullContext.Provider value={pullCtx}>
            <MatchCard
              match={previewData}

              bottomInset={0}
              isForKids={profile?.family?.isForKids ?? null}
              self
              onPhotoTap={(imageIndex) => {
                if (imageIndex < 0) return
                tap()
                setPhotoPopupImageIndex(imageIndex)
              }}
              onFamilyTap={() => { tap(); setFamilyPopupVisible(true) }}
              onBioTap={() => { tap(); setBioPopupVisible(true) }}
              actions={(() => {
                const list: CardAction[] = []
                if (photoAddEnabled) list.push({
                  key: 'photo',
                  icon: <AddPhotoIcon color={WHITE} size={40} />,
                  onPress: () => { tap(); handleAddPhoto() },
                })
                if (familyAddEnabled) list.push({
                  key: 'family',
                  icon: <FamilyKidsIcon color={WHITE} size={40} />,
                  onPress: () => { tap(); setFamilyPopupVisible(true) },
                })
                return list
              })()}
            />
          </PullContext.Provider>
        </View>
      ) : null}
      <PhotoOptionsPopup
        visible={photoPopupImageIndex != null}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onDismiss={() => setPhotoPopupImageIndex(null)}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onReplace={handleReplace}
        onDelete={handleDelete}
      />
      <FamilyKidsPopup
        visible={familyPopupVisible}
        initial={familyInitial}
        initialIsForKids={profile?.family?.isForKids ?? null}
        saving={familySaving}
        weekStart={profile?.weekStart ?? defaultWeekStart(lang)}
        isMale={profile?.is_male ?? null}
        onDismiss={() => setFamilyPopupVisible(false)}
        onSave={handleSaveFamily}
      />
      <BioEditPopup
        visible={bioPopupVisible}
        initial={bioInitial}
        saving={bioSaving}
        onDismiss={() => setBioPopupVisible(false)}
        onSave={handleSaveBio}
      />
    </View>
  )
}

// ── Inner Sub-Page Renderer ────────────────────────────────────────────────
// Used by ProfileSectionPage and AppSectionPage to render a second-level
// ── App Inline Content ─────────────────────────────────────────────────────

function AppInlineContent({ onBack, onOpenSubPage: _onOpenSubPage }: { onBack?: () => void; onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const router = useRouter()
  const { profile } = useUserStore()
  const { signOut } = useAuthStore()
  const [resetting, setResetting] = useState(false)
  const [accountPopupVisible, setAccountPopupVisible] = useState(false)
  const [signOutDialog, setSignOutDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const finishAndGoToLogin = useCallback(async () => {
    // See AccountFieldPage.finishAndGoToLogin for the ordering rationale.
    router.replace('/login')
    await signOut()
  }, [signOut, router])

  const onSignOutConfirmed = useCallback(async () => {
    tap()
    setSignOutDialog(false)
    try { await invoke('app/logout') } catch (e) { console.error(e) }
    await finishAndGoToLogin()
  }, [finishAndGoToLogin])

  const onDeleteConfirmed = useCallback(async () => {
    if (deleting) return
    tapWarning()
    setDeleting(true)
    try { await invoke('app/delete') } catch (e) { console.error(e); setDeleting(false); return }
    setDeleteDialog(false)
    setDeleting(false)
    await finishAndGoToLogin()
  }, [deleting, finishAndGoToLogin])

  const onReset = useCallback(async () => {
    if (resetting) return
    setResetting(true)
    try {
      await invoke('app/reset', {})
      const keys = await AsyncStorage.getAllKeys()
      const chatKeys = keys.filter(k =>
        k.startsWith('chatCache_') || k.startsWith('chatLastOpened_') || k.startsWith('chatLastRead_'),
      )
      if (chatKeys.length > 0) await AsyncStorage.multiRemove(chatKeys)
      if (onBack) onBack()
      else if (router.canGoBack()) router.back()
    } catch (e) { console.error(e) }
    finally { setResetting(false) }
  }, [resetting, onBack, router])

  const resetTap = useTapResponder(onReset)

  if (!profile) return null

  return (
    <>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        <SelectFieldRow
          grouped
          label={t('settings.account')}
          onPress={() => setAccountPopupVisible(true)}
          icon={<UserIcon color={BLACK_STRONG} />}
        />
        {profile.data?.role === 'ADMIN' && (
          <>
            <View style={styles.accountActionDivider} />
            <View
              style={[styles.accountActionRow, resetting && { opacity: 0.5 }]}
              {...(resetting ? {} : resetTap)}
            >
              {resetting
                ? <ActivityIndicator size={18} color={DESTRUCTIVE_COLOR} />
                : <ResetIcon color={DESTRUCTIVE_COLOR} />
              }
              <Text style={[styles.accountActionText, styles.accountActionTextDestructive]}>{t('settings.adminEntry')}</Text>
            </View>
          </>
        )}
      </View>
      <AccountPopup
        visible={accountPopupVisible}
        onDismiss={() => setAccountPopupVisible(false)}
        onSignOutPress={() => setSignOutDialog(true)}
        onDeletePress={() => setDeleteDialog(true)}
      />
      <ConfirmDialog
        visible={signOutDialog}
        title={t('settings.signOutConfirmTitle')}
        description={tg('settings.signOutConfirmDesc', profile.is_male)}
        confirmLabel={tg('settings.signOutYes', profile.is_male)}
        soft
        onCancel={() => setSignOutDialog(false)}
        onConfirm={onSignOutConfirmed}
        draggable
      />
      <ConfirmDialog
        visible={deleteDialog}
        title={t('settings.deleteConfirmTitle')}
        description={tg('settings.deleteConfirmDesc', profile.is_male)}
        confirmLabel={t('settings.deleteYes')}
        destructive
        busy={deleting}
        onCancel={() => setDeleteDialog(false)}
        onConfirm={onDeleteConfirmed}
        draggable
      />
    </>
  )
}

// Wraps a section label text in a row container so flexDirection:'row'
// auto-flipping places the label on the logical start side (right in RTL,
// left in LTR) reliably — textAlign/writingDirection alone proved
// inconsistent at runtime.
function GameModeCard() {
  const profile = useUserStore(s => s.profile)
  const relations = profile?.relations as {
    page2State?: 'free' | 'pending' | 'chat' | 'locked'
    watchers?: Profile[]
    page2?: unknown
    page1?: { state?: 'free' | 'watching' | 'waiting' | 'chat' | 'locked'; profile?: Profile }
  } | null | undefined

  const page1State = relations?.page1?.state
  const page1HasPartner = !!relations?.page1?.profile?.user_id
  const page2State = relations?.page2State
  const page2Raw = relations?.page2
  const page2InviteObj = page2Raw && !Array.isArray(page2Raw) ? page2Raw : null
  const watchers = Array.isArray(relations?.watchers) ? relations!.watchers! : []

  // "Pause mode" reads off the canonical pair: both pages locked with no
  // live partner/profile on either side. Anything else counts as Game mode.
  const isOff = page1State === 'locked' && page2State === 'locked'
    && !page1HasPartner && !page2InviteObj
  // Pending invite or in-chat are transient states whose own pane owns the
  // resolution flow. Disable the button while those are open.
  const disabled = page2State === 'pending' || page1State === 'chat' || page1State === 'waiting'
  const isActive = !isOff && !disabled

  // Whether switching to pause mode would notify someone: watchers in
  // page2.profiles[], a pending invite incoming, a watching/waiting/chat
  // partner on page1. When none of those apply, the press commits without
  // a confirm prompt.
  const hasSideEffects = watchers.length > 0
    || page2State === 'pending'
    || (page1HasPartner && page1State !== 'locked' && page1State !== 'free')

  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const performToggle = useCallback(async (endpoint: 'app/pause' | 'app/resume') => {
    setBusy(true)
    try {
      await invoke(endpoint, {})
    } catch (e) {
      console.error(e)
    }
    setBusy(false)
  }, [])

  const handlePress = useCallback(() => {
    if (busy) return
    if (disabled) { tapWarning(); return }
    tap()
    if (isOff) {
      performToggle('app/resume')
    } else if (!hasSideEffects) {
      performToggle('app/pause')
    } else {
      setConfirmOpen(true)
    }
  }, [busy, disabled, isOff, hasSideEffects, performToggle])

  const tapProps = useTapResponder(handlePress)

  // Currently active → glyph is Pause. Otherwise → Play (invites resume).
  const showPause = isActive

  // Hidden entirely while a transient interaction (pending invite, outgoing
  // waiting, in-chat) owns the resolution flow elsewhere. The overlay would
  // be non-interactive in those states and just clutter the photo. The
  // ConfirmDialog can only open from the interactive path, so unmounting it
  // alongside is safe.
  if (disabled) return null

  return (
    <>
      <Animated.View
        {...tapProps}
        entering={FadeIn.duration(DURATION.med)}
        exiting={FadeOut.duration(DURATION.med)}
        style={styles.gameModeOverlay}
      >
        <View style={styles.gameModeButton}>
          {busy ? (
            <ActivityIndicator size="small" color={WHITE} />
          ) : showPause ? (
            <PauseIcon color={WHITE} size={ICON.xxxl} />
          ) : (
            <PlayIcon color={WHITE} size={ICON.xxxl} />
          )}
        </View>
      </Animated.View>

      <ConfirmDialog
        visible={confirmOpen}
        title={t('settings.gameMode.offConfirmTitle')}
        description={t('settings.gameMode.offConfirmDesc')}
        confirmLabel={t('settings.gameMode.offConfirmButton')}
        destructive
        onCancel={() => { if (!busy) setConfirmOpen(false) }}
        onConfirm={() => { performToggle('app/pause'); setConfirmOpen(false) }}
        busy={busy}
        draggable
      />
    </>
  )
}

type SettingsPageProps = { topInset?: number; onBack?: () => void; focused?: boolean; onOpenSubPage?: (config: SubPageConfig) => Promise<void>; embedded?: boolean }

export default function SettingsPage({ topInset = 0, onBack, focused: _focused = true, onOpenSubPage, embedded = false }: SettingsPageProps = {}) {
  const router = useRouter()
  const { profile } = useUserStore()
  const { user } = useAuthStore()

  const firstPhoto = profile?.images?.[0]?.normal
  const avatarUri = firstPhoto
    ? (localPhotoUriCache.get(firstPhoto) ?? `${SUPABASE_URL}/storage/v1/object/public/users/${user?.id ?? profile?.user_id}/normal/${firstPhoto}`)
    : undefined

  return (
    <View style={styles.rootOuter}>
      <SafeAreaView style={[styles.root, { paddingTop: topInset }]} edges={['bottom', 'left', 'right']}>
        {!embedded && <StatusBar style="dark" />}

        {!embedded && (
          <ScreenHeader
            title={t('settings.preferences')}
            onBack={() => { tap(); if (onBack) onBack(); else if (router.canGoBack()) router.back() }}
          />
        )}

        <ScrollView
          style={styles.tabScroll}
          contentContainerStyle={[styles.tabContent, { paddingTop: 0 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          delaysContentTouches={false}
        >
          <View style={styles.profileCardWrap}>
            <Pressable
              style={styles.profileCard}
              onPress={() => { tap(); onOpenSubPage?.({ kind: 'profileSection', title: t('settings.profile') }) }}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.profileCardImage} resizeMode="cover" />
              ) : (
                <View style={styles.profileCardPlaceholder}>
                  <TabIcon tab="profile" color={BLACK_STRONG} />
                </View>
              )}
              <Svg style={styles.profileCardScrim} pointerEvents="none" preserveAspectRatio="none" viewBox="0 0 1 1">
                <Defs>
                  <SvgLinearGradient id="profileScrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={BLACK} stopOpacity="0" />
                    <Stop offset="1" stopColor={BLACK} stopOpacity="0.7" />
                  </SvgLinearGradient>
                </Defs>
                <Rect x="0" y="0" width="1" height="1" fill="url(#profileScrim)" />
              </Svg>
              <View style={styles.profileCardTopSpacer} pointerEvents="none" />
              <View style={styles.profileCardCaption} pointerEvents="none">
                <Text style={styles.profileCardTitle}>{t('settings.profile')}</Text>
              </View>
            </Pressable>
            <GameModeCard />
          </View>

          <View style={styles.optionsWrap}>
            <PreferencesContent onOpenSubPage={onOpenSubPage} />

            <View style={{ marginTop: QUAD }}>
              <AppInlineContent onBack={onBack} onOpenSubPage={onOpenSubPage} />
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rootOuter: { flex: 1, backgroundColor: WHITE },
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, height: 56,
  },
  backBtn: { minWidth: DOUBLE + SINGLE * 2, paddingHorizontal: SINGLE, paddingVertical: BUTTON, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flex: 1, flexDirection: 'row', marginHorizontal: SINGLE,
    backgroundColor: BLACK_SOFT, borderRadius: RADIUS, padding: 2,
  },
  tabItem: { flex: 1, paddingVertical: SINGLE, alignItems: 'center', borderRadius: RADIUS },
  tabItemActive: { backgroundColor: BLACK_STRONG },
  tabPill: { position: 'absolute', top: 2, bottom: 2, borderRadius: RADIUS, backgroundColor: BLACK_STRONG },

  tabScroll: { flex: 1 },
  // No horizontal padding here: the profile card extends edge-to-edge, flush
  // with the tab strip. The option groups below get their inset via
  // `optionsWrap`.
  tabContent: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  optionsWrap: { paddingHorizontal: SINGLE, marginTop: DOUBLE },

  section: { marginBottom: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabelRow: { flexDirection: 'row', marginTop: 24, marginBottom: 8, paddingHorizontal: SINGLE },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: BLACK_STRONG, letterSpacing: 1, textAlign: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: BLACK, marginBottom: 10 },
  sectionValue: { fontSize: 15, fontWeight: '700', color: BLACK },
  divider: { height: 0 },

  photoThumbStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: SINGLE, justifyContent: 'flex-end', width: 44 * 3 + SINGLE * 2 },
  photoThumb: { width: 44, height: 44, borderRadius: RADIUS },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { width: '100%', height: 40 },
  sliderEndLabel: { fontSize: 12, color: BLACK_MID, minWidth: 22, textAlign: 'center' },

  genderRow: { flexDirection: 'row', gap: 10, marginTop: SINGLE },

  previewWrap: {
    flex: 1,
    backgroundColor: WHITE,
  },

  textInputWrap: { marginTop: SINGLE, borderRadius: RADIUS, paddingHorizontal: BUTTON, paddingTop: BUTTON, paddingBottom: BUTTON + SINGLE, backgroundColor: BLACK_SOFT },
  textInputWrapInner: { paddingHorizontal: BUTTON, paddingTop: BUTTON, paddingBottom: BUTTON + SINGLE },
  textInputHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SINGLE },
  aboutMeQuote: { width: 18, fontSize: 28, lineHeight: 18, color: FIELD_ICON_STROKE, fontWeight: '700', textAlign: 'center' },
  textInput: { fontSize: 16, color: BLACK, padding: 0, textAlign: 'center', minHeight: 56 },
  charCount: { position: 'absolute', end: 12, bottom: 8, fontSize: 12, color: BLACK_MID },

  // Account tab
  infoCard: {
    marginTop: SINGLE, borderRadius: RADIUS, overflow: 'hidden',
    backgroundColor: BLACK_SOFT,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BLACK_SOFT,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: 15, color: BLACK_STRONG },
  infoValue: {
    fontSize: 15, fontWeight: '600', color: BLACK,
    flexShrink: 1, marginStart: 16,
  },

  accountLinkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: BLACK_SOFT, borderRadius: RADIUS,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: DOUBLE,
  },
  // Flat group: no frame, no shadow, no rounded corners. Rows are separated by
  // the subtle hairline `accountActionDivider` between siblings.
  accountLinksCard: {
    backgroundColor: WHITE,
    marginBottom: DOUBLE,
  },
  // Relative-positioned wrapper so the GameModeCard overlay anchors to the
  // photo card's box. Sits flush with the tab strip (no top margin) and
  // owns no horizontal margin, so the card spans the full screen width.
  profileCardWrap: {
    position: 'relative',
  },
  // 16/9 is the MINIMUM card height (via PROFILE_CARD_MIN_HEIGHT); the card
  // grows taller if the caption content needs more room (a11y scaling, etc).
  // Image + scrim are absolute background fills. Top spacer + caption are
  // the two flex children: space-between pins spacer to top (reserving the
  // pause-button area) and caption to bottom. Padding on the card would push
  // absolute children inward, so the gap is reserved by the spacer instead.
  profileCard: {
    width: '100%', minHeight: PROFILE_CARD_MIN_HEIGHT,
    flexDirection: 'column', justifyContent: 'space-between',
    overflow: 'hidden',
    backgroundColor: BLACK_SOFT,
  },
  profileCardTopSpacer: { height: BUTTON + BUTTON_MIN_HEIGHT + BUTTON },

  // Game-mode toggle — overlay button anchored to the profile-card hero
  // image. Visual language matches the heart action button on MatchCard: a
  // circular translucent-black disc with a WHITE glyph, lifted shadow stack
  // so it floats above the photo. The whole disc is the tap target. Same
  // diameter as before (BUTTON_MIN_HEIGHT) — only the chrome and placement
  // changed.
  gameModeOverlay: {
    position: 'absolute',
    top: BUTTON,
    right: BUTTON,
    zIndex: 2,
  },
  gameModeButton: {
    width: BUTTON_MIN_HEIGHT,
    height: BUTTON_MIN_HEIGHT,
    borderRadius: BUTTON_MIN_HEIGHT / 2,
    backgroundColor: BLACK_STRONG,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  profileCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  profileCardPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: BLACK_SOFT },
  profileCardScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  profileCardCaption: { paddingHorizontal: DOUBLE, paddingVertical: DOUBLE },
  profileCardTitle: { color: WHITE, fontSize: TEXT.h1, fontWeight: WEIGHT.bold },
  // Solid composite of PRIMARY_BG over WARM_WHITE — using the translucent
  // PRIMARY_BG directly lets the card's shadow bleed through as a dark rim.
  accentCard: { backgroundColor: WHITE },
  accountLinkRowInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  // Flat group, identical visual language to `accountLinksCard`: no frame,
  // no rounded corners, no shadow. Rows are separated by the hairline
  // `accountActionDivider`.
  accountActionsCard: {
    backgroundColor: WHITE, marginTop: SINGLE,
  },
  accountActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  accountActionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: BLACK_SOFT,
    marginStart: 16,
  },
  accountActionText: { fontSize: 15, color: BLACK, fontWeight: '500' },
  accountActionTextDestructive: { color: DESTRUCTIVE_MUTED },

  // Select field row — tappable row with label + value + forward chevron
  selectRow: {
    flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 10,
    backgroundColor: WHITE, borderRadius: RADIUS,
    paddingHorizontal: BUTTON, paddingVertical: BUTTON, marginTop: SINGLE,
    overflow: 'hidden',
    shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  // Variant for use inside a grouped card (e.g. accountLinksCard) — no own
  // background or rounded corners; the parent card provides those.
  selectRowInner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  selectRowLarge: { paddingVertical: 18 },
  selectRowTextCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  selectRowLabelWrap: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', columnGap: 8, rowGap: 2 },
  selectRowLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectRowLabel: { fontSize: 15, lineHeight: 22, color: BLACK, fontWeight: '500' },
  selectRowSubtitle: { fontSize: 13, color: BLACK_STRONG, marginTop: 2 },
  selectRowTrailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectRowValue: { fontSize: 15, color: PRIMARY, fontWeight: '500', flexShrink: 1, marginStart: 'auto', textAlign: isRTL ? 'left' : 'right' },
  selectRowAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: BLACK_SOFT,
  },
  selectRowAccentIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: PRIMARY_BG,
    alignItems: 'center', justifyContent: 'center',
  },
  selectRowIconWrap: { alignItems: 'center', justifyContent: 'center' },

  // Sub-page overlay panel
  subPageRoot: { backgroundColor: WHITE },
  subPageHeaderTitle: {
    flex: 1, fontSize: 22, fontWeight: '800', color: BLACK,
    letterSpacing: -0.5, lineHeight: 26, includeFontPadding: false,
    textAlign: 'center', textAlignVertical: 'center',
  },
  subPageOptionsCard: {
    marginHorizontal: SINGLE, marginTop: DOUBLE,
    borderRadius: RADIUS, overflow: 'hidden',
    backgroundColor: BLACK_SOFT,
  },
  subPageOptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: BUTTON, paddingVertical: DOUBLE,
  },
  subPageOptionLabel: { fontSize: 17, color: BLACK },
  subPageCheckmark: { fontSize: 17, color: PRIMARY, fontWeight: '600' },
  optionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: BLACK_SOFT,
    marginStart: 16,
  },
  subPageDesc: {
    marginHorizontal: SINGLE, marginTop: 16,
    fontSize: 13, color: BLACK_STRONG,
    textAlign: 'center', lineHeight: 19,
  },
})
