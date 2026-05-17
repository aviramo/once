import React, { useState, useEffect, useRef, useCallback, useMemo, createContext } from 'react'
import { View, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, I18nManager, Animated as RNAnimated, Dimensions, Keyboard, Platform, TextInput as RNTextInput } from 'react-native'
import Animated, { SharedValue, useSharedValue, FadeIn, FadeOut } from 'react-native-reanimated'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { getLocales } from 'expo-localization'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Path, Line, Circle, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap, tapWarning } from '../src/lib/haptics'
import { useUserStore, resolveLocationType, type LocationType } from '../src/stores/userStore'
import { useAuthStore } from '../src/stores/authStore'
import { t, tg, lang } from '../src/i18n'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { Button } from '../src/components/Button'
import { RoundButton } from '../src/components/RoundButton'
import { MatchCard, type CardAction } from '../src/components/MatchCard'
import { PullContext, type PullCtx } from '../src/components/HomeCard'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import { localPhotoUriCache, pendingDeferred, processAndUploadPhotoDeferred } from '../src/components/PhotoEditor'
import { supabase } from '../src/lib/supabase'
import type { Profile } from '../src/stores/userStore'
import { familyEmptyWeek, familyEqual, FAMILY_MAX_KIDS, FAMILY_MAX_WEEKS, startOfDisplayedWeek, sundayOfWeek, toISODate, defaultWeekStart, weekendDays, type FamilyData, type FamilyKid } from '../src/lib/family'
import { XS, SM, MD, LG, XL, BUTTON_MIN_HEIGHT, RADIUS, RADII, DRAG_HANDLE, TEXT, WEIGHT, ICON, TAP_SLOP, STROKE, lh } from '../src/tokens'
import { BLACK, WHITE, WHITE_SOFT, WHITE_MID, WHITE_STRONG, PRIMARY, PRIMARY_BG, BLACK_SOFT, BLACK_STRONG, DESTRUCTIVE, DESTRUCTIVE_BG, BLACK_MID, themed, useThemeRerender, useColors } from '../src/colors'
import { useThemeStore, type ThemeMode } from '../src/stores/themeStore'
import { SlidersIcon, MapPinIcon, RadiusIcon, GenderIcon, ResetIcon, SignOutIcon, TrashIcon, UserIcon, AppearanceIcon, AddPhotoIcon, FamilyKidsIcon, ChevronUpIcon, ChevronDownIcon, PhotoReplaceIcon, PhotoTrashIcon, PlayIcon, PauseIcon, CheckIcon } from '../src/components/icons'
import { visibilityConfirmFor } from '../src/components/visibilityConfirms'
import { BottomSheet } from '../src/components/BottomSheet'
import { PinIcon as PinGlyph, HomeIcon as HomeGlyph, WorkIcon as WorkGlyph } from '../src/components/Chip'
import { units, M_PER_MI } from '../src/lib/units'
import { getLocation, getLocPermission, requestLocPermission, openLocPermSettings, openLocationSettings, enableLocationServices } from '../src/lib/location'

const isRTL = I18nManager.isRTL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
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
  locked,
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
  /** Dims the row content to signal the field is currently unavailable.
   * The row stays pressable so onPress can explain why. */
  locked?: boolean
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
        locked && styles.selectRowLocked,
      ]}
      {...tapProps}
    >
      <RNAnimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, {
          backgroundColor: WHITE_SOFT,
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

// Per-tab glyph used in the avatar preview row. Sized to ICON.lg.

function TabIcon({ tab, color }: { tab: Tab; color: string }) {
  const stroke = color
  if (tab === 'preferences') {
    // Magnifying glass
    return (
      <Svg width={ICON.lg} height={ICON.lg} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="11" cy="11" r="7" />
        <Line x1="16.5" y1="16.5" x2="21" y2="21" />
      </Svg>
    )
  }
  if (tab === 'profile') {
    // Person — head + shoulders
    return (
      <Svg width={ICON.lg} height={ICON.lg} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="12" cy="8" r="4" />
        <Path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </Svg>
    )
  }
  // app → 2×2 grid (app icon)
  return (
    <Svg width={ICON.lg} height={ICON.lg} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
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
  const c = useColors()
  const { profile, update } = useUserStore()
  const [agePopupVisible, setAgePopupVisible] = useState(false)
  const [radiusPopupVisible, setRadiusPopupVisible] = useState(false)
  const [genderPopupVisible, setGenderPopupVisible] = useState(false)
  const [locationPopupVisible, setLocationPopupVisible] = useState(false)
  const [locationLockedInfoVisible, setLocationLockedInfoVisible] = useState(false)

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
  const locationType = resolveLocationType(profile)
  const locationDisplayValue =
    locationType === 'home' ? (profile.location_label || t('settings.locationHome'))
    : locationType === 'work' ? (profile.location_label || t('settings.locationWork'))
    : t('settings.locationDevice')
  // An active page1/page2 interaction freezes the location field: 'watching'
  // (looking at a candidate), 'waiting' (outgoing invite), or 'pending'
  // (incoming invite on page2). Changing location mid-interaction would shift
  // the distance shown to the other party under an in-flight interaction. The
  // row stays tappable but explains why instead of opening the picker.
  const locationLocked =
    profile.state === 'watching' ||
    profile.state === 'waiting' ||
    profile.relations?.page2State === 'pending'

  return (
    <View style={styles.section}>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        <SelectFieldRow
          grouped
          label={t('settings.range')}
          displayValue={formatRadius(radius)}
          onPress={() => setRadiusPopupVisible(true)}
          icon={<RadiusIcon color={c.fg} />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.location')}
          displayValue={locationDisplayValue}
          locked={locationLocked}
          onPress={() => locationLocked
            ? setLocationLockedInfoVisible(true)
            : setLocationPopupVisible(true)}
          icon={<MapPinIcon color={c.fg} />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.ageRange')}
          displayValue={ageMin === ageMax ? `⁦${ageMin}⁩` : `⁦${ageMin} – ${ageMax}⁩`}
          onPress={() => setAgePopupVisible(true)}
          icon={<SlidersIcon color={c.fg} />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.preferredGender')}
          displayValue={genderDisplayValue}
          onPress={() => setGenderPopupVisible(true)}
          icon={<GenderIcon color={c.fg} />}
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
      <LocationPopup
        visible={locationPopupVisible}
        currentType={locationType}
        onSelectDevice={(lat, lng) => {
          update({ location_type: 'device', location_custom: false, location_label: null })
          // Exiting to device mode must always take effect, even when the
          // popup couldn't get a GPS fix right now (common straight after a
          // fixed address — GPS was idle so there's no recent fix). Flip the
          // type regardless; include the fix only if we have one. The home
          // shell re-acquires + broadcasts the real device location the
          // moment location_type turns 'device'. location_custom is mirrored
          // for pre-typed mobile builds (see BACKWARD_COMPAT.md).
          const hasFix = Number.isFinite(lat) && Number.isFinite(lng)
          invoke('app/location', {
            ...(hasFix ? { location: { latitude: lat, longitude: lng } } : {}),
            location_type: 'device',
            location_custom: false,
            location_label: null,
          }).catch(console.error)
        }}
        onSelectTyped={(type, label, lat, lng) => {
          update({ location_type: type, location_custom: true, location_label: label })
          invoke('app/location', {
            location: { latitude: lat, longitude: lng },
            location_type: type,
            location_custom: true,
            location_label: label,
          }).catch(console.error)
        }}
        onDismiss={() => setLocationPopupVisible(false)}
      />
      {/* Location is frozen during an active interaction. This is a
          button-less informational notice (dismiss by swipe / backdrop):
          it just explains why the row didn't open the picker and tells the
          user to finish the current view/invitation first. */}
      <ConfirmDialog
        visible={locationLockedInfoVisible}
        icon={<MapPinIcon color={PRIMARY} size={32} />}
        title={t('settings.locationLockedTitle')}
        description={t('settings.locationLockedDesc')}
        draggable
        onCancel={() => setLocationLockedInfoVisible(false)}
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
  // Stash the follow-up action and fire it from BottomSheet.onClosed, which
  // runs only after the sheet's Modal has fully unmounted.
  const pendingAfter = useRef<(() => void) | null>(null)
  const handleClosed = useCallback(() => {
    const after = pendingAfter.current
    pendingAfter.current = null
    if (after) after()
  }, [])
  const dismissThen = useCallback((after: () => void) => {
    pendingAfter.current = after
    onDismiss()
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
      onClosed={handleClosed}
      contentStyle={{ paddingBottom: Math.max(insets.bottom, SM) }}
    >
      {/* Identity details as a plain stacked text list (PRIMARY on the white
          sheet), not chip pills — one line per field, like a list. */}
      <View style={styles.accountPopupList}>
        {detailRows.map(r => (
          <Text
            key={r.label}
            style={styles.accountPopupListItem}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {r.value}
          </Text>
        ))}
      </View>
      <View style={styles.accountActionsCard}>
        <View style={styles.accountActionRow} {...signOutTap}>
          <SignOutIcon color={BLACK} />
          {/* Wrap label in flex:1 row so the Text auto-flips to the logical
              start side on iOS RTL. See the note above GameModeCard. */}
          <View style={styles.accountActionTextWrap}>
            <Text style={[styles.accountActionText, { color: BLACK }]} numberOfLines={1} ellipsizeMode="clip">{tg('settings.signOut', profile.is_male)}</Text>
          </View>
        </View>
        {/* Soft dark hairline — the shared WHITE_SOFT divider is invisible on
            the white popup surface. */}
        <View style={[styles.accountActionDivider, { backgroundColor: BLACK_SOFT }]} />
        <View style={styles.accountActionRow} {...deleteTap}>
          <TrashIcon color={BLACK_MID} />
          <View style={styles.accountActionTextWrap}>
            <Text style={[styles.accountActionText, { color: BLACK_MID }]} numberOfLines={1} ellipsizeMode="clip">{t('settings.deleteAccount')}</Text>
          </View>
        </View>
      </View>
    </BottomSheet>
  )
}

// ── App Tab ────────────────────────────────────────────────────────────────

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
  const [fromSel, setFromSel] = useState(false)
  const [toSel, setToSel] = useState(false)
  const [kbHeight, setKbHeight] = useState(0)
  const fromRef = useRef<RNTextInput>(null)
  const toRef = useRef<RNTextInput>(null)

  useEffect(() => {
    if (visible) {
      setFromText(String(ageMin))
      setToText(String(ageMax))
      setFromSel(false)
      setToSel(false)
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
      contentStyle={[agePopupStyles.card, { paddingBottom: Math.max(insets.bottom, SM) + SM }]}
    >
      <View style={agePopupStyles.row}>
        <View style={agePopupStyles.field}>
          <Text style={agePopupStyles.fieldLabel}>{t('settings.ageFrom')}</Text>
          <TextInput
            ref={fromRef}
            style={[agePopupStyles.input, fromSel && agePopupStyles.inputSelected]}
            value={fromText}
            onChangeText={v => setFromText(v.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            selectTextOnFocus
            selectionColor={PRIMARY}
            cursorColor={PRIMARY}
            onSelectionChange={e => setFromSel(e.nativeEvent.selection.end > e.nativeEvent.selection.start)}
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
            style={[agePopupStyles.input, toSel && agePopupStyles.inputSelected]}
            value={toText}
            onChangeText={v => setToText(v.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            selectTextOnFocus
            selectionColor={PRIMARY}
            cursorColor={PRIMARY}
            onSelectionChange={e => setToSel(e.nativeEvent.selection.end > e.nativeEvent.selection.start)}
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
    paddingHorizontal: MD,
    paddingTop: 0,
  },
  title: {
    fontSize: TEXT.lg, fontWeight: WEIGHT.semibold, color: BLACK,
    textAlign: 'center', marginBottom: MD,
  },
  row: {
    flexDirection: 'row', gap: SM,
    marginTop: SM,
    marginBottom: SM,
  },
  field: {
    flex: 1,
    backgroundColor: PRIMARY_BG,
    borderRadius: RADIUS,
    paddingVertical: SM,
    paddingHorizontal: SM,
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: TEXT.sm,
    color: BLACK,
  },
  input: {
    fontSize: TEXT.xxl,
    fontWeight: WEIGHT.extrabold,
    color: PRIMARY,
    textAlign: 'center',
    padding: 0,
    minWidth: 60,
  },
  inputSelected: {
    color: WHITE,
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
function SelectListRow({ label, selected, isLast, onPress, icon }: {
  label: string
  selected: boolean
  isLast: boolean
  onPress: () => void
  /** Optional leading glyph (e.g. the location-anchor icon in the picker). */
  icon?: React.ReactNode
}) {
  const [pressed, setPressed] = useState(false)
  const tapProps = useTapResponder(onPress, setPressed)
  return (
    <View {...tapProps}>
      <View style={[selectListStyles.row, pressed && { backgroundColor: BLACK_SOFT }]}>
        {/* labelWrap is flexDirection:'row' so the Text child auto-flips to
            the logical start side (right in RTL). See the wrap-in-row note
            above GameModeCard — more reliable on iOS than textAlign alone. */}
        <View style={selectListStyles.labelWrap}>
          {icon ? <View style={selectListStyles.rowIcon}>{icon}</View> : null}
          <Text style={[selectListStyles.label, selected && selectListStyles.labelSelected]}>{label}</Text>
        </View>
        <View style={selectListStyles.checkSlot}>
          {selected ? <CheckIcon color={PRIMARY} /> : null}
        </View>
      </View>
      {!isLast ? <View style={selectListStyles.divider} /> : null}
    </View>
  )
}

const selectListStyles = StyleSheet.create({
  card: { padding: 0, paddingTop: 0, paddingBottom: XL },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: MD, paddingHorizontal: MD,
  },
  labelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  rowIcon: { marginEnd: SM },
  label: { fontSize: TEXT.md, color: BLACK },
  labelSelected: { color: PRIMARY, fontWeight: WEIGHT.semibold },
  checkSlot: { width: ICON.xxl, height: ICON.xxl, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BLACK_SOFT, marginHorizontal: MD },
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

// ── Location Popup ─────────────────────────────────────────────────────────
// Two-step bottom sheet. Step 1 lets the user pick between "My location"
// (device GPS) and "Custom address". Picking "My location" prompts for
// permission (if needed), fetches a GPS fix, and saves. Picking "Custom
// address" advances to step 2: a near-full-screen sheet with a sticky text
// input at the top and a debounced Google Places Autocomplete list below.
// Tapping a suggestion fetches its place details (lat/lng + formatted
// address), saves, and dismisses — no search button.
//
// While `location_custom` is true the home shell skips the GPS permission
// overlay and the periodic /app/location updates, so the popup is the only
// thing that ever writes a new location for that user.
//
// Requires `EXPO_PUBLIC_GOOGLE_PLACES_KEY` in env, and the Places API
// enabled on the same GCP project. See CLAUDE.md for the one-time setup.

const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? ''

type Prediction = { place_id: string; description: string }
type PlaceLocation = { lat: number; lng: number; label: string }

// Cheap UUID-ish session token; only needs to be unique-per-session for
// Google's billing grouping (autocomplete keystrokes + the closing details
// call counted as one billable session).
function genSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

async function placesAutocomplete(
  input: string, sessionToken: string, language: string, signal: AbortSignal,
): Promise<Prediction[]> {
  if (!input.trim() || !GOOGLE_PLACES_KEY) return []
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', input)
  url.searchParams.set('key', GOOGLE_PLACES_KEY)
  url.searchParams.set('sessiontoken', sessionToken)
  url.searchParams.set('language', language)
  const res = await fetch(url.toString(), { signal })
  const json = await res.json()
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    console.warn('places_autocomplete', json.status, json.error_message)
    return []
  }
  return (json.predictions ?? []).map((p: { place_id: string; description: string }) => ({
    place_id: p.place_id, description: p.description,
  }))
}

async function placeDetails(placeId: string, sessionToken: string, language: string): Promise<PlaceLocation | null> {
  if (!GOOGLE_PLACES_KEY) return null
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('key', GOOGLE_PLACES_KEY)
  url.searchParams.set('sessiontoken', sessionToken)
  url.searchParams.set('language', language)
  url.searchParams.set('fields', 'geometry,formatted_address')
  const res = await fetch(url.toString())
  const json = await res.json()
  if (json.status !== 'OK' || !json.result?.geometry?.location) {
    console.warn('place_details', json.status, json.error_message)
    return null
  }
  return {
    lat: json.result.geometry.location.lat,
    lng: json.result.geometry.location.lng,
    label: json.result.formatted_address || '',
  }
}

function LocationPopup({
  visible, currentType, onSelectDevice, onSelectTyped, onDismiss,
}: {
  visible: boolean
  /** The user's current anchor — highlights the matching row. */
  currentType: LocationType
  onSelectDevice: (lat?: number, lng?: number) => void
  /** Picked Home or Work + the chosen address. */
  onSelectTyped: (type: 'home' | 'work', label: string, lat: number, lng: number) => void
  onDismiss: () => void
}) {
  const insets = useSafeAreaInsets()
  const screenH = useRef(Dimensions.get('window').height).current
  // Address-step sheet height: full screen minus the home shell's TabStrip
  // area at the top (status bar + ~56 px for the tabs row + a little extra
  // breathing room). Without subtracting that the sheet would cover the tabs
  // and lose the visual anchor.
  const tabStripGap = insets.top + 64
  const addressSheetH = screenH - tabStripGap

  const [step, setStep] = useState<'menu' | 'address'>('menu')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [deviceBusy, setDeviceBusy] = useState(false)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  // Which typed anchor the user is picking an address for. Set when they tap
  // the Home or Work row; consumed when a prediction is selected.
  const [pendingType, setPendingType] = useState<'home' | 'work'>('home')
  const sessionTokenRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)
  // Android keyboard tracking — Modal + statusBarTranslucent prevents the
  // window-resize-based avoidance from working, so we shrink the sheet height
  // and add marginBottom to lift it above the keyboard.
  const [kbHeight, setKbHeight] = useState(0)

  // Reset every time the sheet opens.
  useEffect(() => {
    if (!visible) return
    setStep('menu')
    setQuery('')
    setPredictions([])
    setSearchError(null)
    setDeviceError(null)
    setSearching(false)
    setDeviceBusy(false)
    setSelecting(false)
    setPendingType(currentType === 'work' ? 'work' : 'home')
    sessionTokenRef.current = ''
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
  }, [visible])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, e => setKbHeight(e.endCoordinates?.height ?? 0))
    const hideSub = Keyboard.addListener(hideEvent, () => setKbHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])

  // Mint a session token on first entry to the address step. The same token
  // covers every keystroke in that session and the final placeDetails call,
  // so Google bills it as one session.
  useEffect(() => {
    if (step === 'address' && !sessionTokenRef.current) {
      sessionTokenRef.current = genSessionToken()
    }
  }, [step])

  // Debounced autocomplete on every keystroke. AbortController cancels the
  // in-flight request when the user keeps typing so we never race a slow
  // response over a faster one.
  useEffect(() => {
    if (step !== 'address') return
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setPredictions([])
      setSearching(false)
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    const timer = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const results = await placesAutocomplete(trimmed, sessionTokenRef.current, lang, controller.signal)
        if (controller.signal.aborted) return
        setPredictions(results)
        if (results.length === 0) setSearchError(t('settings.locationNoResults'))
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return
        setSearchError(t('settings.locationNoResults'))
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, step])

  const handleMyLocation = async () => {
    if (deviceBusy) return
    setDeviceBusy(true)
    setDeviceError(null)
    try {
      let perm = await getLocPermission()
      if (perm === 'services-off') {
        try { await enableLocationServices(); perm = await getLocPermission() }
        catch { openLocationSettings(); setDeviceError(t('settings.locationServicesOffDesc')); return }
      }
      if (perm === 'undetermined') perm = await requestLocPermission()
      if (perm !== 'granted') {
        setDeviceError(t('settings.locationPermissionDesc'))
        if (perm === 'denied') openLocPermSettings()
        return
      }
      // Best-effort fix. If GPS can't deliver one this instant (typical right
      // after custom mode, when GPS has been idle), still switch to device
      // mode — onSelectDevice flips location_custom off and the home shell
      // re-acquires + broadcasts the real location once tracking resumes.
      // Permission/services were already verified above, so a null here is a
      // transient cold-GPS miss, not a hard block.
      const coords = await getLocation()
      onSelectDevice(coords?.lat, coords?.lng)
      onDismiss()
    } finally {
      setDeviceBusy(false)
    }
  }

  const handleSelectPrediction = async (p: Prediction) => {
    if (selecting) return
    setSelecting(true)
    Keyboard.dismiss()
    try {
      const details = await placeDetails(p.place_id, sessionTokenRef.current, lang)
      // A details call closes the billing session; mint a new token the next
      // time the user re-enters this step.
      sessionTokenRef.current = ''
      if (!details) {
        setSearchError(t('settings.locationNoResults'))
        return
      }
      const label = details.label || p.description
      onSelectTyped(pendingType, label, details.lat, details.lng)
      onDismiss()
    } finally {
      setSelecting(false)
    }
  }

  // Compute the effective sheet height. While the keyboard is up on Android
  // we have to shrink the sheet AND lift it via marginBottom; on iOS the
  // BottomSheet's KeyboardAvoidingView padding handles the lift, so we just
  // shrink the height.
  const isAndroidKb = Platform.OS !== 'ios' && kbHeight > 0
  const addressEffectiveH = kbHeight > 0
    ? Math.max(240, addressSheetH - kbHeight)
    : addressSheetH

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      keyboardAvoiding={step === 'address'}
      cardWrapStyle={step === 'address' ? {
        height: addressEffectiveH,
        ...(isAndroidKb ? { marginBottom: kbHeight } : {}),
      } : undefined}
      contentStyle={step === 'address' ? locationPopupStyles.addressCard : selectListStyles.card}
    >
      {step === 'menu' ? (
        <>
          <SelectListRow
            label={t('settings.locationDevice')}
            icon={<PinGlyph color={currentType === 'device' ? PRIMARY : BLACK_STRONG} size={ICON.md} />}
            selected={currentType === 'device'}
            isLast={false}
            onPress={handleMyLocation}
          />
          <SelectListRow
            label={t('settings.locationHome')}
            icon={<HomeGlyph color={currentType === 'home' ? PRIMARY : BLACK_STRONG} size={ICON.md} />}
            selected={currentType === 'home'}
            isLast={false}
            onPress={() => { setPendingType('home'); setStep('address') }}
          />
          <SelectListRow
            label={t('settings.locationWork')}
            icon={<WorkGlyph color={currentType === 'work' ? PRIMARY : BLACK_STRONG} size={ICON.md} />}
            selected={currentType === 'work'}
            isLast={true}
            onPress={() => { setPendingType('work'); setStep('address') }}
          />
          {deviceBusy ? (
            <View style={locationPopupStyles.statusRow}>
              <ActivityIndicator color={PRIMARY} />
              <Text style={locationPopupStyles.statusText}>{t('settings.locationFetchingDevice')}</Text>
            </View>
          ) : deviceError ? (
            <Text style={locationPopupStyles.errorText}>{deviceError}</Text>
          ) : null}
        </>
      ) : (
        <View style={locationPopupStyles.addressBody}>
          <View style={locationPopupStyles.searchRow}>
            <TextInput
              style={locationPopupStyles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t('settings.locationAddressPrompt')}
              placeholderTextColor={BLACK_MID}
              autoFocus
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching || selecting ? (
              <View style={locationPopupStyles.searchSpinner}>
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : null}
          </View>
          {searchError && predictions.length === 0 && !searching ? (
            <Text style={locationPopupStyles.errorText}>{searchError}</Text>
          ) : null}
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, SM) + SM }}
          >
            {predictions.map((p, i) => (
              <SelectListRow
                key={p.place_id}
                label={p.description}
                selected={false}
                isLast={i === predictions.length - 1}
                onPress={() => handleSelectPrediction(p)}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </BottomSheet>
  )
}

const locationPopupStyles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: SM,
    paddingHorizontal: MD, paddingTop: MD,
  },
  statusText: { fontSize: TEXT.sm, color: BLACK_STRONG },
  errorText: {
    paddingHorizontal: MD, paddingTop: MD,
    fontSize: TEXT.sm, color: WHITE_MID,
    lineHeight: lh(TEXT.sm),
  },
  // Address-step content fills the (now tall) cardWrap.
  addressCard: {
    flex: 1,
    paddingTop: 0,
    paddingBottom: 0,
  },
  addressBody: { flex: 1, paddingHorizontal: MD, paddingTop: SM },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SM, marginBottom: SM,
  },
  searchInput: {
    flex: 1, fontSize: TEXT.md, color: BLACK,
    backgroundColor: BLACK_SOFT, borderRadius: RADIUS,
    paddingHorizontal: MD, paddingVertical: SM,
    textAlign: isRTL ? 'right' : 'left',
  },
  searchSpinner: {
    width: ICON.xxl, height: ICON.xxl,
    alignItems: 'center', justifyContent: 'center',
  },
})

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
    <View style={[familyStyles.toggleRow, familyStyles.triOptionRow]}>
      <Text style={[familyStyles.toggleLabel, familyStyles.triOptionLabel]}>{label}</Text>
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

// Theme (appearance) modes. One list, reused by the row's display value and
// the popup (DRY). Order matches the user's spec: מערכת / כהה / בהיר.
const THEME_OPTIONS: { v: ThemeMode; key: 'settings.themeSystem' | 'settings.themeDark' | 'settings.themeLight' }[] = [
  { v: 'system', key: 'settings.themeSystem' },
  { v: 'dark', key: 'settings.themeDark' },
  { v: 'light', key: 'settings.themeLight' },
]

// Regular settings row → opens this popup to pick the appearance mode. The
// pick applies live across the whole app and persists (themeStore →
// AsyncStorage, mirrored to the server on the next app/start). Same
// BottomSheet + checked-row pattern as FamilyValuePopup, so it looks native
// to the rest of settings (no bespoke control).
function ThemePopup({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const insets = useSafeAreaInsets()
  const mode = useThemeStore(s => s.mode)
  const setMode = useThemeStore(s => s.setMode)
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      contentStyle={[familyStyles.valuePopupCard, { paddingBottom: Math.max(insets.bottom, SM) }]}
    >
      <Text style={familyStyles.valuePopupTitle}>{t('settings.theme')}</Text>
      {THEME_OPTIONS.map(o => {
        const isSelected = mode === o.v
        return (
          <Pressable
            key={o.v}
            style={familyStyles.valueRow}
            onPress={() => { tap(); setMode(o.v); onDismiss() }}
          >
            <Text style={[familyStyles.valueRowLabel, isSelected && familyStyles.valueRowLabelSelected]}>
              {t(o.key)}
            </Text>
            {isSelected ? <Text style={familyStyles.valueRowCheck}>✓</Text> : null}
          </Pressable>
        )
      })}
    </BottomSheet>
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
      contentStyle={[familyStyles.valuePopupCard, { paddingBottom: Math.max(insets.bottom, SM) }]}
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

  const handleDismiss = () => {
    if (saving) return
    if (dirty) onSave(current, isForKids)
    else onDismiss()
  }
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
      onDismiss={handleDismiss}
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

              <View style={{ paddingBottom: Math.max(insets.bottom, SM) }} />

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
    paddingHorizontal: SM,
    flexShrink: 1,
  },
  dragHandle: {
    alignSelf: 'center',
    width: DRAG_HANDLE.width, height: DRAG_HANDLE.height, borderRadius: DRAG_HANDLE.radius,
    backgroundColor: BLACK_SOFT,
    marginBottom: MD,
  },
  scrollContent: { paddingTop: SM, paddingBottom: SM },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SM,
    paddingHorizontal: MD,
  },
  toggleLabel: { fontSize: TEXT.md, color: BLACK },
  toggleTrack: {
    width: 48, height: 28, borderRadius: RADII.round,
    padding: XS, justifyContent: 'center',
  },
  toggleKnob: {
    width: 24, height: 24, borderRadius: RADII.round,
    backgroundColor: WHITE,
    shadowColor: BLACK, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2, elevation: 2,
  },
  section: { marginBottom: MD },
  subSection: {},
  sectionTitle: { fontSize: TEXT.md, color: BLACK, marginBottom: SM },
  subSectionTitle: { fontSize: TEXT.sm, color: BLACK },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: XS },
  sectionHint: { fontSize: TEXT.sm, color: BLACK_STRONG, marginTop: XS, marginBottom: MD },
  optional: { fontSize: TEXT.sm, color: BLACK_STRONG },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SM },
  pill: { paddingHorizontal: MD, paddingVertical: SM, borderRadius: RADII.round, backgroundColor: BLACK_SOFT },
  pillSelected: { backgroundColor: PRIMARY },
  pillLabel: { fontSize: TEXT.sm, color: BLACK },
  pillLabelSelected: { color: WHITE },
  sectionPill: {
    paddingHorizontal: MD, paddingVertical: SM, borderRadius: RADII.round,
    backgroundColor: PRIMARY_BG,
  },
  sectionPillDestructive: { backgroundColor: DESTRUCTIVE_BG },
  sectionPillLabel: { fontSize: TEXT.sm, color: PRIMARY },
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
    paddingHorizontal: MD, paddingVertical: MD,
  },
  dropdownLabel: { fontSize: TEXT.sm, color: BLACK },
  dropdownValue: { fontSize: TEXT.sm, color: PRIMARY },
  dropdownPlaceholder: { fontSize: TEXT.sm, color: BLACK_STRONG },

  // "Days with kids" schedule. Title + weeks render inline with the rest of
  // the form (no enclosing card). Title sits flush, weeks gap below.
  scheduleWrap: { marginTop: SM, paddingHorizontal: MD, gap: MD },

  // Kid age chips. Each chip is a pill split into a tappable label area
  // (opens age picker) and an × remove button. Wraps to multiple rows.
  kidChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SM, paddingHorizontal: MD, marginTop: XS },
  kidChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADII.round, backgroundColor: BLACK_SOFT,
    paddingStart: MD, paddingEnd: SM,
  },
  kidChipMain: { paddingVertical: SM },
  kidChipLabel: { fontSize: TEXT.sm, color: PRIMARY },
  kidChipPlaceholder: { fontSize: TEXT.sm, color: BLACK_STRONG },
  kidChipRemoveBtn: { paddingHorizontal: SM, paddingVertical: XS },
  kidChipRemoveLabel: { fontSize: TEXT.lg, color: BLACK_STRONG, lineHeight: 18 },
  kidChipAdd: {
    paddingHorizontal: MD, paddingVertical: SM,
    borderRadius: RADII.round,
    borderWidth: STROKE.thin, borderColor: BLACK_SOFT, borderStyle: 'dashed',
  },
  kidChipAddLabel: { fontSize: TEXT.sm, color: PRIMARY },

  // + Add kid / + Add week button.
  addKidBtn: { paddingVertical: SM, alignItems: 'center', borderRadius: RADIUS, borderWidth: STROKE.thin, borderColor: BLACK_SOFT, borderStyle: 'dashed' },
  addKidLabel: { fontSize: TEXT.sm, color: PRIMARY },

  weekHeader: { marginBottom: MD, gap: XS },
  weekFooter: { flexDirection: 'row', alignItems: 'center', marginTop: SM },
  weekLabel: { fontSize: TEXT.sm, color: BLACK },
  weekLabelEmphasis: { fontWeight: WEIGHT.extrabold },
  weekHint: { fontSize: TEXT.sm, color: BLACK_STRONG },
  weekRemove: { fontSize: TEXT.sm, color: DESTRUCTIVE },
  daysRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dayCell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-start', gap: XS },
  dayBubble: {
    width: 36, height: 36, borderRadius: RADII.round,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: WHITE, borderWidth: STROKE.thin, borderColor: BLACK_SOFT,
  },
  dayBubbleSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  // Weekend cells (locale-defined: Fri+Sat for he/ar, Sat+Sun otherwise)
  // get a tinted bubble + primary-colored letter when not selected, so the
  // user can orient themselves visually toward their weekend without reading.
  dayBubbleWeekend: { backgroundColor: PRIMARY_BG, borderColor: PRIMARY_BG },
  dayLetterWeekend: { color: PRIMARY },
  dayLetter: { fontSize: TEXT.sm, color: BLACK },
  dayLetterSelected: { color: WHITE },
  dayDate: { fontSize: TEXT.xs, color: BLACK_STRONG },
  addWeekBtn: { marginTop: MD, paddingVertical: MD, alignItems: 'center', borderRadius: RADIUS, borderWidth: STROKE.thin, borderColor: BLACK_SOFT, borderStyle: 'dashed' },
  addWeekLabel: { fontSize: TEXT.sm, color: PRIMARY },
  // Static bottom strip housing the "Interested in kids" toggle. Sits below
  // the sheet's ScrollView so the gray cards expanding/collapsing inside
  // don't push it around. WHITE bg + same horizontal padding as the sheet
  // so the popup reads as one continuous surface.
  interestedBar: { backgroundColor: WHITE },

  // Inline picker (count / age) sheet
  valuePopupOverlay: { flex: 1, justifyContent: 'flex-end' },
  valuePopupCard: {
    backgroundColor: WHITE,
    paddingTop: RADIUS, paddingHorizontal: SM,
  },
  valuePopupTitle: {
    fontSize: TEXT.lg, fontWeight: WEIGHT.extrabold, color: BLACK,
    textAlign: 'center', marginBottom: SM,
  },
  valueRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: MD, paddingHorizontal: SM,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BLACK_SOFT,
  },
  valueRowLabel: { fontSize: TEXT.md, color: BLACK },
  valueRowLabelSelected: { color: PRIMARY, fontWeight: WEIGHT.extrabold },
  valueRowCheck: { fontSize: TEXT.md, color: PRIMARY, fontWeight: WEIGHT.extrabold },
  // Label + Yes/No pills share one row when there's room; only wrap to two
  // lines when there isn't. marginStart:'auto' on the pills (see below) keeps
  // them on the logical-end side in both the same-row and wrapped cases.
  triOptionRow: { flexWrap: 'wrap', rowGap: SM },
  triOptionLabel: { flexShrink: 1 },
  triOptionPills: { marginStart: 'auto', flexDirection: 'row', gap: SM },
  triOptionPill: { paddingHorizontal: MD, paddingVertical: SM, borderRadius: RADII.round, backgroundColor: BLACK_SOFT },
  triOptionPillSelected: { backgroundColor: PRIMARY },
  triOptionPillLabel: { fontSize: TEXT.sm, color: BLACK },
  triOptionPillLabelSelected: { color: WHITE },
})

// ── Photo edit popup ────────────────────────────────────────────────────────
// Bottom sheet shown when the user taps a photo on their own profile preview.
// Lays out four actions in a 2-row grid: Move up / Move down on top, then a
// full-width Replace, then a destructive-tinted Delete. Up/Down are disabled
// at the photo-list boundaries.

// ChevronUpIcon, ChevronDownIcon, PhotoReplaceIcon, PhotoTrashIcon imported
// from '../src/components/icons'.

function PhotoOptionsPopup({
  visible, canMoveUp, canMoveDown, canDelete, onDismiss, onMoveUp, onMoveDown, onReplace, onDelete,
}: {
  visible: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  canDelete: boolean
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
      contentStyle={[photoOptionsStyles.sheet, { paddingBottom: Math.max(insets.bottom, SM) + SM }]}
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
        style={[
          photoOptionsStyles.fullRow,
          canDelete ? photoOptionsStyles.destructiveRow : photoOptionsStyles.disabledRow,
        ]}
        onPress={() => { if (canDelete) { tapWarning(); onDelete() } }}
      >
        <PhotoTrashIcon color={canDelete ? DESTRUCTIVE : BLACK_STRONG} />
        <Text style={[
          photoOptionsStyles.fullRowLabel,
          canDelete ? photoOptionsStyles.destructiveLabel : photoOptionsStyles.disabledLabel,
        ]}>
          {canDelete ? t('settings.photoEditDelete') : t('settings.photoMinTwo')}
        </Text>
      </Pressable>
    </BottomSheet>
  )
}

const photoOptionsStyles = StyleSheet.create({
  sheet: {
    paddingHorizontal: SM,
  },
  row: {
    flexDirection: 'row',
    gap: SM,
    marginBottom: SM,
  },
  tile: {
    flex: 1,
    backgroundColor: BLACK_SOFT,
    borderRadius: RADIUS,
    paddingVertical: MD,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SM,
  },
  tileDisabled: {
    opacity: 0.5,
  },
  tileLabel: {
    fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: BLACK,
  },
  tileLabelDisabled: {
    color: BLACK_STRONG,
  },
  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLACK_SOFT,
    borderRadius: RADIUS,
    paddingVertical: MD,
    paddingHorizontal: MD,
    gap: MD,
    marginBottom: SM,
  },
  fullRowLabel: {
    fontSize: TEXT.md, fontWeight: WEIGHT.semibold, color: BLACK,
  },
  destructiveRow: {
    backgroundColor: DESTRUCTIVE_BG,
  },
  destructiveLabel: {
    color: DESTRUCTIVE,
  },
  disabledRow: {
    opacity: 0.55,
  },
  disabledLabel: {
    color: BLACK_STRONG,
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
  const [bioSaving, setBioSaving] = useState(false)
  // True while the OS image picker is launching from the profile-card round
  // button. launchImageLibraryAsync has a cold-start delay; swap the
  // add-photo glyph for a spinner until the native picker is up.
  const [photoPicking, setPhotoPicking] = useState(false)
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
      location_custom: profile.location_custom ?? null,
      location_type: profile.location_type ?? null,
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
    if (photoCount <= 2) {
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
    if (!user || !profile || photoPicking) return
    const ImagePicker = await import('expo-image-picker')
    setPhotoPicking(true)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    }).finally(() => setPhotoPicking(false))
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
    const ImagePicker = await import('expo-image-picker')
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
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

  // Commit handler for the inline bio editor (MatchCard's BioField). Called
  // once on blur with the already-normalized text (>= BIO_MIN, or null for a
  // cleared bio). No popup to close — the field stays in place.
  const handleSaveBio = async (next: string | null) => {
    if (bioSaving) return
    const value = next ?? ''
    setBioSaving(true)
    try {
      if (inFlightUploads.current.size > 0) {
        await Promise.all(Array.from(inFlightUploads.current))
      }
      update({ bio: value.length === 0 ? null : value })
      await invoke('app/profile', { bio: value })
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
              bioEdit={{ value: bioInitial, saving: bioSaving, onCommit: handleSaveBio }}
              actions={(() => {
                const list: CardAction[] = []
                if (photoAddEnabled) list.push({
                  key: 'photo',
                  icon: photoPicking
                    ? <ActivityIndicator color={WHITE} />
                    : <AddPhotoIcon stroke={WHITE} size={ICON.huge} />,
                  onPress: () => { tap(); handleAddPhoto() },
                })
                if (familyAddEnabled) list.push({
                  key: 'family',
                  icon: <FamilyKidsIcon stroke={WHITE} size={ICON.huge} />,
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
        canDelete={photoCount > 2}
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
    </View>
  )
}

// ── Inner Sub-Page Renderer ────────────────────────────────────────────────
// Used by ProfileSectionPage and AppSectionPage to render a second-level
// ── App Inline Content ─────────────────────────────────────────────────────

function AppInlineContent({ onBack, onNavigateHome, onOpenSubPage: _onOpenSubPage }: { onBack?: () => void; onNavigateHome?: () => void; onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const c = useColors()
  const router = useRouter()
  const { profile } = useUserStore()
  const { signOut } = useAuthStore()
  const [resetting, setResetting] = useState(false)
  const [accountPopupVisible, setAccountPopupVisible] = useState(false)
  const [themePopupVisible, setThemePopupVisible] = useState(false)
  const themeMode = useThemeStore(s => s.mode)
  const themeModeLabel = t(THEME_OPTIONS.find(o => o.v === themeMode)?.key ?? 'settings.themeSystem')
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
      // Server response is back: leave the menu pane and land on page1 (Home).
      if (onNavigateHome) onNavigateHome()
      else if (onBack) onBack()
      else if (router.canGoBack()) router.back()
    } catch (e) { console.error(e) }
    finally { setResetting(false) }
  }, [resetting, onBack, onNavigateHome, router])

  const resetTap = useTapResponder(onReset)

  if (!profile) return null

  return (
    <>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        <SelectFieldRow
          grouped
          label={t('settings.account')}
          onPress={() => setAccountPopupVisible(true)}
          icon={<UserIcon color={c.fg} />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.theme')}
          displayValue={themeModeLabel}
          onPress={() => setThemePopupVisible(true)}
          icon={<AppearanceIcon color={c.fg} />}
        />
        {profile.data?.role === 'ADMIN' && (
          <>
            <View style={styles.accountActionDivider} />
            <View
              style={[styles.accountActionRow, resetting && { opacity: 0.5 }]}
              {...(resetting ? {} : resetTap)}
            >
              {resetting
                ? <ActivityIndicator size={18} color={c.WHITE_MID} />
                : <ResetIcon color={c.WHITE_MID} />
              }
              <Text style={[styles.accountActionText, styles.accountActionTextDestructive]}>{t('settings.adminEntry')}</Text>
            </View>
          </>
        )}
      </View>
      <ThemePopup
        visible={themePopupVisible}
        onDismiss={() => setThemePopupVisible(false)}
      />
      <AccountPopup
        visible={accountPopupVisible}
        onDismiss={() => setAccountPopupVisible(false)}
        onSignOutPress={() => setSignOutDialog(true)}
        onDeletePress={() => setDeleteDialog(true)}
      />
      <ConfirmDialog
        visible={signOutDialog}
        icon={<SignOutIcon color={PRIMARY} size={32} />}
        title={t('settings.signOutConfirmTitle')}
        description={tg('settings.signOutConfirmDesc', profile.is_male)}
        confirmLabel={tg('settings.signOutYes', profile.is_male)}
        onCancel={() => setSignOutDialog(false)}
        onConfirm={onSignOutConfirmed}
        draggable
      />
      <ConfirmDialog
        visible={deleteDialog}
        icon={<TrashIcon color={PRIMARY} size={32} />}
        title={t('settings.deleteConfirmTitle')}
        description={tg('settings.deleteConfirmDesc', profile.is_male)}
        confirmLabel={t('settings.deleteYes')}
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
    last_add_at?: string
  } | null | undefined

  const page1State = relations?.page1?.state
  const page1HasPartner = !!relations?.page1?.profile?.user_id
  const page2State = relations?.page2State
  const page2Raw = relations?.page2
  const page2InviteObj = page2Raw && !Array.isArray(page2Raw) ? page2Raw : null
  const watchers = Array.isArray(relations?.watchers) ? relations!.watchers! : []

  // Broadcast is "active" while the 30m app_add cooldown is still running
  // (see home.tsx for the canonical derivation). Pausing while broadcasting
  // kicks every freshly-pulled candidate — same destructive ripple as
  // pausing with watchers present — so it must go through the confirm path.
  const ADD_COOLDOWN_MS = 30 * 60 * 1000
  const lastAddAtMs = (() => {
    const raw = relations?.last_add_at
    if (typeof raw !== 'string') return 0
    const t = Date.parse(raw)
    return Number.isFinite(t) ? t : 0
  })()
  const broadcastActive = !!lastAddAtMs && (Date.now() - lastAddAtMs) < ADD_COOLDOWN_MS

  // "Pause mode" reads off the canonical pair: both pages locked with no
  // live partner/profile on either side. Anything else counts as Game mode.
  const isOff = page1State === 'locked' && page2State === 'locked'
    && !page1HasPartner && !page2InviteObj
  // An active invitation (outgoing waiting / incoming pending) or a live chat
  // on EITHER page is a transient state whose own pane owns the resolution
  // flow. Hide the toggle entirely while any of those are open — it would be
  // inert and just clutter the photo.
  const hidden =
    page1State === 'waiting' || page1State === 'chat'
    || page2State === 'pending' || page2State === 'chat'
  const isActive = !isOff && !hidden

  // Whether switching to pause mode would notify someone: broadcasting in
  // flight, watchers in page2.profiles[], a pending invite incoming, a
  // watching/waiting/chat partner on page1. When none of those apply, the
  // press commits without a confirm prompt.
  const hasSideEffects = broadcastActive
    || watchers.length > 0
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
    if (hidden) { tapWarning(); return }
    tap()
    if (isOff) {
      performToggle('app/resume')
    } else if (!hasSideEffects) {
      performToggle('app/pause')
    } else {
      setConfirmOpen(true)
    }
  }, [busy, hidden, isOff, hasSideEffects, performToggle])

  // Currently active → glyph is Pause. Otherwise → Play (invites resume).
  const showPause = isActive

  // Confirm-popup copy/icon mirrors the visibility-toggle popups: ask the
  // same question we'd ask if the user reached for the same destructive
  // ripple via the toggle. The shared resolver returns the broadcast or
  // hide-profile variant when one applies; otherwise (a watching partner on
  // page1, etc.) we fall back to the generic pause copy. The confirm action
  // itself is `app/pause` regardless of which variant is shown — see
  // onConfirm below.
  const sharedConfirm = visibilityConfirmFor({ broadcastActive, watchersCount: watchers.length })
  const confirmTitle = sharedConfirm?.title ?? t('settings.gameMode.offConfirmTitle')
  const confirmDesc = sharedConfirm?.description ?? tg('settings.gameMode.offConfirmDesc', profile?.is_male)
  const confirmLabel = sharedConfirm?.confirmLabel ?? t('settings.gameMode.offConfirmButton')
  const topIcon = sharedConfirm?.topIcon ?? <PauseIcon color={PRIMARY} size={32} />

  // Hidden entirely while a transient interaction (pending invite, outgoing
  // waiting, in-chat) owns the resolution flow elsewhere. The overlay would
  // be non-interactive in those states and just clutter the photo. The
  // ConfirmDialog can only open from the interactive path, so unmounting it
  // alongside is safe.
  if (hidden) return null

  return (
    <>
      <Animated.View
        entering={FadeIn}
        exiting={FadeOut}
        style={styles.gameModeOverlay}
      >
        <RoundButton onPress={handlePress}>
          {busy ? (
            <ActivityIndicator size="small" color={PRIMARY} />
          ) : showPause ? (
            <PauseIcon color={PRIMARY} stroke={WHITE} size={ICON.huge} />
          ) : (
            <PlayIcon color={PRIMARY} stroke={WHITE} size={ICON.huge} />
          )}
        </RoundButton>
      </Animated.View>

      <ConfirmDialog
        visible={confirmOpen}
        title={confirmTitle}
        description={confirmDesc}
        confirmLabel={confirmLabel}
        icon={topIcon}
        onCancel={() => { if (!busy) setConfirmOpen(false) }}
        onConfirm={() => { performToggle('app/pause'); setConfirmOpen(false) }}
        busy={busy}
        draggable
      />
    </>
  )
}

type SettingsPageProps = { topInset?: number; onBack?: () => void; onNavigateHome?: () => void; focused?: boolean; onOpenSubPage?: (config: SubPageConfig) => Promise<void>; embedded?: boolean }

export default function SettingsPage({ topInset = 0, onBack, onNavigateHome, focused: _focused = true, onOpenSubPage, embedded = false }: SettingsPageProps = {}) {
  // Re-render the whole settings screen when the appearance toggle flips, so
  // every child re-reads the themed() Proxy stylesheet with the new scheme.
  useThemeRerender()
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

            <View style={{ marginTop: XL }}>
              <AppInlineContent onBack={onBack} onNavigateHome={onNavigateHome} onOpenSubPage={onOpenSubPage} />
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = themed((c) => ({
  rootOuter: { flex: 1, backgroundColor: c.bg },
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, height: 56,
  },
  backBtn: { minWidth: MD + SM * 2, paddingHorizontal: SM, paddingVertical: MD, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flex: 1, flexDirection: 'row', marginHorizontal: SM,
    backgroundColor: c.WHITE_SOFT, borderRadius: RADIUS, padding: XS,
  },
  tabItem: { flex: 1, paddingVertical: SM, alignItems: 'center', borderRadius: RADIUS },
  tabItemActive: { backgroundColor: c.fg },
  tabPill: { position: 'absolute', top: XS, bottom: XS, borderRadius: RADIUS, backgroundColor: c.fg },

  tabScroll: { flex: 1 },
  // No horizontal padding here: the profile card extends edge-to-edge, flush
  // with the tab strip. The option groups below get their inset via
  // `optionsWrap`.
  tabContent: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  optionsWrap: { paddingHorizontal: SM, marginTop: MD },

  section: { marginBottom: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: MD },
  sectionLabelRow: { flexDirection: 'row', marginTop: LG, marginBottom: SM, paddingHorizontal: SM },
  sectionLabel: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: c.WHITE_STRONG, letterSpacing: 1, textAlign: 'center' },
  sectionTitle: { fontSize: TEXT.xl, fontWeight: WEIGHT.extrabold, color: c.fg, marginBottom: SM },
  sectionValue: { fontSize: TEXT.md, fontWeight: WEIGHT.extrabold, color: c.fg },
  divider: { height: 0 },

  photoThumbStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: SM, justifyContent: 'flex-end', width: 44 * 3 + SM * 2 },
  photoThumb: { width: 44, height: 44, borderRadius: RADIUS },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: SM },
  slider: { width: '100%', height: 40 },
  sliderEndLabel: { fontSize: TEXT.sm, color: c.WHITE_MID, minWidth: 22, textAlign: 'center' },

  genderRow: { flexDirection: 'row', gap: SM, marginTop: SM },

  previewWrap: {
    flex: 1,
    backgroundColor: c.bg,
  },

  textInputWrap: { marginTop: SM, borderRadius: RADIUS, paddingHorizontal: MD, paddingTop: MD, paddingBottom: MD + SM, backgroundColor: c.WHITE_SOFT },
  textInputWrapInner: { paddingHorizontal: MD, paddingTop: MD, paddingBottom: MD + SM },
  textInputHeader: { flexDirection: 'row', alignItems: 'center', gap: SM, marginBottom: SM },
  textInput: { fontSize: TEXT.md, color: c.fg, padding: 0, textAlign: 'center', minHeight: 56 },
  charCount: { position: 'absolute', end: 12, bottom: 8, fontSize: TEXT.sm, color: c.WHITE_MID },

  // Account tab
  infoCard: {
    marginTop: SM, borderRadius: RADIUS, overflow: 'hidden',
    backgroundColor: c.WHITE_SOFT,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: MD, paddingVertical: MD,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.WHITE_SOFT,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: TEXT.md, color: c.WHITE_STRONG },
  infoValue: {
    fontSize: TEXT.md, fontWeight: WEIGHT.semibold, color: c.fg,
    flexShrink: 1, marginStart: MD,
  },

  accountLinkRow: {
    flexDirection: 'row', alignItems: 'center', gap: MD,
    backgroundColor: c.WHITE_SOFT, borderRadius: RADIUS,
    paddingHorizontal: MD, paddingVertical: MD,
    marginBottom: MD,
  },
  // Flat group: no frame, no shadow, no rounded corners. Rows are separated by
  // the subtle hairline `accountActionDivider` between siblings.
  accountLinksCard: {
    backgroundColor: c.bg,
    marginBottom: MD,
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
    backgroundColor: c.WHITE_SOFT,
  },
  profileCardTopSpacer: { height: MD + BUTTON_MIN_HEIGHT + MD },

  // Game-mode toggle — overlay anchored to the profile-card hero image.
  // The circular button itself is a RoundButton (visual + tap feedback);
  // this style only positions it.
  gameModeOverlay: {
    position: 'absolute',
    top: MD,
    left: MD,
    zIndex: 2,
  },
  profileCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  profileCardPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: c.WHITE_SOFT },
  profileCardScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  // flexDirection:'row' makes the single Text child sit on the logical
  // start side (right in RTL, left in LTR) — same pattern documented above
  // GameModeCard. textAlign/writingDirection alone proved inconsistent on iOS.
  profileCardCaption: { paddingHorizontal: MD, paddingVertical: MD, flexDirection: 'row' },
  // On-image caption: always light, regardless of theme — it sits over the
  // profile photo (a dark-ish surface), so inverting it would be unreadable.
  profileCardTitle: { color: WHITE, fontSize: TEXT.xl, fontWeight: WEIGHT.extrabold },
  accentCard: { backgroundColor: c.bg },
  accountLinkRowInner: {
    flexDirection: 'row', alignItems: 'center', gap: MD,
    paddingHorizontal: MD, paddingVertical: MD,
  },
  // Flat group, identical visual language to `accountLinksCard`: no frame,
  // no rounded corners, no shadow. Rows are separated by the hairline
  // `accountActionDivider`.
  accountActionsCard: {
    backgroundColor: c.bg, marginTop: SM,
  },
  accountActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: MD,
    paddingHorizontal: MD, paddingVertical: MD,
  },
  accountActionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: c.WHITE_SOFT,
    marginStart: MD,
  },
  accountActionTextWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  accountActionText: { fontSize: TEXT.md, color: c.fg, fontWeight: WEIGHT.semibold },
  accountActionTextDestructive: { color: c.WHITE_MID },
  // Account popup identity block: stacked text list (one field per line) in
  // PRIMARY on the white sheet, replacing the old chip pills.
  accountPopupList: { paddingHorizontal: MD, paddingBottom: MD, gap: XS },
  accountPopupListItem: {
    fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: c.BLACK_STRONG,
    // 'left' = start of writing direction (physically right in RTL after
    // auto-flip) — same correct-in-both-directions value the Chip text uses.
    textAlign: 'left', writingDirection: isRTL ? 'rtl' : 'ltr',
  },

  // Select field row — tappable row with label + value + forward chevron
  selectRow: {
    flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-start', gap: SM,
    backgroundColor: c.bg, borderRadius: RADIUS,
    paddingHorizontal: MD, paddingVertical: MD, marginTop: SM,
    overflow: 'hidden',
    shadowColor: c.BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  // Variant for use inside a grouped card (e.g. accountLinksCard) — no own
  // background or rounded corners; the parent card provides those.
  selectRowInner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: MD,
    paddingHorizontal: MD, paddingVertical: MD,
  },
  selectRowLarge: { paddingVertical: MD },
  selectRowLocked: { opacity: 0.45 },
  selectRowTextCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  selectRowLabelWrap: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', columnGap: SM },
  selectRowLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: MD },
  selectRowLabel: { fontSize: TEXT.md, lineHeight: lh(TEXT.md), color: c.fg, fontWeight: WEIGHT.semibold },
  selectRowSubtitle: { fontSize: TEXT.sm, color: c.WHITE_STRONG, marginTop: XS },
  selectRowTrailing: { flexDirection: 'row', alignItems: 'center', gap: SM },
  selectRowValue: { fontSize: TEXT.md, color: c.WHITE_STRONG, fontWeight: WEIGHT.semibold, flexShrink: 1, marginStart: 'auto', textAlign: (isRTL && Platform.OS === 'ios') ? 'left' : 'right', writingDirection: isRTL ? 'rtl' : 'ltr' },
  selectRowAvatar: {
    width: 44, height: 44, borderRadius: RADII.round,
    backgroundColor: c.WHITE_SOFT,
  },
  selectRowAccentIcon: {
    width: 36, height: 36, borderRadius: RADII.round,
    backgroundColor: c.WHITE_SOFT,
    alignItems: 'center', justifyContent: 'center',
  },
  selectRowIconWrap: { alignItems: 'center', justifyContent: 'center' },

  subPageOptionsCard: {
    marginHorizontal: SM, marginTop: MD,
    borderRadius: RADIUS, overflow: 'hidden',
    backgroundColor: c.WHITE_SOFT,
  },
  subPageOptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: MD, paddingVertical: MD,
  },
  subPageOptionLabel: { fontSize: TEXT.lg, color: c.fg },
  subPageCheckmark: { fontSize: TEXT.lg, color: c.WHITE_STRONG, fontWeight: WEIGHT.semibold },
  optionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: c.WHITE_SOFT,
    marginStart: MD,
  },
  subPageDesc: {
    marginHorizontal: SM, marginTop: MD,
    fontSize: TEXT.sm, color: c.WHITE_STRONG,
    textAlign: 'center', lineHeight: lh(TEXT.sm),
  },
}))
