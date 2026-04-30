import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import {
  View, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator,
  PanResponder, I18nManager, Easing,
  Keyboard, Platform, Animated as RNAnimated, Dimensions,
} from 'react-native'
import Animated, { SharedValue, useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing as REasing } from 'react-native-reanimated'
import { Text, TextInput } from '../src/components/AppText'
import { TextInput as GHTextInput } from 'react-native-gesture-handler'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Path, Line, Polyline, Circle, Rect } from 'react-native-svg'
import { invoke } from '../src/lib/api'
import { tap, tapWarning } from '../src/lib/haptics'
import { useUserStore } from '../src/stores/userStore'
import { useAuthStore } from '../src/stores/authStore'
import { t, tg } from '../src/i18n'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { Button } from '../src/components/Button'
import { IconPressable } from '../src/components/IconPressable'
import { MatchCard } from '../src/components/MatchCard'
import { OnceLogo } from '../src/components/OnceLogo'
import { WhatsSpecialPage } from './login'
import { PhotoEditor, PhotoEditorRef, localPhotoUriCache, pendingDeferred } from '../src/components/PhotoEditor'
import type { Profile } from '../src/stores/userStore'
import { slidingActiveRef, useSlidingActive } from '../src/lib/gesture'
import { SINGLE, DOUBLE, BUTTON, DEFAULT_FAMILY } from '../src/fonts'
import { TEXT_PRIMARY, WHITE, BLACK, PRIMARY, PRIMARY_BG, GRAY_50, GRAY_100, GRAY_400 } from '../src/colors'

const WARM_WHITE = '#FFFDFB'

const isRTL = I18nManager.isRTL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const THUMB = 22
const TAP_SLOP = 10

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
// in a GRAY_50 background) without losing the raw-responder behaviour that's
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

// ── Back Icon ──────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={TEXT_PRIMARY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </Svg>
  )
}

// ── Forward Chevron ────────────────────────────────────────────────────────
// Opposite of BackIcon — points in the "deeper navigation" direction.
// LTR: points right ›  |  RTL: points left ‹

function ForwardChevronIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={GRAY_400} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Svg>
  )
}

// ── Field Icons ────────────────────────────────────────────────────────────

const FIELD_ICON_STROKE = GRAY_400

function SlidersIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={FIELD_ICON_STROKE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="4" y1="21" x2="4" y2="14" />
      <Line x1="4" y1="10" x2="4" y2="3" />
      <Line x1="12" y1="21" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12" y2="3" />
      <Line x1="20" y1="21" x2="20" y2="16" />
      <Line x1="20" y1="12" x2="20" y2="3" />
      <Line x1="1" y1="14" x2="7" y2="14" />
      <Line x1="9" y1="8" x2="15" y2="8" />
      <Line x1="17" y1="16" x2="23" y2="16" />
    </Svg>
  )
}

function MapPinIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={FIELD_ICON_STROKE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx="12" cy="10" r="3" />
    </Svg>
  )
}

function GenderIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={FIELD_ICON_STROKE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="10" r="5" />
      <Line x1="16" y1="6" x2="20" y2="2" />
      <Polyline points="16 2 20 2 20 6" />
      <Line x1="12" y1="15" x2="12" y2="22" />
      <Line x1="9" y1="19" x2="15" y2="19" />
    </Svg>
  )
}

function BabyCarIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={FIELD_ICON_STROKE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h3l3 9h8l2-6H8" />
      <Circle cx={9} cy={19} r={1.5} />
      <Circle cx={17} cy={19} r={1.5} />
    </Svg>
  )
}

function RulerIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={FIELD_ICON_STROKE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
      <Path d="m14.5 12.5 2-2" />
      <Path d="m11.5 9.5 2-2" />
      <Path d="m8.5 6.5 2-2" />
      <Path d="m17.5 15.5 2-2" />
    </Svg>
  )
}

function PencilIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={FIELD_ICON_STROKE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
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

export type PhotoFieldConfig = {
  kind: 'photos'
  title: string
}

export type AccountFieldConfig = {
  kind: 'account'
  title: string
}

export type PreviewFieldConfig = {
  kind: 'preview'
  title: string
}

export type AboutFieldConfig = {
  kind: 'about'
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

export type SubPageConfig = SelectFieldConfig | AgeRangeFieldConfig | RadiusFieldConfig | AdminFieldConfig | PhotoFieldConfig | AccountFieldConfig | PreviewFieldConfig | AboutFieldConfig | ProfileSectionFieldConfig | AppSectionFieldConfig

// ── Select Field Row ───────────────────────────────────────────────────────
// Shared tappable settings row used across Preferences, Profile, App and the
// Main Menu. Layout (logical order, flips automatically in RTL):
//   [chevron] [label / title+subtitle] ... [value] [trailing icon | avatar]
// Variants:
//   - displayValue?      → orange right-aligned value (radius/age/gender/units/kids)
//   - subtitle?          → small secondary text under the label (profile row)
//   - avatar?            → image URI rendered as a circular avatar at the end
//   - tone='accent'      → soft PRIMARY_BG halo behind the trailing icon
// Press feedback fades in a GRAY_50 background; `grouped` rows inherit
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
          backgroundColor: GRAY_50,
          opacity: press,
          borderRadius: grouped ? 0 : 16,
        }]}
      />
      <ForwardChevronIcon />
      {label != null ? (
        <>
          <View style={styles.selectRowTextCol}>
            <Text style={styles.selectRowLabel} numberOfLines={1}>{label}</Text>
            {subtitle ? (
              <Text style={styles.selectRowSubtitle} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
          <View style={{ flex: 1 }} />
          {displayValue != null ? (
            <Text style={styles.selectRowValue} numberOfLines={1}>{displayValue}</Text>
          ) : null}
        </>
      ) : (
        <Text style={[styles.selectRowValue, { flex: 1 }]} numberOfLines={1}>{displayValue ?? ''}</Text>
      )}
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.selectRowAvatar} />
      ) : icon ? (
        tone === 'accent' ? (
          <View style={styles.selectRowAccentIcon}>{icon}</View>
        ) : (
          icon
        )
      ) : null}
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
  trackFill: { position: 'absolute', height: 3, backgroundColor: TEXT_PRIMARY, borderRadius: 2 },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: TEXT_PRIMARY,
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

const VTRACK = 4
const VGLOW = 44

function VerticalRangeSlider({ min, max, valueMin, valueMax, onChangeMin, onChangeMax }: VerticalRangeSliderProps) {
  const s = useRef({ trackHeight: 0, min, max, valueMin, valueMax, startPosMin: 0, startPosMax: 0, startedStackedMin: false, startedStackedMax: false, draggingMin: false, draggingMax: false })
  const cbs = useRef({ onChangeMin, onChangeMax })

  useEffect(() => { s.current.min = min }, [min])
  useEffect(() => { s.current.max = max }, [max])
  useEffect(() => { s.current.valueMin = valueMin }, [valueMin])
  useEffect(() => { s.current.valueMax = valueMax }, [valueMax])
  useEffect(() => { cbs.current = { onChangeMin, onChangeMax } }, [onChangeMin, onChangeMax])

  const trackHeightSv = useSharedValue(0)
  const minPctSv = useSharedValue(max > min ? (valueMin - min) / (max - min) : 0)
  const maxPctSv = useSharedValue(max > min ? (valueMax - min) / (max - min) : 1)
  const minDragSv = useSharedValue(0)
  const maxDragSv = useSharedValue(0)

  // Sync thumb position from prop only when the user is NOT dragging that thumb.
  // During drag, the gesture handler writes minPctSv/maxPctSv directly for smooth tracking.
  useEffect(() => {
    if (s.current.draggingMin) return
    if (max > min) minPctSv.value = withTiming((valueMin - min) / (max - min), { duration: 150 })
  }, [valueMin, min, max])
  useEffect(() => {
    if (s.current.draggingMax) return
    if (max > min) maxPctSv.value = withTiming((valueMax - min) / (max - min), { duration: 150 })
  }, [valueMax, min, max])

  // y=0 is top of track (high value), y=trackHeight is bottom (low value)
  const toPosY = (v: number) => {
    const { trackHeight, min, max } = s.current
    if (!trackHeight) return 0
    return (1 - (v - min) / (max - min)) * trackHeight
  }
  const rawPctFromPosY = (posY: number) => {
    const { trackHeight } = s.current
    if (!trackHeight) return 0
    return 1 - Math.max(0, Math.min(posY, trackHeight)) / trackHeight
  }
  const valFromPct = (pct: number) => {
    const { min, max } = s.current
    return Math.round(min + pct * (max - min))
  }

  const minPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      slidingActiveRef.current = true
      s.current.draggingMin = true
      s.current.startPosMin = toPosY(s.current.valueMin)
      s.current.startedStackedMin = s.current.valueMin === s.current.valueMax
      minDragSv.value = withTiming(1, { duration: 120 })
    },
    onPanResponderMove: (_, { dy }) => {
      const { min: mn, max: mx } = s.current
      if (mx <= mn) return
      const rawPct = rawPctFromPosY(s.current.startPosMin + dy)
      const v = valFromPct(rawPct)
      if (s.current.startedStackedMin && dy < 0) {
        // Started stacked and dragging up → move max instead
        const minPct = (s.current.valueMin - mn) / (mx - mn)
        maxPctSv.value = Math.max(minPct, rawPct)
        if (v !== s.current.valueMax && v >= s.current.valueMin)
          cbs.current.onChangeMax(v)
      } else {
        const maxPct = (s.current.valueMax - mn) / (mx - mn)
        minPctSv.value = Math.min(maxPct, rawPct)
        if (v !== s.current.valueMin && v <= s.current.valueMax)
          cbs.current.onChangeMin(v)
      }
    },
    onPanResponderRelease: () => {
      slidingActiveRef.current = false
      s.current.draggingMin = false
      minDragSv.value = withTiming(0, { duration: 150 })
      const { min: mn, max: mx } = s.current
      if (mx > mn) {
        minPctSv.value = withTiming((s.current.valueMin - mn) / (mx - mn), { duration: 100 })
        if (s.current.startedStackedMin)
          maxPctSv.value = withTiming((s.current.valueMax - mn) / (mx - mn), { duration: 100 })
      }
    },
    onPanResponderTerminate: () => {
      slidingActiveRef.current = false
      s.current.draggingMin = false
      minDragSv.value = withTiming(0, { duration: 150 })
      const { min: mn, max: mx } = s.current
      if (mx > mn) {
        minPctSv.value = withTiming((s.current.valueMin - mn) / (mx - mn), { duration: 100 })
        if (s.current.startedStackedMin)
          maxPctSv.value = withTiming((s.current.valueMax - mn) / (mx - mn), { duration: 100 })
      }
    },
  })).current

  const maxPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      slidingActiveRef.current = true
      s.current.draggingMax = true
      s.current.startPosMax = toPosY(s.current.valueMax)
      s.current.startedStackedMax = s.current.valueMin === s.current.valueMax
      maxDragSv.value = withTiming(1, { duration: 120 })
    },
    onPanResponderMove: (_, { dy }) => {
      const { min: mn, max: mx } = s.current
      if (mx <= mn) return
      const rawPct = rawPctFromPosY(s.current.startPosMax + dy)
      const v = valFromPct(rawPct)
      if (s.current.startedStackedMax && dy > 0) {
        // Started stacked and dragging down → move min instead
        const maxPct = (s.current.valueMax - mn) / (mx - mn)
        minPctSv.value = Math.min(maxPct, rawPct)
        if (v !== s.current.valueMin && v <= s.current.valueMax)
          cbs.current.onChangeMin(v)
      } else {
        const minPct = (s.current.valueMin - mn) / (mx - mn)
        maxPctSv.value = Math.max(minPct, rawPct)
        if (v !== s.current.valueMax && v >= s.current.valueMin)
          cbs.current.onChangeMax(v)
      }
    },
    onPanResponderRelease: () => {
      slidingActiveRef.current = false
      s.current.draggingMax = false
      maxDragSv.value = withTiming(0, { duration: 150 })
      const { min: mn, max: mx } = s.current
      if (mx > mn) {
        maxPctSv.value = withTiming((s.current.valueMax - mn) / (mx - mn), { duration: 100 })
        if (s.current.startedStackedMax)
          minPctSv.value = withTiming((s.current.valueMin - mn) / (mx - mn), { duration: 100 })
      }
    },
    onPanResponderTerminate: () => {
      slidingActiveRef.current = false
      s.current.draggingMax = false
      maxDragSv.value = withTiming(0, { duration: 150 })
      const { min: mn, max: mx } = s.current
      if (mx > mn) {
        maxPctSv.value = withTiming((s.current.valueMax - mn) / (mx - mn), { duration: 100 })
        if (s.current.startedStackedMax)
          minPctSv.value = withTiming((s.current.valueMin - mn) / (mx - mn), { duration: 100 })
      }
    },
  })).current

  const trackFillStyle = useAnimatedStyle(() => {
    const h = trackHeightSv.value
    return {
      top: (1 - maxPctSv.value) * h,
      height: Math.max(0, (maxPctSv.value - minPctSv.value) * h),
    }
  })
  const minWrapStyle = useAnimatedStyle(() => ({
    top: (1 - minPctSv.value) * trackHeightSv.value - VTHUMB / 2,
  }))
  const maxWrapStyle = useAnimatedStyle(() => ({
    top: (1 - maxPctSv.value) * trackHeightSv.value - VTHUMB / 2,
  }))
  const minThumbInnerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + minDragSv.value * 0.1 }],
  }))
  const maxThumbInnerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + maxDragSv.value * 0.1 }],
  }))
  const minGlowStyle = useAnimatedStyle(() => ({
    opacity: minDragSv.value,
    transform: [{ scale: 0.6 + minDragSv.value * 0.4 }],
  }))
  const maxGlowStyle = useAnimatedStyle(() => ({
    opacity: maxDragSv.value,
    transform: [{ scale: 0.6 + maxDragSv.value * 0.4 }],
  }))

  return (
    <View style={vrange.container}>
      <View
        style={vrange.track}
        onLayout={e => {
          s.current.trackHeight = e.nativeEvent.layout.height
          trackHeightSv.value = e.nativeEvent.layout.height
        }}
      >
        <View style={vrange.trackBg} />
        <Animated.View style={[vrange.trackFill, trackFillStyle]} />
        {/* Min thumb — near bottom */}
        <Animated.View
          style={[vrange.thumbWrap, minWrapStyle]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...minPan.panHandlers}
        >
          <Animated.View style={[vrange.glow, minGlowStyle]} />
          <Animated.View style={[vrange.thumb, minThumbInnerStyle]} />
        </Animated.View>
        {/* Max thumb — near top (rendered last = higher z-index, wins when thumbs overlap) */}
        <Animated.View
          style={[vrange.thumbWrap, maxWrapStyle]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...maxPan.panHandlers}
        >
          <Animated.View style={[vrange.glow, maxGlowStyle]} />
          <Animated.View style={[vrange.thumb, maxThumbInnerStyle]} />
        </Animated.View>
      </View>
    </View>
  )
}

const vrange = StyleSheet.create({
  container: { width: VTHUMB + 24, flex: 1, alignItems: 'center', paddingVertical: VTHUMB / 2 },
  track: { width: VTHUMB, flex: 1, alignItems: 'center' },
  trackBg: { position: 'absolute', top: 0, bottom: 0, width: VTRACK, backgroundColor: GRAY_100, borderRadius: VTRACK / 2 },
  trackFill: { position: 'absolute', width: VTRACK, backgroundColor: PRIMARY, borderRadius: VTRACK / 2 },
  thumbWrap: {
    position: 'absolute', width: VTHUMB, height: VTHUMB,
    alignItems: 'center', justifyContent: 'center',
  },
  thumb: {
    width: VTHUMB, height: VTHUMB, borderRadius: VTHUMB / 2,
    backgroundColor: WHITE, borderWidth: 2, borderColor: PRIMARY,
    shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 3,
  },
  glow: {
    position: 'absolute', width: VGLOW, height: VGLOW, borderRadius: VGLOW / 2, backgroundColor: PRIMARY_BG,
  },
})

// ── Vertical Radius Slider ─────────────────────────────────────────────────

function VerticalRadiusSlider({ stepCount, value, onChange }: RadiusSliderProps) {
  const s = useRef({ trackHeight: 0, startPos: 0, value, stepCount, dragging: false })
  s.current.value = value
  s.current.stepCount = stepCount
  const cbs = useRef({ onChange })
  useEffect(() => { cbs.current = { onChange } }, [onChange])

  const trackHeightSv = useSharedValue(0)
  const pctSv = useSharedValue(stepCount <= 1 ? 0 : value / (stepCount - 1))
  const dragSv = useSharedValue(0)

  // Sync thumb position from prop only when not actively dragging.
  // During drag, the gesture handler writes pctSv directly for smooth tracking.
  useEffect(() => {
    if (s.current.dragging) return
    if (stepCount > 1) pctSv.value = withTiming(value / (stepCount - 1), { duration: 150 })
  }, [value, stepCount])

  const toPosY = (v: number) => {
    const { trackHeight, stepCount: sc } = s.current
    if (sc <= 1 || !trackHeight) return trackHeight
    return (1 - v / (sc - 1)) * trackHeight
  }
  const rawPctFromPosY = (posY: number) => {
    const { trackHeight } = s.current
    if (!trackHeight) return 0
    return 1 - Math.max(0, Math.min(posY, trackHeight)) / trackHeight
  }
  const valFromPct = (pct: number) => {
    const { stepCount: sc } = s.current
    if (sc <= 1) return 0
    return Math.round(pct * (sc - 1))
  }

  const thumbPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      slidingActiveRef.current = true
      s.current.dragging = true
      s.current.startPos = toPosY(s.current.value)
      dragSv.value = withTiming(1, { duration: 120 })
    },
    onPanResponderMove: (_, { dy }) => {
      const { stepCount: sc } = s.current
      if (sc <= 1) return
      const rawPct = rawPctFromPosY(s.current.startPos + dy)
      pctSv.value = rawPct
      const v = valFromPct(rawPct)
      if (v !== s.current.value) cbs.current.onChange(v)
    },
    onPanResponderRelease: () => {
      slidingActiveRef.current = false
      s.current.dragging = false
      dragSv.value = withTiming(0, { duration: 150 })
      const { stepCount: sc } = s.current
      if (sc > 1) pctSv.value = withTiming(s.current.value / (sc - 1), { duration: 100 })
    },
    onPanResponderTerminate: () => {
      slidingActiveRef.current = false
      s.current.dragging = false
      dragSv.value = withTiming(0, { duration: 150 })
      const { stepCount: sc } = s.current
      if (sc > 1) pctSv.value = withTiming(s.current.value / (sc - 1), { duration: 100 })
    },
  })).current

  const trackFillStyle = useAnimatedStyle(() => {
    const h = trackHeightSv.value
    return {
      top: (1 - pctSv.value) * h,
      height: pctSv.value * h,
    }
  })
  const wrapStyle = useAnimatedStyle(() => ({
    top: (1 - pctSv.value) * trackHeightSv.value - VTHUMB / 2,
  }))
  const thumbInnerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + dragSv.value * 0.1 }],
  }))
  const glowStyle = useAnimatedStyle(() => ({
    opacity: dragSv.value,
    transform: [{ scale: 0.6 + dragSv.value * 0.4 }],
  }))

  return (
    <View style={vrange.container}>
      <View
        style={vrange.track}
        onLayout={e => {
          s.current.trackHeight = e.nativeEvent.layout.height
          trackHeightSv.value = e.nativeEvent.layout.height
        }}
      >
        <View style={vrange.trackBg} />
        <Animated.View style={[vrange.trackFill, trackFillStyle]} />
        <Animated.View
          style={[vrange.thumbWrap, wrapStyle]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...thumbPan.panHandlers}
        >
          <Animated.View style={[vrange.glow, glowStyle]} />
          <Animated.View style={[vrange.thumb, thumbInnerStyle]} />
        </Animated.View>
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
  if (km === Infinity) return t('settings.rangeUnlimited')
  if (km < 1) return `${km * 1000} ${t('settings.meter')}`
  return `${km} ${t('settings.km')}`
}

function radiusToServer(km: number): number | null {
  if (km === Infinity) return null
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

export type Tab = 'preferences' | 'profile' | 'app'
const TABS: Tab[] = ['app', 'profile', 'preferences']

// Per-tab glyph. Drawn twice by TabIconStack (gray + white) so the active
// state can cross-fade over the pill indicator on the native driver.
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

function TabIconStack({ active, tab }: { active: boolean; tab: Tab }) {
  return <TabIcon tab={tab} color={active ? '#fff' : 'rgba(0,0,0,0.5)'} />
}

// ── Animated Toggle Button ─────────────────────────────────────────────────
// Used for the gender chips (and anywhere else two-state pill buttons appear).
// Animates background color, text color, and a small scale bump on press.

function AnimatedToggleButton({
  active, onPress, label,
}: { active: boolean; onPress: () => void; label: string }) {
  // Stacked layers cross-faded with opacity — lets us run on the native driver
  // (backgroundColor interpolation can't). Active layer sits on top.
  const activeOpacity = useRef(new RNAnimated.Value(active ? 1 : 0)).current
  const scale = useRef(new RNAnimated.Value(1)).current
  const startRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    RNAnimated.timing(activeOpacity, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start()
  }, [active])

  const handlePress = () => {
    tap()
    RNAnimated.sequence([
      RNAnimated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      RNAnimated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start()
    onPress()
  }

  // Raw responder callbacks (not Pressable) for the same reason as Button /
  // IconPressable: RN 0.81 Pressability cancels single taps inside ScrollView.
  return (
    <RNAnimated.View style={{ flex: 1, transform: [{ scale }] }}>
      <View
        onStartShouldSetResponder={() => true}
        onResponderGrant={e => { startRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } }}
        onResponderRelease={e => {
          const dx = Math.abs(e.nativeEvent.pageX - startRef.current.x)
          const dy = Math.abs(e.nativeEvent.pageY - startRef.current.y)
          if (dx < TAP_SLOP && dy < TAP_SLOP) handlePress()
        }}
      >
        <View style={{ borderRadius: 12, overflow: 'hidden' }}>
          {/* Inactive layer — always rendered underneath */}
          <View style={{ backgroundColor: 'rgba(0,0,0,0.06)', paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(0,0,0,0.5)' }}>{label}</Text>
          </View>
          {/* Active layer — fades over the top */}
          <RNAnimated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, start: 0, end: 0, bottom: 0,
              backgroundColor: TEXT_PRIMARY, alignItems: 'center', justifyContent: 'center',
              opacity: activeOpacity,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: WHITE }}>{label}</Text>
          </RNAnimated.View>
        </View>
      </View>
    </RNAnimated.View>
  )
}

// ── Preferences Content ────────────────────────────────────────────────────
// Renders the search-preferences sections without an outer ScrollView so they
// can be embedded inside a parent ScrollView on the main settings screen.

function PreferencesContent({ onOpenSubPage }: { onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const { profile, update } = useUserStore()

  const age = profile?.birth_date ? calcAge(profile.birth_date) : 40
  const ageSliderMin = Math.max(18, age - 20)
  const ageSliderMax = Math.min(80, age + 20)

  if (!profile) return null

  const ageMin = Math.max(ageSliderMin, Math.min(profile.age_from, ageSliderMax))
  const ageMax = Math.max(ageMin, Math.min(ageSliderMax, Math.max(profile.age_to, ageSliderMin)))
  const radius = profile.range == null ? Infinity : profile.range <= 250 ? 0 : snapRadius(profile.range / 1000)
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
    <View style={styles.section}>
      <SectionLabel>{t('settings.searchPreferences').toUpperCase()}</SectionLabel>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        <SelectFieldRow
          grouped
          label={t('settings.range')}
          displayValue={formatRadius(radius)}
          onPress={() => onOpenSubPage?.({
            kind: 'radius',
            title: t('settings.range'),
            stepCount: RADIUS_STEPS.length,
            value: Math.max(0, RADIUS_STEPS.indexOf(radius)),
            onChangeLocal: i => { update({ range: radiusToServer(RADIUS_STEPS[i]) }) },
            onClose: i => { invoke('app/range', { range: radiusToServer(RADIUS_STEPS[i]) }).catch(console.error) },
            formatStep: i => formatRadius(RADIUS_STEPS[i]),
          })}
          icon={<MapPinIcon />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.ageRange')}
          displayValue={`⁦${ageMin} – ${ageMax}⁩`}
          onPress={() => onOpenSubPage?.({
            kind: 'ageRange',
            title: t('settings.ageRange'),
            ageMin, ageMax,
            sliderMin: ageSliderMin, sliderMax: ageSliderMax,
            onChangeLocal: (min, max) => { update({ age_from: min, age_to: max }) },
            onClose: (min, max) => { invoke('app/age', { age_from: min, age_to: max }).catch(console.error) },
          })}
          icon={<SlidersIcon />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.preferredGender')}
          displayValue={genderDisplayValue}
          onPress={() => onOpenSubPage?.({
            kind: 'select',
            title: t('settings.preferredGender'),
            options: genderOptions,
            value: genderPref,
            onSelect: async (v) => {
              update({ is_for_male: v === 'M' || v === 'B', is_for_female: v === 'F' || v === 'B' })
              await invoke('app/preferred_gender', { is_for_male: v === 'M' || v === 'B', is_for_female: v === 'F' || v === 'B' })
            },
          })}
          icon={<GenderIcon />}
        />
      </View>
    </View>
  )
}

// ── Preferences Tab ────────────────────────────────────────────────────────

function PreferencesTab({ onOpenSubPage }: { onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const { profile, update } = useUserStore()

  const age = profile?.birth_date ? calcAge(profile.birth_date) : 40
  const ageSliderMin = Math.max(18, age - 20)
  const ageSliderMax = Math.min(80, age + 20)

  if (!profile) return <View style={styles.tabContent} />

  const ageMin = Math.max(ageSliderMin, Math.min(profile.age_from, ageSliderMax))
  const ageMax = Math.max(ageMin, Math.min(ageSliderMax, Math.max(profile.age_to, ageSliderMin)))
  const radius = profile.range == null ? Infinity : profile.range <= 250 ? 0 : snapRadius(profile.range / 1000)
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
            onChangeLocal: i => { update({ range: radiusToServer(RADIUS_STEPS[i]) }) },
            onClose: i => { invoke('app/range', { range: radiusToServer(RADIUS_STEPS[i]) }).catch(console.error) },
            formatStep: i => formatRadius(RADIUS_STEPS[i]),
          })}
          icon={<MapPinIcon />}
        />
      </View>

      {/* Age Range */}
      <View style={styles.section}>
        <SectionLabel>{t('settings.ageRange').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={`\u2066${ageMin} – ${ageMax}\u2069`}
          onPress={() => onOpenSubPage?.({
            kind: 'ageRange',
            title: t('settings.ageRange'),
            ageMin, ageMax,
            sliderMin: ageSliderMin, sliderMax: ageSliderMax,
            onChangeLocal: (min, max) => { update({ age_from: min, age_to: max }) },
            onClose: (min, max) => { invoke('app/age', { age_from: min, age_to: max }).catch(console.error) },
          })}
          icon={<SlidersIcon />}
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
              await invoke('app/preferred_gender', { is_for_male: v === 'M' || v === 'B', is_for_female: v === 'F' || v === 'B' })
            },
          })}
          icon={<GenderIcon />}
        />
      </View>

    </ScrollView>
  )
}

// ── Photo Field Row ───────────────────────────────────────────────────────
// Thumbnail strip inside a tappable field row — same height as SelectFieldRow.
// Shows up to 6 small round thumbnails + a forward chevron.

function PhotoFieldRow({ photos, userId, onPress, label, grouped }: { photos: string[]; userId: string; onPress: () => void | Promise<unknown>; label?: string; grouped?: boolean }) {
  const press = useRef(new RNAnimated.Value(0)).current
  const tapProps = useTapResponder(onPress, (pressed) => {
    RNAnimated.timing(press, {
      toValue: pressed ? 1 : 0,
      duration: pressed ? 80 : 180,
      useNativeDriver: false,
    }).start()
  })
  const visible = photos.slice(0, 6)
  return (
    <View style={[grouped ? styles.selectRowInner : styles.selectRow, { alignItems: 'flex-start' }]} {...tapProps}>
      <RNAnimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, {
          backgroundColor: GRAY_50,
          opacity: press,
          borderRadius: grouped ? 0 : 16,
        }]}
      />
      <ForwardChevronIcon />
      {label != null && (
        <>
          <Text style={styles.selectRowLabel} numberOfLines={1}>{label}</Text>
          <View style={{ flex: 1 }} />
        </>
      )}
      {visible.length > 0 && (
        <View style={styles.photoThumbStrip}>
          {visible.map((f, i) => (
            <Image
              key={`${i}-${f}`}
              source={{ uri: localPhotoUriCache.get(f) ?? `${SUPABASE_URL}/storage/v1/object/public/users/${userId}/normal/${f}` }}
              style={styles.photoThumb}
            />
          ))}
        </View>
      )}
    </View>
  )
}

// ── Profile Tab ────────────────────────────────────────────────────────────

function ProfileTab({ focused = true, onOpenSubPage }: { focused?: boolean; onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const { profile, update } = useUserStore()
  const { user } = useAuthStore()
  // Bio is held locally while typing — flushed on blur / unmount to avoid per-keystroke server calls
  const [localBio, setLocalBio] = useState(profile?.bio ?? '')
  const localBioRef = useRef(localBio)
  const savedBioRef = useRef(profile?.bio ?? '')
  const scrollRef = useRef<any>(null)
  const bioInputRef = useRef<any>(null)
  const [bioFocused, setBioFocused] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const messageSectionYRef = useRef(0)
  const profileCardYRef = useRef(0)

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
  useDataSave({ images: profile?.images?.filter(img => !pendingDeferred.has(img.normal ?? '')) }, !!profile)

  // Hook calls must be above the early return to keep count stable.
  const previewTap = useTapResponder(() => onOpenSubPage?.({ kind: 'preview', title: t('settings.myProfile') }))
  const bioTapProps = useTapResponder(() => {
    tap()
    setBioFocused(true)
    setTimeout(() => bioInputRef.current?.focus(), 100)
  })

  if (!profile) return <View style={styles.tabContent} />

  const photos = profile.images?.map(e => e.normal ?? '') ?? []
  const isForKids = profile.is_for_kids
  const kidsOptions: SelectOption[] = [
    { value: 'yes', label: t('settings.kidsYes') },
    { value: 'no',  label: t('settings.kidsNo')  },
    { value: 'na',  label: t('settings.kidsNa')  },
  ]
  const kidsValue = isForKids === true ? 'yes' : isForKids === false ? 'no' : 'na'
  const kidsDisplayValue = kidsValue === 'na' ? '' : (kidsOptions.find(o => o.value === kidsValue)?.label ?? '')

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.tabScroll}
      contentContainerStyle={[styles.tabContent, { paddingBottom: 40 + keyboardHeight }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      delaysContentTouches={false}
    >

      <View style={styles.accountLinksCard}>
        <View style={styles.accountLinkRowInner} {...previewTap}>
          <ForwardChevronIcon />
          <Text style={styles.accountActionText}>{t('settings.preview')}</Text>
          <View style={{ flex: 1 }} />
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <Circle cx={12} cy={12} r={3} />
          </Svg>
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabel>{t('settings.myInfo').toUpperCase()}</SectionLabel>
        <View
          style={[styles.accountLinksCard, { marginBottom: 0 }]}
          onLayout={(e) => { profileCardYRef.current = e.nativeEvent.layout.y }}
        >
          <PhotoFieldRow
            grouped
            photos={photos}
          userId={user!.id}
          label={t('settings.photo')}
          onPress={() => onOpenSubPage?.({ kind: 'photos', title: t('settings.photo') })}
        />
        <View style={styles.accountActionDivider} />
        <View
          style={styles.textInputWrapInner}
          onLayout={(e) => { messageSectionYRef.current = e.nativeEvent.layout.y }}
        >
          <View style={styles.textInputHeader}>
            <View style={styles.textInputHeaderSpacer} />
            <Text style={styles.selectRowLabel} numberOfLines={1}>{t('settings.aboutMe')}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.aboutMeQuote}>“</Text>
          </View>
          <View pointerEvents={bioFocused ? 'auto' : 'none'}>
            <GHTextInput
              ref={bioInputRef}
              style={[styles.textInput, { fontFamily: DEFAULT_FAMILY }]}
              value={localBio}
              onChangeText={(text) => {
                if (text.length > 150) text = text.slice(0, 150)
                setLocalBio(text)
              }}
              onFocus={() => {
                setTimeout(() => {
                  scrollRef.current?.scrollTo({
                    y: Math.max(0, profileCardYRef.current + messageSectionYRef.current - 12),
                    animated: true,
                  })
                }, 300)
              }}
              onBlur={() => { setBioFocused(false); flushBio() }}
              multiline
              scrollEnabled={false}
              maxLength={150}
              textAlign="center"
              textAlignVertical="top"
            />
          </View>
          {!bioFocused && (
            <View style={StyleSheet.absoluteFill} {...bioTapProps} />
          )}
          {localBio.length >= 20 && (
            <Text style={styles.charCount}>{150 - localBio.length}</Text>
          )}
        </View>
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={tg('settings.kidsLabel', profile.is_male)}
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
          icon={<BabyCarIcon />}
        />
        </View>
      </View>

    </ScrollView>
  )
}

// 3 columns × 2 rows (max 6 photos). Percentage width + space-between
// lets the gaps adapt to the actual pane width, which varies with safe-area
// insets on edge-to-edge Android, instead of relying on Dimensions at
// module-load time.
// ── Account Tab ────────────────────────────────────────────────────────────

function SignOutIcon({ color = TEXT_PRIMARY }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  )
}

function TrashIcon({ color = TEXT_PRIMARY }: { color?: string }) {
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

// ── App Tab ────────────────────────────────────────────────────────────────

function AppTab({ onBack, onOpenSubPage }: { onBack?: () => void; onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const router = useRouter()
  const { profile, update } = useUserStore()
  const [resetting, setResetting] = useState(false)

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
      else router.back()
    } catch (e) { console.error(e) }
    finally { setResetting(false) }
  }, [resetting, onBack, router])

  const resetTap = useTapResponder(onReset)

  useDataSave({ units: profile?.units }, !!profile)

  if (!profile) return <View style={styles.tabContent} />

  const units = profile.units ?? 'metric'
  const unitsOptions: SelectOption[] = [
    { value: 'metric',   label: t('settings.unitsMetricDesc')   },
    { value: 'imperial', label: t('settings.unitsImperialDesc') },
  ]
  const unitsDisplayValue = unitsOptions.find(o => o.value === units)?.label ?? t('settings.unitsMetricDesc')

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <View style={styles.accountLinksCard}>
          <SelectFieldRow
            grouped
            label={t('settings.unitsLabel')}
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
            icon={<RulerIcon />}
          />
        </View>
      </View>

      {profile.data?.role === 'ADMIN' && (
        <View style={styles.section}>
          <SectionLabel>{t('settings.adminTitle').toUpperCase()}</SectionLabel>
          <View style={styles.accountActionsCard}>
            <View
              style={[styles.accountActionRow, resetting && { opacity: 0.5 }]}
              {...(resetting ? {} : resetTap)}
            >
              {resetting
                ? <ActivityIndicator size={18} color="rgba(0,0,0,0.5)" />
                : <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <Path d="M3 3v5h5" />
                  </Svg>
              }
              <Text style={styles.accountActionText}>{t('settings.adminEntry')}</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

function renderTab(tab: Tab, onBack: (() => void) | undefined, focused: boolean, onOpenSubPage?: (config: SubPageConfig) => Promise<void>) {
  if (tab === 'preferences') return <PreferencesTab onOpenSubPage={onOpenSubPage} />
  if (tab === 'profile')     return <ProfileTab focused={focused} onOpenSubPage={onOpenSubPage} />
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
// ── Select Field Page ──────────────────────────────────────────────────────
// Full-screen pane used as pane 3 in the home shell pager. Mirrors the
// visual style of the settings screen (same background, header, card).

function OptionRow({ onPress, children }: { onPress: () => void | Promise<unknown>; children: React.ReactNode }) {
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
    onBack(() => config.onSelect(value))
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
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
  const ageMinRef = useRef(ageMin)
  const ageMaxRef = useRef(ageMax)

  const handleChangeMin = (v: number) => { setAgeMin(v); ageMinRef.current = v; config.onChangeLocal(v, ageMaxRef.current) }
  const handleChangeMax = (v: number) => { setAgeMax(v); ageMaxRef.current = v; config.onChangeLocal(ageMinRef.current, v) }

  // Fire server call when the page unmounts (back button or swipe).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { config.onClose(ageMinRef.current, ageMaxRef.current) }, [])

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
      </View>
      <View style={spStyles.content}>
        <Text style={spStyles.displayValue}>{`\u2066${ageMin} – ${ageMax}\u2069`}</Text>
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
  const valueRef = useRef(value)

  const handleChange = (v: number) => { setValue(v); valueRef.current = v; config.onChangeLocal(v) }

  // Fire server call when the page unmounts (back button or swipe).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { config.onClose(valueRef.current) }, [])

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
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
    try {
      await config.onReset(state)
      onBack()
    } catch (e) { console.error(e) }
    finally { setResetting(null) }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
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
                loading={resetting === 'VISIBLE'}
                silentDisabled={resetting !== 'VISIBLE'}
                variant="soft"
                size="md"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t('settings.resetHidden')}
                onPress={() => handleReset('HIDDEN')}
                disabled={!!resetting}
                loading={resetting === 'HIDDEN'}
                silentDisabled={resetting !== 'HIDDEN'}
                variant="soft"
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
  const [uploading, setUploading] = useState(false)

  const handleBack = async () => {
    if (uploading) return
    if (photoRef.current) {
      setUploading(true)
      await photoRef.current.flush().catch(console.error)
    }
    onBack()
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <IconPressable style={styles.backBtn} onPress={handleBack} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color={TEXT_PRIMARY} /> : <BackIcon />}
        </IconPressable>
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

// ── Account Field Page ───────────────────────────────────────────────────
// Full-screen pane with account info + sign-out / delete, opened from the
// profile tab via the sub-page mechanism.

export function AccountFieldPage({ config, onBack }: { config: AccountFieldConfig; onBack: (afterSlide?: () => Promise<void> | void) => void }) {
  const insets = useSafeAreaInsets()
  const { profile } = useUserStore()
  const { user, signOut } = useAuthStore()
  const router = useRouter()
  const [signOutDialog, setSignOutDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Hook calls must be above the early return to keep count stable.
  const signOutTap = useTapResponder(() => { tap(); setSignOutDialog(true) })
  const deleteTap = useTapResponder(() => { tapWarning(); setDeleteDialog(true) })

  if (!profile || !user) return <View style={[styles.root, { paddingTop: insets.top }]} />

  const age = profile.birth_date ? calcAge(profile.birth_date) : null
  const gender =
    profile.is_male === true  ? t('settings.male')
    : profile.is_male === false ? t('settings.female')
    : '—'

  const finishAndGoToLogin = async () => {
    await signOut()
    router.replace('/login')
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
    try { await invoke('app/delete') } catch (e) { console.error(e); setDeleting(false); return }
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
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
      </View>
      <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <View style={styles.accountLinksCard}>
            {rows.map((r, i) => (
              <React.Fragment key={r.label}>
                {i > 0 && <View style={styles.accountActionDivider} />}
                <View style={styles.selectRowInner}>
                  <Text style={[styles.selectRowLabel, { flex: 1 }]} numberOfLines={1}>{r.label}</Text>
                  <Text style={[styles.selectRowValue, { color: GRAY_400 }]} numberOfLines={1}>{r.value}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.accountActionsCard}>
            <View
              style={styles.accountActionRow}
              {...signOutTap}
            >
              <SignOutIcon color="rgba(0,0,0,0.5)" />
              <Text style={styles.accountActionText}>{tg('settings.signOut', profile.is_male)}</Text>
            </View>
            <View style={styles.accountActionDivider} />
            <View
              style={styles.accountActionRow}
              {...deleteTap}
            >
              <TrashIcon color="rgba(180,60,60,0.5)" />
              <Text style={[styles.accountActionText, styles.accountActionTextDestructive]}>{t('settings.deleteAccount')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
    <ConfirmDialog
      visible={signOutDialog}
      title={t('settings.signOutConfirmTitle')}
      description={tg('settings.signOutConfirmDesc', profile.is_male)}
      confirmLabel={tg('settings.signOutYes', profile.is_male)}
      soft
      onCancel={() => setSignOutDialog(false)}
      onConfirm={onSignOutConfirmed}
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
    />
    </>
  )
}

// ── Preview Field Page ───────────────────────────────────────────────────
// Full-screen pane showing the user's profile card preview, opened from the
// profile tab via the sub-page mechanism.

export function PreviewFieldPage({ config, onBack }: { config: PreviewFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const { profile } = useUserStore()
  const { user } = useAuthStore()
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
      is_for_kids: profile.is_for_kids ?? null,
      is_male: profile.is_male ?? undefined,
      distance: 0,
      last_seen: new Date().toISOString(),
    }
  }, [profile, user?.id])

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
      </View>
      {previewData ? (
        <View style={styles.previewWrap}>
          <View style={styles.previewOuter}>
            <View style={styles.previewInner}>
              <MatchCard match={previewData} userIsMale={previewData.is_male ?? null} bottomInset={0} />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.tabContent} />
      )}
    </View>
  )
}

// ── About Field Page ─────────────────────────────────────────────────────────
// Full-screen pane showing the marketing/about content from the login screen.

export function AboutFieldPage({ config, onBack }: { config: AboutFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.backBtn} />
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
      </View>
      <WhatsSpecialPage />
    </View>
  )
}

// ── Inner Sub-Page Renderer ────────────────────────────────────────────────
// Used by ProfileSectionPage and AppSectionPage to render a second-level
// sub-page on top of themselves without involving the shell's subPage state.

function InnerSubPageRenderer({ config, onBack }: { config: SubPageConfig; onBack: (after?: () => Promise<void> | void) => void }) {
  if (config.kind === 'ageRange') return <AgeRangeFieldPage config={config} onBack={onBack} />
  if (config.kind === 'radius')   return <RadiusFieldPage   config={config} onBack={onBack} />
  if (config.kind === 'photos')   return <PhotoFieldPage    config={config} onBack={onBack} />
  if (config.kind === 'account')  return <AccountFieldPage  config={config} onBack={onBack} />
  if (config.kind === 'preview')  return <PreviewFieldPage  config={config} onBack={onBack} />
  if (config.kind === 'about')    return <AboutFieldPage    config={config} onBack={() => onBack()} />
  if (config.kind === 'admin')    return <AdminFieldPage    config={config} onBack={() => onBack()} />
  if (config.kind === 'select')   return <SelectFieldPage   config={config} onBack={onBack} />
  return null
}

// ── Section Page Shell ─────────────────────────────────────────────────────
// Shared navigation logic for ProfileSectionPage and AppSectionPage.
// Replicates the shell's push-navigation: section content slides out while the
// sub-page slides in, both driven by the same `slideProgress` value —
// identical to pagerPushStyle + subPageAnimStyle in home.tsx.

function useSectionNav() {
  const width = useRef(Dimensions.get('window').width).current
  const dir = isRTL ? 1 : -1  // matches subPageDir in home.tsx
  const [subConfig, setSubConfig] = useState<SubPageConfig | null>(null)

  // Use the shell's shared slide value when available so the shell's
  // swipe-back gesture can drive the same animation. Fallback to a local
  // SharedValue if the section page is rendered outside the shell.
  const shell = useContext(ShellInnerNavContext)
  const localSlide = useSharedValue(0)
  const slideProgress = shell?.slideProgress ?? localSlide

  // Section content slides out as inner slides in (mirrors pagerPushStyle).
  const sectionPushStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -dir * slideProgress.value * width }],
  }))

  // Inner sub-page slides in from the start edge (mirrors subPageAnimStyle).
  const subPageSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dir * width * (1 - slideProgress.value) }],
  }))

  // Stable refs so handlers registered with the shell don't go stale.
  const closeInnerRef = useRef<(after?: () => Promise<void> | void) => void>(() => {})
  const finalizeCloseRef = useRef<() => void>(() => {})

  const openInner = (cfg: SubPageConfig): Promise<void> => {
    setSubConfig(cfg)
    shell?.setHandlers({
      isOpen: true,
      close: () => closeInnerRef.current(),
      finalizeClose: () => finalizeCloseRef.current(),
    })
    slideProgress.value = withTiming(1, { duration: 300, easing: REasing.out(REasing.cubic) })
    return Promise.resolve()
  }

  const finalizeClose = () => {
    setSubConfig(null)
    shell?.setHandlers(null)
  }
  finalizeCloseRef.current = finalizeClose

  const closeInner = (after?: () => Promise<void> | void) => {
    slideProgress.value = withTiming(
      0,
      { duration: 300, easing: REasing.in(REasing.cubic) },
      (finished) => {
        'worklet'
        if (finished) {
          runOnJS(finalizeClose)()
          if (after) runOnJS(runAfter)(after)
        }
      },
    )
  }
  closeInnerRef.current = closeInner

  useEffect(() => {
    // Reset on mount in case the shell's SharedValue carries a stale value
    // from a previous section page.
    slideProgress.value = 0
    return () => {
      // Section page is unmounting (shell sub-page closed) — make sure the
      // shell doesn't hold a stale inner handler.
      shell?.setHandlers(null)
      slideProgress.value = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { subConfig, openInner, closeInner, sectionPushStyle, subPageSlideStyle }
}

function runAfter(after: () => Promise<void> | void) {
  Promise.resolve(after()).catch(console.error)
}

// ── Profile Section Page ───────────────────────────────────────────────────

export function ProfileSectionPage({ config, onBack }: { config: ProfileSectionFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const { subConfig, openInner, closeInner, sectionPushStyle, subPageSlideStyle } = useSectionNav()

  return (
    <View style={[styles.rootOuter, styles.root, { paddingTop: insets.top, overflow: 'hidden' }]}>
      <StatusBar style="dark" />
      <Animated.View style={[{ flex: 1 }, sectionPushStyle]}>
        <View style={styles.header}>
          <View style={styles.backBtn} />
          <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
          <IconPressable style={styles.backBtn} onPress={onBack}>
            <BackIcon />
          </IconPressable>
        </View>
        <ProfileTab onOpenSubPage={openInner} />
      </Animated.View>
      {subConfig && (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: WHITE }, subPageSlideStyle]}>
          <InnerSubPageRenderer config={subConfig} onBack={closeInner} />
        </Animated.View>
      )}
    </View>
  )
}

// ── App Section Page ───────────────────────────────────────────────────────

export function AppSectionPage({ config, onBack }: { config: AppSectionFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const { subConfig, openInner, closeInner, sectionPushStyle, subPageSlideStyle } = useSectionNav()

  return (
    <View style={[styles.rootOuter, styles.root, { paddingTop: insets.top, overflow: 'hidden' }]}>
      <StatusBar style="dark" />
      <Animated.View style={[{ flex: 1 }, sectionPushStyle]}>
        <View style={styles.header}>
          <View style={styles.backBtn} />
          <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
          <IconPressable style={styles.backBtn} onPress={onBack}>
            <BackIcon />
          </IconPressable>
        </View>
        <AppTab onBack={onBack} onOpenSubPage={openInner} />
      </Animated.View>
      {subConfig && (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: WHITE }, subPageSlideStyle]}>
          <InnerSubPageRenderer config={subConfig} onBack={closeInner} />
        </Animated.View>
      )}
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
    color: TEXT_PRIMARY,
    letterSpacing: -0.5,
    marginBottom: 28,
  },
  sliderArea: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  endLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: GRAY_400,
  },
})

type SettingsPageProps = { topInset?: number; onBack?: () => void; focused?: boolean; onOpenSubPage?: (config: SubPageConfig) => Promise<void> }

// Wraps a section label text in a row container so flexDirection:'row'
// auto-flipping places the label on the logical start side (right in RTL,
// left in LTR) reliably — textAlign/writingDirection alone proved
// inconsistent at runtime.
function SectionLabel({ children, icon }: { children: any; icon?: React.ReactNode }) {
  return (
    <View style={[styles.sectionLabelRow, icon ? { justifyContent: 'space-between', alignItems: 'center' } : { justifyContent: 'center' }]}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {icon}
    </View>
  )
}

export default function SettingsPage({ topInset = 0, onBack, focused = true, onOpenSubPage }: SettingsPageProps = {}) {
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
        <StatusBar style="dark" />

        <View style={styles.header}>
          <View style={styles.backBtn} />
          <Text style={styles.subPageHeaderTitle}>{t('settings.preferences')}</Text>
          <IconPressable
            style={styles.backBtn}
            onPress={() => { tap(); onBack ? onBack() : router.back() }}
          >
            <BackIcon />
          </IconPressable>
        </View>

        <ScrollView
          style={styles.tabScroll}
          contentContainerStyle={styles.tabContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          delaysContentTouches={false}
        >
          <View style={styles.accountLinksCard}>
            <SelectFieldRow
              grouped
              size="large"
              label={t('settings.profile')}
              subtitle={t('settings.profileSubtitle')}
              avatar={avatarUri}
              icon={!avatarUri ? <TabIcon tab="profile" color={GRAY_400} /> : undefined}
              onPress={() => onOpenSubPage?.({ kind: 'profileSection', title: t('settings.profile') })}
            />
          </View>

          <PreferencesContent onOpenSubPage={onOpenSubPage} />

          <View>
            <SectionLabel>{t('settings.settings').toUpperCase()}</SectionLabel>
            <View style={styles.accountLinksCard}>
              <SelectFieldRow
                grouped
                label={t('settings.account')}
                onPress={() => onOpenSubPage?.({ kind: 'account', title: t('settings.account') })}
                icon={
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={GRAY_400} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M12 3 4 6v6c0 4.6 3.3 8.7 8 9.4 4.7-.7 8-4.8 8-9.4V6l-8-3z" />
                    <Polyline points="9 12 11.5 14.5 15.5 10.5" />
                  </Svg>
                }
              />
              <View style={styles.accountActionDivider} />
              <SelectFieldRow
                grouped
                label={t('settings.appSettings')}
                onPress={() => onOpenSubPage?.({ kind: 'appSection', title: t('settings.appSettings') })}
                icon={<TabIcon tab="app" color={GRAY_400} />}
              />
            </View>
          </View>

          <View style={[styles.accountLinksCard, styles.accentCard, { marginTop: DOUBLE }]}>
            <SelectFieldRow
              grouped
              size="large"
              tone="accent"
              label={t('settings.about')}
              subtitle={t('settings.aboutSubtitle')}
              onPress={() => onOpenSubPage?.({ kind: 'about', title: t('settings.about') })}
              icon={<OnceLogo size={20} color={PRIMARY} />}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rootOuter: { flex: 1, backgroundColor: WARM_WHITE },
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, height: 56,
  },
  backBtn: { minWidth: DOUBLE + SINGLE * 2, paddingHorizontal: SINGLE, paddingVertical: BUTTON, alignItems: 'center', justifyContent: 'center' },

  tabBar: {
    flex: 1, flexDirection: 'row', marginHorizontal: SINGLE,
    backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 16, padding: 2,
  },
  tabItem: { flex: 1, paddingVertical: SINGLE, alignItems: 'center', borderRadius: 12 },
  tabItemActive: { backgroundColor: 'rgba(0,0,0,0.5)' },
  tabPill: { position: 'absolute', top: 2, bottom: 2, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)' },

  tabScroll: { flex: 1 },
  tabContent: { paddingHorizontal: SINGLE, paddingTop: 24, paddingBottom: 40 },

  section: { marginBottom: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabelRow: { flexDirection: 'row', marginTop: 24, marginBottom: 8, paddingHorizontal: SINGLE },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: GRAY_400, letterSpacing: 1 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 10 },
  sectionValue: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  divider: { height: 0 },

  photoThumbStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: SINGLE, justifyContent: 'flex-end', width: 44 * 3 + SINGLE * 2 },
  photoThumb: { width: 44, height: 44, borderRadius: 12 },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { width: '100%', height: 40 },
  sliderEndLabel: { fontSize: 12, color: 'rgba(0,0,0,0.35)', minWidth: 22, textAlign: 'center' },

  genderRow: { flexDirection: 'row', gap: 10, marginTop: SINGLE },

  previewWrap: {
    flex: 1,
    marginHorizontal: SINGLE,
    marginBottom: DOUBLE + SINGLE,
  },
  previewOuter: {
    flex: 1,
    borderRadius: 16,
  },
  previewInner: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 16,
    overflow: 'hidden',
  },

  textInputWrap: { marginTop: SINGLE, borderRadius: 12, paddingHorizontal: BUTTON, paddingTop: BUTTON, paddingBottom: BUTTON + SINGLE, backgroundColor: 'rgba(0,0,0,0.06)' },
  textInputWrapInner: { paddingHorizontal: BUTTON, paddingTop: BUTTON, paddingBottom: BUTTON + SINGLE },
  textInputHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SINGLE },
  textInputHeaderSpacer: { width: 16, height: 16 },
  aboutMeQuote: { width: 18, fontSize: 28, lineHeight: 18, color: FIELD_ICON_STROKE, fontWeight: '700', textAlign: 'center' },
  textInput: { fontSize: 16, color: TEXT_PRIMARY, padding: 0, textAlign: 'center', minHeight: 56 },
  charCount: { position: 'absolute', end: 12, bottom: 8, fontSize: 12, color: 'rgba(0,0,0,0.35)' },

  // Account tab
  infoCard: {
    marginTop: SINGLE, borderRadius: 16, overflow: 'hidden',
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
    fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY,
    flexShrink: 1, marginStart: 16,
  },

  accountLinkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: DOUBLE,
  },
  accountLinksCard: {
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: WHITE,
    marginBottom: DOUBLE,
    shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  // Solid composite of PRIMARY_BG over WARM_WHITE — using the translucent
  // PRIMARY_BG directly lets the card's shadow bleed through as a dark rim.
  accentCard: { backgroundColor: '#FFF0EB' },
  accountLinkRowInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  accountActionsCard: {
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: WHITE, marginTop: SINGLE,
    shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  accountActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  accountActionDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)',
    marginStart: 16,
  },
  accountActionText: { fontSize: 15, color: TEXT_PRIMARY, fontWeight: '500' },
  accountActionTextDestructive: { color: 'rgba(180,60,60,0.6)' },

  // Select field row — tappable row with label + value + forward chevron
  selectRow: {
    flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 10,
    backgroundColor: WHITE, borderRadius: 16,
    paddingHorizontal: BUTTON, paddingVertical: BUTTON, marginTop: SINGLE,
    overflow: 'hidden',
    shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  // Variant for use inside a grouped card (e.g. accountLinksCard) — no own
  // background or rounded corners; the parent card provides those.
  selectRowInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  selectRowLarge: { paddingVertical: 18 },
  selectRowTextCol: { justifyContent: 'center' },
  selectRowLabel: { fontSize: 15, color: TEXT_PRIMARY, fontWeight: '500' },
  selectRowSubtitle: { fontSize: 13, color: GRAY_400, marginTop: 2 },
  selectRowTrailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectRowValue: { fontSize: 15, color: PRIMARY, fontWeight: '500' },
  selectRowAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: GRAY_50,
  },
  selectRowAccentIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: PRIMARY_BG,
    alignItems: 'center', justifyContent: 'center',
  },

  // Sub-page overlay panel
  subPageRoot: { backgroundColor: WHITE },
  subPageHeaderTitle: {
    flex: 1, fontSize: 17, fontWeight: '600', color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  subPageOptionsCard: {
    marginHorizontal: SINGLE, marginTop: DOUBLE,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  subPageOptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: BUTTON, paddingVertical: DOUBLE,
  },
  subPageOptionLabel: { fontSize: 17, color: TEXT_PRIMARY },
  subPageCheckmark: { fontSize: 17, color: PRIMARY, fontWeight: '600' },
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
