import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, I18nManager, Animated as RNAnimated, Dimensions, Keyboard, Linking, TextInput as RNTextInput } from 'react-native'
import { SharedValue, useSharedValue } from 'react-native-reanimated'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { getLocales } from 'expo-localization'
import * as ImagePicker from 'expo-image-picker'
import { Path, Line, Circle, Rect } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap, tapWarning } from '../src/lib/haptics'
import { useUserStore, resolveLocationType, selectIsHidden, selectWatcherCount, selectProfileBuilt, type LocationType } from '../src/stores/userStore'
import { useAuthStore } from '../src/stores/authStore'
import { t, tg, lang, genderize, lowerFirst } from '../src/i18n'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { ToggleRow } from '../src/components/Switch'
import { MatchCard, type CardAddChip } from '../src/components/MatchCard'
import { PullContext, PullScrollView, type PullCtx } from '../src/components/PullPane'
import type { OverlaySheetBody } from '../src/components/OverlaySheet'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import { localPhotoUriCache, pendingDeferred, processAndUploadPhotoDeferred } from '../src/components/PhotoEditor'
import { supabase } from '../src/lib/supabase'
import type { Profile } from '../src/stores/userStore'
import { familyEmptyWeek, familyEqual, FAMILY_MAX_KIDS, FAMILY_MAX_WEEKS, startOfDisplayedWeek, sundayOfWeek, toISODate, defaultWeekStart, weekendDays, type FamilyData, type FamilyKid } from '../src/lib/family'
import { XS, SM, MD, LG, XL, RADIUS, DRAG_HANDLE, TEXT, WEIGHT, ICON, TAP_SLOP, STROKE, lh, bottomGap, SEARCH_DEBOUNCE_MS } from '../src/tokens'
import { GlyphSlot } from '../src/components/GlyphSlot'
import { INK, INK_WASH, PAGE, SHADOW_BLACK, SURFACE, SURFACE_SUNK, WHITE, WHITE_SOFT, WHITE_MID, WHITE_STRONG, INK_SUBTLE, INK_DIM, LINE } from '../src/colors'
import { FIELD_SKIN, OUTLINE_SKIN } from '../src/field'
import { Glyph, SlidersIcon, RadiusIcon, GenderIcon, SignOutIcon, TrashIcon, UserIcon, UserPlusIcon, GroupsIcon, CameraIcon, ChevronUpIcon, ChevronDownIcon, PhotoReplaceIcon, PhotoTrashIcon, CheckIcon, CreditIcon, SupportIcon, EyeOpenIcon, EyeOffIcon, LogInIcon } from '../src/components/icons'
import { creditTotal } from '../src/lib/credits'
import { hideProfileConfirm } from '../src/components/visibilityConfirms'
import { BuyExtraPopup } from '../src/components/BuyExtraPopup'
import { BottomSheet, SheetActionRow, SheetTitle } from '../src/components/BottomSheet'
import { Button } from '../src/components/Button'
import { useKeyboardHeight } from '../src/hooks/useKeyboardHeight'
import { useBottomInset } from '../src/hooks/useBottomInset'
import { INVITE_CODE_LEN, type Group } from '../src/lib/groups'
import { communitiesSummary, pendingApprovals, groupLabel, friendLabel, requestLabel } from '../src/lib/communities'
import { StripBody } from '../src/components/Strip'
import type { MetaPart } from '../src/lib/meta'
import { supportMailUrl } from '../src/lib/links'
import { useCachedGroups, setCachedGroups } from '../src/lib/groupsCache'
import { Chip, CHIP_HEIGHT, PinIcon as PinGlyph, HomeIcon as HomeGlyph, WorkIcon as WorkGlyph, KidsIcon as KidsGlyph } from '../src/components/Chip'
import { units, M_PER_MI } from '../src/lib/units'
import { getLocation, getLocPermission, requestLocPermission, openLocPermSettings, openLocationSettings, enableLocationServices } from '../src/lib/location'

const isRTL = I18nManager.isRTL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
// Profile card is sized like a regular menu row, just at 2× the height. A
// grouped row is `ICON.xxl + 2*MD` tall (the icon + its vertical padding), so
// double that. The card keeps the photo as its background but reads as one of
// the menu buttons rather than a hero.
const PROFILE_CARD_HEIGHT = (ICON.xxl + MD * 2) * 2

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

export type CommunitiesFieldConfig = {
  kind: 'communities'
  title: string
}

export type SubPageConfig = SelectFieldConfig | AgeRangeFieldConfig | RadiusFieldConfig | AccountFieldConfig | PreviewFieldConfig | ProfileSectionFieldConfig | AppSectionFieldConfig | CommunitiesFieldConfig

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
            <GlyphSlot width={ICON.md} style={styles.selectRowIconWrap}>{icon}</GlyphSlot>
          )
        ) : null
        // A menu row IS a strip (user directive 2026-07-29): a leading glyph or
        // face, the label, and the facts under it on the app's one fact line —
        // the same object, from the same component, as the group rows this menu
        // opens. Only the row BOX stays here, because a menu row's is its own:
        // the press fade, the card grouping, the large/locked variants.
        // What that buys, and what this row therefore no longer decides:
        //  • The chip rides the row's LAST TEXT LINE, at its END edge — the
        //    subtitle when there is one, the label when there is not. It is
        //    never glued beside the label and never centred against the whole
        //    row: centred it read as a control floating beside the button
        //    rather than as a fact stated by its line.
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

// ── Tabs ───────────────────────────────────────────────────────────────────

type Tab = 'preferences' | 'profile' | 'app'

// Per-tab glyph used in the avatar preview row. Sized to ICON.lg.

function TabIcon({ tab, color }: { tab: Tab; color: string }) {
  const stroke = color
  if (tab === 'preferences') {
    // Magnifying glass
    return (
      <Glyph width={ICON.lg} height={ICON.lg} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="11" cy="11" r="7" />
        <Line x1="16.5" y1="16.5" x2="21" y2="21" />
      </Glyph>
    )
  }
  if (tab === 'profile') {
    // Person — head + shoulders
    return (
      <Glyph width={ICON.lg} height={ICON.lg} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx="12" cy="8" r="4" />
        <Path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </Glyph>
    )
  }
  // app → 2×2 grid (app icon)
  return (
    <Glyph width={ICON.lg} height={ICON.lg} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="3" width="8" height="8" rx="2" />
      <Rect x="13" y="3" width="8" height="8" rx="2" />
      <Rect x="3" y="13" width="8" height="8" rx="2" />
      <Rect x="13" y="13" width="8" height="8" rx="2" />
    </Glyph>
  )
}

// ── Animated Toggle Button ─────────────────────────────────────────────────
// Used for the gender chips (and anywhere else two-state pill buttons appear).
// Animates background color, text color, and a small scale bump on press.

// Visibility + Communities: the menu's FIRST group (user directive
// 2026-07-27), standing above the preferences group with a full gap under it.
// Both rows answer "who gets to see me" — one is the switch, the other the
// circle — so they share one group, ahead of the search preferences and well
// ahead of the account links at the bottom.
function AudienceContent({ onOpenSubPage }: { onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const { profile } = useUserStore()
  const router = useRouter()
  // Visibility (visible <-> hidden). This row is the ONLY way back to visible
  // now that page2 has no UI of its own, so it must stay reachable and must
  // not silently fail. Going hidden kicks every watcher pinned to the user,
  // so it is confirmed first; going visible is immediate.
  //
  // Visibility is NOT credit-gated any more. The server used to auto-hide a
  // zero-credit wallet (the dispatcher's maybeAutoHide → app_lock2), so this
  // row routed an empty wallet to the buy picker instead of app/free2, which
  // would have been undone in the same round trip. That auto-hide is gone
  // (2026-07-22): being broke keeps you visible on purpose — the invitation
  // you can't accept is the moment to buy.
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
  const [visibilityBusy, setVisibilityBusy] = useState(false)
  const isHidden = selectIsHidden(profile)
  // Communities are members-only: a browse-only account (profile not yet built)
  // may not enter the hub at all, because every surface in there shows the user
  // to other people (a group's member list, a friend request). Same marker the
  // invite gate uses (selectProfileBuilt), so "full member" means one thing.
  // The tap opens an explanation whose single button is the build flow, so the
  // popup that says what is missing is also the way to fix it.
  const profileBuilt = selectProfileBuilt(profile)
  const [commGateOpen, setCommGateOpen] = useState(false)

  const runVisibility = useCallback(async (endpoint: string) => {
    if (visibilityBusy) return
    setVisibilityBusy(true)
    try { await invoke(endpoint) } catch (e) { console.error(e) }
    finally { setVisibilityBusy(false); setHideConfirmOpen(false) }
  }, [visibilityBusy])

  const onVisibilityPress = useCallback(() => {
    tap()
    if (!isHidden) { setHideConfirmOpen(true); return }
    runVisibility('app/free2')
  }, [isHidden, runVisibility])

  if (!profile) return null

  // Watcher count drives two surfaces: the chip on the Visible row and the
  // concrete ripple in the hide confirm. deriveCompat only fills the array
  // while page2 is free, so a hidden user reads 0 without a separate guard.
  const watcherCount = selectWatcherCount(profile)
  const hideConfirmConfig = hideProfileConfirm(watcherCount)

  // Communities row summary — read from the denormalized relations.communities
  // field (instant, no query). Friends first, then groups (= managed + joined),
  // and anything waiting on MY answer (friend requests + join requests on
  // groups I manage) is the last segment of the same line, the way a managed
  // group row reads
  // ("Approved · 17 members · 3 requests") — a decision someone else is
  // waiting on is a fact about the row, not a badge beside it. An account with
  // neither groups nor friends still says what the row is for instead of
  // dropping to a bare label.
  const comm = communitiesSummary(profile)
  const commGroups = comm ? comm.managed.length + comm.joined.length : 0
  const commRequests = pendingApprovals(comm)
  // What is WAITING is off the meta line (user directive 2026-07-28): it rides
  // its own solid-purple chip, exactly as it does on every row of the hub the
  // tap opens, so "someone is waiting on you" is said the one way in both
  // places. The line keeps the standing facts, what I have.
  const commSubtitle: MetaPart[] | undefined = !comm ? undefined
    : comm.friends > 0 || commGroups > 0
      ? [comm.friends > 0 && friendLabel(comm.friends), commGroups > 0 && groupLabel(commGroups)]
      : [t('communities.rowEmpty')]

  return (
    <View style={styles.section}>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        {/* Visibility FIRST: it is a game-state control, not an account
            detail, and it is the only path back to being discoverable. */}
        {/* The state IS the label: "Visibility  Hidden" says the same thing
            twice, and the eye glyph already names the field. */}
        {/* The watcher count is a live quantity, so it rides its own chip
            instead of a bare "(n)" glued to the label: a number in
            parentheses says nothing about what it counts, the chip spells
            it out ("3 watching you"). */}
        <SelectFieldRow
          grouped
          label={isHidden ? t('settings.visibilityHidden') : t('settings.visibilityVisible')}
          trailing={!isHidden && watcherCount > 0 ? (
            <Chip
              small
              text={watcherCount === 1
                ? t('settings.watchersOne')
                : t('settings.watchersMany').replace('{count}', String(watcherCount))}
            />
          ) : undefined}
          onPress={onVisibilityPress}
          // Plain ICON.md, like every other row. The eye used to be bumped to
          // ICON.lg to make up for a flat lens that fills barely half its box
          // vertically — but the eye's artwork runs the FULL width of its box
          // (2..22 of 24), so the bump made it the widest ink in the column by
          // a wide margin: 18.2dp across, against 15-16.5 for everything else,
          // which is exactly how it read (user, 2026-07-29). At ICON.md its ink
          // box is 16.4 x 11.9 and its ink mass 70dp², both mid-pack.
          icon={isHidden ? <EyeOffIcon color={INK} size={ICON.md} /> : <EyeOpenIcon color={INK} size={ICON.md} />}
          labelColor={INK}
        />
        {/* Communities: a navigable row (like Account) that opens the full
            hub — my friends, groups I manage, groups I'm in, create, find.
            Superseded the inline group chips + join-by-code sheet, which now
            live inside the hub. */}
        <SelectFieldRow
          grouped
          label={t('communities.menuRow')}
          subtitle={commSubtitle}
          // The strips' own chip, exactly: the small tile, in full-strength
          // purple because something is WAITING here — the pale neutral one the
          // visibility row wears states a fact, this one asks for an answer.
          trailing={commRequests > 0 ? <Chip small text={requestLabel(commRequests)} tone="solid" /> : undefined}
          onPress={() => {
            if (!profileBuilt) { setCommGateOpen(true); return }
            return onOpenSubPage?.({ kind: 'communities', title: t('communities.menuRow') })
          }}
          icon={<GroupsIcon color={INK} />}
          labelColor={INK}
        />
      </View>
      {/* The confirm glyph is ICON.md, the size every other button icon wears:
          the icon's own 28 default made it tower over the label beside it. */}
      <ConfirmDialog
        visible={hideConfirmOpen}
        title={hideConfirmConfig.title}
        description={hideConfirmConfig.description}
        confirmLabel={hideConfirmConfig.confirmLabel}
        confirmIconStart={<EyeOffIcon color={WHITE} />}
        onCancel={() => { if (!visibilityBusy) setHideConfirmOpen(false) }}
        onConfirm={() => runVisibility('app/lock2')}
        busy={visibilityBusy}
        draggable
      />
      {/* The one button is the build flow itself, wearing the same label as the
          menu's own build-profile CTA: the popup that says what is missing is
          also the way to fix it. Dismissed by swiping down / the backdrop. */}
      <ConfirmDialog
        visible={commGateOpen}
        title={t('communities.gateTitle')}
        description={t('communities.gateDesc')}
        confirmLabel={t('settings.buildProfile')}
        confirmIconStart={<UserPlusIcon color={WHITE} />}
        onConfirm={() => { setCommGateOpen(false); router.push('/onboarding') }}
        onCancel={() => setCommGateOpen(false)}
        draggable
      />
    </View>
  )
}

function PreferencesContent({ onOpenSubPage: _onOpenSubPage }: { onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
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
        description={t('settings.locationLockedDesc')}
        confirmLabel={t('common.gotIt')}
        draggable
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
  const bottomInset = useBottomInset()

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
      contentStyle={{ paddingBottom: bottomGap(bottomInset, SM + MD) }}
    >
      {/* Identity details as chips, stacked one under the other — each pill
          hugs its own text (alignItems:'flex-start' on the column), so the
          block reads as a list of facts rather than a wrapping chip cloud. */}
      <View style={styles.accountPopupList}>
        {detailRows.map(r => (
          <Chip key={r.label} text={r.value} />
        ))}
      </View>
      {/* The same pair of full-width buttons the chat menu's leave/block sheet
          uses: the action you opened this for is the solid primary, the
          drastic and rarely-wanted one recedes to the muted secondary. */}
      <View style={styles.accountActions}>
        <Button
          label={tg('settings.signOut', profile.is_male)}
          iconStart={<SignOutIcon color={WHITE} />}
          onPress={() => { tap(); dismissThen(onSignOutPress) }}
        />
        <Button
          label={t('settings.deleteAccount')}
          variant="secondary"
          iconStart={<TrashIcon color={INK_SUBTLE} />}
          onPress={() => { tapWarning(); dismissThen(onDeletePress) }}
        />
      </View>
    </BottomSheet>
  )
}

// ── Groups Popup ───────────────────────────────────────────────────────────

/**
 * "My groups" sheet. Lists the caller's current group memberships with a
 * per-row leave button, plus an input to redeem a 6-digit invite code at the
 * bottom. Both actions speak to /app/leave_group and /app/redeem_invite,
 * whose responses carry a fresh `groups` sidecar so the list updates in one
 * round trip per mutation.
 */
function GroupsPopup({ visible, onDismiss, mode, leaveGroup, groups, setGroups }: {
  visible: boolean
  onDismiss: () => void
  /** Which act to show. The sheet no longer lists the groups — the menu does
   * that with chips — so it opens straight into joining or leaving. */
  mode: 'join' | 'leave'
  /** The group a chip was tapped on. Only read when mode is 'leave'. */
  leaveGroup: Group | null
  // Lifted up to AppInlineContent so the settings menu row can render the
  // chained group names alongside this sheet, sharing one source of truth.
  // null = not yet loaded (initial fetch in flight); [] = loaded, empty.
  groups: Group[] | null
  setGroups: (g: Group[]) => void
}) {
  const bottomInset = useBottomInset()
  const kbHeight = useKeyboardHeight()
  const codeInputRef = useRef<RNTextInput>(null)

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [leavingId, setLeavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setCode('')
    setCodeError(null)
    invoke<{ groups?: Group[] }>('app/my_groups')
      .then(data => {
        if (cancelled) return
        setGroups(data?.groups ?? [])
      })
      .catch(() => { /* my_groups fetch failed; keep last-known groups */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const onJoin = async () => {
    if (code.length !== INVITE_CODE_LEN || submitting) return
    tap()
    Keyboard.dismiss()
    setSubmitting(true)
    setCodeError(null)
    try {
      const result = await invoke<{ groups?: Group[] }>('app/redeem_invite', { code })
      if (result?.groups) setGroups(result.groups)
      setCode('')
      // Nothing left to show here once joined — the new chip appears in the menu.
      onDismiss()
    } catch {
      setCodeError(t('settings.groupsInviteInvalid'))
    } finally {
      setSubmitting(false)
    }
  }

  const onLeave = async (id: string) => {
    if (leavingId) return
    tapWarning()
    setLeavingId(id)
    try {
      const result = await invoke<{ groups?: Group[] }>('app/leave_group', { group_id: id })
      if (result?.groups) setGroups(result.groups)
      else setGroups((groups ?? []).filter(g => g.id !== id))
    } catch {
      // Silently fail; the row stays. User can retry.
    } finally {
      setLeavingId(null)
      onDismiss()
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      cardWrapStyle={kbHeight > 0 ? { marginBottom: kbHeight } : undefined}
      contentStyle={{ paddingBottom: bottomGap(bottomInset, SM + SM) }}
    >
      {mode === 'leave' && leaveGroup ? (
        <View style={groupsPopupStyles.step}>
          <Text style={groupsPopupStyles.title}>
            {t('settings.groupsLeaveTitle').replace('{name}', leaveGroup.name)}
          </Text>
          <Text style={groupsPopupStyles.hint}>{t('settings.groupsLeaveDesc')}</Text>
          <View style={groupsPopupStyles.actions}>
            <View style={groupsPopupStyles.action}>
              <Button
                label={t('settings.groupsBack')}
                onPress={() => { tap(); onDismiss() }}
                disabled={leavingId !== null}
                variant="secondary"
                size="lg"
              />
            </View>
            <View style={groupsPopupStyles.action}>
              <Button
                label={t('settings.groupsLeaveConfirm')}
                onPress={() => onLeave(leaveGroup.id)}
                loading={leavingId !== null}
                iconStart={<SignOutIcon color={WHITE} />}
                variant="primary"
                size="lg"
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={groupsPopupStyles.step}>
          <Text style={groupsPopupStyles.title}>{t('settings.groupsJoinTitle')}</Text>
          <Text style={groupsPopupStyles.hint}>{t('settings.groupsJoinHint')}</Text>
          <View style={groupsPopupStyles.inputWrap}>
            <TextInput
              ref={codeInputRef}
              style={groupsPopupStyles.input}
              value={code}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, INVITE_CODE_LEN)
                setCode(digits)
                if (codeError) setCodeError(null)
              }}
              keyboardType="number-pad"
              maxLength={INVITE_CODE_LEN}
              placeholder={t('settings.groupsCodePlaceholder')}
              placeholderTextColor={INK_DIM}
              autoComplete="off"
              textContentType="none"
              editable={!submitting}
              autoFocus
            />
          </View>
          {codeError ? <Text style={groupsPopupStyles.error}>{codeError}</Text> : null}
          <View style={groupsPopupStyles.actions}>
            <View style={groupsPopupStyles.action}>
              <Button
                label={t('settings.groupsBack')}
                onPress={() => { tap(); Keyboard.dismiss(); onDismiss() }}
                disabled={submitting}
                variant="secondary"
                size="lg"
              />
            </View>
            <View style={groupsPopupStyles.action}>
              <Button
                label={t('settings.groupsJoinAction')}
                onPress={onJoin}
                disabled={code.length !== INVITE_CODE_LEN || submitting}
                loading={submitting}
                iconStart={<LogInIcon color={WHITE} />}
                variant="primary"
                size="lg"
              />
            </View>
          </View>
        </View>
      )}
    </BottomSheet>
  )
}

const groupsPopupStyles = StyleSheet.create({
  header: { paddingHorizontal: MD, paddingBottom: MD },
  // The standard popup title: same size, weight and centring as every other
  // sheet in the app, so this one stops looking like a section heading.
  title: { fontSize: TEXT.lg, fontWeight: WEIGHT.medium, color: INK, textAlign: 'center', letterSpacing: -0.3 },
  mineSection: { paddingHorizontal: MD, paddingBottom: LG },
  joinSection: { paddingHorizontal: MD, paddingTop: LG },
  // Join and leave steps: one titled block with its own actions row.
  step: { paddingHorizontal: MD, paddingTop: SM },
  actions: { flexDirection: 'row', gap: SM, marginTop: LG },
  action: { flex: 1 },
  hint: { fontSize: TEXT.md, color: INK_DIM, marginTop: XS, lineHeight: lh(TEXT.md) },
  empty: { fontSize: TEXT.md, color: INK_DIM, paddingVertical: SM, textAlign: 'center' },
  // Wrap: as many chips per line as fit, centred. alignItems keeps a chip
  // sized to its own content instead of stretching to the tallest on its line.
  list: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start', gap: SM },
  rowTag: { fontSize: TEXT.sm, color: INK_DIM },
  sectionDivider: { height: 1, backgroundColor: LINE, marginHorizontal: MD },
  // Reads as a field: a border and a white fill, not just a tinted block. The
  // previous WHITE_SOFT-on-white panel gave no edge to aim at. Skin comes from
  // FIELD_SKIN like every other typing surface — it used to hand-roll its own
  // 1.5px INK_DIM rule, a heavier edge than the login field it sits beside.
  inputWrap: {
    ...FIELD_SKIN,
    marginTop: LG,
    paddingHorizontal: MD,
    paddingVertical: MD,
  },
  input: {
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.medium,
    color: INK,
    textAlign: 'center',
    letterSpacing: 6,
    padding: 0,
  },
  error: { marginTop: XS, fontSize: TEXT.md, color: INK, textAlign: 'center' },
})

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
  const bottomInset = useBottomInset()
  const [fromText, setFromText] = useState(String(ageMin))
  const [toText, setToText] = useState(String(ageMax))
  const kbHeight = useKeyboardHeight()
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
      cardWrapStyle={kbHeight > 0 ? { marginBottom: kbHeight } : undefined}
      contentStyle={[agePopupStyles.card, { paddingBottom: bottomGap(bottomInset, SM + SM) }]}
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
    paddingHorizontal: MD,
    paddingTop: 0,
  },
  title: {
    fontSize: TEXT.lg, fontWeight: WEIGHT.medium, color: INK,
    textAlign: 'center', marginBottom: MD,
  },
  row: {
    flexDirection: 'row', gap: SM,
    marginTop: SM,
    marginBottom: SM,
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
  card: { padding: 0, paddingTop: 0, paddingBottom: XL },
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
  const insets = useSafeAreaInsets()
  const bottomInset = useBottomInset()
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
  // Keyboard tracking — Modal + statusBarTranslucent prevents window-resize
  // avoidance on both platforms (BottomSheet no longer carries a global lift),
  // so we shrink the sheet height and add marginBottom to lift it above the
  // keyboard. Applies to iOS and Android alike.
  const kbHeight = useKeyboardHeight()

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
        if (results.length === 0) setSearchError(t('settings.locationNoResults'))
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return
        setSearchError(t('settings.locationNoResults'))
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

  // While the keyboard is up we shrink the sheet AND lift it via marginBottom.
  // BottomSheet no longer carries a global keyboard lift, so this nudge must
  // apply on iOS too.
  const addressEffectiveH = kbHeight > 0
    ? Math.max(240, addressSheetH - kbHeight)
    : addressSheetH

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      cardWrapStyle={step === 'address' ? {
        height: addressEffectiveH,
        ...(kbHeight > 0 ? { marginBottom: kbHeight } : {}),
      } : undefined}
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
              placeholder={t('settings.locationAddressPrompt')}
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
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: bottomGap(bottomInset, SM + SM) }}
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
  errorText: {
    paddingHorizontal: MD, paddingTop: MD,
    fontSize: TEXT.md, color: WHITE_MID,
    lineHeight: lh(TEXT.md),
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
  const bottomInset = useBottomInset()
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      contentStyle={[familyStyles.valuePopupCard, { paddingBottom: bottomGap(bottomInset, SM) }]}
    >
      <SheetTitle style={familyStyles.valuePopupTitle}>{title}</SheetTitle>
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
  const bottomInset = useBottomInset()
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

              <View style={{ paddingBottom: bottomGap(bottomInset, SM) }} />

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
  shadowLayer: { flex: 1, backgroundColor: SURFACE_SUNK },
  gestureWrap: { flexShrink: 1 },
  sheet: {
    // No ground of its own: every popup is WHITE and BottomSheet's card paints
    // it (user directive 2026-07-28). Only metrics here.
    paddingTop: RADIUS,
    paddingHorizontal: SM,
    flexShrink: 1,
  },
  dragHandle: {
    alignSelf: 'center',
    width: DRAG_HANDLE.width, height: DRAG_HANDLE.height, borderRadius: DRAG_HANDLE.radius,
    backgroundColor: INK_DIM,
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

  // Inline picker (count / age) sheet
  valuePopupOverlay: { flex: 1, justifyContent: 'flex-end' },
  valuePopupCard: {
    paddingTop: RADIUS, paddingHorizontal: SM,
  },
  // Spacing only — the type comes from SheetTitle (BottomSheet.tsx).
  valuePopupTitle: { marginBottom: SM },
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

// ── Photo edit popup ────────────────────────────────────────────────────────
// Bottom sheet shown when the user taps a photo on their own profile preview.
// Lays out four actions in a 2-row grid: Move up / Move down on top, then a
// full-width Replace, then a destructive-tinted Delete. Up/Down are disabled
// at the photo-list boundaries.

// ChevronUpIcon, ChevronDownIcon, PhotoReplaceIcon, PhotoTrashIcon imported
// from '../src/components/icons'.

function PhotoOptionsPopup({
  visible, canMoveUp, canMoveDown, canDelete, replacing, onDismiss, onMoveUp, onMoveDown, onReplace, onDelete,
}: {
  visible: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  canDelete: boolean
  replacing: boolean
  onDismiss: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onReplace: () => void
  onDelete: () => void
}) {
  const bottomInset = useBottomInset()
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      contentStyle={[photoOptionsStyles.sheet, { paddingBottom: bottomGap(bottomInset, SM + SM) }]}
    >
      <View style={photoOptionsStyles.row}>
        <Pressable
          style={[photoOptionsStyles.tile, !canMoveUp && photoOptionsStyles.tileDisabled]}
          onPress={() => { if (canMoveUp) { tap(); onMoveUp() } }}
        >
          <ChevronUpIcon color={canMoveUp ? INK : INK_SUBTLE} />
          <Text style={[photoOptionsStyles.tileLabel, !canMoveUp && photoOptionsStyles.tileLabelDisabled]}>
            {t('settings.photoEditMoveUp')}
          </Text>
        </Pressable>
        <Pressable
          style={[photoOptionsStyles.tile, !canMoveDown && photoOptionsStyles.tileDisabled]}
          onPress={() => { if (canMoveDown) { tap(); onMoveDown() } }}
        >
          <ChevronDownIcon color={canMoveDown ? INK : INK_SUBTLE} />
          <Text style={[photoOptionsStyles.tileLabel, !canMoveDown && photoOptionsStyles.tileLabelDisabled]}>
            {t('settings.photoEditMoveDown')}
          </Text>
        </Pressable>
      </View>

      <SheetActionRow
        icon={replacing ? <ActivityIndicator color={INK} /> : <PhotoReplaceIcon color={INK} />}
        label={t('settings.photoEditReplace')}
        disabled={replacing}
        onPress={() => { tap(); onReplace() }}
      />

      {/* Deliberately NOT gold: this sheet's rows are one set of choices and
          the gold made Delete read as a warning banner rather than a sibling
          of Move / Replace (user request 2026-07-20). Deleting a photo is
          reversible by re-adding one, and the confirm still gates it; the
          warning haptic below carries the caution instead of the colour. */}
      <SheetActionRow
        icon={<PhotoTrashIcon color={canDelete ? INK : INK_SUBTLE} />}
        label={canDelete ? t('settings.photoEditDelete') : t('settings.photoMinTwo')}
        disabled={!canDelete}
        onPress={() => { tapWarning(); onDelete() }}
      />
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
    backgroundColor: PAGE,
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
    fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: INK,
  },
  tileLabelDisabled: {
    color: INK_SUBTLE,
  },
})

// Full-screen pane showing the user's profile card preview, opened from the
// profile tab via the sub-page mechanism.

export function PreviewFieldPage({
  config, onBack, dismissGestureRef, onScrollAtTop, headerBottomShared, pullEngaged, clipBottom: _clipBottom,
}: {
  config: PreviewFieldConfig
  onBack: () => void
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
  const [photoPopupImageIndex, setPhotoPopupImageIndex] = useState<number | null>(null)
  const [familyPopupVisible, setFamilyPopupVisible] = useState(false)
  // Serializes the background family writes (see handleSaveFamily).
  const familySaveChain = useRef<Promise<void>>(Promise.resolve())
  const [bioSaving, setBioSaving] = useState(false)
  // True while the OS image picker is launching. launchImageLibraryAsync has a
  // cold-start delay (especially the very first time it loads the native
  // bridge). Drive a spinner in whichever UI initiated the pick so the user
  // gets immediate visual feedback while the picker dialog comes up.
  const [photoPicking, setPhotoPicking] = useState(false)
  // True while the picker is loading specifically for the Replace flow inside
  // PhotoOptionsPopup — keeps the popup open with a spinner on the Replace
  // tile, so the user sees what's loading instead of a blank screen between
  // popup-close and picker-open.
  const [photoReplacing, setPhotoReplacing] = useState(false)

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
    if (photoPopupImageIndex == null || !user || !profile?.images || photoReplacing) return
    const targetIndex = photoPopupImageIndex
    setPhotoReplacing(true)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    }).finally(() => {
      setPhotoReplacing(false)
      setPhotoPopupImageIndex(null)
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]

    const userId = user.id
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    const { filename, uploaded } = processAndUploadPhotoDeferred(asset.uri, userId, token)

    // Kept so a failed upload can put the previous photo BACK (see the catch
    // below). The old file is still in storage and still valid -- only the
    // reference is being swapped here.
    const current = useUserStore.getState().profile
    const oldEntry = current?.images?.[targetIndex]
    if (current?.images) {
      // Swap the slot optimistically -- processAndUploadPhotoDeferred already
      // primed localPhotoUriCache with the picked URI, so the new photo renders
      // straight away. The OLD photo's local cache + deferred marker are
      // deliberately NOT torn down here: until the new upload lands, the old
      // photo is still the one we fall back to. Tearing its state down eagerly
      // meant a failed replace restored an entry with no local cache (visible
      // flash), and -- worse -- replacing a photo that was ITSELF still
      // uploading un-marked it from pendingDeferred, letting persistImages()
      // write it to the server before its upload had landed. Both cleanups now
      // live on the success path below.
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
              // Puts the pinned add chips on the same line as the sheet's
              // floating close X. Only when the sheet owns the top inset —
              // standalone, the root has already padded the card down past it.
              chromeInset={dismissGestureRef ? insets.top : 0}
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
              // No round button on your own card: there is nobody to invite,
              // and the adds moved into the chip column below.
              actions={[]}
              addChips={(() => {
                const list: CardAddChip[] = []
                if (photoAddEnabled) list.push({
                  key: 'photo',
                  label: t('settings.addPhoto'),
                  renderIcon: c => photoPicking
                    ? <ActivityIndicator size="small" color={c} />
                    : <CameraIcon color={c} size={ICON.sm} />,
                  onPress: () => { tap(); handleAddPhoto() },
                })
                if (familyAddEnabled) list.push({
                  key: 'family',
                  label: t('settings.addFamily'),
                  renderIcon: c => <KidsGlyph color={c} />,
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
        replacing={photoReplacing}
        onDismiss={() => { if (!photoReplacing) setPhotoPopupImageIndex(null) }}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onReplace={handleReplace}
        onDelete={handleDelete}
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

function AppInlineContent({ onBack: _onBack, onNavigateHome: _onNavigateHome, onOpenSubPage }: { onBack?: () => void; onNavigateHome?: () => void; onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const router = useRouter()
  const { profile } = useUserStore()
  const { signOut } = useAuthStore()
  const [accountPopupVisible, setAccountPopupVisible] = useState(false)
  const [groupsPopupVisible, setGroupsPopupVisible] = useState(false)
  // The groups sheet is opened straight into one of its two acts by the chip
  // that was tapped: a group chip leaves it, the trailing chip joins a new one.
  const [groupsMode, setGroupsMode] = useState<'join' | 'leave'>('join')
  const [groupsLeaveTarget, setGroupsLeaveTarget] = useState<Group | null>(null)
  const openJoinGroup = () => { tap(); setGroupsLeaveTarget(null); setGroupsMode('join'); setGroupsPopupVisible(true) }
  const openLeaveGroup = (g: Group) => { tapWarning(); setGroupsLeaveTarget(g); setGroupsMode('leave'); setGroupsPopupVisible(true) }
  // Lifted from GroupsPopup so the menu row can render the chained group
  // names from the same fetched list — one source of truth shared between
  // the row label and the popup.
  //
  // Seeded from the persisted cache so the row paints its names with the
  // screen rather than popping in when `app/my_groups` lands; the response
  // then overwrites both. A failed fetch keeps the cached names (falling back
  // to "no groups" only when there is nothing cached to show).
  const cachedGroups = useCachedGroups()
  const [fetchedGroups, setFetchedGroups] = useState<Group[] | null>(null)
  const [groupsFetchFailed, setGroupsFetchFailed] = useState(false)
  const groups = fetchedGroups ?? cachedGroups ?? (groupsFetchFailed ? [] : null)
  const setGroups = useCallback((g: Group[]) => {
    setFetchedGroups(g)
    setCachedGroups(g)
  }, [])
  useEffect(() => {
    let cancelled = false
    invoke<{ groups?: Group[] }>('app/my_groups')
      .then(data => { if (!cancelled) setGroups(data?.groups ?? []) })
      .catch(() => { if (!cancelled) setGroupsFetchFailed(true) })
    return () => { cancelled = true }
  }, [setGroups])
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

  return (
    <>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        {/* Credits, then Account. Tapping credits opens the buy picker
            straight away. (Visibility moved to the menu's top group, beside
            Communities.) */}
        <SelectFieldRow
          grouped
          // The label is the bare word and the whole wallet rides its own line
          // as ONE small chip on the END edge (user directive 2026-07-28) — the
          // same trailing tile the watcher/requests rows wear, so the count
          // reads as a fact stated by the row rather than a table hung under it.
          label={t('settings.credits')}
          trailing={<Chip small text={String(heartsTotal)} />}
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
      </View>
      <AccountPopup
        visible={accountPopupVisible}
        onDismiss={() => setAccountPopupVisible(false)}
        onSignOutPress={() => setSignOutDialog(true)}
        onDeletePress={() => setDeleteDialog(true)}
      />
      <GroupsPopup
        visible={groupsPopupVisible}
        onDismiss={() => setGroupsPopupVisible(false)}
        mode={groupsMode}
        leaveGroup={groupsLeaveTarget}
        groups={groups}
        setGroups={setGroups}
      />
      <ConfirmDialog
        visible={signOutDialog}
        title={t('settings.signOutConfirmTitle')}
        description={tg('settings.signOutConfirmDesc', profile.is_male)}
        confirmLabel={tg('settings.signOutYes', profile.is_male)}
        confirmIconStart={<SignOutIcon color={WHITE} />}
        onCancel={() => setSignOutDialog(false)}
        onConfirm={onSignOutConfirmed}
        draggable
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
        draggable
      />
      <BuyExtraPopup
        visible={buyExtraOpen}
        onDismiss={() => setBuyExtraOpen(false)}
      />
    </>
  )
}



type SettingsPageProps = {
  topInset?: number
  /** Height of the floating sheet chrome drawn OVER this page. The profile
   *  photo grows by this much and bleeds up behind the chrome, so the photo
   *  fills to the very top of the screen while its bottom edge — and the
   *  caption row on it — stay exactly where they were. 0 = opaque chrome
   *  above the page, nothing to bleed behind. */
  photoBleed?: number
  onBack?: () => void
  onNavigateHome?: () => void
  focused?: boolean
  onOpenSubPage?: (config: SubPageConfig) => Promise<void>
  embedded?: boolean
} & Partial<OverlaySheetBody>

export default function SettingsPage({
  topInset = 0, photoBleed = 0, onBack, onNavigateHome, focused: _focused = true, onOpenSubPage, embedded = false,
  dismissGestureRef, onScrollAtTop, pullEngaged,
}: SettingsPageProps = {}) {
  const { profile } = useUserStore()
  const { user } = useAuthStore()
  const router = useRouter()
  const bottomInset = useBottomInset()

  // While the profile is not yet BUILT (photos + bio), the menu's hero slot is
  // not the avatar but a purple CTA into the build-profile flow. A browse-only
  // user reaches settings freely (the menu is never gated), so this is their
  // way to finish. Same completion marker the invite popup and the server gate
  // use — one source of truth.
  const profileBuilt = selectProfileBuilt(profile)

  const firstPhoto = profile?.images?.[0]?.normal
  const avatarUri = firstPhoto
    ? (localPhotoUriCache.get(firstPhoto) ?? `${SUPABASE_URL}/storage/v1/object/public/users/${user?.id ?? profile?.user_id}/normal/${firstPhoto}`)
    : undefined

  // Same wiring PreviewFieldPage uses: when this page is the body of an
  // OverlaySheet, its scroll has to negotiate with the sheet's dismiss pan
  // (PullScrollView reports at-top and drops scrollEnabled mid-pull) or the
  // two fight and the content lands nudged after a swipe + snap-back.
  const idlePull = useSharedValue(false)
  const pullCtx = useMemo<PullCtx | null>(() => dismissGestureRef ? {
    panRef: dismissGestureRef,
    extraRefs: [],
    setScrollAtTop: onScrollAtTop ?? (() => {}),
    pullEngaged: pullEngaged ?? idlePull,
  } : null, [dismissGestureRef, onScrollAtTop, pullEngaged, idlePull])

  // The photo grows by `photoBleed` so the image bleeds up behind the floating
  // sheet chrome (the close X), filling to the very top of the screen.
  const photoHeight = PROFILE_CARD_HEIGHT + photoBleed

  const body = (
    <View style={styles.rootOuter}>
      {/* NO 'bottom' edge: reserving the safe area HERE shortens the scroll's
          viewport, so the menu was permanently clipped a home-indicator's
          height above the screen edge and rode over a dead empty band that
          never scrolled away (iPhone only — Android reports 0 here, which is
          why it went unseen). The inset belongs to the scroll CONTENT below,
          where the list runs to the very bottom edge and only its last row is
          held clear of the indicator. */}
      <SafeAreaView style={[styles.root, { paddingTop: topInset }]} edges={['left', 'right']}>
        {/* The profile photo is the BACKMOST, FIXED layer: it stays pinned to
            the top while the menu content scrolls UP and covers it (user
            request 2026-07-26). pointerEvents 'none' so the transparent spacer
            in the scroll below owns the tap (open profile) and the scroll
            gesture, while the photo shows through behind it. */}
        {profileBuilt ? (
          <View style={[styles.profileCardFixed, { height: photoHeight }]} pointerEvents="none">
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.profileCardImage} resizeMode="cover" />
            ) : (
              <View style={styles.profileCardPlaceholder}>
                <TabIcon tab="profile" color={INK_SUBTLE} />
              </View>
            )}
          </View>
        ) : null}
        <PullScrollView
          style={styles.tabScroll}
          contentContainerStyle={[styles.tabContent, { paddingTop: 0, paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          delaysContentTouches={false}
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={16}
        >
          {profileBuilt ? (
            // Transparent spacer sitting over the fixed photo: tapping it opens
            // profile editing, dragging it scrolls, and the photo behind shows
            // through. As the user scrolls, this spacer rides up and the opaque
            // content body below rises to cover the pinned photo.
            <Pressable
              style={{ height: photoHeight }}
              onPress={() => { tap(); onOpenSubPage?.({ kind: 'profileSection', title: t('settings.profile') }) }}
            />
          ) : (
            // Not-yet-built profile: no hero card. Plain page, one regular
            // button sitting just below the sheet's close (X) chrome.
            <View style={[styles.buildProfileWrap, { paddingTop: photoBleed + LG }]}>
              <Button
                label={t('settings.buildProfile')}
                onPress={() => { tap(); router.push('/onboarding') }}
                variant="primary"
                size="lg"
              />
            </View>
          )}

          {/* Opaque body: its solid WHITE fill is what covers the fixed photo as
              the list scrolls up over it. */}
          <View style={styles.scrollBody}>
            <View style={styles.optionsWrap}>
              <AudienceContent onOpenSubPage={onOpenSubPage} />

              <View style={{ marginTop: XL }}>
                <PreferencesContent onOpenSubPage={onOpenSubPage} />
              </View>

              <View style={{ marginTop: XL }}>
                <AppInlineContent onBack={onBack} onNavigateHome={onNavigateHome} onOpenSubPage={onOpenSubPage} />
              </View>
            </View>
          </View>

        </PullScrollView>
      </SafeAreaView>
    </View>
  )

  return pullCtx
    ? <PullContext.Provider value={pullCtx}>{body}</PullContext.Provider>
    : body
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
  // The user's photo, uncaptioned, at 2x the height of a regular row. It is the
  // BACKMOST, FIXED layer: pinned to the top of the sheet behind the scroll,
  // the content body scrolls up and covers it. No label and no scrim over it,
  // the photo is the affordance (the transparent spacer over it owns the tap).
  profileCardFixed: {
    position: 'absolute', top: 0, start: 0, end: 0,
    overflow: 'hidden',
    backgroundColor: WHITE_SOFT,
  },
  // Opaque wrapper around the scrolling menu content: its solid WHITE is what
  // hides the fixed photo behind it as the list rises over the photo.
  scrollBody: { backgroundColor: SURFACE },
  profileCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  profileCardPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE_SOFT },
  // Not-yet-built profile: no hero card, just the plain white page. A regular
  // button sits below the sheet's close (X) chrome; the inline paddingTop
  // clears that chrome (photoBleed) so the button never hides under it.
  buildProfileWrap: { paddingHorizontal: LG, paddingBottom: MD },
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
  // Two stacked full-width buttons on the page gutter — the same spec as the
  // chat menu's leave/block sheet (chatMenuStyles.sheet in home.tsx).
  accountActions: { paddingHorizontal: MD, gap: SM },
  // Account popup identity block: one chip per field, stacked vertically.
  // alignItems:'flex-start' keeps each pill at its own text width instead of
  // stretching it across the sheet.
  accountPopupList: {
    paddingHorizontal: MD, paddingBottom: MD, gap: XS,
    alignItems: 'flex-start',
  },

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
  selectRowLocked: { opacity: 0.45 },
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
    textAlign: 'center', lineHeight: lh(TEXT.md),
  },
})
