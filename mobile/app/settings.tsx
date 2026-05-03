import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import {
  View, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator,
  PanResponder, I18nManager, Easing, Modal,
  Animated as RNAnimated, Dimensions,
} from 'react-native'
import Animated, { SharedValue, useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing as REasing } from 'react-native-reanimated'
import { Text, TextInput } from '../src/components/AppText'
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler'
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
import { PullContext, type PullCtx } from '../src/components/HomeCard'
import type { GestureType } from 'react-native-gesture-handler'
import { OnceLogo } from '../src/components/OnceLogo'
import { WhatsSpecialPage } from './login'
import { localPhotoUriCache, pendingDeferred, processAndUploadPhotoDeferred } from '../src/components/PhotoEditor'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '../src/lib/supabase'
import type { Profile, ProfileItem } from '../src/stores/userStore'
import { slidingActiveRef, useSlidingActive } from '../src/lib/gesture'
import { SINGLE, DOUBLE, BUTTON, DEFAULT_FAMILY } from '../src/fonts'
import { TEXT_PRIMARY, WHITE, BLACK, PRIMARY, PRIMARY_BG, GRAY_50, GRAY_100, GRAY_400, DESTRUCTIVE } from '../src/colors'

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
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Svg>
  )
}

function CloseIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={TEXT_PRIMARY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
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

export type SubPageConfig = SelectFieldConfig | AgeRangeFieldConfig | RadiusFieldConfig | AdminFieldConfig | AccountFieldConfig | PreviewFieldConfig | AboutFieldConfig | ProfileSectionFieldConfig | AppSectionFieldConfig

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

// ── Horizontal Range Slider ────────────────────────────────────────────────
// Horizontal variant of VerticalRangeSlider. Left = low value, right = high value.
// Used in the age-range popup so the slider fits the bottom-sheet layout.

const HTHUMB = 28
const HTRACK = 4
const HGLOW = 44

interface HorizontalRangeSliderProps {
  min: number; max: number
  valueMin: number; valueMax: number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
}

function HorizontalRangeSlider({ min, max, valueMin, valueMax, onChangeMin, onChangeMax }: HorizontalRangeSliderProps) {
  const s = useRef({ trackWidth: 0, min, max, valueMin, valueMax, startPosMin: 0, startPosMax: 0, startedStackedMin: false, startedStackedMax: false, draggingMin: false, draggingMax: false })
  const cbs = useRef({ onChangeMin, onChangeMax })

  useEffect(() => { s.current.min = min }, [min])
  useEffect(() => { s.current.max = max }, [max])
  useEffect(() => { s.current.valueMin = valueMin }, [valueMin])
  useEffect(() => { s.current.valueMax = valueMax }, [valueMax])
  useEffect(() => { cbs.current = { onChangeMin, onChangeMax } }, [onChangeMin, onChangeMax])

  const trackWidthSv = useSharedValue(0)
  const minPctSv = useSharedValue(max > min ? (valueMin - min) / (max - min) : 0)
  const maxPctSv = useSharedValue(max > min ? (valueMax - min) / (max - min) : 1)
  const minDragSv = useSharedValue(0)
  const maxDragSv = useSharedValue(0)

  useEffect(() => {
    if (s.current.draggingMin) return
    if (max > min) minPctSv.value = withTiming((valueMin - min) / (max - min), { duration: 150 })
  }, [valueMin, min, max])
  useEffect(() => {
    if (s.current.draggingMax) return
    if (max > min) maxPctSv.value = withTiming((valueMax - min) / (max - min), { duration: 150 })
  }, [valueMax, min, max])

  const toPosX = (v: number) => {
    const { trackWidth, min, max } = s.current
    if (!trackWidth) return 0
    return ((v - min) / (max - min)) * trackWidth
  }
  const rawPctFromPosX = (posX: number) => {
    const { trackWidth } = s.current
    if (!trackWidth) return 0
    return Math.max(0, Math.min(posX, trackWidth)) / trackWidth
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
      s.current.startPosMin = toPosX(s.current.valueMin)
      s.current.startedStackedMin = s.current.valueMin === s.current.valueMax
      minDragSv.value = withTiming(1, { duration: 120 })
    },
    onPanResponderMove: (_, { dx }) => {
      const { min: mn, max: mx } = s.current
      if (mx <= mn) return
      const rawPct = rawPctFromPosX(s.current.startPosMin + dx)
      const v = valFromPct(rawPct)
      if (s.current.startedStackedMin && dx > 0) {
        // Started stacked and dragging right → move max instead
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
      s.current.startPosMax = toPosX(s.current.valueMax)
      s.current.startedStackedMax = s.current.valueMin === s.current.valueMax
      maxDragSv.value = withTiming(1, { duration: 120 })
    },
    onPanResponderMove: (_, { dx }) => {
      const { min: mn, max: mx } = s.current
      if (mx <= mn) return
      const rawPct = rawPctFromPosX(s.current.startPosMax + dx)
      const v = valFromPct(rawPct)
      if (s.current.startedStackedMax && dx < 0) {
        // Started stacked and dragging left → move min instead
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
    const w = trackWidthSv.value
    return {
      left: minPctSv.value * w,
      width: Math.max(0, (maxPctSv.value - minPctSv.value) * w),
    }
  })
  const minWrapStyle = useAnimatedStyle(() => ({
    left: minPctSv.value * trackWidthSv.value - HTHUMB / 2,
  }))
  const maxWrapStyle = useAnimatedStyle(() => ({
    left: maxPctSv.value * trackWidthSv.value - HTHUMB / 2,
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
    <View style={hrange.container}>
      <View
        style={hrange.track}
        onLayout={e => {
          s.current.trackWidth = e.nativeEvent.layout.width
          trackWidthSv.value = e.nativeEvent.layout.width
        }}
      >
        <View style={hrange.trackBg} />
        <Animated.View style={[hrange.trackFill, trackFillStyle]} />
        {/* Min thumb — near left */}
        <Animated.View
          style={[hrange.thumbWrap, minWrapStyle]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...minPan.panHandlers}
        >
          <Animated.View style={[hrange.glow, minGlowStyle]} />
          <Animated.View style={[hrange.thumb, minThumbInnerStyle]} />
        </Animated.View>
        {/* Max thumb — near right (rendered last = higher z-index, wins when thumbs overlap) */}
        <Animated.View
          style={[hrange.thumbWrap, maxWrapStyle]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...maxPan.panHandlers}
        >
          <Animated.View style={[hrange.glow, maxGlowStyle]} />
          <Animated.View style={[hrange.thumb, maxThumbInnerStyle]} />
        </Animated.View>
      </View>
    </View>
  )
}

const hrange = StyleSheet.create({
  container: { height: HTHUMB + 24, flex: 1, justifyContent: 'center', paddingHorizontal: HTHUMB / 2 },
  track: { height: HTHUMB, flex: 1, justifyContent: 'center' },
  trackBg: { position: 'absolute', left: 0, right: 0, height: HTRACK, backgroundColor: GRAY_100, borderRadius: HTRACK / 2 },
  trackFill: { position: 'absolute', height: HTRACK, backgroundColor: PRIMARY, borderRadius: HTRACK / 2 },
  thumbWrap: {
    position: 'absolute', width: HTHUMB, height: HTHUMB,
    alignItems: 'center', justifyContent: 'center',
  },
  thumb: {
    width: HTHUMB, height: HTHUMB, borderRadius: HTHUMB / 2,
    backgroundColor: WHITE, borderWidth: 2, borderColor: PRIMARY,
    shadowColor: BLACK, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 3,
  },
  glow: {
    position: 'absolute', width: HGLOW, height: HGLOW, borderRadius: HGLOW / 2, backgroundColor: PRIMARY_BG,
  },
})

// ── Horizontal Step Slider ─────────────────────────────────────────────────
// Single-thumb step-snapping slider oriented horizontally.
// Left = step 0, right = step (stepCount-1). Used in the radius popup.

interface HorizontalStepSliderProps {
  stepCount: number
  value: number
  onChange: (v: number) => void
}

function HorizontalStepSlider({ stepCount, value, onChange }: HorizontalStepSliderProps) {
  const s = useRef({ trackWidth: 0, startPos: 0, value, stepCount, dragging: false })
  s.current.value = value
  s.current.stepCount = stepCount
  const cbs = useRef({ onChange })
  useEffect(() => { cbs.current = { onChange } }, [onChange])

  const trackWidthSv = useSharedValue(0)
  const pctSv = useSharedValue(stepCount <= 1 ? 0 : value / (stepCount - 1))
  const dragSv = useSharedValue(0)

  useEffect(() => {
    if (s.current.dragging) return
    if (stepCount > 1) pctSv.value = withTiming(value / (stepCount - 1), { duration: 150 })
  }, [value, stepCount])

  const toPosX = (v: number) => {
    const { trackWidth, stepCount: sc } = s.current
    if (sc <= 1 || !trackWidth) return 0
    return (v / (sc - 1)) * trackWidth
  }
  const rawPctFromPosX = (posX: number) => {
    const { trackWidth } = s.current
    if (!trackWidth) return 0
    return Math.max(0, Math.min(posX, trackWidth)) / trackWidth
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
      s.current.startPos = toPosX(s.current.value)
      dragSv.value = withTiming(1, { duration: 120 })
    },
    onPanResponderMove: (_, { dx }) => {
      const { stepCount: sc } = s.current
      if (sc <= 1) return
      const rawPct = rawPctFromPosX(s.current.startPos + dx)
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

  const trackFillStyle = useAnimatedStyle(() => ({
    width: pctSv.value * trackWidthSv.value,
  }))
  const wrapStyle = useAnimatedStyle(() => ({
    left: pctSv.value * trackWidthSv.value - HTHUMB / 2,
  }))
  const thumbInnerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + dragSv.value * 0.1 }],
  }))
  const glowStyle = useAnimatedStyle(() => ({
    opacity: dragSv.value,
    transform: [{ scale: 0.6 + dragSv.value * 0.4 }],
  }))

  return (
    <View style={hrange.container}>
      <View
        style={hrange.track}
        onLayout={e => {
          s.current.trackWidth = e.nativeEvent.layout.width
          trackWidthSv.value = e.nativeEvent.layout.width
        }}
      >
        <View style={hrange.trackBg} />
        <Animated.View style={[hrange.trackFill, trackFillStyle]} />
        <Animated.View
          style={[hrange.thumbWrap, wrapStyle]}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          {...thumbPan.panHandlers}
        >
          <Animated.View style={[hrange.glow, glowStyle]} />
          <Animated.View style={[hrange.thumb, thumbInnerStyle]} />
        </Animated.View>
      </View>
    </View>
  )
}

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

const RADIUS_STEPS_KM = [0, 0.5, 1, 2, 5, 10, 20, 50, 70, 100, Infinity]
// Miles steps chosen to roughly match the km steps in physical distance,
// rounded to numbers that read nicely in miles.
const RADIUS_STEPS_MI = [0, 0.3, 0.5, 1, 3, 5, 10, 30, 50, 60, Infinity]
const M_PER_MI = 1609.344

function radiusSteps(units: string | null | undefined): number[] {
  return units === 'imperial' ? RADIUS_STEPS_MI : RADIUS_STEPS_KM
}

function snapRadius(value: number, steps: number[]): number {
  return steps.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  )
}

function formatRadius(value: number, units: string | null | undefined): string {
  if (value === 0) return t('settings.rangeHere')
  if (value === Infinity) return t('settings.rangeUnlimited')
  if (units === 'imperial') return `${value} ${t('settings.miles')}`
  if (value < 1) return `${value * 1000} ${t('settings.meter')}`
  return `${value} ${t('settings.km')}`
}

function radiusToServer(value: number, units: string | null | undefined): number | null {
  if (value === Infinity) return null
  if (value === 0) return 250
  return units === 'imperial' ? Math.round(value * M_PER_MI) : Math.round(value * 1000)
}

// Convert stored meters into the unit the slider/format uses.
function metersToUnit(meters: number, units: string | null | undefined): number {
  return units === 'imperial' ? meters / M_PER_MI : meters / 1000
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
  const units = profile.units
  const STEPS = radiusSteps(units)
  const radius = profile.range == null ? Infinity : profile.range <= 250 ? 0 : snapRadius(metersToUnit(profile.range, units), STEPS)
  const radiusStep = Math.max(0, STEPS.indexOf(radius))
  const forMale = profile.is_for_male
  const forFemale = profile.is_for_female
  const genderDisplayValue = forMale && forFemale ? t('settings.genderBoth') : forMale ? t('settings.genderM') : t('settings.genderF')

  return (
    <View style={styles.section}>
      <SectionLabel>{t('settings.searchPreferences').toUpperCase()}</SectionLabel>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        <SelectFieldRow
          grouped
          label={t('settings.range')}
          displayValue={formatRadius(radius, units)}
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
        formatStep={i => formatRadius(STEPS[i], units)}
        onSave={async i => {
          update({ range: radiusToServer(STEPS[i], units) })
          await invoke('app/range', { range: radiusToServer(STEPS[i], units) })
          setRadiusPopupVisible(false)
        }}
        onDismiss={() => setRadiusPopupVisible(false)}
      />
      <AgeRangePopup
        visible={agePopupVisible}
        ageMin={ageMin} ageMax={ageMax}
        sliderMin={ageSliderMin} sliderMax={ageSliderMax}
        onSave={async (min, max) => {
          update({ age_from: min, age_to: max })
          await invoke('app/age', { age_from: min, age_to: max })
          setAgePopupVisible(false)
        }}
        onDismiss={() => setAgePopupVisible(false)}
      />
      <GenderPopup
        visible={genderPopupVisible}
        initialForMale={forMale ?? true}
        initialForFemale={forFemale ?? false}
        onSave={async (m, f) => {
          update({ is_for_male: m, is_for_female: f })
          await invoke('app/preferred_gender', { is_for_male: m, is_for_female: f })
          setGenderPopupVisible(false)
        }}
        onDismiss={() => setGenderPopupVisible(false)}
      />
    </View>
  )
}

// ── Preferences Tab ────────────────────────────────────────────────────────

function PreferencesTab({ onOpenSubPage: _onOpenSubPage }: { onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const { profile, update } = useUserStore()
  const [agePopupVisible, setAgePopupVisible] = useState(false)
  const [radiusPopupVisible, setRadiusPopupVisible] = useState(false)
  const [genderPopupVisible, setGenderPopupVisible] = useState(false)

  const age = profile?.birth_date ? calcAge(profile.birth_date) : 40
  const ageSliderMin = Math.max(18, age - 20)
  const ageSliderMax = Math.min(80, age + 20)

  if (!profile) return <View style={styles.tabContent} />

  const ageMin = Math.max(ageSliderMin, Math.min(profile.age_from, ageSliderMax))
  const ageMax = Math.max(ageMin, Math.min(ageSliderMax, Math.max(profile.age_to, ageSliderMin)))
  const units = profile.units
  const STEPS = radiusSteps(units)
  const radius = profile.range == null ? Infinity : profile.range <= 250 ? 0 : snapRadius(metersToUnit(profile.range, units), STEPS)
  const radiusStep = Math.max(0, STEPS.indexOf(radius))
  const forMale = profile.is_for_male
  const forFemale = profile.is_for_female
  const genderDisplayValue = forMale && forFemale ? t('settings.genderBoth') : forMale ? t('settings.genderM') : t('settings.genderF')

  return (
    <>
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">

      {/* Search Radius */}
      <View style={styles.section}>
        <SectionLabel>{t('settings.range').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={formatRadius(radius, units)}
          onPress={() => setRadiusPopupVisible(true)}
          icon={<MapPinIcon />}
        />
      </View>

      {/* Age Range */}
      <View style={styles.section}>
        <SectionLabel>{t('settings.ageRange').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={ageMin === ageMax ? `⁦${ageMin}⁩` : `⁦${ageMin} – ${ageMax}⁩`}
          onPress={() => setAgePopupVisible(true)}
          icon={<SlidersIcon />}
        />
      </View>

      {/* Preferred Gender */}
      <View style={styles.section}>
        <SectionLabel>{t('settings.preferredGender').toUpperCase()}</SectionLabel>
        <SelectFieldRow
          displayValue={genderDisplayValue}
          onPress={() => setGenderPopupVisible(true)}
          icon={<GenderIcon />}
        />
      </View>

    </ScrollView>
    <RadiusPopup
      visible={radiusPopupVisible}
      stepCount={STEPS.length}
      initialValue={radiusStep}
      formatStep={i => formatRadius(STEPS[i], units)}
      onSave={async i => {
        update({ range: radiusToServer(STEPS[i], units) })
        await invoke('app/range', { range: radiusToServer(STEPS[i], units) })
        setRadiusPopupVisible(false)
      }}
      onDismiss={() => setRadiusPopupVisible(false)}
    />
    <AgeRangePopup
      visible={agePopupVisible}
      ageMin={ageMin} ageMax={ageMax}
      sliderMin={ageSliderMin} sliderMax={ageSliderMax}
      onSave={async (min, max) => {
        update({ age_from: min, age_to: max })
        await invoke('app/age', { age_from: min, age_to: max })
        setAgePopupVisible(false)
      }}
      onDismiss={() => setAgePopupVisible(false)}
    />
    <GenderPopup
      visible={genderPopupVisible}
      initialForMale={forMale ?? true}
      initialForFemale={forFemale ?? false}
      onSave={async (m, f) => {
        update({ is_for_male: m, is_for_female: f })
        await invoke('app/preferred_gender', { is_for_male: m, is_for_female: f })
        setGenderPopupVisible(false)
      }}
      onDismiss={() => setGenderPopupVisible(false)}
    />
    </>
  )
}

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

function InfoIcon({ color = TEXT_PRIMARY }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="16" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12.01" y2="8" />
    </Svg>
  )
}

function UserIcon({ color = TEXT_PRIMARY }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </Svg>
  )
}

function AccountDetailsPopup({ visible, rows, onDismiss }: {
  visible: boolean
  rows: Array<{ label: string; value: string }>
  onDismiss: () => void
}) {
  const translateY = useSharedValue(400)
  const dragY = useSharedValue(0)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (visible) {
      dragY.value = 0
      translateY.value = withTiming(0, { duration: 280, easing: REasing.out(REasing.cubic) })
    } else {
      translateY.value = withTiming(400, { duration: 220, easing: REasing.in(REasing.cubic) })
    }
  }, [visible])

  const animatedDismiss = useCallback(() => {
    dragY.value = withTiming(400, { duration: 220 })
    translateY.value = withTiming(400, { duration: 220, easing: REasing.in(REasing.cubic) }, () => runOnJS(onDismiss)())
  }, [onDismiss])

  const swipeDismiss = Gesture.Pan()
    .onUpdate(e => { if (e.translationY > 0) dragY.value = e.translationY })
    .onEnd(e => {
      if (e.translationY > 80 || e.velocityY > 500) {
        dragY.value = withTiming(400, { duration: 200 })
        translateY.value = withTiming(400, { duration: 200 }, () => runOnJS(onDismiss)())
      } else {
        dragY.value = withTiming(0, { duration: 200 })
      }
    })

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={animatedDismiss}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={animatedDismiss}>
          <GestureDetector gesture={swipeDismiss}>
            <Animated.View
              style={[acctDetailsStyles.sheet, { paddingBottom: Math.max(insets.bottom, SINGLE) }, slideStyle]}
              onStartShouldSetResponder={() => true}
            >
              <View style={acctDetailsStyles.pill} />
              {rows.map((r, i) => (
                <React.Fragment key={r.label}>
                  {i > 0 && <View style={acctDetailsStyles.divider} />}
                  <View style={acctDetailsStyles.row}>
                    <Text style={acctDetailsStyles.label}>{r.label}</Text>
                    <Text style={acctDetailsStyles.value} numberOfLines={1}>{r.value}</Text>
                  </View>
                </React.Fragment>
              ))}
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  )
}

const acctDetailsStyles = StyleSheet.create({
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 0,
  },
  pill: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: GRAY_100,
    alignSelf: 'center', marginBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: DOUBLE, paddingVertical: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)',
    marginStart: DOUBLE,
  },
  label: { fontSize: 15, color: TEXT_PRIMARY, fontWeight: '500' },
  value: { fontSize: 15, color: GRAY_400, fontWeight: '400', flexShrink: 1, textAlign: isRTL ? 'left' : 'right', marginStart: 16 },
  detailField: { paddingHorizontal: DOUBLE, paddingVertical: 11 },
  detailLabel: { fontSize: 12, color: GRAY_400, fontWeight: '400', marginBottom: 2 },
  detailValue: { fontSize: 15, color: GRAY_400, fontWeight: '400' },
})

function formatBirthDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

// ── Account Popup ──────────────────────────────────────────────────────────

function AccountPopup({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { profile } = useUserStore()
  const { user, signOut } = useAuthStore()
  const router = useRouter()
  const [signOutDialog, setSignOutDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const translateY = useSharedValue(400)
  const dragY = useSharedValue(0)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (visible) {
      dragY.value = 0
      translateY.value = withTiming(0, { duration: 280, easing: REasing.out(REasing.cubic) })
    } else {
      translateY.value = withTiming(400, { duration: 220, easing: REasing.in(REasing.cubic) })
    }
  }, [visible])

  const animatedDismiss = useCallback(() => {
    dragY.value = withTiming(400, { duration: 220 })
    translateY.value = withTiming(400, { duration: 220, easing: REasing.in(REasing.cubic) }, () => runOnJS(onDismiss)())
  }, [onDismiss])

  const swipeDismiss = Gesture.Pan()
    .onUpdate(e => { if (e.translationY > 0) dragY.value = e.translationY })
    .onEnd(e => {
      if (e.translationY > 80 || e.velocityY > 500) {
        dragY.value = withTiming(400, { duration: 200 })
        translateY.value = withTiming(400, { duration: 200 }, () => runOnJS(onDismiss)())
      } else {
        dragY.value = withTiming(0, { duration: 200 })
      }
    })

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const signOutTap = useTapResponder(() => { tap(); setSignOutDialog(true) })
  const deleteTap = useTapResponder(() => { tapWarning(); setDeleteDialog(true) })

  if (!profile || !user) return null

  const age = profile.birth_date ? calcAge(profile.birth_date) : null
  const gender =
    profile.is_male === true  ? t('settings.male')
    : profile.is_male === false ? t('settings.female')
    : '—'

  const detailRows: Array<{ label: string; value: string }> = [
    { label: t('settings.name'),      value: profile.name ?? '—' },
    { label: t('settings.birthDate'), value: profile.birth_date ? `${formatBirthDate(profile.birth_date)} (${age})` : '—' },
    { label: t('settings.gender'),    value: gender },
    { label: t('settings.email'),     value: user.email ?? '—' },
  ]

  const finishAndGoToLogin = async () => {
    await signOut()
    router.replace('/login')
  }

  const onSignOutConfirmed = async () => {
    tap()
    setSignOutDialog(false)
    animatedDismiss()
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
    animatedDismiss()
    await finishAndGoToLogin()
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={animatedDismiss}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={animatedDismiss}>
            <GestureDetector gesture={swipeDismiss}>
              <Animated.View
                style={[acctDetailsStyles.sheet, { paddingBottom: Math.max(insets.bottom, SINGLE) }, slideStyle]}
                onStartShouldSetResponder={() => true}
              >
                <View style={acctDetailsStyles.pill} />
                {detailRows.map((r, i) => (
                  <React.Fragment key={r.label}>
                    {i > 0 && <View style={acctDetailsStyles.divider} />}
                    <View style={acctDetailsStyles.detailField}>
                      <Text style={acctDetailsStyles.detailLabel}>{r.label}</Text>
                      <Text style={acctDetailsStyles.detailValue} numberOfLines={1}>{r.value}</Text>
                    </View>
                  </React.Fragment>
                ))}
                <View style={[acctDetailsStyles.divider, { marginTop: 8, marginStart: 0 }]} />
                <View style={[acctDetailsStyles.row, { gap: 12 }]} {...signOutTap}>
                  <Text style={[acctDetailsStyles.label, { flex: 1 }]}>{tg('settings.signOut', profile.is_male)}</Text>
                  <SignOutIcon color="rgba(0,0,0,0.5)" />
                </View>
                <View style={acctDetailsStyles.divider} />
                <View style={[acctDetailsStyles.row, { gap: 12 }]} {...deleteTap}>
                  <Text style={[acctDetailsStyles.label, styles.accountActionTextDestructive, { flex: 1 }]}>{t('settings.deleteAccount')}</Text>
                  <TrashIcon color="rgba(180,60,60,0.5)" />
                </View>
              </Animated.View>
            </GestureDetector>
          </Pressable>
        </GestureHandlerRootView>
      </Modal>
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

// ── App Tab ────────────────────────────────────────────────────────────────

function AppTab({ onBack, onOpenSubPage: _onOpenSubPage }: { onBack?: () => void; onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const router = useRouter()
  const { profile, update } = useUserStore()
  const [resetting, setResetting] = useState(false)
  const [unitsPopupVisible, setUnitsPopupVisible] = useState(false)

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
    <>
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <View style={styles.accountLinksCard}>
          <SelectFieldRow
            grouped
            label={t('settings.unitsLabel')}
            displayValue={unitsDisplayValue}
            onPress={() => setUnitsPopupVisible(true)}
            icon={<RulerIcon />}
          />
          {profile.data?.role === 'ADMIN' && (
            <>
              <View style={styles.accountActionDivider} />
              <View
                style={[styles.accountActionRow, resetting && { opacity: 0.5 }]}
                {...(resetting ? {} : resetTap)}
              >
                <Text style={[styles.accountActionText, styles.accountActionTextDestructive]}>{t('settings.adminEntry')}</Text>
                <View style={{ flex: 1 }} />
                {resetting
                  ? <ActivityIndicator size={18} color="rgba(180,60,60,0.6)" />
                  : <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(180,60,60,0.6)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <Path d="M3 3v5h5" />
                    </Svg>
                }
              </View>
            </>
          )}
        </View>
      </View>
    </ScrollView>
    <OptionPopup
      visible={unitsPopupVisible}
      title={t('settings.unitsLabel')}
      initialValue={units}
      options={unitsOptions}
      onSave={async v => {
        update({ units: v })
        await invoke('app/units', { units: v })
        setUnitsPopupVisible(false)
      }}
      onDismiss={() => setUnitsPopupVisible(false)}
    />
    </>
  )
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
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <View style={styles.backBtn} />
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
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={spStyles.content}>
        <Text style={spStyles.displayValue}>{ageMin === ageMax ? `⁦${ageMin}⁩` : `⁦${ageMin} – ${ageMax}⁩`}</Text>
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

// ── Age Range Popup ────────────────────────────────────────────────────────
// Bottom-sheet modal with a horizontal range slider for editing the age preference.
// Changes are local until the user presses Save, which is the only path to the server.

function AgeRangePopup({
  visible, ageMin, ageMax, sliderMin, sliderMax, onSave, onDismiss,
}: {
  visible: boolean
  ageMin: number; ageMax: number
  sliderMin: number; sliderMax: number
  onSave: (min: number, max: number) => Promise<void>
  onDismiss: () => void
}) {
  const translateY = useSharedValue(400)
  const dragY = useSharedValue(0)
  const [modalVisible, setModalVisible] = useState(false)
  const cardHeight = useSharedValue(400)
  const [localMin, setLocalMin] = useState(ageMin)
  const [localMax, setLocalMax] = useState(ageMax)
  const localMinRef = useRef(ageMin)
  const localMaxRef = useRef(ageMax)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setLocalMin(ageMin); localMinRef.current = ageMin
      setLocalMax(ageMax); localMaxRef.current = ageMax
      setSaving(false)
      dragY.value = 0
      translateY.value = cardHeight.value
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 350, easing: REasing.out(REasing.cubic) })
      })
    } else {
      translateY.value = withTiming(cardHeight.value, { duration: 250, easing: REasing.in(REasing.cubic) }, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetY(-8)
    .onUpdate(e => {
      'worklet'
      dragY.value = Math.max(0, e.translationY)
    })
    .onEnd(e => {
      'worklet'
      if (e.translationY > 80 || e.velocityY > 800) {
        dragY.value = withTiming(cardHeight.value, { duration: 250, easing: REasing.in(REasing.cubic) })
        runOnJS(onDismiss)()
      } else {
        dragY.value = withTiming(0, { duration: 300, easing: REasing.out(REasing.cubic) })
      }
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(localMinRef.current, localMaxRef.current)
    } finally {
      setSaving(false)
    }
  }

  const displayValue = localMin === localMax ? `⁦${localMin}⁩` : `⁦${localMin} – ${localMax}⁩`

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={agePopupStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onDismiss} />
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[agePopupStyles.cardWrap, animStyle]}
              onLayout={e => { cardHeight.value = e.nativeEvent.layout.height }}
            >
              <View style={agePopupStyles.shadowGradient} pointerEvents="none">
                {[0.01,0.02,0.025,0.03,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.08,0.09,0.10,0.11,0.12,0.13,0.14,0.15].map((o, i) => (
                  <View key={i} style={[agePopupStyles.shadowLayer, { opacity: o }]} />
                ))}
              </View>
              <View style={agePopupStyles.card}>
                <View style={agePopupStyles.dragHandle} />
                <Text style={agePopupStyles.title}>{t('settings.ageRange')}</Text>
                <Text style={agePopupStyles.displayValue}>{displayValue}</Text>
                <View style={[agePopupStyles.sliderRow, { direction: 'ltr' }]}>
                  <Text style={agePopupStyles.endLabel}>{sliderMin}</Text>
                  <HorizontalRangeSlider
                    min={sliderMin} max={sliderMax}
                    valueMin={localMin} valueMax={localMax}
                    onChangeMin={v => { setLocalMin(v); localMinRef.current = v }}
                    onChangeMax={v => { setLocalMax(v); localMaxRef.current = v }}
                  />
                  <Text style={agePopupStyles.endLabel}>{sliderMax}</Text>
                </View>
                <Button
                  label={t('settings.save')}
                  onPress={handleSave}
                  variant="primary"
                  size="lg"
                  loading={saving}
                  disabled={saving}
                />
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const agePopupStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  cardWrap: {},
  shadowGradient: { height: 60, marginBottom: -1 },
  shadowLayer: { flex: 1, backgroundColor: BLACK },
  card: {
    backgroundColor: WHITE,
    padding: 24,
    paddingTop: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: GRAY_100,
    marginBottom: 16,
  },
  title: {
    fontSize: 17, fontWeight: '600', color: TEXT_PRIMARY,
    textAlign: 'center', marginBottom: 8,
  },
  displayValue: {
    fontSize: 36, fontWeight: '700', color: TEXT_PRIMARY,
    textAlign: 'center', letterSpacing: -0.5,
    marginBottom: 20,
  },
  sliderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 24,
  },
  endLabel: { fontSize: 13, fontWeight: '500', color: GRAY_400, minWidth: 24, textAlign: 'center' },
})

// ── Radius Popup ───────────────────────────────────────────────────────────
// Bottom-sheet modal with a horizontal step slider for the search radius.

function RadiusPopup({
  visible, stepCount, initialValue, formatStep, onSave, onDismiss,
}: {
  visible: boolean
  stepCount: number
  initialValue: number
  formatStep: (i: number) => string
  onSave: (stepIndex: number) => Promise<void>
  onDismiss: () => void
}) {
  const translateY = useSharedValue(400)
  const dragY = useSharedValue(0)
  const [modalVisible, setModalVisible] = useState(false)
  const cardHeight = useSharedValue(400)
  const [localValue, setLocalValue] = useState(initialValue)
  const localValueRef = useRef(initialValue)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setLocalValue(initialValue); localValueRef.current = initialValue
      setSaving(false)
      dragY.value = 0
      translateY.value = cardHeight.value
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 350, easing: REasing.out(REasing.cubic) })
      })
    } else {
      translateY.value = withTiming(cardHeight.value, { duration: 250, easing: REasing.in(REasing.cubic) }, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetY(-8)
    .onUpdate(e => { 'worklet'; dragY.value = Math.max(0, e.translationY) })
    .onEnd(e => {
      'worklet'
      if (e.translationY > 80 || e.velocityY > 800) {
        dragY.value = withTiming(cardHeight.value, { duration: 250, easing: REasing.in(REasing.cubic) })
        runOnJS(onDismiss)()
      } else {
        dragY.value = withTiming(0, { duration: 300, easing: REasing.out(REasing.cubic) })
      }
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try { await onSave(localValueRef.current) } finally { setSaving(false) }
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={agePopupStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onDismiss} />
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[agePopupStyles.cardWrap, animStyle]}
              onLayout={e => { cardHeight.value = e.nativeEvent.layout.height }}
            >
              <View style={agePopupStyles.shadowGradient} pointerEvents="none">
                {[0.01,0.02,0.025,0.03,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.08,0.09,0.10,0.11,0.12,0.13,0.14,0.15].map((o, i) => (
                  <View key={i} style={[agePopupStyles.shadowLayer, { opacity: o }]} />
                ))}
              </View>
              <View style={agePopupStyles.card}>
                <View style={agePopupStyles.dragHandle} />
                <Text style={agePopupStyles.title}>{t('settings.range')}</Text>
                <Text style={agePopupStyles.displayValue}>{formatStep(localValue)}</Text>
                <View style={[agePopupStyles.sliderRow, { direction: 'ltr' }]}>
                  <Text style={agePopupStyles.endLabel}>{formatStep(0)}</Text>
                  <HorizontalStepSlider
                    stepCount={stepCount}
                    value={localValue}
                    onChange={v => { setLocalValue(v); localValueRef.current = v }}
                  />
                  <Text style={agePopupStyles.endLabel}>{formatStep(stepCount - 1)}</Text>
                </View>
                <Button label={t('settings.save')} onPress={handleSave} variant="primary" size="lg" loading={saving} disabled={saving} />
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

// ── Gender Popup ───────────────────────────────────────────────────────────
// Bottom-sheet modal with Men/Women chips — each independently toggleable.
// At least one must remain selected.

function GenderPopup({
  visible, initialForMale, initialForFemale, onSave, onDismiss,
}: {
  visible: boolean
  initialForMale: boolean
  initialForFemale: boolean
  onSave: (forMale: boolean, forFemale: boolean) => Promise<void>
  onDismiss: () => void
}) {
  const translateY = useSharedValue(400)
  const dragY = useSharedValue(0)
  const [modalVisible, setModalVisible] = useState(false)
  const cardHeight = useSharedValue(400)
  const [localMale, setLocalMale] = useState(initialForMale)
  const [localFemale, setLocalFemale] = useState(initialForFemale)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setLocalMale(initialForMale)
      setLocalFemale(initialForFemale)
      setSaving(false)
      dragY.value = 0
      translateY.value = cardHeight.value
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 350, easing: REasing.out(REasing.cubic) })
      })
    } else {
      translateY.value = withTiming(cardHeight.value, { duration: 250, easing: REasing.in(REasing.cubic) }, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetY(-8)
    .onUpdate(e => { 'worklet'; dragY.value = Math.max(0, e.translationY) })
    .onEnd(e => {
      'worklet'
      if (e.translationY > 80 || e.velocityY > 800) {
        dragY.value = withTiming(cardHeight.value, { duration: 250, easing: REasing.in(REasing.cubic) })
        runOnJS(onDismiss)()
      } else {
        dragY.value = withTiming(0, { duration: 300, easing: REasing.out(REasing.cubic) })
      }
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try { await onSave(localMale, localFemale) } finally { setSaving(false) }
  }

  const toggleMale = () => {
    const next = !localMale
    if (!next && !localFemale) return
    setLocalMale(next)
  }

  const toggleFemale = () => {
    const next = !localFemale
    if (!next && !localMale) return
    setLocalFemale(next)
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={agePopupStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onDismiss} />
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[agePopupStyles.cardWrap, animStyle]}
              onLayout={e => { cardHeight.value = e.nativeEvent.layout.height }}
            >
              <View style={agePopupStyles.shadowGradient} pointerEvents="none">
                {[0.01,0.02,0.025,0.03,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.08,0.09,0.10,0.11,0.12,0.13,0.14,0.15].map((o, i) => (
                  <View key={i} style={[agePopupStyles.shadowLayer, { opacity: o }]} />
                ))}
              </View>
              <View style={agePopupStyles.card}>
                <View style={agePopupStyles.dragHandle} />
                <Text style={agePopupStyles.title}>{t('settings.preferredGender')}</Text>
                <View style={genderPopupStyles.chips}>
                  <AnimatedToggleButton
                    active={localMale}
                    label={t('settings.genderM')}
                    onPress={toggleMale}
                  />
                  <AnimatedToggleButton
                    active={localFemale}
                    label={t('settings.genderF')}
                    onPress={toggleFemale}
                  />
                </View>
                <Button label={t('settings.save')} onPress={handleSave} variant="primary" size="lg" loading={saving} disabled={saving} />
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const genderPopupStyles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 10, marginBottom: 24, marginTop: 8 },
})

// ── Option Popup (single-select) ───────────────────────────────────────────
// Generic single-select bottom sheet for units and similar one-of-N pickers.

function OptionPopup({
  visible, title, initialValue, options, onSave, onDismiss,
}: {
  visible: boolean
  title: string
  initialValue: string
  options: SelectOption[]
  onSave: (value: string) => Promise<void>
  onDismiss: () => void
}) {
  const translateY = useSharedValue(400)
  const dragY = useSharedValue(0)
  const [modalVisible, setModalVisible] = useState(false)
  const cardHeight = useSharedValue(400)
  const [localValue, setLocalValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setLocalValue(initialValue)
      setSaving(false)
      dragY.value = 0
      translateY.value = cardHeight.value
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 350, easing: REasing.out(REasing.cubic) })
      })
    } else {
      translateY.value = withTiming(cardHeight.value, { duration: 250, easing: REasing.in(REasing.cubic) }, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetY(-8)
    .onUpdate(e => { 'worklet'; dragY.value = Math.max(0, e.translationY) })
    .onEnd(e => {
      'worklet'
      if (e.translationY > 80 || e.velocityY > 800) {
        dragY.value = withTiming(cardHeight.value, { duration: 250, easing: REasing.in(REasing.cubic) })
        runOnJS(onDismiss)()
      } else {
        dragY.value = withTiming(0, { duration: 300, easing: REasing.out(REasing.cubic) })
      }
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try { await onSave(localValue) } finally { setSaving(false) }
  }

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={agePopupStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onDismiss} />
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[agePopupStyles.cardWrap, animStyle]}
              onLayout={e => { cardHeight.value = e.nativeEvent.layout.height }}
            >
              <View style={agePopupStyles.shadowGradient} pointerEvents="none">
                {[0.01,0.02,0.025,0.03,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.08,0.09,0.10,0.11,0.12,0.13,0.14,0.15].map((o, i) => (
                  <View key={i} style={[agePopupStyles.shadowLayer, { opacity: o }]} />
                ))}
              </View>
              <View style={agePopupStyles.card}>
                <View style={agePopupStyles.dragHandle} />
                <Text style={agePopupStyles.title}>{title}</Text>
                <View style={genderPopupStyles.chips}>
                  {options.map(opt => (
                    <AnimatedToggleButton
                      key={opt.value}
                      active={localValue === opt.value}
                      label={opt.label}
                      onPress={() => setLocalValue(opt.value)}
                    />
                  ))}
                </View>
                <Button label={t('settings.save')} onPress={handleSave} variant="primary" size="lg" loading={saving} disabled={saving} />
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
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
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <View style={styles.backBtn} />
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
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <View style={styles.backBtn} />
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
  const [detailsVisible, setDetailsVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Hook calls must be above the early return to keep count stable.
  const signOutTap = useTapResponder(() => { tap(); setSignOutDialog(true) })
  const deleteTap = useTapResponder(() => { tapWarning(); setDeleteDialog(true) })
  const detailsTap = useTapResponder(() => { tap(); setDetailsVisible(true) })

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

  const detailRows: Array<{ label: string; value: string }> = [
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
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false} delaysContentTouches={false} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <View style={styles.accountActionsCard}>
            <View style={styles.accountActionRow} {...detailsTap}>
              <Text style={[styles.accountActionText, { flex: 1 }]}>{t('settings.accountDetails')}</Text>
              <InfoIcon color="rgba(0,0,0,0.5)" />
            </View>
            <View style={styles.accountActionDivider} />
            <View style={styles.accountActionRow} {...signOutTap}>
              <Text style={[styles.accountActionText, { flex: 1 }]}>{tg('settings.signOut', profile.is_male)}</Text>
              <SignOutIcon color="rgba(0,0,0,0.5)" />
            </View>
            <View style={styles.accountActionDivider} />
            <View style={styles.accountActionRow} {...deleteTap}>
              <Text style={[styles.accountActionText, styles.accountActionTextDestructive, { flex: 1 }]}>{t('settings.deleteAccount')}</Text>
              <TrashIcon color="rgba(180,60,60,0.5)" />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
    <AccountDetailsPopup visible={detailsVisible} rows={detailRows} onDismiss={() => setDetailsVisible(false)} />
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

// ── Preview Field Page ───────────────────────────────────────────────────
// ── Add Options Popup ─────────────────────────────────────────────────────
// Bottom-sheet shown when the user taps "Add profile item". Lays out the
// available top-level categories as a tile grid (icon + label) rather than
// a flat list, so each entry reads as a discoverable action.

type AddOption = 'photo' | 'familyKids'

function AddPhotoIcon({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="5" width="18" height="14" rx="2" />
      <Circle cx="12" cy="12" r="3" />
      <Line x1="17.5" y1="3" x2="17.5" y2="7" />
      <Line x1="15.5" y1="5" x2="19.5" y2="5" />
    </Svg>
  )
}

function FamilyKidsIcon({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="7" cy="7" r="2.5" />
      <Path d="M3 19c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" />
      <Circle cx="17" cy="7" r="2.5" />
      <Path d="M13 19c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" />
      <Circle cx="12" cy="13" r="1.6" />
      <Path d="M9.5 19c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5" />
    </Svg>
  )
}

function AddOptionsPopup({
  visible, photoEnabled, onDismiss, onSelect,
}: {
  visible: boolean
  photoEnabled: boolean
  onDismiss: () => void
  onSelect: (option: AddOption) => void
}) {
  const translateY = useSharedValue(400)
  const dragY = useSharedValue(0)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (visible) {
      dragY.value = 0
      translateY.value = withTiming(0, { duration: 280, easing: REasing.out(REasing.cubic) })
    } else {
      translateY.value = withTiming(400, { duration: 220, easing: REasing.in(REasing.cubic) })
    }
  }, [visible])

  const swipeDismiss = Gesture.Pan()
    .onUpdate(e => { if (e.translationY > 0) dragY.value = e.translationY })
    .onEnd(e => {
      if (e.translationY > 80 || e.velocityY > 500) {
        dragY.value = withTiming(400, { duration: 200 })
        translateY.value = withTiming(400, { duration: 200 }, () => runOnJS(onDismiss)())
      } else {
        dragY.value = withTiming(0, { duration: 200 })
      }
    })

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={onDismiss}>
        <GestureDetector gesture={swipeDismiss}>
          <Animated.View
            style={[addPopupStyles.sheet, { paddingBottom: Math.max(insets.bottom, SINGLE) + SINGLE }, slideStyle]}
            onStartShouldSetResponder={() => true}
          >
            <View style={addPopupStyles.pill} />
            <View style={addPopupStyles.row}>
              <Pressable
                style={[addPopupStyles.tile, !photoEnabled && addPopupStyles.tileDisabled]}
                onPress={() => { if (photoEnabled) { tap(); onSelect('photo') } }}
              >
                <View style={addPopupStyles.iconWrap}>
                  <AddPhotoIcon color={photoEnabled ? PRIMARY : GRAY_400} />
                </View>
                <Text style={[addPopupStyles.tileLabel, !photoEnabled && addPopupStyles.tileLabelDisabled]}>
                  {t('settings.addPhoto')}
                </Text>
              </Pressable>
              <Pressable
                style={addPopupStyles.tile}
                onPress={() => { tap(); onSelect('familyKids') }}
              >
                <View style={addPopupStyles.iconWrap}>
                  <FamilyKidsIcon color={PRIMARY} />
                </View>
                <Text style={addPopupStyles.tileLabel}>{t('settings.addFamilyKids')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </GestureDetector>
      </Pressable>
    </Modal>
  )
}

const addPopupStyles = StyleSheet.create({
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: SINGLE,
  },
  pill: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: GRAY_100,
    alignSelf: 'center', marginBottom: SINGLE,
  },
  row: {
    flexDirection: 'row',
    gap: SINGLE,
  },
  tile: {
    flex: 1,
    backgroundColor: GRAY_50,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  tileDisabled: {
    opacity: 0.45,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: PRIMARY_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY,
  },
  tileLabelDisabled: {
    color: GRAY_400,
  },
})

// ── Photo edit popup ────────────────────────────────────────────────────────
// Bottom sheet shown when the user taps a photo on their own profile preview.
// Lays out four actions in a 2-row grid: Move up / Move down on top, then a
// full-width Replace, then a destructive-tinted Delete. Up/Down are disabled
// at the photo-list boundaries.

function ChevronUpIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 15 12 9 18 15" />
    </Svg>
  )
}

function ChevronDownIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 9 12 15 18 9" />
    </Svg>
  )
}

function PhotoReplaceIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 9h13l-3-3" />
      <Path d="M20 15H7l3 3" />
    </Svg>
  )
}

function PhotoTrashIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </Svg>
  )
}

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
  const translateY = useSharedValue(400)
  const dragY = useSharedValue(0)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (visible) {
      dragY.value = 0
      translateY.value = withTiming(0, { duration: 280, easing: REasing.out(REasing.cubic) })
    } else {
      translateY.value = withTiming(400, { duration: 220, easing: REasing.in(REasing.cubic) })
    }
  }, [visible])

  const swipeDismiss = Gesture.Pan()
    .onUpdate(e => { if (e.translationY > 0) dragY.value = e.translationY })
    .onEnd(e => {
      if (e.translationY > 80 || e.velocityY > 500) {
        dragY.value = withTiming(400, { duration: 200 })
        translateY.value = withTiming(400, { duration: 200 }, () => runOnJS(onDismiss)())
      } else {
        dragY.value = withTiming(0, { duration: 200 })
      }
    })

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={onDismiss}>
        <GestureDetector gesture={swipeDismiss}>
          <Animated.View
            style={[photoOptionsStyles.sheet, { paddingBottom: Math.max(insets.bottom, SINGLE) + SINGLE }, slideStyle]}
            onStartShouldSetResponder={() => true}
          >
            <View style={photoOptionsStyles.pill} />

            <View style={photoOptionsStyles.row}>
              <Pressable
                style={[photoOptionsStyles.tile, !canMoveUp && photoOptionsStyles.tileDisabled]}
                onPress={() => { if (canMoveUp) { tap(); onMoveUp() } }}
              >
                <ChevronUpIcon color={canMoveUp ? TEXT_PRIMARY : GRAY_400} />
                <Text style={[photoOptionsStyles.tileLabel, !canMoveUp && photoOptionsStyles.tileLabelDisabled]}>
                  {t('settings.photoEditMoveUp')}
                </Text>
              </Pressable>
              <Pressable
                style={[photoOptionsStyles.tile, !canMoveDown && photoOptionsStyles.tileDisabled]}
                onPress={() => { if (canMoveDown) { tap(); onMoveDown() } }}
              >
                <ChevronDownIcon color={canMoveDown ? TEXT_PRIMARY : GRAY_400} />
                <Text style={[photoOptionsStyles.tileLabel, !canMoveDown && photoOptionsStyles.tileLabelDisabled]}>
                  {t('settings.photoEditMoveDown')}
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={photoOptionsStyles.fullRow}
              onPress={() => { tap(); onReplace() }}
            >
              <PhotoReplaceIcon color={TEXT_PRIMARY} />
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
          </Animated.View>
        </GestureDetector>
      </Pressable>
    </Modal>
  )
}

const photoOptionsStyles = StyleSheet.create({
  sheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: SINGLE,
  },
  pill: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: GRAY_100,
    alignSelf: 'center', marginBottom: SINGLE,
  },
  row: {
    flexDirection: 'row',
    gap: SINGLE,
    marginBottom: SINGLE,
  },
  tile: {
    flex: 1,
    backgroundColor: GRAY_50,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileDisabled: {
    opacity: 0.5,
  },
  tileLabel: {
    fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY,
  },
  tileLabelDisabled: {
    color: GRAY_400,
  },
  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GRAY_50,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
    marginBottom: SINGLE,
  },
  fullRowLabel: {
    fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY,
  },
  destructiveRow: {
    backgroundColor: 'rgba(217,107,107,0.10)',
  },
  destructiveLabel: {
    color: DESTRUCTIVE,
  },
})

// Full-screen pane showing the user's profile card preview, opened from the
// profile tab via the sub-page mechanism.

export function PreviewFieldPage({
  config, onBack, dismissGestureRef, onScrollAtTop, headerBottomShared, clipBottom,
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
  const [addPopupVisible, setAddPopupVisible] = useState(false)
  const [photoPopupItemIndex, setPhotoPopupItemIndex] = useState<number | null>(null)
  // True when the user has made local edits that haven't been pushed to the
  // server yet. Toggles the bottom button between gray "Add profile item"
  // and coral "Save".
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // Tracks deferred uploads in flight so Save can await them before invoking
  // app/items (preventing the server from receiving a filename whose upload
  // has not yet landed in storage).
  const inFlightUploads = useRef(new Set<Promise<unknown>>())

  const pullCtx = useMemo<PullCtx | null>(() => dismissGestureRef ? {
    panRef: dismissGestureRef,
    extraRefs: [],
    setScrollAtTop: onScrollAtTop ?? (() => {}),
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
    const items = (profile.items ?? []).map(item => {
      if (item.kind !== 'photo' || !item.normal) return item
      return {
        ...item,
        normal: localPhotoUriCache.get(item.normal) ?? `${SUPABASE_URL}/storage/v1/object/public/users/${userId}/normal/${item.normal}`,
      }
    })
    return {
      user_id: profile.user_id,
      title,
      name,
      images,
      items,
      bio: profile.bio ?? '',
      is_for_kids: profile.is_for_kids ?? null,
      is_male: profile.is_male ?? undefined,
      distance: 0,
      last_seen: new Date().toISOString(),
    }
  }, [profile, user?.id])

  const photoAddEnabled = (profile?.images?.length ?? 0) < 6

  // Photo positions inside the items array, used to compute Up/Down enablement
  // and to swap with the previous / next photo without disturbing non-photo items.
  const photoIndicesInItems = useMemo(() => {
    const items = profile?.items ?? []
    const out: number[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'photo' && (items[i] as { normal?: string }).normal) out.push(i)
    }
    return out
  }, [profile?.items])

  const popupItem = photoPopupItemIndex != null ? profile?.items?.[photoPopupItemIndex] : null
  const popupPhotoOrdinal = photoPopupItemIndex != null
    ? photoIndicesInItems.indexOf(photoPopupItemIndex)
    : -1
  const canMoveUp = popupPhotoOrdinal > 0
  const canMoveDown = popupPhotoOrdinal >= 0 && popupPhotoOrdinal < photoIndicesInItems.length - 1
  const photoCount = photoIndicesInItems.length

  // Mutates items locally, sets dirty=true. Save sends the latest items to
  // the server. The userStore's `pending` map protects items from realtime
  // overwrite until the server echo confirms.
  const commitItems = (nextItems: ProfileItem[]) => {
    update({ items: nextItems })
    setDirty(true)
  }

  const swapAt = (a: number, b: number) => {
    const items = profile?.items
    if (!items || a < 0 || b < 0 || a >= items.length || b >= items.length) return
    const next = [...items]
    ;[next[a], next[b]] = [next[b], next[a]]
    commitItems(next)
  }

  const handleMoveUp = () => {
    if (popupPhotoOrdinal <= 0) return
    const from = photoIndicesInItems[popupPhotoOrdinal]
    const to = photoIndicesInItems[popupPhotoOrdinal - 1]
    setPhotoPopupItemIndex(null)
    swapAt(from, to)
  }

  const handleMoveDown = () => {
    if (popupPhotoOrdinal < 0 || popupPhotoOrdinal >= photoIndicesInItems.length - 1) return
    const from = photoIndicesInItems[popupPhotoOrdinal]
    const to = photoIndicesInItems[popupPhotoOrdinal + 1]
    setPhotoPopupItemIndex(null)
    swapAt(from, to)
  }

  const handleDelete = () => {
    if (photoPopupItemIndex == null || !profile?.items) return
    if (photoCount <= 1) {
      // Last photo guard: the profile must have at least one photo. Bounce
      // the popup but keep the item.
      setPhotoPopupItemIndex(null)
      return
    }
    const target = profile.items[photoPopupItemIndex] as { normal?: string }
    const filename = target?.normal
    setPhotoPopupItemIndex(null)
    if (filename) {
      localPhotoUriCache.delete(filename)
      pendingDeferred.delete(filename)
    }
    const next = profile.items.filter((_, i) => i !== photoPopupItemIndex)
    commitItems(next)
  }

  const handleReplace = async () => {
    if (photoPopupItemIndex == null || !user || !profile?.items) return
    const targetIndex = photoPopupItemIndex
    setPhotoPopupItemIndex(null)
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

    // Deferred upload: assign filename + prime localPhotoUriCache synchronously
    // so the new photo shows immediately, then upload in the background. Save
    // awaits the `uploaded` promise via inFlightUploads before invoking app/items.
    const { filename, uploaded } = processAndUploadPhotoDeferred(asset.uri, userId, token)

    // Commit the new filename to items immediately. hash is empty until the
    // upload completes; we patch it in when the promise resolves.
    const current = useUserStore.getState().profile
    if (current?.items) {
      const oldItem = current.items[targetIndex]
      const oldFilename = oldItem && oldItem.kind === 'photo' ? oldItem.normal : undefined
      const next = [...current.items]
      next[targetIndex] = { kind: 'photo', normal: filename, hash: '' }
      if (oldFilename) {
        localPhotoUriCache.delete(oldFilename)
        pendingDeferred.delete(oldFilename)
      }
      useUserStore.getState().update({ items: next })
      setDirty(true)
    }

    const tracker = uploaded
      .then(hash => {
        // Patch hash on the (possibly reordered) item now that it landed.
        const latest = useUserStore.getState().profile
        if (!latest?.items) return
        const idx = latest.items.findIndex(it => it.kind === 'photo' && (it as { normal?: string }).normal === filename)
        if (idx < 0) return
        const next = [...latest.items]
        next[idx] = { kind: 'photo', normal: filename, hash }
        useUserStore.getState().update({ items: next })
      })
      .catch(e => {
        console.error('Photo replace upload error:', e)
        // Roll back the items patch so the user can retry.
        const latest = useUserStore.getState().profile
        if (!latest?.items) return
        const next = latest.items.filter(it => !(it.kind === 'photo' && (it as { normal?: string }).normal === filename))
        useUserStore.getState().update({ items: next })
      })
    inFlightUploads.current.add(tracker)
    tracker.finally(() => inFlightUploads.current.delete(tracker))
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      // Wait for any in-flight replace uploads to finish so the items list
      // we send references files that actually exist in storage.
      if (inFlightUploads.current.size > 0) {
        await Promise.all(Array.from(inFlightUploads.current))
      }
      const finalItems = useUserStore.getState().profile?.items ?? []
      await invoke('app/items', { items: finalItems })
      setDirty(false)
    } catch (e) {
      console.error('Save items error:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View onLayout={e => {
        if (headerBottomShared) headerBottomShared.value = e.nativeEvent.layout.y + e.nativeEvent.layout.height
      }}>
        <View style={styles.header}>
          <View style={styles.backBtn} />
          <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
          <IconPressable style={styles.backBtn} onPress={onBack}>
            <CloseIcon />
          </IconPressable>
        </View>
        <Text style={styles.previewHint}>{t('settings.myProfileHint')}</Text>
      </View>
      {previewData ? (
        <View style={{ flex: 1 }}>
          <View style={[styles.previewWrap, { marginBottom: 0 }]}>
            <View style={styles.previewOuter}>
              <View style={styles.previewInner}>
                <PullContext.Provider value={pullCtx}>
                  <MatchCard
                    match={previewData}
                    userIsMale={previewData.is_male ?? null}
                    bottomInset={0}
                    onPhotoTap={(itemIndex) => {
                      if (itemIndex < 0) return
                      tap()
                      setPhotoPopupItemIndex(itemIndex)
                    }}
                  />
                </PullContext.Provider>
              </View>
            </View>
          </View>
          <View style={{ paddingHorizontal: SINGLE, paddingTop: SINGLE, paddingBottom: Math.max(insets.bottom, SINGLE) }}>
            {dirty ? (
              <Button
                label={t('settings.save')}
                variant="primary"
                tone="positive"
                loading={saving}
                onPress={handleSave}
              />
            ) : (
              <Button
                label={t('settings.addProfileItem')}
                variant="secondary"
                onPress={() => setAddPopupVisible(true)}
              />
            )}
          </View>
        </View>
      ) : null}
      <AddOptionsPopup
        visible={addPopupVisible}
        photoEnabled={photoAddEnabled}
        onDismiss={() => setAddPopupVisible(false)}
        onSelect={() => setAddPopupVisible(false)}
      />
      <PhotoOptionsPopup
        visible={photoPopupItemIndex != null && popupItem?.kind === 'photo'}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onDismiss={() => setPhotoPopupItemIndex(null)}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onReplace={handleReplace}
        onDelete={handleDelete}
      />
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
        <IconPressable style={styles.backBtn} onPress={onBack}>
          <BackIcon />
        </IconPressable>
        <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
        <View style={styles.backBtn} />
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
  if (config.kind === 'account')  return <AccountFieldPage  config={config} onBack={onBack} />
  if (config.kind === 'preview')  return <PreviewFieldPage  config={config} onBack={onBack} />
  if (config.kind === 'about')    return <AboutFieldPage    config={config} onBack={() => onBack()} />
  if (config.kind === 'admin')    return <AdminFieldPage    config={config} onBack={() => onBack()} />
  if (config.kind === 'select')   return <SelectFieldPage   config={config} onBack={onBack} />
  return null
}

// ── Section Page Shell ─────────────────────────────────────────────────────
// Shared navigation logic for ProfileSectionPage and AppSectionPage.
// Inner sub-page slides in as a pure overlay on top of the stationary section
// content — matches how the shell's settings overlay sits over a stationary home.

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

  // Inner sub-page slides in from the start edge as a pure overlay.
  // Section content stays stationary beneath it.
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

  return { subConfig, openInner, closeInner, subPageSlideStyle }
}

function runAfter(after: () => Promise<void> | void) {
  Promise.resolve(after()).catch(console.error)
}

// ── App Section Page ───────────────────────────────────────────────────────

export function AppSectionPage({ config, onBack }: { config: AppSectionFieldConfig; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const { subConfig, openInner, closeInner, subPageSlideStyle } = useSectionNav()

  return (
    <View style={[styles.rootOuter, styles.root, { paddingTop: insets.top, overflow: 'hidden' }]}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <IconPressable style={styles.backBtn} onPress={onBack}>
            <BackIcon />
          </IconPressable>
          <Text style={styles.subPageHeaderTitle}>{config.title}</Text>
          <View style={styles.backBtn} />
        </View>
        <AppTab onBack={onBack} onOpenSubPage={openInner} />
      </View>
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

// ── App Inline Content ─────────────────────────────────────────────────────

function AppInlineContent({ onBack, onOpenSubPage: _onOpenSubPage }: { onBack?: () => void; onOpenSubPage?: (config: SubPageConfig) => Promise<void> }) {
  const router = useRouter()
  const { profile, update } = useUserStore()
  const [resetting, setResetting] = useState(false)
  const [unitsPopupVisible, setUnitsPopupVisible] = useState(false)
  const [accountPopupVisible, setAccountPopupVisible] = useState(false)

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

  if (!profile) return null

  const units = profile.units ?? 'metric'
  const unitsOptions: SelectOption[] = [
    { value: 'metric',   label: t('settings.unitsMetricDesc')   },
    { value: 'imperial', label: t('settings.unitsImperialDesc') },
  ]
  const unitsDisplayValue = unitsOptions.find(o => o.value === units)?.label ?? t('settings.unitsMetricDesc')

  return (
    <>
      <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
        <SelectFieldRow
          grouped
          label={t('settings.unitsLabel')}
          displayValue={unitsDisplayValue}
          onPress={() => setUnitsPopupVisible(true)}
          icon={<RulerIcon />}
        />
        <View style={styles.accountActionDivider} />
        <SelectFieldRow
          grouped
          label={t('settings.account')}
          onPress={() => setAccountPopupVisible(true)}
          icon={<UserIcon color={GRAY_400} />}
        />
        {profile.data?.role === 'ADMIN' && (
          <>
            <View style={styles.accountActionDivider} />
            <View
              style={[styles.accountActionRow, resetting && { opacity: 0.5 }]}
              {...(resetting ? {} : resetTap)}
            >
              <Text style={[styles.accountActionText, styles.accountActionTextDestructive]}>{t('settings.adminEntry')}</Text>
              <View style={{ flex: 1 }} />
              {resetting
                ? <ActivityIndicator size={18} color="rgba(180,60,60,0.6)" />
                : <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(180,60,60,0.6)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <Path d="M3 3v5h5" />
                  </Svg>
              }
            </View>
          </>
        )}
      </View>
      <OptionPopup
        visible={unitsPopupVisible}
        title={t('settings.unitsLabel')}
        initialValue={units}
        options={unitsOptions}
        onSave={async v => {
          update({ units: v })
          await invoke('app/units', { units: v })
          setUnitsPopupVisible(false)
        }}
        onDismiss={() => setUnitsPopupVisible(false)}
      />
      <AccountPopup visible={accountPopupVisible} onDismiss={() => setAccountPopupVisible(false)} />
    </>
  )
}

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
          <IconPressable
            style={styles.backBtn}
            onPress={() => { tap(); onBack ? onBack() : router.back() }}
          >
            <BackIcon />
          </IconPressable>
          <Text style={styles.subPageHeaderTitle}>{t('settings.preferences')}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          style={styles.tabScroll}
          contentContainerStyle={[styles.tabContent, { paddingTop: 0 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          delaysContentTouches={false}
        >
          <View style={[styles.accountLinksCard, { marginBottom: 0 }]}>
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
            <AppInlineContent onBack={onBack} onOpenSubPage={onOpenSubPage} />
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

  previewHint: {
    textAlign: 'center',
    color: GRAY_400,
    fontSize: 13,
    paddingHorizontal: SINGLE,
    marginTop: -4,
    marginBottom: 10,
  },
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
