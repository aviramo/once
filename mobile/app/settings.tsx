import { useState, useEffect, useRef } from 'react'
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  PanResponder, I18nManager, TextInput, Image, ActivityIndicator,
  Keyboard, Platform, Animated, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Slider from '@react-native-community/slider'
import * as DocumentPicker from 'expo-document-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import Svg, { Path, Line, Polyline, Circle } from 'react-native-svg'
import { supabase } from '../src/lib/supabase'
import { invoke } from '../src/lib/api'
import { tap, tapMedium, tapSuccess, tapWarning } from '../src/lib/haptics'
import { useUserStore } from '../src/stores/userStore'
import { useAuthStore } from '../src/stores/authStore'
import { t, tg } from '../src/i18n'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { Button } from '../src/components/Button'

const isRTL = I18nManager.isRTL
const THUMB = 22
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

// Module-level flag flipped by sliders while their thumb is being dragged.
// The settings tab pager checks this in its onMoveShouldSetPanResponder so
// it doesn't steal horizontal gestures away from a slider mid-drag. Module
// scope is fine here because only one slider can be dragged at a time and
// only the in-page pager reads it.
const slidingActiveRef = { current: false }

// ── Back Icon ──────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Svg>
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
        <View style={[rs.thumb, { start: `${minPct * 100}%`, transform: [{ translateX: -THUMB / 2 }] }]} {...minPan.panHandlers} />
        <View style={[rs.thumb, { start: `${maxPct * 100}%`, transform: [{ translateX: -THUMB / 2 }] }]} {...maxPan.panHandlers} />
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
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

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <Pressable onPress={handlePress}>
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {/* Inactive layer — always rendered underneath */}
          <View style={{ backgroundColor: 'rgba(0,0,0,0.06)', paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: 'rgba(0,0,0,0.5)' }}>{label}</Text>
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
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>{label}</Text>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

// ── Preferences Tab ────────────────────────────────────────────────────────

function PreferencesTab() {
  const { profile, update } = useUserStore()

  const age = profile?.birth_date ? calcAge(profile.birth_date) : 40
  const ageSliderMin = Math.max(18, age - 20)
  const ageSliderMax = Math.min(80, age + 20)

  useAutoSave({
    age_from: profile?.age_from ?? 18,
    age_to: profile?.age_to ?? 80,
    range: profile?.range ?? 0,
    preferred_gender: profile?.is_for_male && profile?.is_for_female ? 'B' : profile?.is_for_male ? 'M' : 'F',
  }, !!profile)

  if (!profile) return <View style={styles.tabContent} />

  const ageMin = Math.max(ageSliderMin, Math.min(profile.age_from, ageSliderMax - 1))
  const ageMax = Math.min(ageSliderMax, Math.max(profile.age_to, ageSliderMin + 1))
  const radius = profile.range >= 100_000_000 ? Infinity : profile.range <= 250 ? 0 : snapRadius(profile.range / 1000)
  const forMale = profile.is_for_male
  const forFemale = profile.is_for_female

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>

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
              onChangeMin={v => update({ age_from: v })} onChangeMax={v => update({ age_to: v })}
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
        <View
          onTouchStart={() => { slidingActiveRef.current = true }}
          onTouchEnd={() => { slidingActiveRef.current = false }}
          onTouchCancel={() => { slidingActiveRef.current = false }}
        >
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={RADIUS_STEPS.length - 1}
            step={1}
            value={RADIUS_STEPS.indexOf(radius) < 0 ? 0 : RADIUS_STEPS.indexOf(radius)}
            onValueChange={i => update({ range: radiusToServer(RADIUS_STEPS[Math.round(i)]) })}
            minimumTrackTintColor="#111"
            maximumTrackTintColor="rgba(0,0,0,0.15)"
            thumbTintColor="#111"
          />
        </View>
      </View>

      {/* Preferred Gender */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('settings.preferredGender').toUpperCase()}</Text>
        <View style={styles.genderRow}>
          <AnimatedToggleButton
            active={!!forMale}
            label={t('settings.genderM')}
            onPress={() => { if (forFemale || !forMale) update({ is_for_male: !forMale }) }}
          />
          <AnimatedToggleButton
            active={!!forFemale}
            label={t('settings.genderF')}
            onPress={() => { if (forMale || !forFemale) update({ is_for_female: !forFemale }) }}
          />
        </View>
      </View>

    </ScrollView>
  )
}

// ── Profile Tab ────────────────────────────────────────────────────────────

// Module-level cache of URIs already loaded at least once in this app session.
// React Native Image caches bytes to disk, but the component still runs a load
// cycle on re-mount which shows a spinner. Tracking loaded URIs here lets us
// skip the spinner entirely when the user navigates back to the screen.
const loadedUris = new Set<string>()

function PhotoCell({
  uri, localUri, onRemove, onLoaded, canRemove, panHandlers, dragging, highlighted, onLayout,
}: {
  uri: string
  localUri?: string  // Shown immediately while uri is loading, to avoid layout jitter
  onRemove: () => void
  onLoaded?: () => void
  canRemove: boolean
  panHandlers?: any
  dragging?: boolean
  highlighted?: boolean  // Live drop-target indicator during another cell's drag
  onLayout?: (e: any) => void
}) {
  const [loaded, setLoaded] = useState(() => loadedUris.has(uri))
  return (
    <View
      style={photoStyles.cell}
      onLayout={onLayout}
      {...panHandlers}
    >
      {/* Local preview shown at full opacity until server image loads — no layout shift, no gray square */}
      {localUri && !loaded && (
        <Image source={{ uri: localUri }} style={[photoStyles.img, { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 }]} />
      )}
      <Image
        source={{ uri }}
        style={[photoStyles.img, !loaded && { opacity: 0 }]}
        onLoad={() => { loadedUris.add(uri); setLoaded(true); onLoaded?.() }}
      />
      {!loaded && (
        <View style={photoStyles.spinnerBadge}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      )}
      {/* Black border indicator — drawn under the X button so the button stays tappable. */}
      {/* `dragging` = this is the source photo being held. */}
      {/* `highlighted` = this cell is the current drop target. Both get the same frame. */}
      {(dragging || highlighted) && <View pointerEvents="none" style={photoStyles.dropTarget} />}
      {loaded && canRemove && (
        <Pressable style={photoStyles.remove} onPress={() => { tap(); onRemove() }}>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round">
            <Line x1="18" y1="6" x2="6" y2="18" />
            <Line x1="6" y1="6" x2="18" y2="18" />
          </Svg>
        </Pressable>
      )}
    </View>
  )
}

// Draggable photo grid — long-press to lift, drag to reorder
function PhotoGrid({
  photos, urlFor, onRemove, onLoaded, onReorder, canRemove, uploads, additionalChildren, onDragStateChange,
}: {
  photos: string[]
  urlFor: (f: string) => string
  onRemove: (f: string) => void
  onLoaded: (f: string) => void
  onReorder: (from: number, to: number) => void
  canRemove: boolean
  uploads: { id: string; uri: string; filename?: string }[]
  additionalChildren?: React.ReactNode
  onDragStateChange?: (dragging: boolean) => void
}) {
  const layouts = useRef<Array<{ x: number; y: number; w: number; h: number }>>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  // Live "where the photo would land if released now" — a black frame on the
  // nearest cell tells the user what a release will swap with.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const hoverIdxRef = useRef<number | null>(null)

  // Refs for values the PanResponder closures need to read freshly — we bind
  // them via refs because the PanResponders themselves are created once per
  // index and retained, so direct closures would go stale.
  const photosLenRef = useRef(photos.length)
  const onReorderRef = useRef(onReorder)
  const onDragStateChangeRef = useRef(onDragStateChange)
  useEffect(() => { photosLenRef.current = photos.length }, [photos.length])
  useEffect(() => { onReorderRef.current = onReorder }, [onReorder])
  useEffect(() => { onDragStateChangeRef.current = onDragStateChange }, [onDragStateChange])

  // Stable PanResponder per cell index. Re-creating PanResponder mid-gesture
  // (which happened on every setHoverIdx re-render) resets its internal
  // gestureState, so subsequent move events report dx/dy relative to the new
  // instance's grant — effectively collapsing back toward 0. The symptom the
  // user reported — "the target frame disappears while moving" — was that: a
  // fresh PanResponder would read g.dx ≈ 0, recompute the nearest target as
  // the source itself, and null out hoverIdx. Pinning them across renders
  // keeps the gestureState alive for the whole drag.
  const pansRef = useRef<Array<ReturnType<typeof PanResponder.create>>>([])
  const ensurePanAt = (index: number) => {
    if (pansRef.current[index]) return pansRef.current[index]
    pansRef.current[index] = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderTerminationRequest: () => false,  // never let parent take over
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        tapMedium()
        setDragIdx(index)
        onDragStateChangeRef.current?.(true)
      },
      // No floating preview — we just need the gesture's dx/dy to compute
      // which cell the finger is hovering over. Nearest-by-center.
      onPanResponderMove: (_, g) => {
        const l = layouts.current[index]
        if (!l) return
        const cx = l.x + l.w / 2 + g.dx
        const cy = l.y + l.h / 2 + g.dy
        let best = -1
        let bestDist = Infinity
        for (let i = 0; i < layouts.current.length; i++) {
          const li = layouts.current[i]
          if (!li) continue
          const dx = (li.x + li.w / 2) - cx
          const dy = (li.y + li.h / 2) - cy
          const d = dx * dx + dy * dy
          if (d < bestDist) { bestDist = d; best = i }
        }
        const normalized = best < 0 || best === index ? null : best
        if (normalized !== hoverIdxRef.current) {
          hoverIdxRef.current = normalized
          setHoverIdx(normalized)
        }
      },
      onPanResponderRelease: () => {
        // The highlighted target is the same cell the user sees framed, so
        // the drop matches the hint exactly.
        const target = hoverIdxRef.current
        if (target !== null && target >= 0 && target < photosLenRef.current && target !== index) {
          tapSuccess()
          onReorderRef.current(index, target)
        }
        setDragIdx(null)
        setHoverIdx(null)
        hoverIdxRef.current = null
        onDragStateChangeRef.current?.(false)
      },
      onPanResponderTerminate: () => {
        setDragIdx(null)
        setHoverIdx(null)
        hoverIdxRef.current = null
        onDragStateChangeRef.current?.(false)
      },
    })
    return pansRef.current[index]
  }

  return (
    <View style={photoStyles.grid}>
      {photos.map((filename, i) => {
        // If there's an upload matching this filename, show its local preview under the spinner
        const matchingUpload = uploads.find(u => u.filename === filename)
        const pan = ensurePanAt(i)
        return (
          <PhotoCell
            key={filename}
            uri={urlFor(filename)}
            localUri={matchingUpload?.uri}
            onRemove={() => onRemove(filename)}
            onLoaded={() => onLoaded(filename)}
            canRemove={canRemove}
            panHandlers={pan.panHandlers}
            dragging={dragIdx === i}
            highlighted={hoverIdx === i}
            onLayout={(e) => { layouts.current[i] = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y, w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height } }}
          />
        )
      })}
      {/* Pending uploads without a filename yet (still uploading) */}
      {uploads.filter(u => !u.filename).map(u => (
        <View key={u.id} style={photoStyles.cell}>
          <Image source={{ uri: u.uri }} style={photoStyles.img} />
          <View style={photoStyles.spinnerBadge}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        </View>
      ))}
      {additionalChildren}
    </View>
  )
}

function ProfileTab() {
  const { profile, update } = useUserStore()
  const { user } = useAuthStore()
  // filename is set when upload is done; we keep the upload card until the server image loads
  const [uploads, setUploads] = useState<{ id: string; uri: string; filename?: string; sig: string }[]>([])
  // filename → signature map, persists across the session even after upload cell disappears
  const sigByFilename = useRef<Map<string, string>>(new Map())
  const [dragging, setDragging] = useState(false)
  const [duplicateDialog, setDuplicateDialog] = useState(false)
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

  const uploadFile = async (uri: string, filename: string, contentType: string, variant: 'normal' | 'blur', token: string) => {
    const formData = new FormData()
    formData.append('', { uri, name: filename, type: contentType } as any)
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/users/${user!.id}/${variant}/${filename}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-upsert': 'true' },
        body: formData,
      }
    )
    if (!res.ok) throw new Error(await res.text())
  }

  // Compress the image to JPEG under 200K by resizing + iterating compression quality.
  const compressUnder200K = async (uri: string): Promise<string> => {
    const MAX_BYTES = 200 * 1024
    const widths = [1080, 900, 720, 540]
    const qualities = [0.8, 0.6, 0.45, 0.3]
    for (const w of widths) {
      for (const q of qualities) {
        const out = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: w } }],
          { compress: q, format: ImageManipulator.SaveFormat.JPEG }
        )
        const size = (await (await fetch(out.uri)).blob()).size
        if (size <= MAX_BYTES) return out.uri
      }
    }
    // Last resort — smallest size
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 480 } }],
      { compress: 0.25, format: ImageManipulator.SaveFormat.JPEG }
    )
    return out.uri
  }

  const uploadOne = async (asset: DocumentPicker.DocumentPickerAsset) => {
    if (!user) return null
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`

    const [normalUri, blurred] = await Promise.all([
      compressUnder200K(asset.uri),
      ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 32 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      ),
    ])

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    await uploadFile(normalUri, filename, 'image/jpeg', 'normal', token)
    await uploadFile(blurred.uri, filename, 'image/jpeg', 'blur', token)
    return filename
  }

  const pickPhoto = async () => {
    if (!user || photos.length >= 6) return
    const maxPick = 6 - photos.length
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: false,
      multiple: true,
    })
    if (result.canceled || !result.assets?.length) return

    const sigFor = (a: DocumentPicker.DocumentPickerAsset) => `${a.name ?? ''}|${a.size ?? 0}`

    // All signatures currently in use: completed uploads + in-progress uploads
    const existingSigs = new Set<string>([
      ...Array.from(sigByFilename.current.values()),
      ...uploads.map(u => u.sig),
    ])

    // Filter out duplicates: within this batch AND against existing
    const seenThisBatch = new Set<string>()
    const filtered = result.assets.filter(a => {
      const s = sigFor(a)
      if (existingSigs.has(s) || seenThisBatch.has(s)) return false
      seenThisBatch.add(s)
      return true
    })

    const skipped = result.assets.length - filtered.length
    if (skipped > 0) setDuplicateDialog(true)
    if (filtered.length === 0) return

    const assets = filtered.slice(0, maxPick)
    const newUploads = assets.map((a, i) => ({
      id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      uri: a.uri,
      sig: sigFor(a),
    }))
    setUploads(prev => [...prev, ...newUploads])

    // Upload each asset; when done, attach filename to upload AND add to photos.
    // The upload card stays visible until the server image in PhotoCell loads (onLoaded).
    for (let i = 0; i < assets.length; i++) {
      try {
        const filename = await uploadOne(assets[i])
        if (filename) {
          sigByFilename.current.set(filename, newUploads[i].sig)
          setUploads(prev => prev.map(u => u.id === newUploads[i].id ? { ...u, filename } : u))
          const current = useUserStore.getState().profile?.images?.normal ?? []
          update({ images: { normal: [...current, filename], blur: [...current, filename] } })
        } else {
          setUploads(prev => prev.filter(u => u.id !== newUploads[i].id))
        }
      } catch (e: any) {
        console.error('Photo upload error:', e)
        setUploads(prev => prev.filter(u => u.id !== newUploads[i].id))
      }
    }
  }

  const removePhoto = async (filename: string) => {
    if (!user) return
    if (photos.length <= 1) return  // must keep at least one photo
    await supabase.storage.from('users').remove([
      `${user.id}/normal/${filename}`,
      `${user.id}/blur/${filename}`,
    ])
    // Release the signature so the user can re-pick the same file later
    sigByFilename.current.delete(filename)
    const newPhotos = photos.filter(f => f !== filename)
    update({ images: { normal: newPhotos, blur: newPhotos } })
  }

  const reorderPhotos = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return
    // Pure swap — only the two cells exchange positions, the rest stay put.
    const next = [...photos]
    ;[next[from], next[to]] = [next[to], next[from]]
    update({ images: { normal: next, blur: next } })
  }

  const onPhotoLoaded = (filename: string) => {
    setUploads(prev => prev.filter(u => u.filename !== filename))
  }

  return (
    <>
    <ScrollView
      ref={scrollRef}
      // Pad the bottom by the live keyboard height so the scroll has somewhere
      // to go: without it, on short-content tabs scrollTo would clamp before
      // the section reaches the top of the visible area.
      contentContainerStyle={[styles.tabContent, { paddingBottom: 40 + keyboardHeight }]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!dragging}
      keyboardShouldPersistTaps="handled"
    >

      <Pressable style={({ pressed }) => [styles.previewBtn, pressed && { opacity: 0.7 }]} onPress={tap}>
        <Text style={styles.previewBtnText}>{t('settings.previewProfile')}</Text>
      </Pressable>

      <View style={[styles.section, { marginTop: 24 }]}>
        <Text style={styles.sectionLabel}>{t('settings.photo').toUpperCase()}</Text>
        <PhotoGrid
          photos={photos}
          urlFor={(f) => `${SUPABASE_URL}/storage/v1/object/public/users/${user!.id}/normal/${f}`}
          onRemove={removePhoto}
          onLoaded={onPhotoLoaded}
          onReorder={reorderPhotos}
          canRemove={photos.length > 1}
          uploads={uploads}
          onDragStateChange={setDragging}
          additionalChildren={
            photos.length + uploads.filter(u => !u.filename).length < 6 ? (
              <Pressable style={photoStyles.add} onPress={() => { tap(); pickPhoto() }}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={1.5} strokeLinecap="round">
                  <Path d="M12 5v14M5 12h14" />
                </Svg>
              </Pressable>
            ) : null
          }
        />
      </View>

      <View
        style={styles.section}
        onLayout={(e) => { messageSectionYRef.current = e.nativeEvent.layout.y }}
      >
        <Text style={styles.sectionLabel}>{t('settings.aboutMe').toUpperCase()}</Text>
        <View style={styles.textInputWrap}>
          <TextInput
            style={styles.textInput}
            value={localMessage}
            onChangeText={setLocalMessage}
            onFocus={() => {
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

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{tg('settings.kidsLabel', profile.is_male).toUpperCase()}</Text>
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
    <ConfirmDialog
      visible={duplicateDialog}
      title={t('settings.duplicatePhotoTitle')}
      description={t('settings.duplicatePhotoBody')}
      confirmLabel={t('common.gotIt')}
      onConfirm={() => setDuplicateDialog(false)}
    />
    </>
  )
}

const photoStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  cell: { width: '30%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute', top: 4, end: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  add: {
    width: '30%', aspectRatio: 1, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)', borderStyle: 'dashed',
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dropTarget: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: '#111',
    borderRadius: 12,
  },
  spinnerBadge: {
    position: 'absolute',
    top: '50%', start: '50%',
    width: 36, height: 36, marginStart: -18, marginTop: -18,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressBarBg: {
    width: '70%', height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressBarFill: {
    height: '100%', borderRadius: 2,
    backgroundColor: '#fff',
  },
  progressText: {
    color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 6,
  },
})

// ── Account Tab ────────────────────────────────────────────────────────────

function SignOutIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  )
}

function TrashIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
    tapWarning()
    setDeleteDialog(false)
    try { await invoke('app/delete') } catch (e) { console.error(e) }
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
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('settings.accountInfo').toUpperCase()}</Text>
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
        <Text style={styles.sectionLabel}>{t('settings.accountActions').toUpperCase()}</Text>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
          onPress={confirmSignOut}
        >
          <SignOutIcon />
          <Text style={styles.actionBtnText}>{tg('settings.signOut', profile.is_male)}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, { marginTop: 10 }, pressed && { opacity: 0.7 }]}
          onPress={confirmDelete}
        >
          <TrashIcon />
          <Text style={styles.actionBtnText}>{t('settings.deleteAccount')}</Text>
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
      onCancel={() => setDeleteDialog(false)}
      onConfirm={onDeleteConfirmed}
    />
    </>
  )
}

// ── App Tab ────────────────────────────────────────────────────────────────

function AppTab() {
  const { profile, update } = useUserStore()
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  // Null-safe: useAutoSave compares JSON.stringify of the object, so writing
  // `units: profile?.units` (undefined when unset) vs `'metric'` / `'imperial'`
  // after a tap produces a different key and saves correctly.
  useAutoSave({ units: profile?.units }, !!profile)

  if (!profile) return <View style={styles.tabContent} />

  // Default view state is metric when units is unset (matches our km sliders).
  const isMetric = (profile.units ?? 'metric') === 'metric'

  const onReset = async () => {
    setResetting(true)
    try {
      await invoke('app/reset')
      setResetDone(true)
      setTimeout(() => setResetDone(false), 2500)
    } catch (e) { console.error(e) }
    finally { setResetting(false) }
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('settings.unitsLabel').toUpperCase()}</Text>
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
          <Text style={styles.sectionLabel}>{t('settings.adminLabel').toUpperCase()}</Text>
          <View style={{ marginTop: 14 }}>
            <Button
              label={resetDone ? t('settings.resetDone') : t('settings.reset')}
              onPress={onReset}
              loading={resetting}
              disabled={resetDone}
              variant="destructive"
              size="md"
            />
          </View>
        </View>
      )}
    </ScrollView>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

function renderTab(tab: Tab) {
  if (tab === 'preferences') return <PreferencesTab />
  if (tab === 'profile')     return <ProfileTab />
  if (tab === 'account')     return <AccountTab />
  if (tab === 'app')         return <AppTab />
  return <View style={styles.tabContent} />
}

// When embedded inside the home shell pager, the parent passes `onBack` so
// the back button animates the shell back to the home pane instead of
// popping the navigation stack. When rendered standalone via expo-router
// (e.g., direct /settings navigation), onBack is undefined and the back
// button falls back to router.back().
type SettingsPageProps = { onBack?: () => void }

export default function SettingsPage({ onBack }: SettingsPageProps = {}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('preferences')
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
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
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
    setActiveTab(tab)
    animateToIndex(TABS.indexOf(tab))
  }

  // Swipe-to-change-tab — dragging horizontally moves both the content strip
  // and the tab indicator together under the finger, then springs to the
  // nearest tab on release (distance past 30% of the screen OR a flick faster
  // than 0.4 px/ms advances). The release spring inherits the gesture's
  // velocity so the motion is one continuous gesture.
  const panResponder = useRef(
    PanResponder.create({
      // Don't claim on touch-down — child Pressables / sliders need the first
      // frame. Only claim once the gesture is clearly horizontal. When
      // embedded in the home shell pager, surrender a backward swipe at
      // the first tab so the outer shell can take over and slide back
      // to home instead of us clamping at the edge. Also stay out of the
      // way while a slider thumb is being dragged.
      onMoveShouldSetPanResponder: (_, g) => {
        if (slidingActiveRef.current) return false
        const horizontal =
          Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5
        if (!horizontal) return false
        const index = TABS.indexOf(activeTabRef.current)
        const forward = isRTL ? g.dx > 0 : g.dx < 0
        if (!forward && index === 0) return false
        return true
      },
      // Once we have the gesture, refuse to give it up — otherwise the
      // outer home-shell pan responder steals mid-swipe and the user
      // ends up back on home instead of changing tabs.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const w = widthRef.current
        const tbw = tabBarWidthRef.current
        if (!w || !tbw) return
        const tabW = (tbw - TAB_BAR_PAD * 2) / TABS.length
        const index = TABS.indexOf(activeTabRef.current)
        const base = (isRTL ? 1 : -1) * index * w
        // Edge clamp — can't drag past the first/last tab.
        const edge = (isRTL ? 1 : -1) * (TABS.length - 1) * w
        const [lo, hi] = isRTL ? [0, edge] : [edge, 0]
        const next = Math.max(lo, Math.min(hi, base + g.dx))
        translate.setValue(next)
        indicator.setValue(-next * (tabW / w))
      },
      onPanResponderRelease: (_, g) => {
        const w = widthRef.current
        if (!w) return
        const index = TABS.indexOf(activeTabRef.current)
        // "Forward" = next tab in the list; direction flips under RTL.
        const forward = isRTL ? g.dx > 0 : g.dx < 0
        const flick = Math.abs(g.vx) > 0.4
        const past = Math.abs(g.dx) > w * 0.3
        let delta = 0
        if ((past || flick) && forward && index < TABS.length - 1) delta = 1
        else if ((past || flick) && !forward && index > 0) delta = -1
        const targetIndex = index + delta
        // Carry the finger's velocity into the spring — no frame gap, no
        // "stop and restart" feel. gestureState.vx is px/ms; spring wants px/s.
        animateToIndex(targetIndex, g.vx * 1000)
        const targetTab = TABS[targetIndex]
        if (targetTab !== activeTabRef.current) {
          tap()
          setActiveTab(targetTab)
        }
      },
    })
  ).current

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => { tap(); onBack ? onBack() : router.back() }}>
          <BackIcon />
        </Pressable>
        <Text style={styles.title}>{t('settings.title')}</Text>
        <View style={styles.backBtn} />
      </View>

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
            <Pressable
              key={tab}
              style={styles.tabItem}
              onPress={() => changeTab(tab)}
            >
              <TabIconStack opacity={whiteOpacity} tab={tab} />
            </Pressable>
          )
        })}
      </View>

      <View
        style={{ flex: 1, overflow: 'hidden' }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
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
              {renderTab(tab)}
            </View>
          ))}
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: '#111', letterSpacing: -0.3 },

  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 12, padding: 3,
  },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },

  tabContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },

  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(0,0,0,0.4)', letterSpacing: 1 },
  sectionValue: { fontSize: 15, fontWeight: '700', color: '#111' },
  divider: { height: 0 },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { width: '100%', height: 40 },
  sliderEndLabel: { fontSize: 12, color: 'rgba(0,0,0,0.35)', minWidth: 22, textAlign: 'center' },

  genderRow: { flexDirection: 'row', gap: 10, marginTop: 14 },

  previewBtn: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  previewBtnText: { fontSize: 15, fontWeight: '500', color: '#111' },

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
  infoValue: { fontSize: 15, fontWeight: '600', color: '#111', flexShrink: 1, marginStart: 16 },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 14,
    paddingVertical: 14, marginTop: 10,
  },
  actionBtnText: { fontSize: 15, fontWeight: '500', color: '#111' },
})
