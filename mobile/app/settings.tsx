import { useState, useEffect, useMemo, useRef } from 'react'
import {
  View, Pressable, StyleSheet, ScrollView, Image,
  PanResponder, I18nManager,
  Keyboard, Platform, Animated, Dimensions,
} from 'react-native'
import { Text, TextInput } from '../src/components/AppText'
import { Gesture, GestureDetector, TextInput as GHTextInput } from 'react-native-gesture-handler'
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
import { Button } from '../src/components/Button'
import { IconPressable } from '../src/components/IconPressable'
import { MatchCard } from '../src/components/MatchCard'
import { PhotoEditor, PhotoEditorRef, localPhotoUriCache } from '../src/components/PhotoEditor'
import type { MatchData } from '../src/stores/userStore'
import { slidingActiveRef, useSlidingActive } from '../src/lib/gesture'
import { SINGLE, DOUBLE, BUTTON, DEFAULT_FAMILY } from '../src/fonts'
import { TEXT, WHITE, BLACK, PURPLE } from '../src/colors'

const isRTL = I18nManager.isRTL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const THUMB = 22
const TAP_SLOP = 10

// Returns responder props that fire `onPress` only on clean taps (movement < TAP_SLOP).
function useTapResponder(onPress: () => void) {
  const start = useRef({ x: 0, y: 0 })
  return {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (e: any) => { start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } },
    onResponderRelease: (e: any) => {
      const dx = Math.abs(e.nativeEvent.pageX - start.current.x)
      const dy = Math.abs(e.nativeEvent.pageY - start.current.y)
      if (dx < TAP_SLOP && dy < TAP_SLOP) { tap(); onPress() }
    },
  }
}

// ── Back Icon ──────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={DOUBLE} height={DOUBLE} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Svg>
  )
}

// ── Forward Chevron ────────────────────────────────────────────────────────
// Opposite of BackIcon — points in the "deeper navigation" direction.
// LTR: points right ›  |  RTL: points left ‹

function ForwardChevronIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </Svg>
  )
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
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
}

export type RadiusFieldConfig = {
  kind: 'radius'
  title: string
  stepCount: number
  value: number
  onChange: (v: number) => void
  formatStep: (i: number) => string
}

export type AdminFieldConfig = {
  kind: 'admin'
  title: string
  onReset: (state: 'VISIBLE' | 'HIDDEN') => Promise<void>
}

export type PhotoFieldConfig = {
  kind: 'photos'
  title: string
}

export type SubPageConfig = SelectFieldConfig | AgeRangeFieldConfig | RadiusFieldConfig | AdminFieldConfig | PhotoFieldConfig

// ── Select Field Row ───────────────────────────────────────────────────────
// Tappable settings row: label on the start side, current value + forward
// chevron on the end side. Tapping opens the sub-page via onPress.

function SelectFieldRow({
  displayValue,
  onPress,
}: {
  displayValue: string
  onPress: () => void
}) {
  const tapProps = useTapResponder(onPress)
  return (
    <View style={styles.selectRow} {...tapProps}>
      <Text style={styles.selectRowValue}>{displayValue}</Text>
      <ForwardChevronIcon />
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
  trackFill: { position: 'absolute', height: 3, backgroundColor: TEXT, borderRadius: 2 },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: TEXT,
    shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 4,
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

// ── Vertical Range Slider ──────────────────────────────────────────────────
// Same logic as RangeSlider but oriented vertically. High values are at the
// top of the track; low values at the bottom. PanResponder uses `dy` instead
// of `dx`, and position math inverts the y-axis so dragging up increases the
// value.

const VTHUMB = 28

interface VerticalRangeSliderProps {
  min: number; max: number
  valueMin: number; valueMax: number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
}

function VerticalRangeSlider({ min, max, valueMin, valueMax, onChangeMin, onChangeMax }: VerticalRangeSliderProps) {
  const s = useRef({ trackHeight: 0, min, max, valueMin, valueMax, startPosMin: 0, startPosMax: 0, startedStackedMin: false, startedStackedMax: false })
  const cbs = useRef({ onChangeMin, onChangeMax })

  useEffect(() => { s.current.min = min }, [min])
  useEffect(() => { s.current.max = max }, [max])
  useEffect(() => { s.current.valueMin = valueMin }, [valueMin])
  useEffect(() => { s.current.valueMax = valueMax }, [valueMax])
  useEffect(() => { cbs.current = { onChangeMin, onChangeMax } }, [onChangeMin, onChangeMax])

  // y=0 is top of track (high value), y=trackHeight is bottom (low value)
  const toPosY = (v: number) => {
    const { trackHeight, min, max } = s.current
    if (!trackHeight) return 0
    return (1 - (v - min) / (max - min)) * trackHeight
  }
  const toVal = (posY: number) => {
    const { min, max, trackHeight } = s.current
    if (!trackHeight) return min
    return Math.round(min + (1 - Math.max(0, Math.min(posY, trackHeight)) / trackHeight) * (max - min))
  }

  const minPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      slidingActiveRef.current = true
      s.current.startPosMin = toPosY(s.current.valueMin)
      s.current.startedStackedMin = s.current.valueMin === s.current.valueMax
    },
    onPanResponderMove: (_, { dy }) => {
      const v = toVal(s.current.startPosMin + dy)
      if (s.current.startedStackedMin && dy < 0) {
        // Started stacked and dragging up → move max instead
        if (v !== s.current.valueMax && v >= s.current.valueMin)
          cbs.current.onChangeMax(v)
      } else {
        if (v !== s.current.valueMin && v <= s.current.valueMax)
          cbs.current.onChangeMin(v)
      }
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
      s.current.startPosMax = toPosY(s.current.valueMax)
      s.current.startedStackedMax = s.current.valueMin === s.current.valueMax
    },
    onPanResponderMove: (_, { dy }) => {
      const v = toVal(s.current.startPosMax + dy)
      if (s.current.startedStackedMax && dy > 0) {
        // Started stacked and dragging down → move min instead
        if (v !== s.current.valueMin && v <= s.current.valueMax)
          cbs.current.onChangeMin(v)
      } else {
        if (v !== s.current.valueMax && v >= s.current.valueMin)
          cbs.current.onChangeMax(v)
      }
    },
    onPanResponderRelease: () => { slidingActiveRef.current = false },
    onPanResponderTerminate: () => { slidingActiveRef.current = false },
  })).current

  const minPct = (valueMin - min) / (max - min)
  const maxPct = (valueMax - min) / (max - min)

  return (
    <View style={vrs.container}>
      <View
        style={vrs.track}
        onLayout={e => { s.current.trackHeight = e.nativeEvent.layout.height }}
      >
        <View style={vrs.trackBg} />
        <View style={[vrs.trackFill, { top: `${(1 - maxPct) * 100}%`, bottom: `${minPct * 100}%` }]} />
        {/* Max thumb — near top */}
        <View
          style={[vrs.thumb, { top: `${(1 - maxPct) * 100}%`, transform: [{ translateY: -VTHUMB / 2 }] }]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...maxPan.panHandlers}
        />
        {/* Min thumb — near bottom */}
        <View
          style={[vrs.thumb, { top: `${(1 - minPct) * 100}%`, transform: [{ translateY: -VTHUMB / 2 }] }]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...minPan.panHandlers}
        />
      </View>
    </View>
  )
}

// ── Vertical Radius Slider ─────────────────────────────────────────────────

function VerticalRadiusSlider({ stepCount, value, onChange }: RadiusSliderProps) {
  const s = useRef({ trackHeight: 0, startPos: 0, value, stepCount })
  s.current.value = value
  s.current.stepCount = stepCount
  const cbs = useRef({ onChange })
  useEffect(() => { cbs.current = { onChange } }, [onChange])

  const toPosY = (v: number) => {
    const { trackHeight, stepCount: sc } = s.current
    if (sc <= 1 || !trackHeight) return trackHeight
    return (1 - v / (sc - 1)) * trackHeight
  }
  const toVal = (posY: number) => {
    const { trackHeight, stepCount: sc } = s.current
    if (sc <= 1 || !trackHeight) return 0
    const frac = 1 - Math.max(0, Math.min(posY, trackHeight)) / trackHeight
    return Math.round(frac * (sc - 1))
  }

  const thumbPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      slidingActiveRef.current = true
      s.current.startPos = toPosY(s.current.value)
    },
    onPanResponderMove: (_, { dy }) => {
      const v = toVal(s.current.startPos + dy)
      if (v !== s.current.value) cbs.current.onChange(v)
    },
    onPanResponderRelease: () => { slidingActiveRef.current = false },
    onPanResponderTerminate: () => { slidingActiveRef.current = false },
  })).current

  const pct = stepCount <= 1 ? 0 : value / (stepCount - 1)

  return (
    <View style={vrs.container}>
      <View
        style={vrs.track}
        onLayout={e => { s.current.trackHeight = e.nativeEvent.layout.height }}
      >
        <View style={vrs.trackBg} />
        <View style={[vrs.trackFill, { bottom: 0, top: `${(1 - pct) * 100}%` }]} />
        <View
          style={[vrs.thumb, { top: `${(1 - pct) * 100}%`, transform: [{ translateY: -VTHUMB / 2 }] }]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...thumbPan.panHandlers}
        />
      </View>
    </View>
  )
}

const vrs = StyleSheet.create({
  container: { width: VTHUMB + 16, flex: 1, alignItems: 'center', paddingVertical: VTHUMB / 2 },
  track: { width: VTHUMB, flex: 1, alignItems: 'center' },
  trackBg: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 2 },
  trackFill: { position: 'absolute', width: 3, backgroundColor: TEXT, borderRadius: 2 },
  thumb: {
    position: 'absolute', width: VTHUMB, height: VTHUMB, borderRadius: VTHUMB / 2, backgroundColor: TEXT,
    shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 4,
  },
})

// ── Radius helpers ─────────────────────────────────────────────────────────

const RADIUS_STEPS = [0, 0.5, 1, 2, 5, 10, 20, 50, 70, 100, Infinity]

function snapRadius(km: number): number {
  return RADIUS_STEPS.reduce((prev, curr) =>
    Math.abs(curr - km) < Math.abs(prev - km) ? curr : prev
  )
}

function formatRadius(km: number): string {
  if (km === 0) return t('settings.rangeHere')
  if (km === Infinity) return t('settings.rangeUnlimited')
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
    const field = Object.keys(data)[0]
    timer.current = setTimeout(() => { invoke(`app/${field}`, data).catch(console.error) }, delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [key, ready])
}

// Saves a partial data object via app/data whenever the value changes.
// Server uses lodash.merge so only the provided fields are touched.
// A stabilization window after mount absorbs the initial realtime echoes
// that arrive after navigation (e.g. onboarding → home) so they don't
// trigger a redundant save-back to the server.
const DATA_SAVE_STABILIZE_MS = 2000
function useDataSave(data: Record<string, unknown>, ready: boolean, delay = 600) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stableRef = useRef(false)
  const latestKeyRef = useRef<string | null>(null)
  const key = JSON.stringify(data)

  // Stabilization: ignore all changes for a short window after first ready.
  useEffect(() => {
    if (!ready || stableRef.current) return
    latestKeyRef.current = key
    const id = setTimeout(() => {
      // Capture whatever value settled during the window as baseline.
      latestKeyRef.current = JSON.stringify(data)
      stableRef.current = true
    }, DATA_SAVE_STABILIZE_MS)
    return () => clearTimeout(id)
  }, [ready ? 1 : 0, key])

  useEffect(() => {
    if (!ready || !stableRef.current) return
    if (key === latestKeyRef.current) return
    latestKeyRef.current = key
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const field = Object.keys(data)[0]
      invoke(`app/${field}`, data).catch(console.error)
    }, delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [key, ready ? 1 : 0])
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

export type Tab = 'preferences' | 'profile' | 'account' | 'app' | 'preview'
const TABS: Tab[] = ['preferences', 'profile', 'account', 'app', 'preview']

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
  if (tab === 'preview') {
    // Eye
    return (
      <Svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <Circle cx={12} cy={12} r={3} />
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
  const startRef = useRef({ x: 0, y: 0 })

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
        onResponderGrant={e => { startRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
        onResponderRelease={e => {
          const dx = Math.abs(e.nativeEvent.pageX - startRef.current.x)
          const dy = Math.abs(e.nativeEvent.pageY - startRef.current.y)
          if (dx < TAP_SLOP && dy < TAP_SLOP) handlePress()
        }}
      >
        <View style={{ borderRadius: SINGLE, overflow: 'hidden' }}>
          {/* Inactive layer — always rendered underneath */}
          <View style={{ backgroundColor: 'rgba(0,0,0,0.06)', paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(0,0,0,0.5)' }}>{label}</Text>
          </View>
          {/* Active layer — fades over the top */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, start: 0, end: 0, bottom: 0,
              backgroundColor: TEXT, alignItems: 'center', justifyContent: 'center',
              opacity: activeOpacity,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: WHITE }}>{label}</Text>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  )
}

// ── Preferences Tab ────────────────────────────────────────────────────────

function PreferencesTab({ onOpenSubPage }: { onOpenSubPage?: (config: SubPageConfig) => void }) {
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
    const field = Object.keys(body)[0]
    invoke(`app/${field}`, body).catch(console.error)
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
  const genderPref = forMale && forFemale ? 'B' : forMale ? 'M' : 'F'
  const genderOptions: SelectOption[] = [
    { value: 'M', label: t('settings.genderM') },
    { value: 'F', label: t('settings.genderF') },
    { value: 'B', label: t('settings.genderB') },
  ]
  const genderDisplayValue = genderOptions.find(o => o.value === genderPref)?.label ?? t('settings.genderM')

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">

      {/* Age Range */}
      <View style={styles.section}>
        <SectionLabel>{t('settings.ageRange').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={`${ageMin} – ${ageMax}`}
          onPress={() => onOpenSubPage?.({
            kind: 'ageRange',
            title: t('settings.ageRange'),
            ageMin, ageMax,
            sliderMin: ageSliderMin, sliderMax: ageSliderMax,
            onChangeMin: v => { update({ age_from: v }); queuePref({ age_from: v }) },
            onChangeMax: v => { update({ age_to: v }); queuePref({ age_to: v }) },
          })}
        />
      </View>

      {/* Search Radius */}
      <View style={styles.section}>
        <SectionLabel>{t('settings.range').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={formatRadius(radius)}
          onPress={() => onOpenSubPage?.({
            kind: 'radius',
            title: t('settings.range'),
            stepCount: RADIUS_STEPS.length,
            value: Math.max(0, RADIUS_STEPS.indexOf(radius)),
            onChange: i => {
              const r = radiusToServer(RADIUS_STEPS[i])
              update({ range: r })
              queuePref({ range: r })
            },
            formatStep: i => formatRadius(RADIUS_STEPS[i]),
          })}
        />
      </View>

      {/* Preferred Gender */}
      <View style={styles.section}>
        <SectionLabel>{t('settings.preferredGender').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={genderDisplayValue}
          onPress={() => onOpenSubPage?.({
            kind: 'select',
            title: t('settings.preferredGender'),
            options: genderOptions,
            value: genderPref,
            onSelect: async (v) => {
              update({ is_for_male: v === 'M' || v === 'B', is_for_female: v === 'F' || v === 'B' })
              await invoke('app/preferred_gender', { is_for_male: v === 'M' || v === 'B', is_for_female: v === 'F' || v === 'B', preferred_gender: v })
            },
          })}
        />
      </View>

    </ScrollView>
  )
}

// ── Photo Field Row ───────────────────────────────────────────────────────
// Thumbnail strip inside a tappable field row — same height as SelectFieldRow.
// Shows up to 6 small round thumbnails + a forward chevron.

function PhotoFieldRow({ photos, userId, onPress }: { photos: string[]; userId: string; onPress: () => void }) {
  const tapProps = useTapResponder(onPress)
  const slots = Array.from({ length: 6 }, (_, i) => photos[i] ?? null)
  return (
    <View style={styles.selectRow} {...tapProps}>
      <View style={styles.photoThumbStrip}>
        {slots.map((f, i) => f ? (
          <Image
            key={`${i}-${f}`}
            source={{ uri: localPhotoUriCache.get(f) ?? `${SUPABASE_URL}/storage/v1/object/public/users/${userId}/normal/${f}` }}
            style={styles.photoThumb}
          />
        ) : (
          <View key={`empty-${i}`} style={styles.photoThumb} />
        ))}
      </View>
      <ForwardChevronIcon />
    </View>
  )
}

// ── Profile Tab ────────────────────────────────────────────────────────────

function ProfileTab({ focused = true, onOpenSubPage }: { focused?: boolean; onOpenSubPage?: (config: SubPageConfig) => void }) {
  const { profile, update } = useUserStore()
  const { user } = useAuthStore()
  // Bio is held locally while typing — flushed on blur / unmount to avoid per-keystroke server calls
  const [localBio, setLocalBio] = useState(profile?.bio ?? '')
  const localBioRef = useRef(localBio)
  const savedBioRef = useRef(profile?.bio ?? '')
  const scrollRef = useRef<ScrollView>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const messageSectionYRef = useRef(0)

  // Keep localBio in sync when profile loads or changes from elsewhere
  useEffect(() => {
    const serverBio = profile?.bio ?? ''
    savedBioRef.current = serverBio
    setLocalBio(serverBio)
  }, [profile?.bio])

  useEffect(() => { localBioRef.current = localBio }, [localBio])

  const flushBio = () => {
    const next = localBioRef.current.replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '')
    if (next !== localBioRef.current) { setLocalBio(next); localBioRef.current = next }
    if (next === savedBioRef.current) return
    if (next.length > 0 && next.length < 20) return
    savedBioRef.current = next
    update({ bio: next })
    const p = useUserStore.getState().profile
    if (!p) return
    invoke('app/bio', { bio: next }).catch(console.error)
  }

  useEffect(() => {
    return () => { flushBio() }
  }, [])

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height))
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])

  useAutoSave({ is_for_kids: profile?.is_for_kids ?? null }, !!profile)
  useDataSave({ images: profile?.images }, !!profile)

  if (!profile) return <View style={styles.tabContent} />

  const photos = profile.images?.normal ?? []
  const isForKids = profile.is_for_kids
  const kidsOptions: SelectOption[] = [
    { value: 'yes', label: t('settings.kidsYes') },
    { value: 'no',  label: t('settings.kidsNo')  },
    { value: 'na',  label: t('settings.kidsNa')  },
  ]
  const kidsValue = isForKids === true ? 'yes' : isForKids === false ? 'no' : 'na'
  const kidsDisplayValue = kidsOptions.find(o => o.value === kidsValue)?.label ?? t('settings.kidsNa')

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.tabScroll}
      contentContainerStyle={[styles.tabContent, { paddingBottom: 40 + keyboardHeight }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      delaysContentTouches={false}
    >

      <View style={[styles.section, { marginTop: 0 }]}>
        <SectionLabel>{t('settings.photo').toUpperCase()}</SectionLabel>
        <PhotoFieldRow
          photos={photos}
          userId={user!.id}
          onPress={() => onOpenSubPage?.({ kind: 'photos', title: t('settings.photo') })}
        />
      </View>

      <View
        style={styles.section}
        onLayout={(e) => { messageSectionYRef.current = e.nativeEvent.layout.y }}
      >
        <SectionLabel>{t('settings.aboutMe').toUpperCase()}</SectionLabel>
        <View style={styles.textInputWrap}>
          <GHTextInput
            style={[styles.textInput, { fontFamily: DEFAULT_FAMILY }]}
            value={localBio}
            onChangeText={(text) => {
              if (text.length > 150) text = text.slice(0, 150)
              setLocalBio(text)
            }}
            onFocus={() => {
              setTimeout(() => {
                scrollRef.current?.scrollTo({
                  y: Math.max(0, messageSectionYRef.current - 12),
                  animated: true,
                })
              }, 300)
            }}
            onBlur={flushBio}
            multiline
            scrollEnabled={false}
            maxLength={150}
            textAlign="center"
            textAlignVertical="top"
          />
          {localBio.length >= 20 && (
            <Text style={styles.charCount}>{150 - localBio.length}</Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>{tg('settings.kidsLabel', profile.is_male).toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={kidsDisplayValue}
          onPress={() => onOpenSubPage?.({
            kind: 'select',
            title: tg('settings.kidsLabel', profile.is_male),
            options: kidsOptions,
            value: kidsValue,
            onSelect: async (v) => {
              const val = v === 'yes' ? true : v === 'no' ? false : null
              update({ is_for_kids: val })
              await invoke('app/is_for_kids', { is_for_kids: val })
            },
          })}
        />
      </View>

    </ScrollView>
  )
}

// 3 columns × 2 rows (max 6 photos). Percentage width + space-between
// lets the gaps adapt to the actual pane width, which varies with safe-area
// insets on edge-to-edge Android, instead of relying on Dimensions at
// module-load time.
// ── Account Tab ────────────────────────────────────────────────────────────

function SignOutIcon({ color = TEXT }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  )
}

function TrashIcon({ color = TEXT }: { color?: string }) {
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
    { label: t('settings.name'),      value: profile.name ?? '—' },
    { label: t('settings.birthDate'), value: profile.birth_date ? `${formatBirthDate(profile.birth_date)} (${age})` : '—' },
    { label: t('settings.gender'),    value: gender },
    { label: t('settings.email'),     value: user.email ?? '—' },
  ]

  return (
    <>
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">
      {rows.map((r) => (
        <View key={r.label} style={styles.section}>
          <SectionLabel>{r.label.toUpperCase()}</SectionLabel>
          <View style={styles.selectRow} pointerEvents="none">
            <Text style={styles.selectRowLabel} numberOfLines={1}>{r.value}</Text>
          </View>
        </View>
      ))}

      <View style={styles.section}>
        <View style={styles.accountActionsCard}>
          <View
            style={styles.accountActionRow}
            {...useTapResponder(confirmSignOut)}
          >
            <SignOutIcon color="rgba(0,0,0,0.5)" />
            <Text style={styles.accountActionText}>{tg('settings.signOut', profile.is_male)}</Text>
          </View>
          <View style={styles.accountActionDivider} />
          <View
            style={styles.accountActionRow}
            {...useTapResponder(confirmDelete)}
          >
            <TrashIcon color="rgba(180,60,60,0.5)" />
            <Text style={[styles.accountActionText, styles.accountActionTextDestructive]}>{t('settings.deleteAccount')}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
    <ConfirmDialog
      visible={signOutDialog}
      title={t('settings.signOutConfirmTitle')}
      description={tg('settings.signOutConfirmDesc', profile.is_male)}
      cancelLabel={t('settings.signOutNo')}
      confirmLabel={tg('settings.signOutYes', profile.is_male)}
      confirmFlex={0.6}
      soft
      onCancel={() => setSignOutDialog(false)}
      onConfirm={onSignOutConfirmed}
    />
    <ConfirmDialog
      visible={deleteDialog}
      title={t('settings.deleteConfirmTitle')}
      description={tg('settings.deleteConfirmDesc', profile.is_male)}
      cancelLabel={t('settings.deleteNo')}
      confirmLabel={t('settings.deleteYes')}
      confirmFlex={0.6}
      destructive
      busy={deleting}
      onCancel={() => setDeleteDialog(false)}
      onConfirm={onDeleteConfirmed}
    />
    </>
  )
}

// ── App Tab ────────────────────────────────────────────────────────────────

function AppTab({ onBack, onOpenSubPage }: { onBack?: () => void; onOpenSubPage?: (config: SubPageConfig) => void }) {
  const router = useRouter()
  const { profile, update } = useUserStore()
  const [resetting, setResetting] = useState<null | 'VISIBLE' | 'HIDDEN'>(null)

  useDataSave({ units: profile?.units }, !!profile)

  if (!profile) return <View style={styles.tabContent} />

  const units = profile.units ?? 'metric'
  const unitsOptions: SelectOption[] = [
    { value: 'metric',   label: t('settings.unitsMetricDesc')   },
    { value: 'imperial', label: t('settings.unitsImperialDesc') },
  ]
  const unitsDisplayValue = unitsOptions.find(o => o.value === units)?.label ?? t('settings.unitsMetricDesc')

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
        <SectionLabel>{t('settings.unitsLabel').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={unitsDisplayValue}
          onPress={() => onOpenSubPage?.({
            kind: 'select',
            title: t('settings.unitsLabel'),
            options: unitsOptions,
            value: units,
            onSelect: async (v) => {
              update({ units: v })
              const p = useUserStore.getState().profile
              if (p) await invoke('app/units', { units: v })
            },
          })}
        />
      </View>

      {profile.role === 'ADMIN' && (
        <View style={styles.section}>
          <SectionLabel>{t('settings.adminTitle').toUpperCase()}</SectionLabel>
          <SelectFieldRow
            displayValue={t('settings.adminEntry')}
            onPress={() => onOpenSubPage?.({
              kind: 'admin',
              title: t('settings.adminTitle'),
              onReset: async (state) => { await onReset(state) },
            })}
          />
        </View>
      )}
    </ScrollView>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

function PreviewTab() {
  const { profile } = useUserStore()
  const previewData: MatchData | null = useMemo(() => {
    if (!profile) return null
    const imgs = profile.images?.normal ?? []
    return {
      user_id: profile.user_id,
      image: imgs[0] ?? '',
      images: imgs,
      title: profile.name ?? '—',
      bio: profile.bio ?? '',
      distance: 0,
      located_at: new Date().toISOString(),
      subscribed: false,
      is_for_kids: profile.is_for_kids ?? null,
      age: profile.birth_date ? calcAge(profile.birth_date) : undefined,
      is_male: profile.is_male,
      units: profile.units,
    }
  }, [profile])

  if (!previewData) return <View style={styles.tabContent} />
  return (
    <View style={styles.previewTabWrap}>
      <View style={styles.previewCard}>
        <MatchCard match={previewData} userIsMale={previewData.is_male ?? null} bottomInset={0} />
      </View>
    </View>
  )
}

function renderTab(tab: Tab, onBack: (() => void) | undefined, focused: boolean, onOpenSubPage?: (config: SubPageConfig) => void) {
  if (tab === 'preferences') return <PreferencesTab onOpenSubPage={onOpenSubPage} />
  if (tab === 'profile')     return <ProfileTab focused={focused} onOpenSubPage={onOpenSubPage} />
  if (tab === 'account')     return <AccountTab />
  if (tab === 'app')         return <AppTab onBack={onBack} onOpenSubPage={onOpenSubPage} />
  if (tab === 'preview')     return <PreviewTab />
  return <View style={styles.tabContent} />
}

// When embedded inside the home shell pager, the parent passes `onBack` so
// the back button animates the shell back to the home pane instead of
// popping the navigation stack. When rendered standalone via expo-router
// (e.g., direct /settings navigation), onBack is undefined and the back
// button falls back to router.back(). `focused` is true when the settings
// pane is the current pane in the home shell — tabs use it to tear down
// ephemeral UI state (e.g., photo jiggle) when the user swipes back home.
// ── Select Field Page ──────────────────────────────────────────────────────
// Full-screen pane used as pane 3 in the home shell pager. Mirrors the
// visual style of the settings screen (same background, header, card).

function OptionRow({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  const tapProps = useTapResponder(onPress)
  return <View style={styles.subPageOptionRow} {...tapProps}>{children}</View>
}

export function SelectFieldPage({
  config,
  onBack,
}: {
  config: SelectFieldConfig
  onBack: (afterSlide?: () => Promise<void> | void) => void
}) {
  const insets = useSafeAreaInsets()
  const handleSelect = (value: string) => {
    const p = Promise.resolve(config.onSelect(value))
    onBack(() => p)
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.subPageOptionsCard}>
          {config.options.map((opt, i) => (
            <View key={opt.value}>
              {i > 0 && <View style={styles.optionDivider} />}
              <OptionRow onPress={() => handleSelect(opt.value)}>
                <Text style={styles.subPageOptionLabel}>{opt.label}</Text>
                {opt.value === config.value && (
                  <Text style={styles.subPageCheckmark}>✓</Text>
                )}
              </OptionRow>
            </View>
          ))}
        </View>
        {config.description ? (
          <Text style={styles.subPageDesc}>{config.description}</Text>
        ) : null}
      </ScrollView>
    </View>
  )
}

// ── Age Range Field Page ───────────────────────────────────────────────────
// Full-screen pane with a vertical range slider for editing the age preference.

export function AgeRangeFieldPage({ config, onBack }: { config: AgeRangeFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const [ageMin, setAgeMin] = useState(config.ageMin)
  const [ageMax, setAgeMax] = useState(config.ageMax)

  const handleChangeMin = (v: number) => { setAgeMin(v); config.onChangeMin(v) }
  const handleChangeMax = (v: number) => { setAgeMax(v); config.onChangeMax(v) }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
      </View>
      <View style={spStyles.content}>
        <Text style={spStyles.displayValue}>{ageMin} – {ageMax}</Text>
        <View style={spStyles.sliderArea}>
          <Text style={spStyles.endLabel}>{config.sliderMax}</Text>
          <VerticalRangeSlider
            min={config.sliderMin} max={config.sliderMax}
            valueMin={ageMin} valueMax={ageMax}
            onChangeMin={handleChangeMin} onChangeMax={handleChangeMax}
          />
          <Text style={spStyles.endLabel}>{config.sliderMin}</Text>
        </View>
      </View>
    </View>
  )
}

// ── Radius Field Page ──────────────────────────────────────────────────────
// Full-screen pane with a vertical single-thumb slider for editing the search radius.

export function RadiusFieldPage({ config, onBack }: { config: RadiusFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const [value, setValue] = useState(config.value)

  const handleChange = (v: number) => { setValue(v); config.onChange(v) }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
      </View>
      <View style={spStyles.content}>
        <Text style={spStyles.displayValue}>{config.formatStep(value)}</Text>
        <View style={spStyles.sliderArea}>
          <Text style={spStyles.endLabel}>{config.formatStep(config.stepCount - 1)}</Text>
          <VerticalRadiusSlider
            stepCount={config.stepCount}
            value={value}
            onChange={handleChange}
          />
          <Text style={spStyles.endLabel}>{config.formatStep(0)}</Text>
        </View>
      </View>
    </View>
  )
}

// ── Admin Field Page ───────────────────────────────────────────────────────
// Full-screen pane with the reset-users controls.

export function AdminFieldPage({ config, onBack }: { config: AdminFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const [resetting, setResetting] = useState<null | 'VISIBLE' | 'HIDDEN'>(null)

  const handleReset = async (state: 'VISIBLE' | 'HIDDEN') => {
    if (resetting) return
    setResetting(state)
    try { await config.onReset(state) }
    finally { setResetting(null) }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <SectionLabel>{t('settings.adminLabel').toUpperCase()}</SectionLabel>
          <View style={[styles.genderRow, { marginTop: 14 }]}>
            <View style={{ flex: 1 }}>
              <Button
                label={t('settings.resetVisible')}
                onPress={() => handleReset('VISIBLE')}
                disabled={!!resetting}
                silentDisabled={resetting !== 'VISIBLE'}
                variant="secondary"
                size="md"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t('settings.resetHidden')}
                onPress={() => handleReset('HIDDEN')}
                disabled={!!resetting}
                silentDisabled={resetting !== 'HIDDEN'}
                variant="secondary"
                size="md"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

// ── Photo Field Page ──────────────────────────────────────────────────────
// Full-screen photo editor opened from the profile photo field row.

export function PhotoFieldPage({ config, onBack }: { config: PhotoFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const photoRef = useRef<PhotoEditorRef>(null)

  const handleBack = () => {
    photoRef.current?.flush().catch(console.error)
    onBack()
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <IconPressable style={styles.backBtn} onPress={handleBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SINGLE, paddingTop: 12, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        delaysContentTouches={false}
      >
        <Text style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', textAlign: 'center', marginBottom: 4 }}>{t('settings.photoHint')}</Text>
        <PhotoEditor ref={photoRef} deferUpload />
      </ScrollView>
    </View>
  )
}

const spStyles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 40,
  },
  displayValue: {
    fontSize: 40,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.5,
    marginBottom: 28,
  },
  sliderArea: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  endLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(0,0,0,0.35)',
  },
})

type SettingsPageProps = { onBack?: () => void; focused?: boolean; onOpenSubPage?: (config: SubPageConfig) => void; changeTabRef?: React.MutableRefObject<((tab: Tab) => void) | null>; onTabChange?: (index: number) => void }

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

export default function SettingsPage({ onBack, focused = true, onOpenSubPage, changeTabRef, onTabChange }: SettingsPageProps = {}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('preferences')
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

  // Single animation entry point — used both by tab taps and by swipe release.
  // Spring with an initial velocity carries the finger's momentum forward
  // without the "stop, then re-start" feel that timing() produces. Velocity
  // is in px/s (gestureState.vx is px/ms, so callers multiply by 1000).
  const animateToIndex = (index: number, velocity = 0) => {
    const w = widthRef.current
    const tbw = tabBarWidthRef.current
    if (!w || !tbw) return
    const tabW = tbw / TABS.length
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
    const tabW = tabBarWidth / TABS.length
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
    onTabChange?.(TABS.indexOf(tab))
    animateToIndex(TABS.indexOf(tab))
  }

  useEffect(() => {
    if (changeTabRef) changeTabRef.current = changeTab
    return () => { if (changeTabRef) changeTabRef.current = null }
  })

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
      .enabled(!sliding)
      .activeOffsetX(activeOffsetX)
      .failOffsetY([-20, 20])
      .onUpdate(e => {
        if (slidingActiveRef.current) return
        const w = widthRef.current
        const tbw = tabBarWidthRef.current
        if (!w || !tbw) return
        const tabW = tbw / TABS.length
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
          onTabChange?.(targetIndex)
        }
      })
      .runOnJS(true)
  , [activeOffsetX[0], activeOffsetX[1], sliding])

  return (
    <View style={styles.rootOuter}>
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.header}>
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
              top: 0,
              bottom: 0,
              start: 0,
              width: tabBarWidth / TABS.length,
              borderRadius: SINGLE,
              backgroundColor: 'rgba(0,0,0,0.5)',
              transform: [{ translateX: indicator }],
            }}
          />
        )}
        {TABS.map((tab, i) => {
          const tabW = tabBarWidth > 0 ? tabBarWidth / TABS.length : 0
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
              {renderTab(tab, onBack, focused && activeTab === tab, onOpenSubPage)}
            </View>
          ))}
        </Animated.View>
      </View>
      </GestureDetector>

    </SafeAreaView>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rootOuter: { flex: 1, backgroundColor: '#eef0f3' },
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, height: 56,
  },
  backBtn: { padding: BUTTON, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flex: 1, flexDirection: 'row', marginHorizontal: SINGLE,
    backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: SINGLE, padding: 0,
  },
  tabItem: { flex: 1, paddingVertical: SINGLE, alignItems: 'center', borderRadius: SINGLE },

  tabScroll: { flex: 1 },
  tabContent: { paddingHorizontal: SINGLE, paddingTop: 24, paddingBottom: 40 },

  section: { marginBottom: DOUBLE },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabelRow: { flexDirection: 'row', marginBottom: 0 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(0,0,0,0.5)', letterSpacing: 1 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: TEXT, marginBottom: 10 },
  sectionValue: { fontSize: 15, fontWeight: '700', color: TEXT },
  divider: { height: 0 },

  photoThumbStrip: { flexDirection: 'row', gap: SINGLE, flex: 1, marginEnd: DOUBLE },
  photoThumb: { flex: 1, aspectRatio: 1, borderRadius: SINGLE },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { width: '100%', height: 40 },
  sliderEndLabel: { fontSize: 12, color: 'rgba(0,0,0,0.35)', minWidth: 22, textAlign: 'center' },

  genderRow: { flexDirection: 'row', gap: 10, marginTop: SINGLE },

  previewTabWrap: {
    flex: 1,
    marginHorizontal: SINGLE, marginTop: SINGLE, marginBottom: 0,
  },
  previewCard: {
    flex: 1, borderRadius: SINGLE, overflow: 'hidden',
    backgroundColor: WHITE,
  },


  textInputWrap: { marginTop: SINGLE, borderRadius: SINGLE, paddingHorizontal: BUTTON, paddingTop: BUTTON, paddingBottom: BUTTON + SINGLE, backgroundColor: 'rgba(0,0,0,0.06)' },
  textInput: { fontSize: 16, color: TEXT, padding: 0, textAlign: 'center', minHeight: 56 },
  charCount: { position: 'absolute', end: 12, bottom: 8, fontSize: 12, color: 'rgba(0,0,0,0.35)' },

  // Account tab
  infoCard: {
    marginTop: SINGLE, borderRadius: SINGLE, overflow: 'hidden',
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
    fontSize: 15, fontWeight: '600', color: TEXT,
    flexShrink: 1, marginStart: 16,
  },

  accountActionsCard: {
    borderRadius: SINGLE, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  accountActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  accountActionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)',
    marginStart: 16,
  },
  accountActionText: { fontSize: 15, color: 'rgba(0,0,0,0.5)' },
  accountActionTextDestructive: { color: 'rgba(180,60,60,0.6)' },

  // Select field row — tappable row with label + value + forward chevron
  selectRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: SINGLE,
    paddingHorizontal: BUTTON, paddingVertical: BUTTON, marginTop: SINGLE,
  },
  selectRowLabel: { fontSize: 15, color: TEXT },
  selectRowTrailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectRowValue: { fontSize: 15, color: 'rgba(0,0,0,0.5)' },

  // Sub-page overlay panel
  subPageRoot: { backgroundColor: '#eef0f3' },
  subPageHeaderTitle: {
    flex: 1, fontSize: 17, fontWeight: '600', color: TEXT,
    textAlign: 'center',
    // balance the back-button width so the title is visually centred
    marginEnd: 36,
  },
  subPageOptionsCard: {
    marginHorizontal: SINGLE, marginTop: DOUBLE,
    borderRadius: SINGLE, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  subPageOptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: BUTTON, paddingVertical: DOUBLE,
  },
  subPageOptionLabel: { fontSize: 17, color: TEXT },
  subPageCheckmark: { fontSize: 17, color: PURPLE, fontWeight: '600' },
  optionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)',
    marginStart: 16,
  },
  subPageDesc: {
    marginHorizontal: SINGLE, marginTop: 16,
    fontSize: 13, color: 'rgba(0,0,0,0.5)',
    textAlign: 'center', lineHeight: 19,
  },
})
