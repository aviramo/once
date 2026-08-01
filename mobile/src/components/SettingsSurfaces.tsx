import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, I18nManager, Animated as RNAnimated, Dimensions, Keyboard, Linking, TextInput as RNTextInput } from 'react-native'
import { useSharedValue, type SharedValue } from 'react-native-reanimated'
import { Text, TextInput } from './AppText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { getLocales } from 'expo-localization'
import * as ImagePicker from 'expo-image-picker'
import { invoke } from '../lib/api'
import { tap, tapWarning } from '../lib/haptics'
import { useUserStore, resolveLocationType, selectIsHidden, selectInvisibleReason, selectWatcherCount, type LocationType } from '../stores/userStore'
import { useAuthStore } from '../stores/authStore'
import { t, tg, lang, genderize, lowerFirst } from '../i18n'
import { ConfirmDialog } from './ConfirmDialog'
import { BuildProfileGate } from './BuildProfileGate'
import { ToggleRow } from './Switch'
import { MatchCard } from './MatchCard'
import { PullContext, type PullCtx } from './PullPane'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import { localPhotoUriCache, pendingDeferred, processAndUploadPhotoDeferred } from './PhotoEditor'
import { MIN_PHOTOS, MAX_PHOTOS } from '../lib/photos'
import { TapMenu, TAP_MENU_ICON, type TapPoint } from './TapMenu'
import { hasSeenFlag, markSeenFlag } from '../lib/seenFlags'
import { SEEN_FLAGS } from '../keys'
import { supabase } from '../lib/supabase'
import type { Profile } from '../stores/userStore'
import { familyEmptyWeek, familyEqual, FAMILY_MAX_KIDS, FAMILY_MAX_WEEKS, startOfDisplayedWeek, sundayOfWeek, toISODate, defaultWeekStart, weekendDays, type FamilyData, type FamilyKid } from '../lib/family'
import { XS, SM, MD, LG, RADIUS, TEXT, WEIGHT, ICON, TAP_SLOP, STROKE, SHEET_GAP, SEARCH_DEBOUNCE_MS, DISABLED_OPACITY } from '../tokens'
import { GlyphSlot } from './GlyphSlot'
import { INK, INK_WASH, PAGE, SHADOW_BLACK, SURFACE, WHITE, WHITE_SOFT, WHITE_MID, WHITE_STRONG, INK_SUBTLE, INK_DIM, LINE } from '../colors'
import { OUTLINE_SKIN } from '../field'
import { SlidersIcon, RadiusIcon, GenderIcon, SignOutIcon, TrashIcon, UserIcon, CameraIcon, ChevronUpIcon, ChevronDownIcon, PhotoReplaceIcon, PhotoTrashIcon, CheckIcon, CreditIcon, SupportIcon, GlobeIcon, EyeOpenIcon, EyeOffIcon } from './icons'
import { creditTotal, creditHeld } from '../lib/credits'
import { hideProfileConfirm } from './visibilityConfirms'
import { BuyExtraPopup } from './BuyExtraPopup'
import { BottomSheet, SheetActionPair, SheetTitle } from './BottomSheet'
import { Button } from './Button'
import { StripBody } from './Strip'
import { MetaLine } from './MetaLine'
import type { MetaPart } from '../lib/meta'
import { supportMailUrl, brandSiteUrl } from '../lib/links'
import { Chip, CHIP_HEIGHT, PinIcon as PinGlyph, HomeIcon as HomeGlyph, WorkIcon as WorkGlyph } from './Chip'
import { units, M_PER_MI } from '../lib/units'
import { getLocation, getLocPermission, requestLocPermission, openLocPermSettings, openLocationSettings, enableLocationServices } from '../lib/location'

const isRTL = I18nManager.isRTL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

// Returns responder props that fire `onPress` only on clean taps (movement < TAP_SLOP).
// `onPressStateChange` lets the caller drive a visual pressed-state (e.g. fade
// in a PAGE-tinted background) without losing the raw-responder behaviour that's
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

// ── Select Field Types ─────────────────────────────────────────────────────

// (The `SubPageConfig` union and its eight member types stood here. They were
// the menu page's sub-page ROUTER — "open this field as a screen" — and the menu
// page is deleted, 2026-07-30. Every one of those fields is a popup raised by
// its own row now, so a config object describing a screen has nothing left to
// describe.)

// ── Select Field Row ───────────────────────────────────────────────────────
// Shared tappable settings row used across Preferences, Profile, App and the
// Main Menu. Layout (logical order, flips automatically in RTL):
//   [chevron] [label / title+subtitle] [trailing] ... [avatar]
// The row has NO separate value column: a field's current value is baked into
// the `label` as one whole sentence ("Available for women", "Up to 5 km").
// Splitting it into label + value read as two disconnected fragments at the
// row's size (user feedback 2026-07-20) — one text run reads as one statement.
// Variants:
//   - subtitle?          → small secondary text under the label (profile row)
//   - avatar?            → image URI rendered as a circular avatar at the end
//   - tone='accent'      → soft INK_WASH halo behind the trailing icon
// Press feedback fades in a PAGE background; `grouped` rows inherit
// rounding from their parent card so the press state stays inside the card.

function SelectFieldRow({
  label,
  subtitle,
  onPress,
  icon,
  avatar,
  grouped,
  tone = 'default',
  size = 'default',
  locked,
  labelColor,
  trailing,
  trailingBeside,
}: {
  label?: string
  /** The facts under the label, on the app's one fact line (MetaLine). */
  subtitle?: MetaPart[]
  onPress: () => void | Promise<unknown>
  icon?: React.ReactNode
  avatar?: string
  grouped?: boolean
  tone?: 'default' | 'accent'
  size?: 'default' | 'large'
  /** Dims the row content to signal the field is currently unavailable.
   * The row stays pressable so onPress can explain why. */
  locked?: boolean
  /** Ink for the label. The menu can tint a row's label (and its icon) to
   * distinguish groups; pass the same colour to this row's `icon` so the pair
   * matches. Since the app unified onto one purple, that tint is normally the
   * regular purple. */
  labelColor?: string
  /** A chip on the row's far END edge, riding its last text line (the watcher
   * count, the waiting-requests count). A live quantity belongs on its own
   * surface, not glued into the label string. */
  trailing?: React.ReactNode
  /** Stand that chip BESIDE the label instead of at the row's far edge (the
   * credits count, user directive 2026-07-30) — see Strip's `endBeside`. */
  trailingBeside?: boolean
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
            <GlyphSlot width={ICON.md} label={label} style={styles.selectRowIconWrap}>{icon}</GlyphSlot>
          )
        ) : null
        // A menu row IS a strip (user directive 2026-07-29): a leading glyph or
        // face, the label, and the facts under it on the app's one fact line —
        // the same object, from the same component, as the group rows this menu
        // opens. Only the row BOX stays here, because a menu row's is its own:
        // the press fade, the card grouping, the large/locked variants.
        // What that buys, and what this row therefore no longer decides:
        //  • The chip rides the row's LAST TEXT LINE — the subtitle when there
        //    is one, the label when there is not — at that line's END edge, or
        //    right beside its words with `trailingBeside`. It is never centred
        //    against the whole row: centred it read as a control floating beside
        //    the button rather than as a fact stated by its line.
        //  • A subtitle stating several facts (the communities counts) is laid
        //    out by MetaLine, so it wraps when the column is narrow, drops its
        //    separator at the break, and never paints its scripts out of order.
        //  • The subtitle aligns with the LABEL TEXT, not under the leading
        //    icon: they share one column rather than the subtitle being
        //    indented by a guess at the icon's width.
        // The lane wrappers stay: `selectRowLabelGroup` is what centres a taller
        // leading element (avatar, accent circle) against the label, and the
        // plain glyph opts out of that on its own (selectRowIconWrap).
        return label != null ? (
          <View style={styles.selectRowTextCol}>
            <View style={styles.selectRowLabelGroup}>
              <StripBody
                icon={renderedIcon}
                iconLane="natural"
                title={label}
                titleColor={labelColor}
                meta={subtitle}
                lineEnd={trailing ? <View style={styles.selectRowTrailing}>{trailing}</View> : null}
                endBeside={trailingBeside}
              />
            </View>
          </View>
        ) : renderedIcon
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

// (The per-tab TabIcon that used to live here is gone with the tabs it named.
// Only its `profile` branch had a caller left — the photo placeholder below —
// and it was a second hand-drawn person standing beside the app's own UserIcon.
// One glyph, one place: components/icons.tsx.)

// ── Visibility: the state IS the control ───────────────────────────────────
// The row that LEADS the preferences popup home's dock opens (VisibilityRow)
// says the state as its label and flips it when tapped, so the rule about HOW it
// flips lives here rather than in the row: going hidden kicks every watcher
// pinned to the user, so it is confirmed first; going visible is immediate. It
// is also the only way back to visible now that page2 has no UI of its own, so
// it must stay reachable and must not silently fail. (It used to be one control
// on two surfaces, the second being the chip on the menu's profile photo; the
// menu is deleted, 2026-07-30.)
//
// Visibility is NOT credit-gated any more. The server used to auto-hide a
// zero-credit wallet (the dispatcher's maybeAutoHide → app_lock2), so this
// control routed an empty wallet to the buy picker instead of app/free2, which
// would have been undone in the same round trip. That auto-hide is gone
// (2026-07-22): being broke keeps you visible on purpose — the invitation
// you can't accept is the moment to buy.
//
// The haptic is deliberately NOT in here: one caller is a Chip, which fires none
// of its own, and the other is a SelectFieldRow, whose tap responder already
// does. A tap in the hook would double on the row.
function useVisibility() {
  const { profile } = useUserStore()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const isHidden = selectIsHidden(profile)

  const run = useCallback(async (endpoint: string) => {
    if (busy) return
    setBusy(true)
    try { await invoke(endpoint) } catch (e) { console.error(e) }
    finally { setBusy(false); setConfirmOpen(false) }
  }, [busy])

  const toggle = useCallback(() => {
    if (!isHidden) { setConfirmOpen(true); return }
    run('app/free2')
  }, [isHidden, run])

  // Watcher count drives two surfaces: the count beside the state, and the
  // concrete ripple in the hide confirm. deriveCompat only fills the array while
  // page2 is free, so a hidden user reads 0 without a separate guard.
  const watcherCount = selectWatcherCount(profile)
  const confirm = hideProfileConfirm(watcherCount)

  return {
    // No `isHidden` out of here: what the row PAINTS is selectInvisibleReason,
    // which knows the second reason this hook does not (an unbuilt profile), and
    // two answers to "am I hidden" on one row is one too many.
    watcherCount,
    toggle,
    /** The confirm that gates going hidden. Rendered by whichever surface owns
     *  the control — it is the same dialog either way. The glyph is ICON.md, the
     *  size every other button icon wears: the icon's own 28 default made it
     *  tower over the label beside it. */
    dialog: (
      <ConfirmDialog
        visible={confirmOpen}
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.confirmLabel}
        confirmIconStart={<EyeOffIcon color={WHITE} />}
        onCancel={() => { if (!busy) setConfirmOpen(false) }}
        onConfirm={() => run('app/lock2')}
        busy={busy}
      />
    ),
  }
}

// What the watcher count SAYS on that row (user directive 2026-07-31): the row
// states its state as a sentence about the user, so the pill beside it finishes
// that sentence instead of dropping a bare digit into it — a number alone says
// nothing about what it counts, and here there is a whole line to say it on. The
// dock's preferences key keeps the bare number (see HomeDock): a mark beside a
// glyph has no room for a sentence, and this row is the sentence it points at.
// One definition, in the app's own `xLabel(n)` shape, with the singular as its
// own string because Hebrew inflects the verb for a single watcher.
//
// It answers for ZERO too (user directive 2026-08-01), so the pill stands beside
// a visible row at every count and the row is never a state with no value: an
// empty trailing lane read as the count having failed to load, when what it meant
// was "nobody" — the one answer a visible user opens this row to check. A hidden
// row still carries nothing, because there the count is not zero, it is moot.
const watcherLabel = (n: number) =>
  n === 0 ? t('settings.watchersNone')
    : n === 1 ? t('settings.watchersOne')
      : t('settings.watchersMany').replace('{count}', String(n))

// The same control as a MENU ROW — the first field of the preferences popup
// (user directive 2026-07-30). It states the whole thing as a sentence about the
// user ("I am visible" / "I am hidden"), because a row is read as a line of text
// where the photo's chip is read as a badge, and the live watcher count rides
// BESIDE that sentence on the credits row's own trailing pill: the count is a
// fact about the state the label just named, so it reads as that label's value
// rather than as a control facing it from the row's far edge.
//
// A user who has not built a profile reads HIDDEN here, because that is what he
// is (user directive 2026-07-30): others() drops a photo-less row from every
// pool, so the honest sentence is the same one an explicit hide gets, and the
// row is the one place in the app that states this fact. The control is SHUT
// while that is the reason — `locked`, the app's shut-door fade — but it stays
// pressable and answers with the door that opens it, the build-profile gate,
// exactly as the dock's faded Circles key does. A shut control that says nothing
// when tapped is the one thing this must never be.
function VisibilityRow({ onBuildProfile }: {
  /** Raised when the shut row's gate is confirmed. The popup this row lives in
   *  has to close before onboarding can be pushed — see PreferencesPopup. */
  onBuildProfile: () => void
}) {
  const { profile } = useUserStore()
  const vis = useVisibility()
  const [gateOpen, setGateOpen] = useState(false)
  if (!profile) return null
  const reason = selectInvisibleReason(profile)
  const unbuilt = reason === 'unbuilt'
  return (
    <>
      <SelectFieldRow
        grouped
        label={genderize(
          reason ? t('settings.visibilityStateHidden') : t('settings.visibilityStateVisible'),
          profile.is_male,
        )}
        icon={reason ? <EyeOffIcon color={INK} size={ICON.md} /> : <EyeOpenIcon color={INK} size={ICON.md} />}
        labelColor={INK}
        locked={unbuilt}
        trailing={!reason ? <Chip small text={watcherLabel(vis.watcherCount)} /> : undefined}
        trailingBeside
        // No haptic here for either branch: the row's tap responder fires one.
        onPress={() => { if (unbuilt) { setGateOpen(true); return } vis.toggle() }}
      />
      {vis.dialog}
      {/* Nested inside the preferences popup, which is the only way two popups
          may overlap (BottomSheet.tsx) — the list stays lit underneath. */}
      <BuildProfileGate
        visible={gateOpen}
        // Neither line is genderized any more: both name the PHOTOS instead of
        // telling the user to go and build something (2026-08-01), so neither is
        // in the imperative and neither carries a {m|f} marker.
        title={t('home.buildProfileTitle')}
        description={t('settings.visibilityGateDesc')}
        onClose={() => setGateOpen(false)}
        onConfirm={onBuildProfile}
      />
    </>
  )
}

function PreferencesContent({ leading }: {
  /** A row to stand at the HEAD of the same card, before the four preferences.
   *  The popup home's dock opens leads with the visibility row (VisibilityRow);
   *  the menu does not, because the profile photo above it already carries that
   *  state as its chip and two controls for one state on one screen is one too
   *  many. A prop, never a forked second copy of this block. */
  leading?: React.ReactNode
}) {
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
  // The gender field's opening word is itself gendered by the user's own sex
  // ("פנוי"/"פנויה"); English collapses to "Available" (genderize no-op).
  // The picker's option strings are standalone sentences ("For women"), so
  // they need their initial lowered to continue this one ("Available for
  // women"). No-op in Hebrew — the script has no case.
  const genderLabel = `${genderize(t('settings.preferredGender'), profile.is_male)} ${lowerFirst(genderDisplayValue)}`
  const locationType = resolveLocationType(profile)
  // Location row: one sentence naming the chosen anchor ("מהבית" / "מהמשרד" /
  // "מהמיקום הנוכחי שלי"), with the icon matching it. Home/work append the
  // picked address; the device case appends nothing (the sentence already
  // says it's the current location).
  const locationFieldAnchor =
    locationType === 'home' ? t('settings.locationFromHome')
    : locationType === 'work' ? t('settings.locationFromWork')
    : t('settings.locationFromDevice')
  const locationFieldAddress =
    locationType === 'home' ? (profile.location_label || t('settings.locationHome'))
    : locationType === 'work' ? (profile.location_label || t('settings.locationWork'))
    : undefined
  // Comma, not a space: the address is an apposition on the anchor
  // ("From home, 12 Rothschild St"), not a continuation of it.
  const locationFieldLabel = locationFieldAddress
    ? `${locationFieldAnchor}, ${locationFieldAddress}`
    : locationFieldAnchor
  const locationFieldIcon =
    locationType === 'home' ? <HomeGlyph color={INK} size={ICON.md} />
    : locationType === 'work' ? <WorkGlyph color={INK} size={ICON.md} />
    : <PinGlyph color={INK} size={ICON.md} />
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
        {leading}
        {/* Order (user request): gender, then ages, then distance, location. */}
        <SelectFieldRow
          grouped
          label={genderLabel}
          onPress={() => setGenderPopupVisible(true)}
          icon={<GenderIcon color={INK} />}
          labelColor={INK}
        />
        <SelectFieldRow
          grouped
          // No bidi isolate around the pair: natural bidi order puts the MIN
          // first in reading direction (rightmost under RTL, leftmost under
          // LTR). The old LRI/PDI wrap forced LTR and so read max-first in
          // Hebrew (user directive 2026-07-28: revert to natural).
          label={`${t('settings.ageRange')} ${ageMin === ageMax ? `${ageMin}` : `${ageMin} – ${ageMax}`}`}
          onPress={() => setAgePopupVisible(true)}
          icon={<SlidersIcon color={INK} />}
          labelColor={INK}
        />
        <SelectFieldRow
          grouped
          // "עד {value}" normally; unlimited has its own standalone sentence
          // ("ללא הגבלת מרחק"). (The zero/"ממש כאן" special-case was reverted
          // at the user's request — it reads normally as "עד ממש כאן".)
          label={radius === Infinity
            ? t('settings.rangeUnlimitedLabel')
            : `${t('settings.range')} ${formatRadius(radius)}`}
          onPress={() => setRadiusPopupVisible(true)}
          icon={<RadiusIcon color={INK} />}
          labelColor={INK}
        />
        <SelectFieldRow
          grouped
          label={locationFieldLabel}
          locked={locationLocked}
          onPress={() => locationLocked
            ? setLocationLockedInfoVisible(true)
            : setLocationPopupVisible(true)}
          icon={locationFieldIcon}
          labelColor={INK}
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
      {/* Location is frozen during an active interaction. Informational
          notice: it just explains why the row didn't open the picker and
          tells the user to finish the current view/invitation first. Carries
          a single "got it" acknowledge button (default ✓) so there's an
          explicit way to close it, on top of swipe / backdrop. */}
      <ConfirmDialog
        visible={locationLockedInfoVisible}
        title={t('settings.locationLockedTitle')}
        description={genderize(t('settings.locationLockedDesc'), profile.is_male)}
        confirmLabel={t('common.gotIt')}
        onConfirm={() => setLocationLockedInfoVisible(false)}
        onCancel={() => setLocationLockedInfoVisible(false)}
      />
    </View>
  )
}


// ── Account Tab ────────────────────────────────────────────────────────────
// Icons (SignOutIcon, TrashIcon, UserIcon) imported from
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

  if (!profile || !user) return null

  const age = profile.birth_date ? calcAge(profile.birth_date) : null
  const gender =
    profile.is_male === true  ? t('settings.male')
    : profile.is_male === false ? t('settings.female')
    : '—'

  const nameAndGender = [profile.name, gender !== '—' ? gender : null].filter(Boolean).join(', ') || '—'
  // Who this account is, as facts about one thing — so they go on the app's ONE
  // fact line (MetaLine), not three stacked pills. A chip is a tile you can act
  // on or a count that stands apart; these are the details OF the account named
  // in the title above them, which is exactly what a meta line states.
  const identityFacts: MetaPart[] = [
    nameAndGender,
    profile.birth_date ? `${formatBirthDate(profile.birth_date)} (${age})` : null,
    user.email ?? null,
  ]

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onClosed={handleClosed}
    >
      {/* The popup says whose account this is, then states it: the title, and
          under it the identity on the app's one fact line, centred and in full
          INK the way the group popup's head states a group's facts. The line
          stands where a description would, so it takes that same gap. */}
      <View style={styles.accountPopupHead}>
        <SheetTitle>{t('settings.myAccount')}</SheetTitle>
        <MetaLine parts={identityFacts} color={INK} align="center" />
      </View>
      {/* WHAT I MAY DO, BESIDE WHAT I AM BEING OFFERED — the app's one pair at
          the foot of a popup (user directive 2026-07-31, the group popup's own
          row): deleting the account is a bare mark on NO GROUND AT ALL, passed on
          the way past, and signing out is the purple, ending the row under the
          thumb. They were two full-width tiles stacked, the drastic one receding
          into a muted secondary — but a tile is a tile, and the thing you must
          never press by accident was still painted as something to press. Bare
          ink beside a filled button is the strongest form of that difference the
          app has, and the confirm dialog behind it is what actually guards it. */}
      <SheetActionPair
        options={[{
          key: 'delete',
          label: t('settings.deleteAccount'),
          icon: <TrashIcon color={INK} size={ICON.xxl} />,
          onPress: () => { tapWarning(); dismissThen(onDeletePress) },
        }]}
        action={
          <Button
            label={tg('settings.signOut', profile.is_male)}
            iconStart={<SignOutIcon color={WHITE} />}
            onPress={() => { tap(); dismissThen(onSignOutPress) }}
          />
        }
      />
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
  const [fromText, setFromText] = useState(String(ageMin))
  const [toText, setToText] = useState(String(ageMax))
  const fromRef = useRef<RNTextInput>(null)
  const toRef = useRef<RNTextInput>(null)

  useEffect(() => {
    if (visible) {
      setFromText(String(ageMin))
      setToText(String(ageMax))
    }
  }, [visible, ageMin, ageMax])

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
  // Two fields side by side and nothing else — no title, so the sheet's own top
  // air stands above them and its bottom gap under them. It used to declare a
  // gutter, a paddingTop:0 and an SM above and below the row, which is why this
  // popup opened tighter than the one that raised it. (Its unused `title` style
  // went with them: this popup has never rendered one.)
  row: {
    flexDirection: 'row', gap: SM,
  },
  field: {
    flex: 1,
    backgroundColor: INK_WASH,
    borderRadius: RADIUS,
    paddingVertical: SM,
    paddingHorizontal: SM,
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: TEXT.md,
    color: INK,
  },
  input: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.medium,
    // Always black. selectTextOnFocus highlights the digits on focus; the
    // selection tint is AppText's app-standard translucent SELECTION, so the
    // black number stays readable on it (the old bespoke solid-black
    // selectionColor + white-text flip rendered white-on-light, unreadable).
    color: INK,
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
      <View style={[selectListStyles.row, pressed && { backgroundColor: PAGE }]}>
        {/* labelWrap is flexDirection:'row' so the Text child auto-flips to
            the logical start side (right in RTL) — more reliable on iOS than
            textAlign alone. */}
        <View style={selectListStyles.labelWrap}>
          {icon ? <View style={selectListStyles.rowIcon}>{icon}</View> : null}
          <Text style={[selectListStyles.label, selected && selectListStyles.labelSelected]}>{label}</Text>
        </View>
        <View style={selectListStyles.checkSlot}>
          {selected ? <CheckIcon color={INK} /> : null}
        </View>
      </View>
      {!isLast ? <View style={selectListStyles.divider} /> : null}
    </View>
  )
}

const selectListStyles = StyleSheet.create({
  // Edge-to-edge rows: the ONE thing a popup body may override about the frame,
  // because a row that is tapped runs the full width of the sheet. The air above
  // the first row and under the last one are still the popup's own, the same in
  // every popup (they used to be an XL and a 0 of this list's own).
  card: { paddingHorizontal: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: MD, paddingHorizontal: MD,
  },
  labelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  rowIcon: { marginEnd: SM },
  label: { fontSize: TEXT.md, color: INK },
  labelSelected: { color: INK, fontWeight: WEIGHT.medium },
  checkSlot: { width: ICON.xxl, height: ICON.xxl, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: LINE, marginHorizontal: MD },
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
  // Both sentences this popup addresses the user with (the address field's
  // placeholder and the no-results line) are imperatives, so they take his sex.
  const isMale = useUserStore(st => st.profile?.is_male)
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
        if (results.length === 0) setSearchError(genderize(t('settings.locationNoResults'), isMale))
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return
        setSearchError(genderize(t('settings.locationNoResults'), isMale))
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
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
        setSearchError(genderize(t('settings.locationNoResults'), isMale))
        return
      }
      const label = details.label || p.description
      onSelectTyped(pendingType, label, details.lat, details.lng)
      onDismiss()
    } finally {
      setSelecting(false)
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      // The address step claims a fixed tall sheet so the results list has room
      // whether or not it has results yet. Nothing here about the keyboard: the
      // sheet lifts itself and its `flexShrink` takes this height back down by
      // however much the keyboard needs (BottomSheet.tsx).
      cardWrapStyle={step === 'address' ? { height: addressSheetH } : undefined}
      contentStyle={step === 'address' ? locationPopupStyles.addressCard : selectListStyles.card}
    >
      {step === 'menu' ? (
        <>
          <SelectListRow
            label={t('settings.locationDevice')}
            icon={<PinGlyph color={currentType === 'device' ? INK : INK_SUBTLE} size={ICON.md} />}
            selected={currentType === 'device'}
            isLast={false}
            onPress={handleMyLocation}
          />
          <SelectListRow
            label={t('settings.locationHome')}
            icon={<HomeGlyph color={currentType === 'home' ? INK : INK_SUBTLE} size={ICON.md} />}
            selected={currentType === 'home'}
            isLast={false}
            onPress={() => { setPendingType('home'); setStep('address') }}
          />
          <SelectListRow
            label={t('settings.locationWork')}
            icon={<WorkGlyph color={currentType === 'work' ? INK : INK_SUBTLE} size={ICON.md} />}
            selected={currentType === 'work'}
            isLast={true}
            onPress={() => { setPendingType('work'); setStep('address') }}
          />
          {deviceBusy ? (
            <View style={locationPopupStyles.statusRow}>
              <ActivityIndicator color={INK} />
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
              placeholder={genderize(t('settings.locationAddressPrompt'), isMale)}
              placeholderTextColor={INK_DIM}
              autoFocus
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching || selecting ? (
              <View style={locationPopupStyles.searchSpinner}>
                <ActivityIndicator color={INK} />
              </View>
            ) : null}
          </View>
          {searchError && predictions.length === 0 && !searching ? (
            <Text style={locationPopupStyles.errorText}>{searchError}</Text>
          ) : null}
          {/* No bottom padding of its own: the sheet's own gap sits under the
              scroll, so a second one here would double it. */}
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
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
  statusText: { fontSize: TEXT.md, color: INK_SUBTLE },
  // Why the address could not be resolved, under the field it belongs to. INK,
  // not WHITE_MID: popup text is full-strength purple on the white sheet (user
  // directive 2026-07-26) — a near-white ink here was invisible on it.
  errorText: {
    paddingHorizontal: MD, paddingTop: MD,
    fontSize: TEXT.md, color: INK,
  },
  // Address-step content fills the (now tall) cardWrap. Its own gutter, because
  // both steps of this popup are edge-to-edge row lists (`selectListStyles.card`)
  // and the search field is the one thing here that is not a row. The air ABOVE
  // it is the popup's, as in every popup — this step used to add an SM of its own
  // on top of it — and so is the air under the list.
  addressCard: { flex: 1, paddingHorizontal: 0 },
  addressBody: { flex: 1, paddingHorizontal: MD },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SM, marginBottom: SM,
  },
  searchInput: {
    flex: 1, fontSize: TEXT.md, color: INK,
    backgroundColor: PAGE, borderRadius: RADIUS,
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

// How tall the inline value picker's list may grow before it scrolls. A cap of
// its own rather than the sheet's, because this picker STACKS over the family
// sheet: it has to read as a small list laid on that sheet, not as a second
// full-height popup replacing it.
const FAMILY_PICKER_MAX_H = 360

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
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      contentStyle={familyStyles.valuePopupCard}
    >
      <SheetTitle>{title}</SheetTitle>
      <ScrollView style={familyStyles.valuePopupList} keyboardShouldPersistTaps="handled">
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
  visible, initial, initialIsForKids, weekStart, isMale, onDismiss, onSave,
}: {
  visible: boolean
  initial: FamilyData | null
  initialIsForKids: boolean | null
  weekStart: number
  isMale: boolean | null
  onDismiss: () => void
  onSave: (data: FamilyData, isForKids: boolean | null) => void
}) {
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

  // Tapping outside closes the sheet on the same frame. The save is handed to
  // the parent as fire-and-forget — waiting for the round trip to finish before
  // closing made the popup feel stuck on a slow network.
  const handleDismiss = () => {
    if (dirty) onSave(current, isForKids)
    onDismiss()
  }
  const onPickerDismiss = () => setPickerTarget(null)
  const onPickerPick = (value: number) => {
    if (!pickerTarget) return
    setKidAge(pickerTarget.index, value === AGE_CLEAR ? undefined : value)
    setPickerTarget(null)
  }

  // The toggle label states the count back to the user, so the row doubles as
  // the answer ("I have 2 kids") instead of just the question. Zero kids keeps
  // the plain phrasing — the toggle can be on before any kid has been added.
  const hasKidsLabel = kids.length === 0
    ? t('family.hasKidsYes')
    : kids.length === 1
      ? t('family.hasKidsYesOne')
      : t('family.hasKidsYesMany').replace('{count}', String(kids.length))

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
      cardWrapStyle={{ maxHeight: sheetMaxH }}
      contentStyle={familyStyles.sheet}
    >
              <ScrollView
                style={familyStyles.scrollBody}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Has kids? — single toggle row. No section marginBottom so
                    it sits flush against the kids/schedule wrapper (and, when
                    hasKids is off, against the static "Interested in kids"
                    row below). */}
                <View>
                  <ToggleRow
                    label={hasKidsLabel}
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

              {/* No tail spacer: the sheet's own bottom gap sits under the
                  scroll, the same one every popup ends on. */}

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
  sheet: {
    // No ground and no frame of its own: every popup is WHITE and BottomSheet's
    // card paints it (user directive 2026-07-28), and the air above the first row
    // is the popup's (2026-07-30 — this sheet used to add a RADIUS of its own,
    // and its scroll another SM on top of that). Only the tighter gutter its
    // full-width rows want, and the shrink that lets the body obey the sheet's
    // height cap.
    paddingHorizontal: SM,
    flexShrink: 1,
  },
  // The body gives when the sheet hits its height cap; it adds no padding of its
  // own at either end (both are the popup's).
  scrollBody: { flexShrink: 1 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SM,
    paddingHorizontal: MD,
  },
  toggleLabel: { fontSize: TEXT.md, color: INK },
  section: { marginBottom: MD },
  subSection: {},
  sectionTitle: { fontSize: TEXT.md, color: INK, marginBottom: SM },
  subSectionTitle: { fontSize: TEXT.md, color: INK },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: XS },
  sectionHint: { fontSize: TEXT.md, color: INK_SUBTLE, marginTop: XS, marginBottom: MD },
  optional: { fontSize: TEXT.md, color: INK_SUBTLE },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SM },
  pill: { paddingHorizontal: MD, paddingVertical: SM, borderRadius: 999, backgroundColor: PAGE },
  pillSelected: { backgroundColor: INK },
  pillLabel: { fontSize: TEXT.md, color: INK },
  pillLabelSelected: { color: WHITE },
  sectionPill: {
    paddingHorizontal: MD, paddingVertical: SM, borderRadius: 999,
    backgroundColor: INK_WASH,
  },
  sectionPillLabel: { fontSize: TEXT.md, color: INK },
  card: {
    backgroundColor: PAGE,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  cardRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  cardRowDividerLast: { borderBottomWidth: 0 },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: MD, paddingVertical: MD,
  },
  dropdownLabel: { fontSize: TEXT.md, color: INK },
  dropdownValue: { fontSize: TEXT.md, color: INK },
  dropdownPlaceholder: { fontSize: TEXT.md, color: INK_SUBTLE },

  // "Days with kids" schedule. Title + weeks render inline with the rest of
  // the form (no enclosing card). Title sits flush, weeks gap below.
  scheduleWrap: { marginTop: SM, paddingHorizontal: MD, gap: MD },

  // Kid age chips. Each chip is a pill split into a tappable label area
  // (opens age picker) and an × remove button. Wraps to multiple rows.
  kidChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SM, paddingHorizontal: MD, marginTop: XS },
  kidChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 999, backgroundColor: PAGE,
    paddingStart: MD, paddingEnd: SM,
  },
  kidChipMain: { paddingVertical: SM },
  kidChipLabel: { fontSize: TEXT.md, color: INK },
  kidChipPlaceholder: { fontSize: TEXT.md, color: INK_SUBTLE },
  kidChipRemoveBtn: { paddingHorizontal: SM, paddingVertical: XS },
  // A single × glyph: its line box should equal the glyph, so lineHeight tracks
  // the font size rather than the 1.4× body ratio.
  kidChipRemoveLabel: { fontSize: TEXT.lg, color: INK_SUBTLE, lineHeight: TEXT.lg },
  // "+ Add kid" is the only ACTION among the kid chips (the rest are values
  // you edit), so it is a solid filled pill rather than a dashed outline: the
  // dashed version read as a placeholder slot, not as something you press.
  kidChipAdd: {
    paddingHorizontal: MD, paddingVertical: SM,
    borderRadius: 999,
    backgroundColor: INK,
  },
  kidChipAddLabel: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: WHITE },

  // + Add kid / + Add week button.
  addKidBtn: { ...OUTLINE_SKIN, paddingVertical: SM, alignItems: 'center', borderStyle: 'dashed' },
  addKidLabel: { fontSize: TEXT.md, color: INK },

  weekHeader: { marginBottom: MD, gap: XS },
  weekFooter: { flexDirection: 'row', alignItems: 'center', marginTop: SM },
  weekLabel: { fontSize: TEXT.md, color: INK },
  weekLabelEmphasis: { fontWeight: WEIGHT.medium },
  weekHint: { fontSize: TEXT.md, color: INK_SUBTLE },
  weekRemove: { fontSize: TEXT.md, color: INK_SUBTLE },
  daysRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dayCell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-start', gap: XS },
  dayBubble: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE, borderWidth: STROKE.thin, borderColor: LINE,
  },
  dayBubbleSelected: { backgroundColor: INK, borderColor: INK },
  // Weekend cells (locale-defined: Fri+Sat for he/ar, Sat+Sun otherwise)
  // get a tinted bubble + primary-colored letter when not selected, so the
  // user can orient themselves visually toward their weekend without reading.
  dayBubbleWeekend: { backgroundColor: INK_WASH, borderColor: INK_WASH },
  dayLetterWeekend: { color: INK },
  dayLetter: { fontSize: TEXT.md, color: INK },
  dayLetterSelected: { color: WHITE },
  dayDate: { fontSize: TEXT.sm, color: INK_SUBTLE },
  addWeekBtn: { ...OUTLINE_SKIN, marginTop: MD, paddingVertical: MD, alignItems: 'center', borderStyle: 'dashed' },
  addWeekLabel: { fontSize: TEXT.md, color: INK },
  // Static bottom strip housing the "Interested in kids" toggle. Sits below
  // the sheet's ScrollView so the cards expanding/collapsing inside don't
  // push it around. Same tone + horizontal padding as the sheet, so the popup
  // reads as one continuous surface.
  interestedBar: { backgroundColor: SURFACE },

  // Inline picker (count / age) sheet. A tighter gutter than the standard one
  // because its body is a list of full-width tappable rows, like every other
  // row-list popup; everything else about the frame — the air above the title,
  // under the list, and the gap between them — is the popup's own.
  valuePopupCard: {
    paddingHorizontal: SM,
  },
  valuePopupList: { maxHeight: FAMILY_PICKER_MAX_H, marginTop: SHEET_GAP.block },
  valueRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: MD, paddingHorizontal: SM,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE,
  },
  valueRowLabel: { fontSize: TEXT.md, color: INK },
  valueRowLabelSelected: { color: INK, fontWeight: WEIGHT.medium },
  valueRowCheck: { fontSize: TEXT.md, color: INK, fontWeight: WEIGHT.medium },
  // Label + Yes/No pills share one row when there's room; only wrap to two
  // lines when there isn't. marginStart:'auto' on the pills (see below) keeps
  // them on the logical-end side in both the same-row and wrapped cases.
  triOptionRow: { flexWrap: 'wrap', rowGap: SM },
  triOptionLabel: { flexShrink: 1 },
  triOptionPills: { marginStart: 'auto', flexDirection: 'row', gap: SM },
  triOptionPill: { paddingHorizontal: MD, paddingVertical: SM, borderRadius: 999, backgroundColor: PAGE },
  triOptionPillSelected: { backgroundColor: INK },
  triOptionPillLabel: { fontSize: TEXT.md, color: INK },
  triOptionPillLabelSelected: { color: WHITE },
})

// ── What a photo on your own card opens ─────────────────────────────────────
// (user directive 2026-07-31.) A `BottomSheet` of four labelled tiles stood
// here — move up / replace / delete / move down, a whole surface raised from the
// bottom of the screen to say four words about the photo the user had just put a
// finger on. It is a `TapMenu` now (components/TapMenu.tsx): the same four
// verbs, as rows that pop out of the tap itself. Nothing is being announced, so
// nothing is raised; the verbs stand where the thing they act on is.
//
// The SURFACE changed and the LIST did not. Replace was dropped along with the
// popup that morning, on "replacing is deleting and adding, and both are one tap
// away", and the user put it back the same day: it had been there all along and
// worked, and it is the one edit that leaves the ORDER of the photos — which is
// what the card reads top to bottom — untouched.
//
// The two cases the sheet spelled out in words are not spelled out at all now:
// a move at either end of the list, and the delete at the two-photo floor, are
// simply absent (see TapMenu — only what applies is listed).

// (`ProfileAddPopup` stood here until 2026-08-01: a popup listing the two things
// that could still be ADDED to your own profile, raised by a plus on the card's
// heading tile. Both the plus and the popup are deleted, because each of its two
// rows now lives where the thing it adds actually IS — a photo is a row of the
// PHOTO's own menu, and family & kids is an empty chip standing in the fact set's
// own place on the first photo. With nothing left for it to list, it was a door
// in front of two doors.)

// Full-screen pane showing the user's profile card preview: the sheet the dock's
// profile key raises, and the page a roster row that is ME opens inside Circles.
// It renders NO way out of itself and never did — it took an `onBack` it never
// called, back when the sheet above it supplied a floating X. Both of those Xs
// went on 2026-07-31, so the prop went with them: the swipe is the way out.

export function PreviewFieldPage({
  dismissGestureRef, onScrollAtTop, headerBottomShared, pullEngaged, clipBottom: _clipBottom,
}: {
  dismissGestureRef?: React.MutableRefObject<GestureType | undefined>
  onScrollAtTop?: (atTop: boolean) => void
  headerBottomShared?: SharedValue<number>
  // Live "the dismiss-pan is engaged" flag from the parent's usePullBehavior.
  // Threaded into pullCtx so PullScrollView drops scrollEnabled while pulling
  // (same protection page1/page2 get via usePullCtx). Without it the inner
  // ScrollView competes with the pan and keeps a few px of residual scroll
  // velocity, so after a swipe-down + snap-back the content lands nudged down.
  // A SHARED value: this page must not re-render because a drag started on it.
  pullEngaged?: SharedValue<boolean>
  clipBottom?: boolean
}) {
  const insets = useSafeAreaInsets()
  const { profile, update } = useUserStore()
  const { user } = useAuthStore()
  // WHICH photo was tapped and WHERE — the menu of verbs pops out of that point
  // (see TapMenu). One piece of state because the two are one fact: there is no
  // moment where a photo is chosen and the finger that chose it is unknown.
  const [photoMenu, setPhotoMenu] = useState<{ index: number; at: TapPoint } | null>(null)
  const photoMenuIndex = photoMenu?.index ?? null
  const [familyPopupVisible, setFamilyPopupVisible] = useState(false)
  // ── THE FIRST-OPEN PHOTO TUTORIAL (user directive 2026-08-01) ─────────────
  // The photos on your own profile carry a menu of edits and nothing on screen
  // says so. So the first time this page opens, that very menu pops with ONE row
  // in it, saying to tap a photo — the thing being taught demonstrated by
  // itself, rather than described by a surface of a different kind. It is put
  // away by tapping either the row or a photo, and from then on the ordinary
  // menu is what a photo opens.
  //
  // It is not the exception to "nothing takes the screen away from the user to
  // teach him something" so much as the reading of it: `TapMenu` raises no
  // scrim, dims nothing, and goes away on any touch at all — it is a label
  // standing on the photo for as long as the user looks at it.
  const [tutorialAt, setTutorialAt] = useState<TapPoint | null>(null)
  useEffect(() => {
    let live = true
    hasSeenFlag(SEEN_FLAGS.photoMenuSeen).then(seen => {
      if (!live || seen) return
      // Anchored at the middle of the window, because there is no finger to
      // anchor to — this menu is the only one in the app that was not opened by
      // a touch. TapMenu keeps itself inside the page gutter and both safe
      // areas from there, exactly as it does for a real one.
      const { width, height } = Dimensions.get('window')
      setTutorialAt({ x: width / 2, y: height / 2 })
    })
    return () => { live = false }
  }, [])
  const endTutorial = useCallback(() => {
    setTutorialAt(null)
    markSeenFlag(SEEN_FLAGS.photoMenuSeen)
  }, [])
  // Serializes the background family writes (see handleSaveFamily).
  const familySaveChain = useRef<Promise<void>>(Promise.resolve())
  const [bioSaving, setBioSaving] = useState(false)
  // A picker is on its way up. NOTHING IS DRAWN FOR IT (user directive
  // 2026-08-01): a spinner says the app is working on the photo, and opening
  // the OS gallery is not that — the picker is its own answer to the tap, and
  // the menu that raised it goes away on the tap like every other row of it.
  // A spinner is for the upload alone. So this is a REF, not state: it refuses
  // a second picker (a photo re-tapped while the first is still coming up)
  // without costing a render.
  const pickerOpen = useRef(false)

  // Warm up the image picker on mount: getMediaLibraryPermissionsAsync()
  // initializes the native bridge so the first launchImageLibraryAsync after
  // this point is dramatically faster. Cheap (no permission prompt — read-only
  // status check), safe (errors swallowed), and runs in parallel with the rest
  // of the screen mount.
  useEffect(() => { ImagePicker.getMediaLibraryPermissionsAsync().catch(() => {}) }, [])
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

  // Stable by construction (ref + callback + shared value), so a swipe on this
  // page never re-renders it. `idlePull` only stands in when the page is not a
  // sheet body at all and no drag can reach it.
  const idlePull = useSharedValue(false)
  const pullCtx = useMemo<PullCtx | null>(() => dismissGestureRef ? {
    panRef: dismissGestureRef,
    extraRefs: [],
    setScrollAtTop: onScrollAtTop ?? (() => {}),
    pullEngaged: pullEngaged ?? idlePull,
  } : null, [dismissGestureRef, onScrollAtTop, pullEngaged, idlePull])

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
  const photoAddEnabled = photoCount < MAX_PHOTOS
  const familyAddEnabled = profile?.family == null
  const canMoveUp = photoMenuIndex != null && photoMenuIndex > 0
  const canMoveDown = photoMenuIndex != null && photoMenuIndex < photoCount - 1
  const canDelete = photoCount > MIN_PHOTOS

  const swapImages = (a: number, b: number) => {
    const images = profile?.images
    if (!images || a < 0 || b < 0 || a >= images.length || b >= images.length) return
    const next = [...images]
    ;[next[a], next[b]] = [next[b], next[a]]
    update({ images: next })
    persistImages()
  }

  const handleMoveUp = () => {
    if (photoMenuIndex == null || photoMenuIndex <= 0) return
    const from = photoMenuIndex
    setPhotoMenu(null)
    swapImages(from, from - 1)
  }

  const handleMoveDown = () => {
    if (photoMenuIndex == null || photoMenuIndex >= photoCount - 1) return
    const from = photoMenuIndex
    setPhotoMenu(null)
    swapImages(from, from + 1)
  }

  const handleDelete = () => {
    if (photoMenuIndex == null || !profile?.images) return
    if (!canDelete) {
      setPhotoMenu(null)
      return
    }
    const target = profile.images[photoMenuIndex]
    const filename = target?.normal
    const idx = photoMenuIndex
    setPhotoMenu(null)
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
    if (!user || !profile || pickerOpen.current) return
    // The row has been answered, so the menu goes — the picker is what stands
    // in front of the user now, and a menu left open behind it with a spinner
    // in it was the app saying it was busy when it was not.
    setPhotoMenu(null)
    pickerOpen.current = true
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    }).finally(() => { pickerOpen.current = false })
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

  // Pick a new photo INTO the tapped slot. The order of the list is what the
  // card reads top to bottom, so replacing is not deleting and adding: it is the
  // one edit that leaves every other photo where it is.
  const handleReplace = async () => {
    if (photoMenuIndex == null || !user || !profile?.images || pickerOpen.current) return
    const targetIndex = photoMenuIndex
    // Same as the add row above: the menu is answered and goes.
    setPhotoMenu(null)
    pickerOpen.current = true
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    }).finally(() => { pickerOpen.current = false })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]

    const userId = user.id
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    const { filename, uploaded } = processAndUploadPhotoDeferred(asset.uri, userId, token)

    // Kept so a failed upload can put the previous photo BACK (see the catch
    // below). The old file is still in storage and still valid — only the
    // reference is being swapped here.
    const current = useUserStore.getState().profile
    const oldEntry = current?.images?.[targetIndex]
    if (current?.images) {
      // Swap the slot optimistically — processAndUploadPhotoDeferred already
      // primed localPhotoUriCache with the picked URI, so the new photo renders
      // straight away. The OLD photo's local cache + deferred marker are
      // deliberately NOT torn down here: until the new upload lands, the old
      // photo is still the one we fall back to. Tearing its state down eagerly
      // meant a failed replace restored an entry with no local cache (visible
      // flash), and — worse — replacing a photo that was ITSELF still uploading
      // un-marked it from pendingDeferred, letting persistImages() write it to
      // the server before its upload had landed. Both cleanups live on the
      // success path below.
      const next = [...current.images]
      next[targetIndex] = { normal: filename, hash: '' }
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
        // The new photo is in storage now, so the old one is finally redundant.
        // (Its file is left in storage: removes never delete, same as elsewhere.)
        const oldFilename = oldEntry?.normal
        if (oldFilename && !next.some(img => img.normal === oldFilename)) {
          localPhotoUriCache.delete(oldFilename)
          pendingDeferred.delete(oldFilename)
        }
      })
      .catch(e => {
        console.error('Photo replace upload error:', e)
        const latest = useUserStore.getState().profile
        if (!latest) return
        // RESTORE the previous photo rather than just dropping the failed one.
        // Filtering it out left the array one entry SHORTER, which is the one
        // way to get below the 2-photo floor that handleDelete enforces: two
        // failed replaces took a profile to zero photos, persistImages() wrote
        // that to the server, and others(only_available) then dropped the user
        // from everyone's pool with no indication anything had gone wrong.
        const idx = latest.images.findIndex(img => img.normal === filename)
        if (idx < 0) return
        const next = [...latest.images]
        if (oldEntry) next[idx] = oldEntry
        else next.splice(idx, 1)
        useUserStore.getState().update({ images: next })
      })
    inFlightUploads.current.add(tracker)
    tracker.finally(() => inFlightUploads.current.delete(tracker))
    persistImages()
  }

  const familyInitial = profile?.family ?? null
  const bioInitial = profile?.bio ?? ''

  // Commit handler for the inline bio editor (MatchCard's BioField). Called by
  // the field's Update button with the already-normalized text, or null for a
  // cleared bio — which is an ordinary save since the bio stopped being
  // required (user directive 2026-07-31) and no longer un-builds the profile.
  // No popup to close: the field stays in place.
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
  //
  // The popup has already closed by the time this runs: the local store is
  // updated on this frame (so the card behind the sheet is correct at once) and
  // the write goes out behind it. Saves are chained rather than dropped, so a
  // reopen-edit-close while the previous request is still in flight can't race
  // it or be silently lost.
  const handleSaveFamily = (data: FamilyData, isForKids: boolean | null) => {
    const dropEntry = !data.hasKids && isForKids == null
    const familyWithPref: FamilyData | null = dropEntry
      ? null
      : { ...data, ...(isForKids !== null ? { isForKids } : {}) }
    update({ family: familyWithPref })
    familySaveChain.current = familySaveChain.current
      .then(async () => {
        if (inFlightUploads.current.size > 0) {
          await Promise.all(Array.from(inFlightUploads.current))
        }
        await invoke('app/profile', { family: familyWithPref })
      })
      .catch(e => { console.error('Save family error:', e) })
  }

  return (
    <View style={[styles.root, dismissGestureRef ? null : { paddingTop: insets.top }]}>
      {previewData ? (
        <View style={styles.previewWrap}>
          <PullContext.Provider value={pullCtx}>
            <MatchCard
              match={previewData}
              // Puts the pinned name/age chip on the same line as the sheet's
              // own floating chrome. Only when the sheet owns the top inset —
              // standalone, the root has already padded the card down past it.
              chromeInset={dismissGestureRef ? insets.top : 0}
              bottomInset={0}
              isForKids={profile?.family?.isForKids ?? null}
              self
              onPhotoTap={(imageIndex, at) => {
                if (imageIndex < 0) return
                // The tutorial is put away by a tap on a photo as much as by one
                // on its own row, and that tap does nothing else: it was showing
                // where to press, so the press that answers it is spent on the
                // lesson.
                if (tutorialAt) { endTutorial(); return }
                tap()
                setPhotoMenu({ index: imageIndex, at })
              }}
              onFamilyTap={() => { tap(); setFamilyPopupVisible(true) }}
              bioEdit={{ value: bioInitial, saving: bioSaving, onCommit: handleSaveBio }}
              // No round button on your own card: there is nobody to invite.
              actions={[]}
            />
          </PullContext.Provider>
        </View>
      ) : null}
      {/* WHAT CAN BE DONE TO THIS PHOTO, TOP-DOWN: move up, replace, ADD, delete,
          move down (user directive 2026-07-31, with the add placed 2026-08-01).
          One white tile with the app's hairline between its rows — the very
          object the card's fact set is — and each row a glyph and the words for
          it. ONLY WHAT APPLIES IS LISTED: a move at either end of the list, a
          delete at the two-photo floor and an add at the six-photo ceiling are
          not doors being held shut, they are things that do not exist here, so
          nothing stands in for them.
          REPLACE IS ALWAYS ONE OF THEM (user directive 2026-07-31, putting back
          what that morning's simplification had dropped): every photo can be
          swapped, and swapping is the one edit that keeps the ORDER — which is
          what the card reads top to bottom — so it is not the delete and the add
          standing either side of it. It sits directly under "move up", where the
          old popup put it.
          ADDING A PHOTO IS HERE TOO (user directive 2026-08-01), directly under
          replace. It is the one row that is not ABOUT the photo under the finger
          — but a photo is where the user's attention already is when he wants
          another one, and this menu is the whole of what the app has to say about
          photos now that the profile's plus is gone.
          The delete is deliberately not a warning colour: these are one set of
          choices about one photo, and a red row among them would read as an alarm
          rather than as a sibling of the others. Deleting a photo is undone by
          adding one; the caution rides the haptic instead of the ink. */}
      <TapMenu
        at={photoMenu?.at ?? null}
        onDismiss={() => setPhotoMenu(null)}
        actions={[
          ...(canMoveUp ? [{
            key: 'up',
            label: t('settings.photoEditMoveUp'),
            renderIcon: (c: string) => <ChevronUpIcon color={c} size={TAP_MENU_ICON} />,
            onPress: () => { tap(); handleMoveUp() },
          }] : []),
          {
            key: 'replace',
            label: t('settings.photoEditReplace'),
            renderIcon: (c: string) => <PhotoReplaceIcon color={c} size={TAP_MENU_ICON} />,
            onPress: () => { tap(); handleReplace() },
          },
          ...(photoAddEnabled ? [{
            key: 'add',
            label: t('settings.addPhoto'),
            renderIcon: (c: string) => <CameraIcon color={c} size={TAP_MENU_ICON} />,
            onPress: () => { tap(); handleAddPhoto() },
          }] : []),
          ...(canDelete ? [{
            key: 'delete',
            label: t('settings.photoEditDelete'),
            renderIcon: (c: string) => <PhotoTrashIcon color={c} size={TAP_MENU_ICON} />,
            onPress: () => { tapWarning(); handleDelete() },
          }] : []),
          ...(canMoveDown ? [{
            key: 'down',
            label: t('settings.photoEditMoveDown'),
            renderIcon: (c: string) => <ChevronDownIcon color={c} size={TAP_MENU_ICON} />,
            onPress: () => { tap(); handleMoveDown() },
          }] : []),
        ]}
      />
      {/* The lesson, in the shape of the thing being taught: the same menu, one
          row, saying where to press. Either the row or a photo puts it away
          (see onPhotoTap above), and it never comes back. */}
      <TapMenu
        at={tutorialAt}
        onDismiss={endTutorial}
        actions={[{
          key: 'hint',
          label: t('settings.photoMenuHint'),
          renderIcon: (c: string) => <CameraIcon color={c} size={TAP_MENU_ICON} />,
          onPress: endTutorial,
        }]}
      />
      <FamilyKidsPopup
        visible={familyPopupVisible}
        initial={familyInitial}
        initialIsForKids={profile?.family?.isForKids ?? null}
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

// What the DEPOSIT says on the credits row (user directive 2026-08-01), in the
// same `xLabel(n)` shape as the watcher pill above and for the same reason: the
// dock's key can only afford a bare "+1" beside a 24dp glyph, and this row is
// the line of text that mark points at, so here the pill names what it counts.
// One string, no singular of its own — neither language inflects on this one.
const heldLabel = (n: number) => t('settings.creditsHeld').replace('{count}', String(n))

function AppInlineContent() {
  const router = useRouter()
  const { profile } = useUserStore()
  const { signOut } = useAuthStore()
  const [accountPopupVisible, setAccountPopupVisible] = useState(false)
  // No groups state here any more: joining by code, leaving, and the list of
  // memberships all live in Circles (the hub sheet). The menu's old "my groups"
  // row and its join-by-code popup were unreachable — nothing had opened them
  // since the hub took the job — so they are gone rather than kept warm.
  const [signOutDialog, setSignOutDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // The credits row opens the buy picker DIRECTLY (2026-07-22). It used to
  // open an explainer dialog first (balance + extra + next grant) whose only
  // action was "more credits" — but the row itself already carries the
  // balance in its label and the renewal time in its subtitle, so the dialog
  // was a step that re-read what the user had just tapped.
  const [buyExtraOpen, setBuyExtraOpen] = useState(false)
  const onOpenBuyExtra = useCallback(() => {
    tap()
    setBuyExtraOpen(true)
  }, [])

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

  if (!profile) return null

  // Credits row content: ONE number, the whole wallet (user directive
  // 2026-07-28). The row used to carry a two-line pool table under the label —
  // the daily pool with the hour it refills at, the extras beneath it — and it
  // said more than the row needed to: what the user can spend is the total, and
  // the split between the two pools is the buy picker's business, which the row
  // opens anyway.
  const heartsTotal = creditTotal(profile)
  // The other half of it: the credit standing in a deposit against an
  // invitation of my own. It is money the user has — and, since 2026-07-31,
  // money he can spend on an accept — so the row that IS his wallet may not
  // leave it out; home's credits key has said it since 2026-08-01 and the two
  // must say the same thing. No deposit, no second pill.
  const heldCredits = creditHeld(profile)

  return (
    <>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        {/* Credits, then Account. Tapping credits opens the buy picker
            straight away. (Visibility moved to the menu's top group, beside
            Communities.) */}
        <SelectFieldRow
          grouped
          // The label is the bare word and the whole wallet rides its own line
          // as ONE small chip (user directive 2026-07-28) — the same trailing
          // tile the watcher/requests rows wear, so the count reads as a fact
          // stated by the row rather than a table hung under it. It stands
          // BESIDE the word rather than on the row's far edge (user directive
          // 2026-07-30): the number is the wallet the label names, so it reads
          // as that label's value; across the row it read as a control of its
          // own, facing the label from the other side. The watcher and
          // waiting-requests chips keep the edge, because what they count is
          // not what their row is named for.
          label={t('settings.credits')}
          // TWO PILLS, NOT A SUM: the balance finishes the word "credits" beside
          // it, and the deposit stands after it saying what it is. They are the
          // same `Chip small` fabric in the same lane (`selectRowTrailing` is
          // already the row that holds them, at the app's own gap), so the pair
          // reads as one wallet in two parts — the row's long-form of the "1 +1"
          // on home's dock key. Adding them into one number would hide the fact
          // that half the wallet is spoken for; a second ROW would make a
          // passing state look like a place to go.
          trailing={(
            <>
              <Chip small text={String(heartsTotal)} />
              {heldCredits > 0 ? <Chip small text={heldLabel(heldCredits)} /> : null}
            </>
          )}
          trailingBeside
          onPress={onOpenBuyExtra}
          icon={<CreditIcon color={INK} size={ICON.md} />}
          labelColor={INK}
        />
        <SelectFieldRow
          grouped
          label={t('settings.account')}
          onPress={() => setAccountPopupVisible(true)}
          icon={<UserIcon color={INK} />}
          labelColor={INK}
        />
        <SelectFieldRow
          grouped
          label={t('settings.support')}
          onPress={() => { Linking.openURL(supportMailUrl(t('support.mailSubject'))).catch(() => {}) }}
          icon={<SupportIcon color={INK} />}
          labelColor={INK}
        />
        {/* The brand site, last in the card: the one row that leaves the app
            for something that is not a mail composer. brandSiteUrl carries the
            app's own language, so the landing page opens in the language the
            user is already reading rather than the browser's guess. */}
        <SelectFieldRow
          grouped
          label={t('settings.site')}
          onPress={() => { Linking.openURL(brandSiteUrl(lang)).catch(() => {}) }}
          icon={<GlobeIcon color={INK} />}
          labelColor={INK}
        />
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
        confirmIconStart={<SignOutIcon color={WHITE} />}
        onCancel={() => setSignOutDialog(false)}
        onConfirm={onSignOutConfirmed}
      />
      <ConfirmDialog
        visible={deleteDialog}
        title={t('settings.deleteConfirmTitle')}
        description={tg('settings.deleteConfirmDesc', profile.is_male)}
        confirmLabel={t('settings.deleteYes')}
        confirmIconStart={<TrashIcon color={WHITE} />}
        busy={deleting}
        onCancel={() => setDeleteDialog(false)}
        onConfirm={onDeleteConfirmed}
      />
      <BuyExtraPopup
        visible={buyExtraOpen}
        onDismiss={() => setBuyExtraOpen(false)}
      />
    </>
  )
}



// ── The two popups home's dock opens ───────────────────────────────────────
// The menu page is being taken apart (user directive 2026-07-30): its four
// entries are home's four arched keys now, and the two of them that are LISTS of
// settings rather than surfaces of their own — the search preferences and the
// app's own settings — open as popups from the dock instead of as a page you
// first have to find a drawer for.
//
// Both are the menu's own blocks VERBATIM: the same PreferencesContent and
// AppInlineContent, so every row keeps its glyph, its one-sentence label and the
// popup it raises, and neither of these wrappers states a preference of its own.
// That is the whole point — there is no second copy of the settings list to
// drift, and when the menu page finally goes nothing here changes.
//
// `selectListStyles.card` is the one frame override a popup body is allowed to
// make (BottomSheet.tsx): these bodies are lists of full-width tappable rows
// that already carry the page gutter inside each row, so the sheet's own gutter
// would indent them twice. Everything else about the frame — the air above the
// first row, the gap under the last, the white — is the sheet's, identical to
// every other popup in the app.
//
// The row popups each of these raises (gender, ages, distance, location, the buy
// picker, the account sheet) are Modals rendered INSIDE this Modal's tree. That
// is nesting, not the two-sheets-at-one-level case the account popup works
// around with `onClosed` — a nested Modal presents over its parent, which is
// exactly what a row opening a picker over its list should look like.

/** Search preferences: whether you are visible at all, then who / at what ages /
 *  how far / from where. Visibility LEADS because it is the preference that
 *  decides whether any of the others matter (user directive 2026-07-30). */
export function PreferencesPopup({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const router = useRouter()
  // The visibility row's gate is the one thing in here that LEAVES: onboarding
  // is a route, and a route pushed under an open Modal comes up behind it. So
  // the confirm only closes this sheet, and the jump runs from `onClosed`, after
  // it is gone — the same chaining home does when one of its popups opens
  // another. A ref, not state: nothing about this sheet re-renders for it.
  const goBuild = useRef(false)
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onClosed={() => { if (goBuild.current) { goBuild.current = false; router.push('/onboarding') } }}
      contentStyle={selectListStyles.card}
    >
      <PreferencesContent leading={
        <VisibilityRow onBuildProfile={() => { goBuild.current = true; onDismiss() }} />
      } />
    </BottomSheet>
  )
}

/** The app's own settings: the wallet (with its count), the account, support,
 *  and the brand site. The menu's second card, unchanged. */
export function AppSettingsPopup({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} contentStyle={selectListStyles.card}>
      <AppInlineContent />
    </BottomSheet>
  )
}


// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // The menu page is WHITE (user directive 2026-07-28), the same white as the
  // OverlaySheet it rises in — the page tint is for the app's own pages (home,
  // chat), not for the drawer.
  rootOuter: { flex: 1, backgroundColor: SURFACE },
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, height: 56,
  },
  backBtn: { minWidth: MD + SM * 2, paddingHorizontal: SM, paddingVertical: MD, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flex: 1, flexDirection: 'row', marginHorizontal: SM,
    backgroundColor: WHITE_SOFT, borderRadius: RADIUS, padding: XS,
  },
  tabItem: { flex: 1, paddingVertical: SM, alignItems: 'center', borderRadius: RADIUS },
  tabItemActive: { backgroundColor: SURFACE },
  tabPill: { position: 'absolute', top: XS, bottom: XS, borderRadius: RADIUS, backgroundColor: SURFACE },

  tabScroll: { flex: 1 },
  // No horizontal padding here: the profile card extends edge-to-edge, flush
  // with the tab strip. The option groups below get their inset via
  // `optionsWrap`.
  tabContent: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  optionsWrap: { paddingHorizontal: SM, marginTop: MD },

  section: { marginBottom: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: MD },
  sectionLabelRow: { flexDirection: 'row', marginTop: LG, marginBottom: SM, paddingHorizontal: SM },
  sectionLabel: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: WHITE_STRONG, letterSpacing: 1, textAlign: 'center' },
  sectionTitle: { fontSize: TEXT.lg, fontWeight: WEIGHT.medium, color: WHITE, marginBottom: SM },
  sectionValue: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: WHITE },
  divider: { height: 0 },

  photoThumbStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: SM, justifyContent: 'flex-end', width: 44 * 3 + SM * 2 },
  photoThumb: { width: 44, height: 44, borderRadius: RADIUS },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: SM },
  slider: { width: '100%', height: 40 },
  sliderEndLabel: { fontSize: TEXT.md, color: WHITE_MID, minWidth: 22, textAlign: 'center' },

  genderRow: { flexDirection: 'row', gap: SM, marginTop: SM },

  previewWrap: {
    flex: 1,
    backgroundColor: SURFACE,
  },

  textInputWrap: { marginTop: SM, borderRadius: RADIUS, paddingHorizontal: MD, paddingTop: MD, paddingBottom: MD + SM, backgroundColor: WHITE_SOFT },
  textInputWrapInner: { paddingHorizontal: MD, paddingTop: MD, paddingBottom: MD + SM },
  textInputHeader: { flexDirection: 'row', alignItems: 'center', gap: SM, marginBottom: SM },
  textInput: { fontSize: TEXT.md, color: WHITE, padding: 0, textAlign: 'center', minHeight: 56 },
  charCount: { position: 'absolute', end: 12, bottom: 8, fontSize: TEXT.md, color: WHITE_MID },

  // Account tab
  infoCard: {
    marginTop: SM, borderRadius: RADIUS, overflow: 'hidden',
    backgroundColor: WHITE_SOFT,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: MD, paddingVertical: MD,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: WHITE_SOFT,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: TEXT.md, color: WHITE_STRONG },
  infoValue: {
    fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: WHITE,
    flexShrink: 1, marginStart: MD,
  },

  accountLinkRow: {
    flexDirection: 'row', alignItems: 'center', gap: MD,
    backgroundColor: WHITE_SOFT, borderRadius: RADIUS,
    paddingHorizontal: MD, paddingVertical: MD,
    marginBottom: MD,
  },
  // Flat group: no frame, no shadow, no rounded corners, and no dividers,
  // rows sit flush with only their own padding between them.
  accountLinksCard: {
    backgroundColor: 'transparent',
    marginBottom: MD,
  },
  // A plain white card. The GROUP's meaning is carried by its ink (the purple
  // for the account/status rows), never by tinting the card itself.
  accentCard: { backgroundColor: 'transparent' },
  accountLinkRowInner: {
    flexDirection: 'row', alignItems: 'center', gap: MD,
    paddingHorizontal: MD, paddingVertical: MD,
  },
  // Flat group, identical visual language to `accountLinksCard`: no frame,
  // no rounded corners, no shadow, no dividers.
  // The groups row: the shared leading-icon column, then a wrap of chips
  // instead of a single label.
  groupsRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: MD, paddingVertical: MD, gap: MD },
  // A box exactly one chip tall so the glyph centres against the FIRST chip
  // (the row wraps to more chip lines, and a hand-tuned margin drifted a few
  // pixels above that first line). Same idea as selectRowIconWrap, measured
  // against the chip's own exported height rather than a re-typed number.
  groupsRowIcon: { height: CHIP_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  groupsChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: SM },
  // Account popup head: the title with the identity fact line under it. Spacing
  // only — the type of both comes from SheetTitle / MetaLine, the gutter from the
  // sheet's card, and the air below it from <SheetActions>. The fact line stands
  // where a popup's description would, so it takes the description's own gap.
  accountPopupHead: { gap: SHEET_GAP.desc },

  // Select field row — tappable row with label + value + forward chevron
  selectRow: {
    flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-start', gap: SM,
    backgroundColor: 'transparent', borderRadius: RADIUS,
    paddingHorizontal: MD, paddingVertical: MD, marginTop: SM,
    overflow: 'hidden',
    shadowColor: SHADOW_BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  // Variant for use inside a grouped card (e.g. accountLinksCard) — no own
  // background or rounded corners; the parent card provides those.
  selectRowInner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: MD,
    paddingHorizontal: MD, paddingVertical: MD,
  },
  selectRowLarge: { paddingVertical: MD },
  // The app's one shut-door fade, shared with Button and the dock's keys.
  selectRowLocked: { opacity: DISABLED_OPACITY },
  selectRowTextCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  // minWidth:0 so a long single-sentence label (e.g. "מהמיקום הנוכחי שלי")
  // wraps to a second line instead of clipping.
  // Stays 'center' so the taller leading elements (avatar, accent circle) keep
  // centring against the label. Only the plain glyph opts out — see
  // selectRowIconWrap's alignSelf.
  selectRowLabelGroup: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: MD },
  // The label + subtitle column, the lines they sit on and the type they are
  // set in all belong to the strip now (components/Strip.tsx): a menu row is the
  // same object as the group rows it opens (user directive 2026-07-29), so it
  // cannot state its own version of the label's size or the fact line's ink.
  // What stays here is the lane the strip's own trailing control rides in.
  selectRowTrailing: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: SM },
  selectRowAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: WHITE_SOFT,
  },
  selectRowAccentIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: WHITE_SOFT,
    alignItems: 'center', justifyContent: 'center',
  },
  // The glyph pins to the FIRST line of a wrapped label instead of drifting
  // into the gap between the two lines — which is why it opts out of the
  // group's alignItems:'center'. Everything else (the one-line-tall box, the
  // ink nudge, the font-scale ceiling) belongs to GlyphSlot, the single
  // implementation shared with the chips and the buttons; the width it is
  // given is the nominal glyph size, so every row's label starts at the same x
  // even when a glyph is drawn larger than the column for optical reasons (the
  // eye — see the visibility row). Overflow is centred, not clipped.
  selectRowIconWrap: { alignSelf: 'flex-start' },

  subPageOptionsCard: {
    marginHorizontal: SM, marginTop: MD,
    borderRadius: RADIUS, overflow: 'hidden',
    backgroundColor: WHITE_SOFT,
  },
  subPageOptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: MD, paddingVertical: MD,
  },
  subPageOptionLabel: { fontSize: TEXT.lg, color: WHITE },
  subPageCheckmark: { fontSize: TEXT.lg, color: WHITE_STRONG, fontWeight: WEIGHT.medium },
  optionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: LINE,
    marginStart: MD,
  },
  subPageDesc: {
    marginHorizontal: SM, marginTop: MD,
    fontSize: TEXT.md, color: WHITE_STRONG,
    textAlign: 'center',
  },
})
