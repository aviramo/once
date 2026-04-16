import { useState, useEffect, useMemo, useRef } from 'react'
import {
  View, Pressable, StyleSheet, ScrollView,
  PanResponder, I18nManager,
  Keyboard, Platform, Animated, Dimensions, BackHandler,
} from 'react-native'
import { Text, TextInput } from '../src/components/AppText'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Svg, { Path, Line, Polyline, Circle } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap, tapWarning } from '../src/lib/haptics'
import { useUserStore } from '../src/stores/userStore'
import { useAuthStore } from '../src/stores/authStore'
import { t, tg } from '../src/i18n'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { Button, PrimaryButton } from '../src/components/Button'
import { IconPressable } from '../src/components/IconPressable'
import { MatchCard } from '../src/components/MatchCard'
import { PhotoEditor } from '../src/components/PhotoEditor'
import type { MatchData } from '../src/stores/userStore'
import { slidingActiveRef, useSlidingActive } from '../src/lib/gesture'

const isRTL = I18nManager.isRTL
const THUMB = 22

// ── Back Icon ──────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Svg>
  )
}

// ── Forward Chevron ────────────────────────────────────────────────────────
// Opposite of BackIcon — points in the "deeper navigation" direction.
// LTR: points right ›  |  RTL: points left ‹

function ForwardChevronIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </Svg>
  )
}

// ── Select Field Types ─────────────────────────────────────────────────────

export type SelectOption = { value: string; label: string }

export type SelectFieldConfig = {
  title: string
  options: SelectOption[]
  value: string
  onSelect: (value: string) => void
  description?: string
}

// ── Select Field Row ───────────────────────────────────────────────────────
// Tappable settings row: label on the start side, current value + forward
// chevron on the end side. Tapping opens the sub-page via onPress.

function SelectFieldRow({
  label,
  displayValue,
  onPress,
}: {
  label: string
  displayValue: string
  onPress: () => void
}) {
  return (
    <View
      style={styles.selectRow}
      onStartShouldSetResponder={() => true}
      onResponderRelease={() => { tap(); onPress() }}
    >
      <Text style={styles.selectRowLabel}>{label}</Text>
      <View style={styles.selectRowTrailing}>
        <Text style={styles.selectRowValue}>{displayValue}</Text>
        <ForwardChevronIcon />
      </View>
    </View>
  )
}

// ── Range Slider ───────────────────────────────────────────────────────────

interface RangeSliderProps {
  min: number; max: number
  valueMin: number; valueMax: number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
}

function RangeSlider({ min, max, valueMin, valueMax, onChangeMin, onChangeMax }: RangeSliderProps) {
  const s = useRef({ trackWidth: 0, min, max, valueMin, valueMax, startMin: 0, startMax: 0 })
  const cbs = useRef({ onChangeMin, onChangeMax })

  useEffect(() => { s.current.min = min }, [min])
  useEffect(() => { s.current.max = max }, [max])
  useEffect(() => { s.current.valueMin = valueMin }, [valueMin])
  useEffect(() => { s.current.valueMax = valueMax }, [valueMax])
  useEffect(() => { cbs.current = { onChangeMin, onChangeMax } }, [onChangeMin, onChangeMax])

  const toPos = (v: number) =>
    ((v - s.current.min) / (s.current.max - s.current.min)) * s.current.trackWidth

  const toVal = (pos: number) => {
    const { min, max, trackWidth } = s.current
    return Math.round(min + (Math.max(0, Math.min(pos, trackWidth)) / trackWidth) * (max - min))
  }

  const minPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Hold on to the gesture so the outer pagers (settings tabs + home
    // shell) can't steal it mid-drag.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      slidingActiveRef.current = true
      s.current.startMin = toPos(s.current.valueMin)
    },
    onPanResponderMove: (_, { dx }) => {
      const v = toVal(s.current.startMin + (isRTL ? -dx : dx))
      if (v !== s.current.valueMin && v < s.current.valueMax)
        cbs.current.onChangeMin(v)
    },
    onPanResponderRelease: () => { slidingActiveRef.current = false },
    onPanResponderTerminate: () => { slidingActiveRef.current = false },
  })).current

  const maxPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      slidingActiveRef.current = true
      s.current.startMax = toPos(s.current.valueMax)
    },
    onPanResponderMove: (_, { dx }) => {
      const v = toVal(s.current.startMax + (isRTL ? -dx : dx))
      if (v !== s.current.valueMax && v > s.current.valueMin)
        cbs.current.onChangeMax(v)
    },
    onPanResponderRelease: () => { slidingActiveRef.current = false },
    onPanResponderTerminate: () => { slidingActiveRef.current = false },
  })).current

  const minPct = (valueMin - min) / (max - min)
  const maxPct = (valueMax - min) / (max - min)

  return (
    <View style={rs.container}>
      <View style={rs.track} onLayout={e => { s.current.trackWidth = e.nativeEvent.layout.width }}>
        <View style={rs.trackBg} />
        <View style={[rs.trackFill, { start: `${minPct * 100}%`, end: `${(1 - maxPct) * 100}%` }]} />
        <View style={[rs.thumb, { start: `${minPct * 100}%`, transform: [{ translateX: isRTL ? THUMB / 2 : -THUMB / 2 }] }]} {...minPan.panHandlers} />
        <View style={[rs.thumb, { start: `${maxPct * 100}%`, transform: [{ translateX: isRTL ? THUMB / 2 : -THUMB / 2 }] }]} {...maxPan.panHandlers} />
      </View>
    </View>
  )
}

const rs = StyleSheet.create({
  container: { height: THUMB + 8, justifyContent: 'center', marginVertical: 4, paddingHorizontal: THUMB / 2 },
  track: { flex: 1, height: THUMB, justifyContent: 'center' },
  trackBg: { position: 'absolute', start: 0, end: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 2 },
  trackFill: { position: 'absolute', height: 3, backgroundColor: '#111', borderRadius: 2 },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#111',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 4,
  },
})

// ── Radius Slider ──────────────────────────────────────────────────────────
// Single-thumb step slider built on the same PanResponder model as the age
// RangeSlider above. Using the native Slider here had recurring gesture
// negotiation problems with the nested horizontal pagers (home shell +
// settings tabs) — replacing it with a custom thumb whose PanResponder
// directly owns the gesture and flips slidingActiveRef makes the nested
// pagers stay out of the way reliably.

interface RadiusSliderProps {
  stepCount: number           // number of snap positions (value domain is 0..stepCount-1)
  value: number               // current integer index
  onChange: (v: number) => void
}

function RadiusSlider({ stepCount, value, onChange }: RadiusSliderProps) {
  const s = useRef({ trackWidth: 0, startPos: 0, value, stepCount })
  s.current.value = value
  s.current.stepCount = stepCount
  const cbs = useRef({ onChange })
  useEffect(() => { cbs.current = { onChange } }, [onChange])

  const toPos = (v: number) => {
    const { trackWidth, stepCount: sc } = s.current
    if (sc <= 1 || trackWidth === 0) return 0
    return (v / (sc - 1)) * trackWidth
  }
  const toVal = (pos: number) => {
    const { trackWidth, stepCount: sc } = s.current
    if (sc <= 1 || trackWidth === 0) return 0
    const frac = Math.max(0, Math.min(pos, trackWidth)) / trackWidth
    return Math.round(frac * (sc - 1))
  }

  const thumbPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      slidingActiveRef.current = true
      s.current.startPos = toPos(s.current.value)
    },
    onPanResponderMove: (_, { dx }) => {
      const v = toVal(s.current.startPos + (isRTL ? -dx : dx))
      if (v !== s.current.value) cbs.current.onChange(v)
    },
    onPanResponderRelease: () => { slidingActiveRef.current = false },
    onPanResponderTerminate: () => { slidingActiveRef.current = false },
  })).current

  const pct = stepCount <= 1 ? 0 : value / (stepCount - 1)

  return (
    <View style={rs.container} collapsable={false}>
      <View
        style={rs.track}
        onLayout={e => { s.current.trackWidth = e.nativeEvent.layout.width }}
      >
        <View style={rs.trackBg} />
        <View style={[rs.trackFill, { start: 0, end: `${(1 - pct) * 100}%` }]} />
        <View
          style={[rs.thumb, { start: `${pct * 100}%`, transform: [{ translateX: isRTL ? THUMB / 2 : -THUMB / 2 }] }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          {...thumbPan.panHandlers}
        />
      </View>
    </View>
  )
}

// ── Radius helpers ─────────────────────────────────────────────────────────

const RADIUS_STEPS = [0, 0.5, 1, 2, 5, 10, 20, 50, 70, 100, Infinity]

function snapRadius(km: number): number {
  return RADIUS_STEPS.reduce((prev, curr) =>
    Math.abs(curr - km) < Math.abs(prev - km) ? curr : prev
  )
}

function formatRadius(km: number): string {
  if (km === 0) return t('settings.rangeHere')
  if (km === Infinity) return '∞'
  if (km < 1) return `${km * 1000} ${t('settings.meter')}`
  return `${km} ${t('settings.km')}`
}

function radiusToServer(km: number): number {
  if (km === Infinity) return 100_000_000
  if (km === 0) return 250
  return Math.round(km * 1000)
}

// ── Auto-save hook ─────────────────────────────────────────────────────────

function useAutoSave(data: object, ready: boolean, delay = 600) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirst = useRef(true)
  const key = JSON.stringify(data)

  useEffect(() => {
    if (!ready) return
    if (isFirst.current) { isFirst.current = false; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { invoke('app/update', data).catch(console.error) }, delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [key, ready])
}

// ── Age helpers ────────────────────────────────────────────────────────────

function calcAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ── Tabs ───────────────────────────────────────────────────────────────────

type Tab = 'preferences' | 'profile' | 'account' | 'app'
const TABS: Tab[] = ['preferences', 'profile', 'account', 'app']
const TAB_BAR_PAD = 3  // inner padding of the tab bar — must match styles.tabBar.padding

// Per-tab glyph. Drawn twice by TabIconStack (gray + white) so the active
// state can cross-fade over the pill indicator on the native driver.
const TAB_ICON_SIZE = 20

function TabIcon({ tab, color }: { tab: Tab; color: string }) {
  const stroke = color
  if (tab === 'preferences') {
    // Sliders — three horizontal tracks with a knob on each
    return (
      <Svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Line x1="4" y1="6" x2="20" y2="6" />
        <Circle cx="15" cy="6" r="2.2" fill={stroke} stroke="none" />
        <Line x1="4" y1="12" x2="20" y2="12" />
        <Circle cx="9" cy="12" r="2.2" fill={stroke} stroke="none" />
        <Line x1="4" y1="18" x2="20" y2="18" />
        <Circle cx="16" cy="18" r="2.2" fill={stroke} stroke="none" />
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
  if (tab === 'account') {
    // Shield with check — account identity
    return (
      <Svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 3 4 6v6c0 4.6 3.3 8.7 8 9.4 4.7-.7 8-4.8 8-9.4V6l-8-3z" />
        <Polyline points="9 12 11.5 14.5 15.5 10.5" />
      </Svg>
    )
  }
  // app → gear
  return (
    <Svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx={12} cy={12} r={3} />
    </Svg>
  )
}

// Stacks an active (white) icon over the inactive (gray) icon. The white
// opacity is driven by the pill indicator's position (passed in by the parent)
// so the cross-fade stays in lockstep with the pill — otherwise the pill can
// sit over a still-gray icon (gray on black = invisible) or leave a tab whose
// icon is still white (white on light bg = invisible).
function TabIconStack({ opacity, tab }: { opacity: Animated.AnimatedInterpolation<number> | number; tab: Tab }) {
  return (
    <View style={{ width: TAB_ICON_SIZE, height: TAB_ICON_SIZE }}>
      <TabIcon tab={tab} color="rgba(0,0,0,0.5)" />
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, start: 0, opacity }}
      >
        <TabIcon tab={tab} color="#fff" />
      </Animated.View>
    </View>
  )
}

// ── Animated Toggle Button ─────────────────────────────────────────────────
// Used for the gender chips (and anywhere else two-state pill buttons appear).
// Animates background color, text color, and a small scale bump on press.

function AnimatedToggleButton({
  active, onPress, label,
}: { active: boolean; onPress: () => void; label: string }) {
  // Stacked layers cross-faded with opacity — lets us run on the native driver
  // (backgroundColor interpolation can't). Active layer sits on top.
  const activeOpacity = useRef(new Animated.Value(active ? 1 : 0)).current
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.timing(activeOpacity, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [active])

  const handlePress = () => {
    tap()
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start()
    onPress()
  }

  // Raw responder callbacks (not Pressable) for the same reason as Button /
  // IconPressable: RN 0.81 Pressability cancels single taps inside ScrollView.
  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <View
        onStartShouldSetResponder={() => true}
        onResponderRelease={handlePress}
      >
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {/* Inactive layer — always rendered underneath */}
          <View style={{ backgroundColor: 'rgba(0,0,0,0.06)', paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(0,0,0,0.5)' }}>{label}</Text>
          </View>
          {/* Active layer — fades over the top */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, start: 0, end: 0, bottom: 0,
              backgroundColor: '#111', alignItems: 'center', justifyContent: 'center',
              opacity: activeOpacity,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{label}</Text>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  )
}

// ── Preferences Tab ────────────────────────────────────────────────────────

function PreferencesTab() {
  const { profile, update } = useUserStore()

  const age = profile?.birth_date ? calcAge(profile.birth_date) : 40
  const ageSliderMin = Math.max(18, age - 20)
  const ageSliderMax = Math.min(80, age + 20)

  // Handler-driven debounced save. The previous useAutoSave bundled all four
  // preference fields and re-fired whenever any of them changed in profile —
  // which included server-pushed values arriving via realtime, causing an
  // echo back to the server with values it had just sent us. Driving the save
  // from the actual control callbacks guarantees a request only goes out for
  // genuine user input.
  const dirtyRef = useRef<Record<string, unknown>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushPrefs = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    const body = dirtyRef.current
    if (Object.keys(body).length === 0) return
    dirtyRef.current = {}
    invoke('app/update', body).catch(console.error)
  }
  const queuePref = (patch: Record<string, unknown>) => {
    Object.assign(dirtyRef.current, patch)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushPrefs, 600)
  }
  // Flush any pending patch on unmount so a swipe away mid-debounce doesn't
  // drop the user's most recent change.
  useEffect(() => () => { flushPrefs() }, [])

  if (!profile) return <View style={styles.tabContent} />

  const ageMin = Math.max(ageSliderMin, Math.min(profile.age_from, ageSliderMax - 1))
  const ageMax = Math.min(ageSliderMax, Math.max(profile.age_to, ageSliderMin + 1))
  const radius = profile.range >= 100_000_000 ? Infinity : profile.range <= 250 ? 0 : snapRadius(profile.range / 1000)
  const forMale = profile.is_for_male
  const forFemale = profile.is_for_female

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">

      {/* Age Range */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('settings.ageRange').toUpperCase()}</Text>
          <Text style={styles.sectionValue}>{ageMin} – {ageMax}</Text>
        </View>
        <View style={styles.sliderRow}>
          <Text style={styles.sliderEndLabel}>{ageSliderMin}</Text>
          <View style={{ flex: 1 }}>
            <RangeSlider
              min={ageSliderMin} max={ageSliderMax}
              valueMin={ageMin} valueMax={ageMax}
              onChangeMin={v => { update({ age_from: v }); queuePref({ age_from: v }) }}
              onChangeMax={v => { update({ age_to: v }); queuePref({ age_to: v }) }}
            />
          </View>
          <Text style={styles.sliderEndLabel}>{ageSliderMax}</Text>
        </View>
      </View>

      {/* Search Radius */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('settings.range').toUpperCase()}</Text>
          <Text style={styles.sectionValue}>{formatRadius(radius)}</Text>
        </View>
        <RadiusSlider
          stepCount={RADIUS_STEPS.length}
          value={Math.max(0, RADIUS_STEPS.indexOf(radius))}
          onChange={i => {
            const r = radiusToServer(RADIUS_STEPS[i])
            update({ range: r })
            queuePref({ range: r })
          }}
        />
      </View>

      {/* Preferred Gender */}
      <View style={styles.section}>
        <SectionLabel>{t('settings.preferredGender').toUpperCase()}</SectionLabel>
        <View style={styles.genderRow}>
          <AnimatedToggleButton
            active={!!forMale}
            label={t('settings.genderM')}
            onPress={() => {
              if (!(forFemale || !forMale)) return
              const nextForMale = !forMale
              update({ is_for_male: nextForMale })
              const pg = nextForMale && forFemale ? 'B' : nextForMale ? 'M' : 'F'
              queuePref({ preferred_gender: pg })
            }}
          />
          <AnimatedToggleButton
            active={!!forFemale}
            label={t('settings.genderF')}
            onPress={() => {
              if (!(forMale || !forFemale)) return
              const nextForFemale = !forFemale
              update({ is_for_female: nextForFemale })
              const pg = forMale && nextForFemale ? 'B' : nextForFemale ? 'F' : 'M'
              queuePref({ preferred_gender: pg })
            }}
          />
        </View>
      </View>

    </ScrollView>
  )
}

// ── Profile Tab ────────────────────────────────────────────────────────────

function ProfileTab({ focused = true, onEditModeChange, previewOpen = false, onTogglePreview, onPreviewDataChange }: { focused?: boolean; onEditModeChange?: (editing: boolean) => void; previewOpen?: boolean; onTogglePreview?: () => void; onPreviewDataChange?: (data: MatchData | null) => void }) {
  const { profile, update } = useUserStore()
  const { user } = useAuthStore()
  const [dragging, setDragging] = useState(false)
  const [editMode, setEditMode] = useState(false)
  // Message is held locally while typing — flushed on blur / unmount to avoid per-keystroke server calls
  const [localMessage, setLocalMessage] = useState(profile?.message ?? '')
  const localMessageRef = useRef(localMessage)
  const savedMessageRef = useRef(profile?.message ?? '')
  const scrollRef = useRef<ScrollView>(null)
  // Keyboard handling: when the message field is focused we explicitly scroll
  // the section into view. Padding the bottom by the keyboard height makes
  // sure the scroll has somewhere to land even when content is short.
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  // y offset of the "About me" section from the top of the scroll content —
  // set by the section's onLayout, used as the scroll target on focus.
  const messageSectionYRef = useRef(0)

  // Keep localMessage in sync when profile loads or changes from elsewhere
  useEffect(() => {
    const serverMessage = profile?.message ?? ''
    savedMessageRef.current = serverMessage
    setLocalMessage(serverMessage)
  }, [profile?.message])

  useEffect(() => { localMessageRef.current = localMessage }, [localMessage])

  const flushMessage = () => {
    const next = localMessageRef.current
    if (next === savedMessageRef.current) return
    savedMessageRef.current = next
    update({ message: next })
    invoke('app/update', { message: next }).catch(console.error)
  }

  // Flush on unmount (e.g., user pressed back while input still focused)
  useEffect(() => {
    return () => { flushMessage() }
  }, [])

  // Leaving the Profile tab (swipe to another settings tab, swipe back to
  // home, or tab tap) dismisses the photo jiggle state. All photo edits save
  // as they happen, so there's nothing to flush here — just drop the UI flag.
  useEffect(() => {
    if (!focused && editMode) setEditMode(false)
  }, [focused, editMode])

  // Report edit-mode to ancestors so they can disable the tab pager and
  // outer shell pan — otherwise horizontal drags on a photo cell get claimed
  // by the outer gestures via activeOffsetX and the whole page slides
  // instead of the photo being dragged.
  useEffect(() => { onEditModeChange?.(editMode) }, [editMode, onEditModeChange])

  // Android hardware back while editing exits edit mode instead of navigating
  // away — matches the iOS home-screen jiggle behavior.
  useEffect(() => {
    if (!editMode) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditMode(false)
      return true
    })
    return () => sub.remove()
  }, [editMode])

  // Subscribe to keyboard show/hide so we can expand the scroll region to
  // leave room for the content above the keyboard, and track the height for
  // any follow-up scroll math.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height))
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])

  // message is excluded — it has its own blur-based save path
  useAutoSave({
    is_for_kids: profile?.is_for_kids ?? null,
    images: profile?.images ?? { normal: [], blur: [] },
  }, !!profile)

  if (!profile) return <View style={styles.tabContent} />

  const photos = profile.images?.normal ?? []
  const isForKids = profile.is_for_kids

  const previewData: MatchData | null = useMemo(() => {
    if (!profile) return null
    const imgs = profile.images?.normal ?? []
    return {
      user_id: profile.user_id,
      image: imgs[0] ?? '',
      images: imgs,
      title: profile.name ?? '—',
      message: localMessage,
      distance: 0,
      located_at: new Date().toISOString(),
      subscribed: false,
      is_for_kids: profile.is_for_kids ?? null,
      age: profile.birth_date ? calcAge(profile.birth_date) : undefined,
      is_male: profile.is_male,
      units: profile.units,
    }
  }, [profile, localMessage])

  useEffect(() => { onPreviewDataChange?.(previewData) }, [previewData, onPreviewDataChange])

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={styles.tabScroll}
      // Pad the bottom by the live keyboard height so the scroll has somewhere
      // to go: without it, on short-content tabs scrollTo would clamp before
      // the section reaches the top of the visible area.
      contentContainerStyle={[styles.tabContent, { paddingBottom: 40 + keyboardHeight }]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!dragging && !previewOpen}
      keyboardShouldPersistTaps="handled"
      delaysContentTouches={false}
      // Any scroll/swipe dismisses photo edit mode — replaces the explicit
      // "Done" button so the user doesn't need to tap it.
      onScrollBeginDrag={() => { if (editMode) setEditMode(false) }}
    >

      <Pressable
        style={({ pressed }) => [styles.previewBtn, pressed && { opacity: 0.7 }]}
        onPress={() => { tap(); if (editMode) setEditMode(false); onTogglePreview?.() }}
      >
        <Text style={styles.previewBtnText}>
          {previewOpen ? t('settings.closePreview') : t('settings.previewProfile')}
        </Text>
      </Pressable>

      <View
        style={[styles.section, { marginTop: 24 }]}
        onLayout={(e) => { messageSectionYRef.current = e.nativeEvent.layout.y }}
      >
        <SectionLabel>{t('settings.aboutMe').toUpperCase()}</SectionLabel>
        <View style={styles.textInputWrap}>
          <TextInput
            style={styles.textInput}
            value={localMessage}
            onChangeText={setLocalMessage}
            onFocus={() => {
              if (editMode) setEditMode(false)
              // Wait for the keyboard to finish animating, then pull the
              // "About me" section up to the top of the visible area. Since
              // the ScrollView is padded by keyboardHeight, there's always
              // room to scroll this far.
              setTimeout(() => {
                scrollRef.current?.scrollTo({
                  y: Math.max(0, messageSectionYRef.current - 12),
                  animated: true,
                })
              }, 300)
            }}
            onBlur={flushMessage}
            multiline
            maxLength={300}
            textAlign="center"
            textAlignVertical="center"
          />
          <Text style={styles.charCount}>{localMessage.length}</Text>
        </View>
      </View>

      {/* Dim overlay sits under the photo grid (higher zIndex) but above
          every other section — tap anywhere outside the photos to drop out
          of jiggle mode. Outsized vertically so it still catches taps when
          the content is shorter than the viewport. */}
      {editMode && (
        <Pressable
          style={styles.photoEditOverlay}
          onPress={() => { tap(); setEditMode(false) }}
        />
      )}

      <View style={[styles.section, styles.photoSection]} pointerEvents="box-none">
        <View style={styles.photoSectionHeader} pointerEvents="box-none">
          <Text style={styles.sectionLabel}>{t('settings.photo').toUpperCase()}</Text>
        </View>
        <PhotoEditor
          editMode={editMode}
          onEnterEditMode={() => setEditMode(true)}
          onDragStateChange={setDragging}
        />
      </View>

      <View style={styles.section}>
        <SectionLabel>{tg('settings.kidsLabel', profile.is_male).toUpperCase()}</SectionLabel>
        <View style={styles.genderRow}>
          <AnimatedToggleButton
            active={isForKids === true}
            label={`✓  ${t('settings.kidsYes')}`}
            onPress={() => update({ is_for_kids: true })}
          />
          <AnimatedToggleButton
            active={isForKids === false}
            label={`✗  ${t('settings.kidsNo')}`}
            onPress={() => update({ is_for_kids: false })}
          />
        </View>
      </View>

    </ScrollView>
    </>
  )
}

// 3 columns × 2 rows (max 6 photos). Percentage width + space-between
// lets the gaps adapt to the actual pane width, which varies with safe-area
// insets on edge-to-edge Android, instead of relying on Dimensions at
// module-load time.
// ── Account Tab ────────────────────────────────────────────────────────────

function SignOutIcon({ color = '#111' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  )
}

function TrashIcon({ color = '#111' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Svg>
  )
}

function formatBirthDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function AccountTab() {
  const { profile } = useUserStore()
  const { user, signOut } = useAuthStore()
  const router = useRouter()
  const [signOutDialog, setSignOutDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (!profile || !user) return <View style={styles.tabContent} />

  const age = profile.birth_date ? calcAge(profile.birth_date) : null
  const gender =
    profile.is_male === true  ? t('settings.male')
    : profile.is_male === false ? t('settings.female')
    : '—'

  // After the server event completes (or fails — we don't want to strand the
  // user on a dead session), clear the Supabase session and hard-navigate to
  // the login screen. router.replace so the back stack can't return here.
  const finishAndGoToLogin = async () => {
    await signOut()
    router.replace('/login')
  }

  const confirmSignOut = () => {
    tap()
    setSignOutDialog(true)
  }

  const confirmDelete = () => {
    tapWarning()
    setDeleteDialog(true)
  }

  const onSignOutConfirmed = async () => {
    tap()
    setSignOutDialog(false)
    try { await invoke('app/logout') } catch (e) { console.error(e) }
    await finishAndGoToLogin()
  }

  const onDeleteConfirmed = async () => {
    if (deleting) return
    tapWarning()
    setDeleting(true)
    try {
      await invoke('app/delete')
    } catch (e) {
      console.error(e)
      setDeleting(false)
      return
    }
    setDeleteDialog(false)
    setDeleting(false)
    await finishAndGoToLogin()
  }

  const rows: Array<{ label: string; value: string }> = [
    { label: t('settings.email'),     value: user.email ?? '—' },
    { label: t('settings.name'),      value: profile.name ?? '—' },
    { label: t('settings.birthDate'), value: profile.birth_date ? `(${age}) ${formatBirthDate(profile.birth_date)}` : '—' },
    { label: t('settings.gender'),    value: gender },
  ]

  return (
    <>
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <SectionLabel>{t('settings.accountInfo').toUpperCase()}</SectionLabel>
        <View style={styles.infoCard}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.infoRow, i === rows.length - 1 && styles.infoRowLast]}>
              <Text style={styles.infoLabel}>{r.label}</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{r.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>{t('settings.accountActions').toUpperCase()}</SectionLabel>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, styles.actionBtnDestructiveSolid, pressed && styles.actionBtnDestructiveSolidPressed]}
          onPress={confirmSignOut}
        >
          <SignOutIcon color="#fff" />
          <Text style={[styles.actionBtnText, styles.actionBtnTextOnSolid]}>{tg('settings.signOut', profile.is_male)}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, styles.actionBtnDestructive, { marginTop: 10 }, pressed && { opacity: 0.7 }]}
          onPress={confirmDelete}
        >
          <TrashIcon color="#4b5563" />
          <Text style={[styles.actionBtnText, styles.actionBtnTextDestructive]}>{t('settings.deleteAccount')}</Text>
        </Pressable>
      </View>
    </ScrollView>
    <ConfirmDialog
      visible={signOutDialog}
      title={t('settings.signOutConfirmTitle')}
      description={tg('settings.signOutConfirmDesc', profile.is_male)}
      cancelLabel={t('settings.signOutNo')}
      confirmLabel={tg('settings.signOutYes', profile.is_male)}
      onCancel={() => setSignOutDialog(false)}
      onConfirm={onSignOutConfirmed}
    />
    <ConfirmDialog
      visible={deleteDialog}
      title={t('settings.deleteConfirmTitle')}
      description={tg('settings.deleteConfirmDesc', profile.is_male)}
      cancelLabel={t('settings.deleteNo')}
      confirmLabel={t('settings.deleteYes')}
      destructive
      busy={deleting}
      onCancel={() => setDeleteDialog(false)}
      onConfirm={onDeleteConfirmed}
    />
    </>
  )
}

// ── App Tab ────────────────────────────────────────────────────────────────

function AppTab({ onBack, onOpenSubPage }: { onBack?: () => void; onOpenSubPage?: (config: SelectFieldConfig) => void }) {
  const router = useRouter()
  const { profile, update } = useUserStore()
  const [resetting, setResetting] = useState<null | 'VISIBLE' | 'HIDDEN'>(null)

  // Null-safe: useAutoSave compares JSON.stringify of the object, so writing
  // `units: profile?.units` (undefined when unset) vs `'metric'` / `'imperial'`
  // after a tap produces a different key and saves correctly.
  useAutoSave({ units: profile?.units }, !!profile)

  if (!profile) return <View style={styles.tabContent} />

  // Default view state is metric when units is unset (matches our km sliders).
  const isMetric = (profile.units ?? 'metric') === 'metric'

  const appearance = profile.appearance ?? 'system'
  const appearanceOptions: SelectOption[] = [
    { value: 'system', label: t('settings.appearanceSystem') },
    { value: 'light',  label: t('settings.appearanceLight')  },
    { value: 'dark',   label: t('settings.appearanceDark')   },
  ]
  const appearanceDisplayValue = appearanceOptions.find(o => o.value === appearance)?.label ?? t('settings.appearanceLight')

  const onReset = async (state: 'VISIBLE' | 'HIDDEN') => {
    if (resetting) return
    setResetting(state)
    try {
      await invoke('app/reset', { state })
      // The reset edge function runs bulk UPDATEs on the DB but doesn't
      // refresh the request's in-memory user, so the response body carries
      // the PRE-reset snapshot. Realtime delivers the real post-reset state
      // ~1s later, which left the home screen showing stale data in the
      // gap. Apply the known post-reset shape locally so the store reflects
      // the new truth before we navigate home.
      update({ state, match: null, watchers: {} })
      // Navigate back to home once the store matches the post-reset state.
      // When embedded in the shell pager the parent slides back to home;
      // standalone falls back to router.back().
      if (onBack) onBack()
      else router.back()
    } catch (e) { console.error(e) }
    finally { setResetting(null) }
  }

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <SectionLabel>{t('settings.appearance').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          label={t('settings.appearance')}
          displayValue={appearanceDisplayValue}
          onPress={() => onOpenSubPage?.({
            title: t('settings.appearance'),
            options: appearanceOptions,
            value: appearance,
            onSelect: (v) => {
              update({ appearance: v })
              invoke('app/update', { appearance: v }).catch(console.error)
            },
            description: t('settings.appearanceDesc'),
          })}
        />
      </View>

      <View style={styles.section}>
        <SectionLabel>{t('settings.unitsLabel').toUpperCase()}</SectionLabel>
        <View style={styles.genderRow}>
          <AnimatedToggleButton
            active={isMetric}
            label={t('settings.unitsMetricDesc')}
            onPress={() => update({ units: 'metric' })}
          />
          <AnimatedToggleButton
            active={!isMetric}
            label={t('settings.unitsImperialDesc')}
            onPress={() => update({ units: 'imperial' })}
          />
        </View>
      </View>

      {profile.role === 'ADMIN' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.adminTitle')}</Text>
          <SectionLabel>{t('settings.adminLabel').toUpperCase()}</SectionLabel>
          <View style={styles.genderRow}>
            <View style={{ flex: 1 }}>
              <Button
                label={t('settings.resetVisible')}
                onPress={() => onReset('VISIBLE')}
                disabled={!!resetting}
                silentDisabled={resetting !== 'VISIBLE'}
                variant="primary"
                tone="visible"
                size="md"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t('settings.resetHidden')}
                onPress={() => onReset('HIDDEN')}
                disabled={!!resetting}
                silentDisabled={resetting !== 'HIDDEN'}
                variant="primary"
                size="md"
              />
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

function renderTab(tab: Tab, onBack: (() => void) | undefined, focused: boolean, onEditModeChange?: (editing: boolean) => void, previewOpen?: boolean, onTogglePreview?: () => void, onPreviewDataChange?: (data: MatchData | null) => void, onOpenSubPage?: (config: SelectFieldConfig) => void) {
  if (tab === 'preferences') return <PreferencesTab />
  if (tab === 'profile')     return <ProfileTab focused={focused} onEditModeChange={onEditModeChange} previewOpen={previewOpen} onTogglePreview={onTogglePreview} onPreviewDataChange={onPreviewDataChange} />
  if (tab === 'account')     return <AccountTab />
  if (tab === 'app')         return <AppTab onBack={onBack} onOpenSubPage={onOpenSubPage} />
  return <View style={styles.tabContent} />
}

// When embedded inside the home shell pager, the parent passes `onBack` so
// the back button animates the shell back to the home pane instead of
// popping the navigation stack. When rendered standalone via expo-router
// (e.g., direct /settings navigation), onBack is undefined and the back
// button falls back to router.back(). `focused` is true when the settings
// pane is the current pane in the home shell — tabs use it to tear down
// ephemeral UI state (e.g., photo jiggle) when the user swipes back home.
type SettingsPageProps = { onBack?: () => void; focused?: boolean; onEditModeChange?: (editing: boolean) => void }

// Wraps a section label text in a row container so flexDirection:'row'
// auto-flipping places the label on the logical start side (right in RTL,
// left in LTR) reliably — textAlign/writingDirection alone proved
// inconsistent at runtime.
function SectionLabel({ children }: { children: any }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{children}</Text>
    </View>
  )
}

export default function SettingsPage({ onBack, focused = true, onEditModeChange }: SettingsPageProps = {}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('preferences')
  // Photo edit (jiggle) state bubbles up from ProfileTab so the tab pager
  // and outer shell can surrender horizontal gestures to the photo-reorder
  // PanResponder. Without this, dragging a photo cell is claimed by the
  // outer GestureDetector's activeOffsetX and the whole page slides.
  const [photoEditActive, setPhotoEditActive] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMounted, setPreviewMounted] = useState(false)
  const [previewData, setPreviewData] = useState<MatchData | null>(null)
  const [headerH, setHeaderH] = useState(0)
  const insets = useSafeAreaInsets()
  const previewSlide = useRef(new Animated.Value(Dimensions.get('window').height)).current
  // Sub-page state declared here so it's available for the dependency arrays below.
  // The animation value and open/close functions live further down (after `width`).
  const [subPage, setSubPage] = useState<SelectFieldConfig | null>(null)
  const subPageSlide = useRef(new Animated.Value(isRTL ? -Dimensions.get('window').width : Dimensions.get('window').width)).current
  useEffect(() => { onEditModeChange?.(photoEditActive || previewOpen || !!subPage) }, [photoEditActive, previewOpen, subPage, onEditModeChange])
  // Close preview when leaving the profile tab so it doesn't linger over other tabs.
  useEffect(() => { if (activeTab !== 'profile' && previewOpen) setPreviewOpen(false) }, [activeTab, previewOpen])
  // Slide-in / slide-out — keep mounted through the close animation so the
  // exit motion is visible. Distance is windowHeight so the card fully clears
  // the viewport regardless of where its top edge is positioned.
  useEffect(() => {
    if (previewOpen) {
      setPreviewMounted(true)
      Animated.timing(previewSlide, { toValue: 0, duration: 280, useNativeDriver: true }).start()
    } else {
      Animated.timing(previewSlide, {
        toValue: Dimensions.get('window').height,
        duration: 240,
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setPreviewMounted(false) })
    }
  }, [previewOpen, previewSlide])
  // Disable the tab pan whenever a slider is mid-drag, so gesture-handler's
  // 10px activeOffsetX doesn't claim the gesture out from under the slider's
  // legacy PanResponder.
  const sliding = useSlidingActive()
  // Pager-style: all 4 tabs are laid out side-by-side in a strip, we just
  // translate the strip to reveal the selected one. No mount/unmount during
  // the transition, so nothing re-renders — the motion runs on the native
  // driver and the content is already there to be seen.
  //
  // Initialize width from the window dimensions so the tab content mounts on
  // the very first render. Waiting for onLayout adds a visible frame where
  // the tab bar shows with an empty strip underneath. onLayout still updates
  // the value if the actual content region turns out to be narrower.
  const [width, setWidth] = useState(() => Dimensions.get('window').width)
  const translate = useRef(new Animated.Value(0)).current
  // Sliding pill indicator in the tab bar — matches the content strip motion
  const [tabBarWidth, setTabBarWidth] = useState(0)
  const indicator = useRef(new Animated.Value(0)).current

  // Refs mirror state so the animateToIndex closure and the PanResponder
  // handlers (created once) see live values without re-binding.
  const activeTabRef = useRef(activeTab)
  const widthRef = useRef(width)
  const tabBarWidthRef = useRef(tabBarWidth)
  useEffect(() => { activeTabRef.current = activeTab; Keyboard.dismiss() }, [activeTab])
  useEffect(() => { widthRef.current = width }, [width])
  useEffect(() => { tabBarWidthRef.current = tabBarWidth }, [tabBarWidth])

  // ── Sub-page open / close helpers ─────────────────────────────────────
  // Declared after `width` and `widthRef` so references are clean.
  // State + animation ref live above the effects (before dep-array evaluation).

  const openSubPage = (config: SelectFieldConfig) => {
    subPageSlide.setValue(isRTL ? -widthRef.current : widthRef.current)
    setSubPage(config)
    Animated.timing(subPageSlide, { toValue: 0, duration: 280, useNativeDriver: true }).start()
  }

  const closeSubPage = () => {
    const w = widthRef.current
    Animated.timing(subPageSlide, { toValue: isRTL ? -w : w, duration: 240, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setSubPage(null) })
  }

  const handleSelectOption = (value: string) => {
    subPage?.onSelect(value)
    closeSubPage()
  }

  // Android hardware back while sub-page is open closes it instead of
  // navigating away to the home pane. Placed here (after closeSubPage) so
  // TypeScript doesn't flag a use-before-declaration.
  useEffect(() => {
    if (!subPage) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSubPage()
      return true
    })
    return () => sub.remove()
  // closeSubPage is stable within a render cycle; subPage drives the guard
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!subPage])

  // Single animation entry point — used both by tab taps and by swipe release.
  // Spring with an initial velocity carries the finger's momentum forward
  // without the "stop, then re-start" feel that timing() produces. Velocity
  // is in px/s (gestureState.vx is px/ms, so callers multiply by 1000).
  const animateToIndex = (index: number, velocity = 0) => {
    const w = widthRef.current
    const tbw = tabBarWidthRef.current
    if (!w || !tbw) return
    const tabW = (tbw - TAB_BAR_PAD * 2) / TABS.length
    const translateTarget = (isRTL ? 1 : -1) * index * w
    const indicatorTarget = (isRTL ? -1 : 1) * index * tabW
    // Content spring — initial velocity is the gesture velocity (LTR:
    // negative dx = forward = translate moves negative, vx mirrors sign).
    Animated.spring(translate, {
      toValue: translateTarget,
      velocity,
      tension: 68,
      friction: 14,
      useNativeDriver: true,
    }).start()
    // Indicator spring — mirror relationship: indicator = -translate * tabW/w,
    // so its velocity is the negated, scaled content velocity.
    Animated.spring(indicator, {
      toValue: indicatorTarget,
      velocity: -velocity * (tabW / w),
      tension: 68,
      friction: 14,
      useNativeDriver: true,
    }).start()
  }

  // Snap to the active tab when layout dimensions change (initial mount,
  // orientation change). No animation — layout shifts should be instant.
  useEffect(() => {
    if (!width || !tabBarWidth) return
    const index = TABS.indexOf(activeTab)
    const tabW = (tabBarWidth - TAB_BAR_PAD * 2) / TABS.length
    translate.setValue((isRTL ? 1 : -1) * index * width)
    indicator.setValue((isRTL ? -1 : 1) * index * tabW)
    // activeTab intentionally NOT in deps — changes to activeTab go through
    // animateToIndex, not this instant-snap path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, tabBarWidth])

  const changeTab = (tab: Tab) => {
    if (tab === activeTab) return
    tap()
    Keyboard.dismiss()
    setActiveTab(tab)
    animateToIndex(TABS.indexOf(tab))
  }

  // Swipe-to-change-tab — dragging horizontally moves both the content strip
  // and the tab indicator together under the finger, then springs to the
  // nearest tab on release (distance past 30% of the screen OR a flick faster
  // than 0.4 px/ms advances). The release spring inherits the gesture's
  // velocity so the motion is one continuous gesture.
  // Swipe-to-change-tab using gesture-handler. activeOffsetX/failOffsetY let
  // the inner ScrollView own vertical drags unambiguously while horizontal
  // intent (>=10px) claims us declaratively. We narrow activeOffsetX to the
  // directions where a neighbor tab actually exists: at the first tab a
  // backward swipe surrenders to the outer shell pan (which slides back to
  // the home pane), and at the last tab a forward swipe is refused entirely
  // so there's no claim+clamp elastic feel against a non-existent neighbor.
  const tabIdx = TABS.indexOf(activeTab)
  const canGoBack = tabIdx > 0
  const canGoFwd  = tabIdx < TABS.length - 1
  const activeOffsetX: [number, number] = isRTL
    ? [canGoBack ? -10 : -99999, canGoFwd ? 10 : 99999]
    : [canGoFwd ? -10 : -99999, canGoBack ? 10 : 99999]
  const tabPan = useMemo(() =>
    Gesture.Pan()
      .enabled(!photoEditActive && !sliding && !previewOpen && !subPage)
      .activeOffsetX(activeOffsetX)
      .failOffsetY([-20, 20])
      .onUpdate(e => {
        if (slidingActiveRef.current) return
        const w = widthRef.current
        const tbw = tabBarWidthRef.current
        if (!w || !tbw) return
        const tabW = (tbw - TAB_BAR_PAD * 2) / TABS.length
        const index = TABS.indexOf(activeTabRef.current)
        const base = (isRTL ? 1 : -1) * index * w
        const edge = (isRTL ? 1 : -1) * (TABS.length - 1) * w
        const [lo, hi] = isRTL ? [0, edge] : [edge, 0]
        const next = Math.max(lo, Math.min(hi, base + e.translationX))
        translate.setValue(next)
        indicator.setValue(-next * (tabW / w))
      })
      .onEnd(e => {
        const w = widthRef.current
        if (!w) return
        const index = TABS.indexOf(activeTabRef.current)
        const forward = isRTL ? e.translationX > 0 : e.translationX < 0
        const vx = e.velocityX / 1000
        const flick = Math.abs(vx) > 0.4
        const past = Math.abs(e.translationX) > w * 0.3
        let delta = 0
        if ((past || flick) && forward && index < TABS.length - 1) delta = 1
        else if ((past || flick) && !forward && index > 0) delta = -1
        const targetIndex = index + delta
        animateToIndex(targetIndex, e.velocityX)
        const targetTab = TABS[targetIndex]
        if (targetTab !== activeTabRef.current) {
          tap()
          setActiveTab(targetTab)
        }
      })
      .runOnJS(true)
  , [activeOffsetX[0], activeOffsetX[1], photoEditActive, sliding, previewOpen, !!subPage])

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.header} onLayout={e => setHeaderH(e.nativeEvent.layout.height)}>
        <IconPressable
          style={styles.backBtn}
          onPress={() => { tap(); onBack ? onBack() : router.back() }}
        >
          <BackIcon />
        </IconPressable>
        <View
          style={styles.tabBar}
          onLayout={e => setTabBarWidth(e.nativeEvent.layout.width)}
        >
        {/* Sliding pill behind the active label. Sits below the Pressables
            in render order so touches still hit the buttons. */}
        {tabBarWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: TAB_BAR_PAD,
              bottom: TAB_BAR_PAD,
              start: TAB_BAR_PAD,
              width: (tabBarWidth - TAB_BAR_PAD * 2) / TABS.length,
              borderRadius: 10,
              backgroundColor: '#111',
              transform: [{ translateX: indicator }],
            }}
          />
        )}
        {TABS.map((tab, i) => {
          const tabW = tabBarWidth > 0 ? (tabBarWidth - TAB_BAR_PAD * 2) / TABS.length : 0
          const center = (isRTL ? -1 : 1) * i * tabW
          // White opacity peaks when the pill is centered on this tab and
          // falls to zero at the neighboring tabs — fades track pill motion.
          const whiteOpacity: Animated.AnimatedInterpolation<number> | number =
            tabW > 0
              ? indicator.interpolate({
                  inputRange: [center - tabW, center, center + tabW],
                  outputRange: [0, 1, 0],
                  extrapolate: 'clamp',
                })
              : (activeTab === tab ? 1 : 0)
          return (
            <IconPressable
              key={tab}
              style={styles.tabItem}
              onPress={() => changeTab(tab)}
            >
              <TabIconStack opacity={whiteOpacity} tab={tab} />
            </IconPressable>
          )
        })}
        </View>
      </View>

      <GestureDetector gesture={tabPan}>
      <View
        style={{ flex: 1, overflow: 'hidden' }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View style={{ flex: 1, transform: [{ translateX: translate }] }}>
          {TABS.map((tab, i) => (
            <View
              key={tab}
              // Inactive tabs must not steal touches or keyboard focus
              pointerEvents={activeTab === tab ? 'auto' : 'none'}
              style={{
                position: 'absolute',
                top: 0, bottom: 0,
                // `start` is RTL-aware: maps to left in LTR, right in RTL.
                // Combined with the translateX sign flip above, child i lands
                // on-screen when activeTab === TABS[i] in both directions.
                start: i * width,
                width,
              }}
            >
              {renderTab(tab, onBack, focused && activeTab === tab, setPhotoEditActive, previewOpen, () => setPreviewOpen(o => !o), setPreviewData, openSubPage)}
            </View>
          ))}
        </Animated.View>
      </View>
      </GestureDetector>

      {previewMounted && previewData && (
        <Animated.View
          style={[
            styles.previewOverlay,
            {
              top: insets.top + headerH + 24 + 42 + 28,
              bottom: Math.max(insets.bottom, 8) + 8,
              transform: [{ translateY: previewSlide }],
            },
          ]}
        >
          <MatchCard match={previewData} userIsMale={previewData.is_male ?? null} bottomInset={0} />
        </Animated.View>
      )}

      {/* ── Sub-page overlay ─────────────────────────────────────────────── */}
      {/* Slides in over everything (header included) when a SelectFieldRow  */}
      {/* is tapped. Slides back out when the user picks an option or taps   */}
      {/* the back button.                                                    */}
      {subPage && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.subPageRoot, { transform: [{ translateX: subPageSlide }] }]}
        >
          {/* Header — same layout as the main settings header */}
          <View style={styles.header}>
            <IconPressable style={styles.backBtn} onPress={closeSubPage}>
              <BackIcon />
            </IconPressable>
            <Text style={styles.subPageHeaderTitle}>{subPage.title}</Text>
          </View>

          {/* Options list */}
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.subPageOptionsCard}>
              {subPage.options.map((opt, i) => (
                <View key={opt.value}>
                  {i > 0 && <View style={styles.optionDivider} />}
                  <View
                    style={styles.subPageOptionRow}
                    onStartShouldSetResponder={() => true}
                    onResponderRelease={() => { tap(); handleSelectOption(opt.value) }}
                  >
                    <Text style={styles.subPageOptionLabel}>{opt.label}</Text>
                    {opt.value === subPage.value && (
                      <Text style={styles.subPageCheckmark}>✓</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
            {subPage.description ? (
              <Text style={styles.subPageDesc}>{subPage.description}</Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef0f3' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, height: 56,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flex: 1, flexDirection: 'row', marginStart: 12,
    backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 12, padding: 3,
  },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },

  tabScroll: { flex: 1 },
  tabContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },

  section: { marginBottom: 28 },
  // Photo section sits above the jiggle-mode overlay — zIndex stacks it
  // over the dim layer so thumbnails stay bright and interactive while the
  // rest of the page dims behind them. elevation mirrors that on Android.
  photoSection: { zIndex: 2, elevation: 2 },
  photoEditOverlay: {
    position: 'absolute',
    start: -40, end: -40, top: -2000, bottom: -2000,
    backgroundColor: 'rgba(0,0,0,0.22)',
    zIndex: 1, elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabelRow: { flexDirection: 'row', marginBottom: 0 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(0,0,0,0.4)', letterSpacing: 1 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 10 },
  photoSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editDoneBtn: { fontSize: 13, fontWeight: '600', color: '#111', letterSpacing: 0.3 },
  sectionValue: { fontSize: 15, fontWeight: '700', color: '#111' },
  divider: { height: 0 },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { width: '100%', height: 40 },
  sliderEndLabel: { fontSize: 12, color: 'rgba(0,0,0,0.35)', minWidth: 22, textAlign: 'center' },

  genderRow: { flexDirection: 'row', gap: 10, marginTop: 14 },

  previewBtn: { backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  previewBtnText: { fontSize: 15, fontWeight: '600', color: '#111' },

  previewOverlay: {
    position: 'absolute',
    start: 16,
    end: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
  },

  textInputWrap: { marginTop: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 14, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 4, backgroundColor: '#fff' },
  textInput: { fontSize: 15, color: '#111' },
  // charCount sits alone on a single line, aligned to the trailing edge via flexbox container
  charCount: { fontSize: 12, color: 'rgba(0,0,0,0.3)', alignSelf: 'flex-end', marginTop: 4 },

  // Account tab
  infoCard: {
    marginTop: 12, borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: 15, color: 'rgba(0,0,0,0.5)' },
  infoValue: {
    fontSize: 15, fontWeight: '600', color: '#111',
    flexShrink: 1, marginStart: 16,
  },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 14,
    paddingVertical: 14, marginTop: 10,
  },
  actionBtnDestructive: { borderWidth: 0 },
  actionBtnDestructiveSolid: { backgroundColor: '#374151', borderColor: '#374151' },
  actionBtnDestructiveSolidPressed: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
  actionBtnText: { fontSize: 15, fontWeight: '500', color: '#111' },
  actionBtnTextDestructive: { color: '#4b5563' },
  actionBtnTextOnSolid: { color: '#fff' },

  // Select field row — tappable row with label + value + forward chevron
  selectRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, marginTop: 14,
  },
  selectRowLabel: { fontSize: 15, color: '#111' },
  selectRowTrailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectRowValue: { fontSize: 15, color: 'rgba(0,0,0,0.45)' },

  // Sub-page overlay panel
  subPageRoot: { backgroundColor: '#eef0f3' },
  subPageHeaderTitle: {
    flex: 1, fontSize: 17, fontWeight: '600', color: '#111',
    textAlign: 'center',
    // balance the back-button width so the title is visually centred
    marginEnd: 36,
  },
  subPageOptionsCard: {
    marginHorizontal: 20, marginTop: 24,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  subPageOptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  subPageOptionLabel: { fontSize: 17, color: '#111' },
  subPageCheckmark: { fontSize: 17, color: '#e11d48', fontWeight: '600' },
  optionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)',
    marginStart: 16,
  },
  subPageDesc: {
    marginHorizontal: 20, marginTop: 16,
    fontSize: 13, color: 'rgba(0,0,0,0.45)',
    textAlign: 'center', lineHeight: 19,
  },
})
