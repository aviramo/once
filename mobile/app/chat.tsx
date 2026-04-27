import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, Animated, AppState, Easing, FlatList, I18nManager, Image, Keyboard,
  Linking, Modal, Platform, Pressable, StyleSheet, View,
} from 'react-native'
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, useAudioPlayerStatus, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import * as Location from 'expo-location'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import ReAnimated, { useSharedValue, useAnimatedStyle, useAnimatedKeyboard, withSpring, withTiming, runOnJS, Easing as REasing } from 'react-native-reanimated'
import { supabase } from '../src/lib/supabase'
import { invoke, publicImageUrl } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { t, tg } from '../src/i18n'
import { IconPressable } from '../src/components/IconPressable'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { useUserStore } from '../src/stores/userStore'
import { FONT_SCALE, SINGLE } from '../src/fonts'
import { TEXT, WHITE, BLACK, RED, GREEN, GREEN_BG, GRAY_50, GRAY_BG } from '../src/colors'

const isRTL = I18nManager.isRTL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const N_REC_BARS = 34

function buildRecWavePath(bars: number[], W: number, H: number): string {
  const n = bars.length
  if (n < 2 || W === 0) return ''
  const cy = H / 2
  const maxAmp = cy - 1
  const step = W / (n + 1)
  const xs = [0, ...bars.map((_, i) => (i + 1) * step), W]
  const topYs = [cy, ...bars.map(a => cy - a * maxAmp), cy]
  const botYs = [cy, ...bars.map(a => cy + a * maxAmp), cy]
  const seg = (xArr: number[], yArr: number[]) => {
    let s = ''
    for (let i = 0; i < xArr.length - 1; i++) {
      const mx = (xArr[i] + xArr[i + 1]) / 2
      const my = (yArr[i] + yArr[i + 1]) / 2
      s += ` Q ${xArr[i].toFixed(1)},${yArr[i].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`
    }
    return s + ` L ${xArr[xArr.length - 1].toFixed(1)},${yArr[yArr.length - 1].toFixed(1)}`
  }
  return `M 0,${cy}` + seg(xs, topYs) + seg([...xs].reverse(), [...botYs].reverse()) + ' Z'
}

type RecordPhase = 'idle' | 'recording' | 'preview'


interface Message {
  user_id: string
  other_id: string
  created_at: string
  text?: string | null
  image_key?: string | null
  location?: { lat: number; lng: number } | null
  audio_key?: string | null
  audio_bars?: number[] | null
  audio_duration_ms?: number | null
  is_event?: boolean
  _pending?: boolean
  _failed?: boolean
  _localUri?: string  // optimistic image preview before upload completes
  _loadingLocation?: boolean  // spinner while GPS acquires precise fix
  _audioUri?: string  // local URI for optimistic audio preview
}

// ── Date / time helpers ────────────────────────────────────────────────────

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const isSameDay = (a: string, b: string) => dayStart(new Date(a)) === dayStart(new Date(b))

function dateSeparatorLabel(dateStr: string): string {
  const diff = Math.round((dayStart(new Date()) - dayStart(new Date(dateStr))) / 86400000)
  if (diff === 0) return t('chat.today')
  if (diff === 1) return t('chat.yesterday')
  if (diff === 2) return t('chat.dayBeforeYesterday')
  try {
    return new Intl.DateTimeFormat(isRTL ? 'he' : 'en', { weekday: 'long' }).format(new Date(dateStr))
  } catch { return '' }
}
function formatTime(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat(isRTL ? 'he' : 'en', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(dateStr))
  } catch { return '' }
}
function formatLastSeen(iso: string | null | undefined, isMale: boolean | null | undefined): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return tg('match.justNow', isMale)
  if (diff < 3600) {
    const n = Math.floor(diff / 60)
    return n === 1 ? tg('match.minAgo', isMale) : tg('match.minsAgo', isMale).replace('{n}', String(n))
  }
  if (diff < 86400) {
    const n = Math.floor(diff / 3600)
    return n === 1 ? tg('match.hrAgo', isMale) : tg('match.hrsAgo', isMale).replace('{n}', String(n))
  }
  const n = Math.floor(diff / 86400)
  return n === 1 ? tg('match.dayAgo', isMale) : tg('match.daysAgo', isMale).replace('{n}', String(n))
}

// ── Icons ──────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
    </Svg>
  )
}
function DotsIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={TEXT}>
      <Circle cx={12} cy={5} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={12} cy={19} r={1.6} />
    </Svg>
  )
}
function SendIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={WHITE}>
      <Path d={isRTL ? 'M22 21L1 12 22 3v7l-15 2 15 2z' : 'M2 21l21-9L2 3v7l15 2-15 2z'} />
    </Svg>
  )
}
function MicIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 1c-2.2 0-4 1.8-4 4v6c0 2.2 1.8 4 4 4s4-1.8 4-4V5c0-2.2-1.8-4-4-4z" />
      <Path d="M19 10a7 7 0 0 1-14 0" />
      <Path d="M12 19v3" />
      <Path d="M8 22h8" />
    </Svg>
  )
}
function CheckMark({ status, isMine }: { status: 'pending' | 'sent' | 'read'; isMine: boolean }) {
  const c = isMine ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.4)'
  if (status === 'pending') {
    return (
      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={12} cy={12} r={10} />
        <Polyline points="12,7 12,12 15.5,14" />
      </Svg>
    )
  }
  return status === 'read' ? (
    <Svg width={16} height={10} viewBox="0 0 16 10">
      <Polyline points="1,5.5 3.5,8 8.5,1.5" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="5,5.5 7.5,8 12.5,1.5" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ) : (
    <Svg width={11} height={10} viewBox="0 0 11 10">
      <Polyline points="1,5.5 3.5,8 10,1.5" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

type ChatPageProps = {
  topInset?: number
  onBack?: () => void
  // True while the chat pane is the visible pane in the home shell. Incoming
  // messages only count toward the unread badge when this is false.
  isActive?: boolean
  onUnreadChange?: (count: number) => void
}

export default function ChatPage({ topInset = 0, onBack, isActive = true, onUnreadChange }: ChatPageProps = {}) {
  const insets = useSafeAreaInsets()
  const { profile } = useUserStore()
  const userId = profile?.user_id ?? ''
  const match = profile?.relations?.match
  const otherId = match?.user_id ?? ''
  const matchLastSeen = match?.last_seen ?? null
  const isMale = profile?.is_male ?? null
  const matchIsMale = match?.is_male ?? null
  const myImage = profile?.images?.[0]?.normal
    ? publicImageUrl(userId, 'normal', profile.images[0].normal)
    : undefined
  const matchImage = match?.images?.[0]?.normal
    ? publicImageUrl(match.user_id, 'normal', match.images[0].normal)
    : undefined

  const [messages, setMessagesRaw] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [enterSends, setEnterSends] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'block' | 'leave' | null>(null)
  const [otherIsOnline, setOtherIsOnline] = useState(false)
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const [otherLastRead, setOtherLastRead] = useState<string | null>(null)
  // Bump to re-render the last-seen label on an interval without touching
  // the message list (which would re-animate bubbles).
  const [, setTick] = useState(0)

  // ── Cache helpers ──────────────────────────────────────────────────────
  const cacheKey = otherId ? `chatCache_${otherId}` : ''
  const readReceiptKey = otherId ? `chatLastRead_${otherId}` : ''
  const setMessages = useCallback((update: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesRaw(update)
  }, [])

  useEffect(() => {
    if (!cacheKey) return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      const clean = messages
        .filter(m => !m._pending && !m._failed)
        .map(({ _pending, _failed, _localUri, _audioUri, _loadingLocation, ...rest }) => rest)
      if (clean.length > 0) AsyncStorage.setItem(cacheKey, JSON.stringify(clean)).catch(() => {})
    }, 800)
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current) }
  }, [messages, cacheKey])

  const scrollRef = useRef<FlatList>(null)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seenSet = useRef<Set<string>>(new Set())
  const initialLoaded = useRef(false)
  const newMsgKeysRef = useRef<Set<string>>(new Set())
  // Mirror of the messages array used by effects (seen-set flush on pane
  // leave) that need the live list without re-running on every append.
  const messagesRef = useRef<Message[]>([])
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastTypingSentRef = useRef(0)
  const lastMsgTimeRef = useRef<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presenceChannelRef = useRef<any>(null)
  const lastReadSentRef = useRef<string | null>(null)
  const retrackRef = useRef<(() => void) | null>(null)
  const [presenceReady, setPresenceReady] = useState(false)

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 100
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const oldestLoadedAtRef = useRef<string | null>(null)
  const scrollOffsetRef = useRef(0)
  const hasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)

  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [attachVisible, setAttachVisible] = useState(false)
  const [inputWrapWidth, setInputWrapWidth] = useState(0)
  const attachAnim = useSharedValue(0)
  useEffect(() => {
    if (attachMenuOpen) {
      setAttachVisible(true)
      attachAnim.value = withTiming(1, { duration: 360, easing: REasing.bezier(0.22, 1, 0.36, 1) })
    } else {
      attachAnim.value = withTiming(0, { duration: 320, easing: REasing.bezier(0.5, 0, 0.75, 0) }, (finished) => {
        if (finished) runOnJS(setAttachVisible)(false)
      })
    }
  }, [attachMenuOpen])
  const attachBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (isRTL ? 1 : -1) * inputWrapWidth * (1 - attachAnim.value) }],
  }))
  const [lightboxUri, setLightboxUri] = useState<string | null>(null)
  // Signed URL cache: image_key → signed URL (valid ~24h)
  const signedUrlCache = useRef<Map<string, string>>(new Map())

  // ── Audio recording ──────────────────────────────────────────────────────
  const [recordPhase, setRecordPhase] = useState<RecordPhase>('idle')
  const [recordElapsed, setRecordElapsed] = useState(0)
  const [audioUri, setAudioUri] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewPos, setPreviewPos] = useState(0)
  const [previewBars, setPreviewBars] = useState<number[]>([])
  const previewProgressAnim = useRef(new Animated.Value(0)).current
  const previewAnimRef = useRef<Animated.CompositeAnimation | null>(null)
  const [liveBars, setLiveBars] = useState<number[]>(() => Array(N_REC_BARS).fill(0.07))
  const [recWaveWidth, setRecWaveWidth] = useState(0)
  const livePhaseRef = useRef(0)
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true })
  const recorderState = useAudioRecorderState(audioRecorder, 50)
  const previewPlayer = useAudioPlayer(null)
  const previewStatus = useAudioPlayerStatus(previewPlayer)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordElapsedRef = useRef(0)
  const amplitudeBufferRef = useRef<number[]>([])
  const signedAudioUrlCache = useRef<Map<string, string>>(new Map())

  // ── Reversed messages for inverted FlatList ──────────────────────────────
  const reversedMessages = useMemo(() => messages.reduceRight<Message[]>((acc, m) => { acc.push(m); return acc }, []), [messages])

  useEffect(() => {
    signedUrlCache.current = new Map()
    signedAudioUrlCache.current = new Map()
  }, [otherId])

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      audioRecorder.stop().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!recorderState.isRecording) return
    const db = recorderState.metering ?? -50
    const amp = Math.max(0.07, Math.min(1, 1 + db / 40))
    amplitudeBufferRef.current.push(amp)
    livePhaseRef.current += 0.4
    const p = livePhaseRef.current
    const bars = Array.from({ length: N_REC_BARS }, (_, i) => {
      const t = (i / N_REC_BARS) * Math.PI * 5
      const wave = Math.abs(0.6 * Math.sin(p + t) + 0.4 * Math.sin(p * 1.5 + t * 1.8))
      return Math.max(0.07, amp * (0.2 + 0.8 * wave))
    })
    setLiveBars(bars)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState])

  useEffect(() => {
    if (!previewStatus) return
    const dur = previewStatus.duration ?? 0
    if (dur > 0) {
      setAudioDuration(Math.round(dur * 1000))
      if (previewStatus.playing) setPreviewPos(Math.round(previewStatus.currentTime * 1000))
    }
    if (previewStatus.didJustFinish) {
      previewAnimRef.current?.stop()
      previewAnimRef.current = null
      setPreviewPlaying(false)
      setPreviewPos(0)
      previewProgressAnim.setValue(0)
    }
  }, [previewStatus.currentTime, previewStatus.duration, previewStatus.didJustFinish])

  // Single continuous animation per play/pause — no polling jitter
  useEffect(() => {
    const dur = previewStatus.duration ?? 0
    if (previewStatus.playing && dur > 0) {
      const remaining = Math.max(0.05, dur - previewStatus.currentTime)
      previewAnimRef.current?.stop()
      previewProgressAnim.setValue(previewStatus.currentTime / dur)
      previewAnimRef.current = Animated.timing(previewProgressAnim, {
        toValue: 1,
        duration: remaining * 1000,
        useNativeDriver: false,
        easing: Easing.linear,
      })
      previewAnimRef.current.start()
    } else if (!previewStatus.playing) {
      previewAnimRef.current?.stop()
      previewAnimRef.current = null
      if (dur > 0) previewProgressAnim.setValue(previewStatus.currentTime / dur)
    }
  }, [previewStatus.playing])

  // ── Last-seen ticker ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])
  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])

  // ── Enter-sends-message preference ───────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem('chatEnterSends').then(v => {
      if (v === '1') setEnterSends(true)
    })
  }, [])

  const toggleEnterSends = () => {
    setEnterSends(prev => {
      const next = !prev
      AsyncStorage.setItem('chatEnterSends', next ? '1' : '0').catch(() => {})
      return next
    })
  }

  // ── Unread counter ───────────────────────────────────────────────────────
  // Incremented inside the realtime INSERT handler when the chat pane is not
  // the active pane; reset to 0 the moment it becomes active again. A ref
  // mirrors `isActive` so the subscription closure (captured once) can read
  // the live value without re-subscribing on every toggle.
  const isActiveRef = useRef(isActive)
  useEffect(() => { isActiveRef.current = isActive }, [isActive])
  const [unread, setUnread] = useState(0)
  useEffect(() => { if (isActive) setUnread(0) }, [isActive])
  useEffect(() => { onUnreadChange?.(unread) }, [unread, onUnreadChange])
  // Flush the seen-set when the chat pane stops being active, so the next
  // time the user comes back, only messages that arrived *after* they left
  // get the "new messages" separator — not the ones they already viewed.
  // We intentionally don't flush while active: firstNewIdx captures the
  // boundary at open time, and memoizes against messages[] so it stays put
  // while the user is reading.
  const prevActiveRef = useRef(isActive)
  useEffect(() => {
    if (prevActiveRef.current && !isActive) {
      for (const m of messagesRef.current) seenSet.current.add(m.user_id + m.created_at)
    }
    prevActiveRef.current = isActive
  }, [isActive])

  // ── Keyboard avoidance ───────────────────────────────────────────────────
  // useAnimatedKeyboard runs on the UI thread and tracks the keyboard frame
  // every animation frame, so the layout follows the keyboard with zero lag.
  // kbHeight (JS state) is kept only to trigger the scroll-to-bottom effect.
  const animKeyboard = useAnimatedKeyboard()
  const safeBottom = Math.max(insets.bottom, 8)
  // Translate body up by (keyboard - safeBottom) so the static safeBottom spacer
  // stays hidden behind the keyboard frame, keeping paddingTop stable.
  const bodyAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(animKeyboard.height.value - safeBottom + 8, 0) }],
  }))
  const hasTextShared = useSharedValue(0)
  const micIconStyle = useAnimatedStyle(() => ({ opacity: hasTextShared.value === 0 ? 1 : 0 }))
  const sendIconStyle = useAnimatedStyle(() => ({ opacity: hasTextShared.value === 1 ? 1 : 0, position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }))
  const [inputRowHeight, setInputRowHeight] = useState(48)

  const [kbHeight, setKbHeight] = useState(0)
  useEffect(() => {
    const isIOS = Platform.OS === 'ios'
    const subs = [
      Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', e => setKbHeight(e.endCoordinates.height)),
      Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbHeight(0)),
    ]
    return () => { subs.forEach(s => s.remove()) }
  }, [])

  // ── Load cached messages instantly ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    // Reset all per-conversation state when the chat partner changes so stale
    // messages from a previous otherId never flash while the new cache loads.
    setMessagesRaw(prev => prev.length > 0 ? [] : prev)
    seenSet.current = new Set()
    initialLoaded.current = false
    newMsgKeysRef.current = new Set()
    lastMsgTimeRef.current = null
    oldestLoadedAtRef.current = null
    setOtherLastRead(null)
    lastReadSentRef.current = null
    setHasMore(false)
    hasMoreRef.current = false
    if (!cacheKey) return
    AsyncStorage.getItem(cacheKey).then(raw => {
      if (cancelled || !raw) return
      try {
        const cached = JSON.parse(raw) as Message[]
        if (cached.length > 0) {
          cached.forEach(m => seenSet.current.add(m.user_id + m.created_at))
          setMessagesRaw(cached)
        }
      } catch {}
    })
    return () => { cancelled = true }
  }, [cacheKey])

  // ── Persist + restore otherLastRead (read receipts) ─────────────────────
  // On first open per conversation (no stored value), seed to now so all
  // pre-feature messages appear as ✓✓ (one-time migration per device).
  useEffect(() => {
    if (!readReceiptKey) return
    AsyncStorage.getItem(readReceiptKey).then(val => {
      const seed = val ?? new Date().toISOString()
      if (!val) AsyncStorage.setItem(readReceiptKey, seed).catch(() => {})
      setOtherLastRead(prev => !prev || Date.parse(seed) > Date.parse(prev) ? seed : prev)
    })
  }, [readReceiptKey])

  useEffect(() => {
    if (!readReceiptKey || !otherLastRead) return
    AsyncStorage.setItem(readReceiptKey, otherLastRead).catch(() => {})
  }, [readReceiptKey, otherLastRead])

  // ── Initial history load ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !otherId) return
    let cancelled = false
    ;(async () => {
      const key = `chatLastOpened_${otherId}`
      const lastOpened = (await AsyncStorage.getItem(key)) ?? new Date(0).toISOString()
      const { data } = await supabase
        .from('chat')
        .select('*')
        .or(`and(user_id.eq.${userId},other_id.eq.${otherId}),and(user_id.eq.${otherId},other_id.eq.${userId})`)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (cancelled || !data) return
      const msgs = (data as Message[]).reverse()
      setHasMore(data.length === PAGE_SIZE)
      hasMoreRef.current = data.length === PAGE_SIZE
      oldestLoadedAtRef.current = msgs[0]?.created_at ?? null
      msgs.forEach((m: Message) => {
        if (m.user_id === userId || m.created_at <= lastOpened)
          seenSet.current.add(m.user_id + m.created_at)
      })
      initialLoaded.current = true
      setMessages(msgs)
      // Stamp the open so next mount doesn't re-animate everything we just saw.
      AsyncStorage.setItem(key, new Date().toISOString())
    })()
    return () => { cancelled = true }
  }, [userId, otherId])

  // ── Realtime: inbound messages ───────────────────────────────────────────
  useEffect(() => {
    if (!userId || !otherId) return
    const channel = supabase
      .channel(`chat:${userId}:${otherId}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'chat', filter: `other_id=eq.${userId}` },
        (payload: any) => {
          const row = payload?.new as Message | undefined
          if (!row || row.user_id !== otherId) return
          newMsgKeysRef.current.add(row.user_id + row.created_at)
          // Only auto-mark as seen if the user is actually looking at the
          // chat. Otherwise leave it unseen so firstNewIdx draws the "new
          // messages" separator above it on their next visit.
          if (isActiveRef.current) seenSet.current.add(row.user_id + row.created_at)
          else setUnread(c => c + 1)
          setMessages(prev => {
            // Dedup: realtime can echo rows we inserted optimistically on
            // the other side of a race with the polling fallback.
            if (prev.some(m => m.user_id === row.user_id && m.created_at === row.created_at)) return prev
            return [...prev, row]
          })
          requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
          clearTimeout(typingTimerRef.current)
          setOtherIsTyping(false)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, otherId])

  // ── Presence + typing broadcast ──────────────────────────────────────────
  // The presence payload always includes `uid` and (when known) `lastRead`,
  // the timestamp of the newest partner message we've seen. Every retrack
  // — initial subscribe, app foregrounding, new message arrival — must send
  // the *full* payload so we never accidentally wipe lastRead on the wire.
  useEffect(() => {
    if (!userId || !otherId) return
    const roomId = [userId, otherId].sort().join(':')
    const ch = supabase.channel(`chat-presence:${roomId}`, {
      config: { presence: { key: userId } },
    })
    presenceChannelRef.current = ch
    const retrack = () => {
      const payload: { uid: string; lastRead?: string } = { uid: userId }
      if (lastReadSentRef.current) payload.lastRead = lastReadSentRef.current
      ch.track(payload).catch(() => {})
    }
    retrackRef.current = retrack
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState()
      setOtherIsOnline(otherId in state)
      const metas = (state[otherId] ?? []) as Array<{ lastRead?: string }>
      let theirLastRead: string | undefined
      for (const m of metas) {
        const v = m.lastRead
        if (v && (!theirLastRead || Date.parse(v) > Date.parse(theirLastRead))) theirLastRead = v
      }
      if (theirLastRead) {
        const next = theirLastRead
        setOtherLastRead(prev => !prev || Date.parse(next) > Date.parse(prev) ? next : prev)
      }
    })
      .on('presence', { event: 'join' }, ({ key }: { key: string }) => {
        if (key === otherId) setOtherIsOnline(true)
      })
      .on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
        if (key === otherId) { setOtherIsOnline(false); setOtherIsTyping(false) }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: { uid: string } }) => {
        if (payload.uid === otherId) {
          setOtherIsTyping(true)
          clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setOtherIsTyping(false), 3000)
        }
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') { retrack(); setPresenceReady(true) }
      })
    const appSub = AppState.addEventListener('change', async (s) => {
      if (s === 'active') retrack()
      else await ch.untrack()
    })
    return () => {
      clearTimeout(typingTimerRef.current)
      presenceChannelRef.current = null
      retrackRef.current = null
      setPresenceReady(false)
      appSub.remove()
      supabase.removeChannel(ch)
    }
  }, [userId, otherId])

  // ── Broadcast read receipts to partner ───────────────────────────────────
  // Whenever the chat is active and messages from the partner are visible,
  // update lastReadSentRef and retrack so the partner sees ✓✓.
  useEffect(() => {
    if (!isActive || !userId || !otherId || !presenceReady) return
    const latest = messages
      .filter(m => m.user_id === otherId)
      .reduce((max, m) => m.created_at > max ? m.created_at : max, '')
    if (latest && latest !== lastReadSentRef.current) {
      lastReadSentRef.current = latest
      retrackRef.current?.()
    }
  }, [isActive, presenceReady, messages, userId, otherId])

  // Track the latest message timestamp for gap-fill queries.
  useEffect(() => {
    messagesRef.current = messages
    if (messages.length > 0) lastMsgTimeRef.current = messages[messages.length - 1].created_at
  }, [messages])

  // ── Missed-message fetcher ───────────────────────────────────────────────
  const fetchMissed = useCallback(() => {
    if (!lastMsgTimeRef.current || !userId || !otherId) return
    supabase
      .from('chat')
      .select('*')
      .or(`and(user_id.eq.${userId},other_id.eq.${otherId}),and(user_id.eq.${otherId},other_id.eq.${userId})`)
      .gt('created_at', lastMsgTimeRef.current)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return
        const current = messagesRef.current
        const existing = new Set(current.map(m => m.user_id + m.created_at))
        const fresh = (data as Message[]).filter(m => !existing.has(m.user_id + m.created_at))
        if (!fresh.length) return
        fresh.forEach(m => {
          if (m.user_id === userId || isActiveRef.current)
            seenSet.current.add(m.user_id + m.created_at)
        })
        if (!isActiveRef.current) {
          const incoming = fresh.filter(m => m.user_id === otherId).length
          if (incoming > 0) setUnread(c => c + incoming)
        }
        let resolved = [...current]
        const remaining: Message[] = []
        for (const m of fresh) {
          const pi = resolved.findIndex(p =>
            (p._pending || p._failed) && p.user_id === m.user_id &&
            (m.text ? p.text === m.text
              : m.image_key ? p.image_key === m.image_key
              : m.audio_key ? p.audio_key === m.audio_key
              : p.location?.lat === m.location?.lat),
          )
          if (pi !== -1) resolved[pi] = m
          else remaining.push(m)
        }
        setMessages([...resolved, ...remaining])
        requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
      })
  }, [userId, otherId])

  // Foreground + periodic polling — closes gaps realtime may have missed
  // while the socket was backgrounded or briefly disconnected.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') fetchMissed()
    })
    const id = setInterval(fetchMissed, 30_000)
    return () => { sub.remove(); clearInterval(id) }
  }, [fetchMissed])

  // Keyboard height and typing-indicator changes always scroll to bottom (offset 0 in inverted list).
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
  }, [otherIsTyping, kbHeight])

  // ── Load older messages ───────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !oldestLoadedAtRef.current || !userId || !otherId) return
    setLoadingMore(true)
    loadingMoreRef.current = true
    const { data } = await supabase
      .from('chat')
      .select('*')
      .or(`and(user_id.eq.${userId},other_id.eq.${otherId}),and(user_id.eq.${otherId},other_id.eq.${userId})`)
      .lt('created_at', oldestLoadedAtRef.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (!data || data.length === 0) {
      setHasMore(false)
      hasMoreRef.current = false
      setLoadingMore(false)
      loadingMoreRef.current = false
      return
    }
    const older = (data as Message[]).reverse()
    const hadMore = data.length === PAGE_SIZE
    setHasMore(hadMore)
    hasMoreRef.current = hadMore
    oldestLoadedAtRef.current = older[0].created_at
    older.forEach(m => seenSet.current.add(m.user_id + m.created_at))
    setMessages(prev => [...older, ...prev])
    setLoadingMore(false)
    loadingMoreRef.current = false
  }, [userId, otherId])

  // Stable ref so handleEndReached (empty deps) can always call the latest loadMore.
  const loadMoreRef = useRef(loadMore)
  useEffect(() => { loadMoreRef.current = loadMore }, [loadMore])

  // ── Scroll handlers ───────────────────────────────────────────────────────
  const handleScroll = useCallback((e: any) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y
  }, [])

  const handleEndReached = useCallback(() => {
    if (hasMoreRef.current && !loadingMoreRef.current) loadMoreRef.current()
  }, [])

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (override?: string) => {
    const msg = (override ?? text).trim()
    if (!msg || sending || !userId || !otherId) return
    setSending(true)
    setText('')
    hasTextShared.value = 0
    const now = new Date().toISOString()
    seenSet.current.add(userId + now)
    setMessages(prev => [...prev, { user_id: userId, other_id: otherId, created_at: now, text: msg, _pending: true }])
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
    try {
      await invoke('app/chat', { chat: { text: msg, created_at: now } })
      setMessages(prev => prev.map(m =>
        m._pending && m.user_id === userId && m.created_at === now
          ? { ...m, _pending: false } : m
      ))
    } catch {
      setMessages(prev => prev.map(m =>
        m._pending && m.user_id === userId && m.created_at === now
          ? { ...m, _pending: false, _failed: true } : m
      ))
    }
    setSending(false)
  }, [text, sending, userId, otherId])

  const handleRetryText = useCallback(async (failedMsg: Message) => {
    if (!failedMsg.text || !userId || !otherId) return
    setMessages(prev => prev.map(m =>
      m._failed && m.user_id === userId && m.created_at === failedMsg.created_at
        ? { ...m, _failed: false, _pending: true } : m
    ))
    try {
      await invoke('app/chat', { chat: { text: failedMsg.text, created_at: failedMsg.created_at } })
    } catch {
      setMessages(prev => prev.map(m =>
        m._pending && m.user_id === userId && m.created_at === failedMsg.created_at
          ? { ...m, _pending: false, _failed: true } : m
      ))
    }
  }, [userId, otherId])

  const getChatAudioUrl = useCallback(async (key: string): Promise<string | null> => {
    const cached = signedAudioUrlCache.current.get(key)
    if (cached) return cached
    const safeKey = key.replace(/\//g, '_')
    const localPath = FileSystem.documentDirectory + 'chat-audio/' + safeKey
    const info = await FileSystem.getInfoAsync(localPath)
    if (info.exists) {
      signedAudioUrlCache.current.set(key, info.uri)
      return info.uri
    }
    const { data, error } = await supabase.storage.from('chat-audio').createSignedUrl(key, 86400)
    if (error || !data?.signedUrl) return null
    try {
      await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'chat-audio/', { intermediates: true })
      const dl = await FileSystem.downloadAsync(data.signedUrl, localPath)
      signedAudioUrlCache.current.set(key, dl.uri)
      return dl.uri
    } catch {
      signedAudioUrlCache.current.set(key, data.signedUrl)
      return data.signedUrl
    }
  }, [])

  const getChatImageUrl = useCallback(async (key: string): Promise<string | null> => {
    const cached = signedUrlCache.current.get(key)
    if (cached) return cached
    const safeKey = key.replace(/\//g, '_')
    const localPath = FileSystem.documentDirectory + 'chat-images/' + safeKey
    const info = await FileSystem.getInfoAsync(localPath)
    if (info.exists) {
      signedUrlCache.current.set(key, info.uri)
      return info.uri
    }
    const { data, error } = await supabase.storage.from('chat-images').createSignedUrl(key, 86400)
    if (error || !data?.signedUrl) return null
    try {
      await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'chat-images/', { intermediates: true })
      const dl = await FileSystem.downloadAsync(data.signedUrl, localPath)
      signedUrlCache.current.set(key, dl.uri)
      return dl.uri
    } catch {
      signedUrlCache.current.set(key, data.signedUrl)
      return data.signedUrl
    }
  }, [])

  const handlePickImage = useCallback(async () => {
    setAttachMenuOpen(false)
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    // Resize to max 1200px, JPEG 0.75
    const manipResult = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
    )
    const localUri = manipResult.uri
    const key = `${userId}/${Date.now()}.jpg`
    const now = new Date().toISOString()
    // Optimistic bubble with local preview
    seenSet.current.add(userId + now)
    setMessages(prev => [...prev, {
      user_id: userId, other_id: otherId, created_at: now,
      image_key: key, _localUri: localUri, _pending: true,
    }])
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
    // Upload via ArrayBuffer — reliable with local file URIs on React Native
    try {
      const resp = await fetch(localUri)
      const arrayBuffer = await resp.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(key, arrayBuffer, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) throw uploadError
      const safeKey = key.replace(/\//g, '_')
      const cachedPath = FileSystem.documentDirectory + 'chat-images/' + safeKey
      await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'chat-images/', { intermediates: true }).catch(() => {})
      await FileSystem.copyAsync({ from: localUri, to: cachedPath }).catch(() => {})
      signedUrlCache.current.set(key, cachedPath)
      await invoke('app/chat', { chat: { image_key: key, created_at: now } })
      setMessages(prev => prev.map(m =>
        m._pending && m.image_key === key
          ? { ...m, _pending: false } : m
      ))
    } catch {
      setMessages(prev => prev.map(m =>
        m._pending && m.image_key === key
          ? { ...m, _pending: false, _failed: true } : m
      ))
    }
  }, [userId, otherId])

  const handleRetryImage = useCallback(async (failedMsg: Message) => {
    const key = failedMsg.image_key
    const localUri = failedMsg._localUri
    if (!key || !localUri || !userId || !otherId) return
    setMessages(prev => prev.map(m =>
      m._failed && m.image_key === key
        ? { ...m, _failed: false, _pending: true } : m
    ))
    try {
      const resp = await fetch(localUri)
      const arrayBuffer = await resp.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(key, arrayBuffer, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw uploadError
      const safeKey = key.replace(/\//g, '_')
      const cachedPath = FileSystem.documentDirectory + 'chat-images/' + safeKey
      await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'chat-images/', { intermediates: true }).catch(() => {})
      await FileSystem.copyAsync({ from: localUri, to: cachedPath }).catch(() => {})
      signedUrlCache.current.set(key, cachedPath)
      await invoke('app/chat', { chat: { image_key: key, created_at: failedMsg.created_at } })
    } catch {
      setMessages(prev => prev.map(m =>
        m._pending && m.image_key === key
          ? { ...m, _pending: false, _failed: true } : m
      ))
    }
  }, [userId, otherId])

  const handleShareLocation = useCallback(async () => {
    setAttachMenuOpen(false)
    const perm = await Location.requestForegroundPermissionsAsync()
    if (perm.status !== 'granted') { tap(); return }
    // Show spinner bubble immediately while GPS acquires precise fix
    const now = new Date().toISOString()
    const loadingKey = userId + now
    seenSet.current.add(loadingKey)
    setMessages(prev => [...prev, {
      user_id: userId, other_id: otherId, created_at: now,
      _pending: true, _loadingLocation: true,
    }])
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
    let location: { lat: number; lng: number }
    try {
      // Watch for fixes; resolve once accuracy ≤ 5m or after 15s (best available)
      const loc = await new Promise<Location.LocationObject>((resolve, reject) => {
        let best: Location.LocationObject | null = null
        let sub: Location.LocationSubscription | null = null
        const timer = setTimeout(() => {
          sub?.remove()
          best ? resolve(best) : reject(new Error('timeout'))
        }, 15000)
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0 },
          fix => {
            if (!best || (fix.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity)) best = fix
            if ((fix.coords.accuracy ?? Infinity) <= 5) {
              clearTimeout(timer)
              sub?.remove()
              resolve(fix)
            }
          },
        ).then(s => { sub = s }).catch(e => { clearTimeout(timer); reject(e) })
      })
      location = { lat: loc.coords.latitude, lng: loc.coords.longitude }
    } catch {
      // GPS failed — remove the spinner bubble
      setMessages(prev => prev.filter(m => !(m._loadingLocation && m.created_at === now)))
      return
    }
    // Replace spinner bubble with real location
    setMessages(prev => prev.map(m =>
      m._loadingLocation && m.created_at === now
        ? { ...m, location, _loadingLocation: false }
        : m,
    ))
    try {
      await invoke('app/chat', { chat: { location, created_at: now } })
      setMessages(prev => prev.map(m =>
        m._pending && m.user_id === userId && m.created_at === now
          ? { ...m, _pending: false } : m
      ))
    } catch {
      setMessages(prev => prev.map(m =>
        m._pending && m.user_id === userId && m.created_at === now
          ? { ...m, _pending: false, _failed: true } : m
      ))
    }
  }, [userId, otherId])

  const handleRetryLocation = useCallback(async (failedMsg: Message) => {
    if (!failedMsg.location || !userId || !otherId) return
    setMessages(prev => prev.map(m =>
      m._failed && m.user_id === userId && m.created_at === failedMsg.created_at
        ? { ...m, _failed: false, _pending: true } : m
    ))
    try {
      await invoke('app/chat', { chat: { location: failedMsg.location, created_at: failedMsg.created_at } })
    } catch {
      setMessages(prev => prev.map(m =>
        m._pending && m.user_id === userId && m.created_at === failedMsg.created_at
          ? { ...m, _pending: false, _failed: true } : m
      ))
    }
  }, [userId, otherId])

  // BAR_STEP = 3px (bar 2px + gap 1px). Inner view 179px clips bar[60] by layout.

  const recordingPermGrantedRef = useRef(false)
  const handleMicPress = useCallback(async () => {
    if (!recordingPermGrantedRef.current) {
      const perm = await requestRecordingPermissionsAsync()
      if (!perm.granted) { tap(); return }
      recordingPermGrantedRef.current = true
    }
    amplitudeBufferRef.current = []
    livePhaseRef.current = 0
    setLiveBars(Array(N_REC_BARS).fill(0.07))
    recordElapsedRef.current = 0
    setRecordElapsed(0)
    setRecordPhase('recording')
    recordTimerRef.current = setInterval(() => {
      recordElapsedRef.current += 1
      setRecordElapsed(n => n + 1)
    }, 1000)
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await audioRecorder.prepareToRecordAsync()
    audioRecorder.record()
  }, [])

  const handleStopRecording = useCallback(async () => {
    if (!audioRecorder.isRecording) return
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    await audioRecorder.stop()
    const uri = audioRecorder.uri ?? null
    const src = amplitudeBufferRef.current
    const N = 60
    let bars: number[]
    if (src.length >= 5) {
      // Max-pool each window so transients (taps, plosives) survive downsampling
      // instead of being averaged/sampled away into a symmetric blob.
      bars = Array.from({ length: N }, (_, i) => {
        const start = Math.floor((i * src.length) / N)
        const end = Math.max(start + 1, Math.floor(((i + 1) * src.length) / N))
        let m = 0
        for (let j = start; j < end; j++) if (src[j] > m) m = src[j]
        return m
      })
    } else {
      let lcg = ((Date.now() ^ 0xDEADBEEF) >>> 0)
      bars = Array.from({ length: N }, () => {
        lcg = (lcg * 1664525 + 1013904223) & 0xFFFFFFFF
        return 0.2 + (lcg % 80) / 100
      })
    }
    setPreviewBars(bars)
    setAudioUri(uri)
    setAudioDuration(recordElapsedRef.current * 1000)
    setPreviewPos(0)
    setPreviewPlaying(false)
    setRecordPhase('preview')
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {})
    if (uri) previewPlayer.replace({ uri })
  }, [])

  const handleCancelRecording = useCallback(async () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    if (audioRecorder.isRecording) {
      await audioRecorder.stop().catch(() => {})
    }
    previewPlayer.pause()
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    amplitudeBufferRef.current = []
    previewProgressAnim.setValue(0)
    setAudioUri(null)
    setPreviewPlaying(false)
    setPreviewPos(0)
    setRecordPhase('idle')
  }, [])

  const handlePreviewPlayPause = useCallback(async () => {
    if (!audioUri) return
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    if (previewStatus.playing) {
      previewPlayer.pause()
      setPreviewPlaying(false)
    } else {
      const dur = previewStatus.duration ?? 0
      if (dur > 0 && previewStatus.currentTime >= dur - 0.1) previewPlayer.seekTo(0)
      previewPlayer.play()
      setPreviewPlaying(true)
    }
  }, [audioUri, previewStatus, previewPlayer])

  const handlePreviewSeek = useCallback((ratio: number) => {
    const dur = previewStatus.duration ?? 0
    if (dur <= 0) return
    const target = ratio * dur
    previewPlayer.seekTo(target)
    setPreviewPos(Math.round(target * 1000))
    if (previewStatus.playing) {
      previewAnimRef.current?.stop()
      previewProgressAnim.setValue(ratio)
      const remaining = Math.max(0.05, dur - target)
      previewAnimRef.current = Animated.timing(previewProgressAnim, {
        toValue: 1,
        duration: remaining * 1000,
        useNativeDriver: false,
        easing: Easing.linear,
      })
      previewAnimRef.current.start()
    } else {
      previewProgressAnim.setValue(ratio)
    }
  }, [previewPlayer, previewStatus.duration, previewStatus.playing])

  const handleSendAudio = useCallback(async () => {
    if (!audioUri || !userId || !otherId) return
    const key = `${userId}/${Date.now()}.m4a`
    const now = new Date().toISOString()
    seenSet.current.add(userId + now)
    const localUri = audioUri
    const bars = previewBars.length >= 8 ? previewBars : null
    const durationMs = audioDuration > 0 ? audioDuration : null
    setMessages(prev => [...prev, {
      user_id: userId, other_id: otherId, created_at: now,
      audio_key: key, audio_bars: bars, audio_duration_ms: durationMs,
      _audioUri: localUri, _pending: true,
    }])
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
    previewPlayer.pause()
    previewProgressAnim.setValue(0)
    setAudioUri(null)
    setPreviewPlaying(false)
    setPreviewPos(0)
    setRecordPhase('idle')
    try {
      const resp = await fetch(localUri)
      const arrayBuffer = await resp.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('chat-audio')
        .upload(key, arrayBuffer, { contentType: 'audio/mp4', upsert: false })
      if (uploadError) throw uploadError
      const safeAudioKey = key.replace(/\//g, '_')
      const cachedAudioPath = FileSystem.documentDirectory + 'chat-audio/' + safeAudioKey
      await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'chat-audio/', { intermediates: true }).catch(() => {})
      await FileSystem.copyAsync({ from: localUri, to: cachedAudioPath }).catch(() => {})
      signedAudioUrlCache.current.set(key, cachedAudioPath)
      await invoke('app/chat', { chat: { audio_key: key, audio_bars: bars, audio_duration_ms: durationMs, created_at: now } })
      setMessages(prev => prev.map(m =>
        m._pending && m.audio_key === key
          ? { ...m, _pending: false } : m
      ))
    } catch {
      setMessages(prev => prev.map(m =>
        m._pending && m.audio_key === key
          ? { ...m, _pending: false, _failed: true } : m
      ))
    }
  }, [audioUri, userId, otherId, previewBars, audioDuration])

  const handleRetryAudio = useCallback(async (failedMsg: Message) => {
    const key = failedMsg.audio_key
    const localUri = failedMsg._audioUri
    if (!key || !localUri || !userId || !otherId) return
    setMessages(prev => prev.map(m =>
      m._failed && m.audio_key === key
        ? { ...m, _failed: false, _pending: true } : m
    ))
    try {
      const resp = await fetch(localUri)
      const arrayBuffer = await resp.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('chat-audio')
        .upload(key, arrayBuffer, { contentType: 'audio/mp4', upsert: true })
      if (uploadError) throw uploadError
      const safeAudioKey = key.replace(/\//g, '_')
      const cachedAudioPath = FileSystem.documentDirectory + 'chat-audio/' + safeAudioKey
      await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'chat-audio/', { intermediates: true }).catch(() => {})
      await FileSystem.copyAsync({ from: localUri, to: cachedAudioPath }).catch(() => {})
      signedAudioUrlCache.current.set(key, cachedAudioPath)
      await invoke('app/chat', { chat: { audio_key: key, audio_bars: failedMsg.audio_bars ?? null, audio_duration_ms: failedMsg.audio_duration_ms ?? null, created_at: failedMsg.created_at } })
    } catch {
      setMessages(prev => prev.map(m =>
        m._pending && m.audio_key === key
          ? { ...m, _pending: false, _failed: true } : m
      ))
    }
  }, [userId, otherId])

  const onInputChange = (value: string) => {
    // On mobile, multiline TextInput turns the soft-keyboard Enter into a
    // literal '\n' in the value rather than firing onKeyPress/onSubmitEditing.
    // When "Enter sends message" is on, detect the inserted newline here and
    // dispatch send instead of letting it land in the input.
    if (enterSends && value.includes('\n')) {
      const msg = value.replace(/\n+/g, ' ').trim()
      if (msg) handleSend(msg)
      else { setText(''); hasTextShared.value = 0 }
      return
    }
    setText(value)
    hasTextShared.value = value.trim().length > 0 ? 1 : 0
    const now = Date.now()
    if (presenceChannelRef.current && now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now
      presenceChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { uid: userId } })
    }
  }


  // ── Derived ──────────────────────────────────────────────────────────────
  const firstNewIdx = useMemo(
    () => messages.findIndex(m => initialLoaded.current && !seenSet.current.has(m.user_id + m.created_at)),
    [messages],
  )

  const statusText = otherIsOnline ? tg('match.connected', matchIsMale) : formatLastSeen(matchLastSeen, matchIsMale)

  // ── FlatList renderItem ───────────────────────────────────────────────────
  // reversedMessages[0] = newest (shown at bottom in inverted list).
  // prevMsg = older neighbor (index+1), nextMsg = newer neighbor (index-1).
  const renderItem = useCallback(({ item: msg, index }: { item: Message; index: number }) => {
    const prevMsg = reversedMessages[index + 1]
    const nextMsg = reversedMessages[index - 1]
    const showSep = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at)
    const isFirstInGroup = showSep || !prevMsg || prevMsg.user_id !== msg.user_id || prevMsg.is_event || !!msg.is_event
    const isLastInGroup = !nextMsg || nextMsg.user_id !== msg.user_id || !!nextMsg.is_event || !!msg.is_event || !isSameDay(msg.created_at, nextMsg.created_at)
    const showNewSep = firstNewIdx !== -1 && index === messages.length - 1 - firstNewIdx

    if (msg.is_event) return null

    const msgAnimKey = msg.user_id + msg.created_at
    const animateIn = newMsgKeysRef.current.has(msgAnimKey)
    const isMine = msg.user_id === userId
    const msgStatus: 'pending' | 'failed' | 'sent' | 'read' =
      msg._failed ? 'failed' :
      msg._pending ? 'pending' :
      isMine && otherLastRead && Date.parse(msg.created_at) <= Date.parse(otherLastRead) ? 'read' : 'sent'

    return (
      <View style={[styles.msgWrap, isFirstInGroup && styles.msgWrapFirst]}>
        {showSep && <DaySeparator label={dateSeparatorLabel(msg.created_at)} />}
        {showNewSep && !showSep && <DaySeparator label={t('chat.newMessages')} bold />}
        <View style={msg._failed ? styles.failedOpacity : undefined}>
          {msg.audio_key || msg._audioUri ? (
            <AudioBubble
              animate={animateIn}
              isMine={isMine}
              isLast={isLastInGroup}
              msg={msg}
              getChatAudioUrl={getChatAudioUrl}
              time={formatTime(msg.created_at)}
              msgStatus={msgStatus}
            />
          ) : msg.image_key || msg._localUri ? (
            <ImageBubble
              animate={animateIn}
              isMine={isMine}
              isLast={isLastInGroup}
              msg={msg}
              getChatImageUrl={getChatImageUrl}
              time={formatTime(msg.created_at)}
              onPress={uri => setLightboxUri(uri)}
              status={msgStatus}
            />
          ) : msg.location || msg._loadingLocation ? (
            <LocationBubble
              animate={animateIn}
              isMine={isMine}
              isLast={isLastInGroup}
              location={msg.location ?? null}
              time={formatTime(msg.created_at)}
              status={msgStatus}
            />
          ) : (
            <AnimatedBubble
              animate={animateIn}
              isMine={isMine}
              style={[
                styles.bubble,
                isMine ? styles.bubbleMine : styles.bubbleTheirs,
                isLastInGroup && (isMine ? styles.bubbleMineLast : styles.bubbleTheirsLast),
              ]}
            >
              <View style={styles.bubbleTextRow}>
                <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                  {msg.text}
                </Text>
                <View style={styles.textBubbleFooter}>
                  <Text style={[styles.inlineTime, isMine ? styles.inlineTimeMine : styles.inlineTimeTheirs]} maxFontSizeMultiplier={FONT_SCALE.ui}>
                    {formatTime(msg.created_at)}
                  </Text>
                  {isMine && msgStatus !== 'failed' && <CheckMark status={msgStatus} isMine />}
                </View>
              </View>
            </AnimatedBubble>
          )}
        </View>
        {msg._failed && isMine && (
          <Pressable
            onPress={() => {
              if (msg.text) handleRetryText(msg)
              else if (msg.image_key) handleRetryImage(msg)
              else if (msg.audio_key) handleRetryAudio(msg)
              else if (msg.location) handleRetryLocation(msg)
            }}
            style={styles.retryRow}
            hitSlop={6}
          >
            <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 9v4M12 17h.01" />
              <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </Svg>
            <Text style={styles.retryLabel}>{t('chat.retry')}</Text>
          </Pressable>
        )}
      </View>
    )
  }, [reversedMessages, messages.length, firstNewIdx, userId, otherLastRead, getChatImageUrl, getChatAudioUrl,
      handleRetryText, handleRetryImage, handleRetryAudio, handleRetryLocation])

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <StatusBar style="dark" />

      {/* ── Header ──
          Simple 3-slot row, fixed 56px tall. Each slot is a 56×56 box with
          its own alignItems/justifyContent centering, so icons and the
          status text all land on the exact same centerline regardless of
          Android's font metrics. No flex, no absolute overlays — the slot
          widths carry the layout. */}
      <View style={styles.header}>
        <IconPressable
          style={styles.backBtn}
          pressedStyle={styles.backBtnPressed}
          onPress={() => { tap(); onBack?.() }}
        >
          <BackIcon />
        </IconPressable>
        <View style={styles.headerCenter}>
          <Text
            style={[styles.status, otherIsOnline && styles.statusOnline]}
            numberOfLines={1}
          >
            {statusText}
          </Text>
        </View>
        <IconPressable
          style={styles.menuBtn}
          pressedStyle={styles.menuBtnPressed}
          onPress={() => { tap(); setMenuOpen(true) }}
        >
          <DotsIcon />
        </IconPressable>
      </View>

      {/* ── Messages ── */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
      <ReAnimated.View style={[styles.body, bodyAnimStyle]}>
        <FlatList
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={[styles.messagesContent, { paddingTop: inputRowHeight + safeBottom }]}
          automaticallyAdjustKeyboardInsets={false}
          data={reversedMessages}
          keyExtractor={(item) => `${item.user_id}-${item.created_at}`}
          renderItem={renderItem}
          inverted
          onScroll={handleScroll}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="handled"
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={otherIsTyping ? (
            <View style={[styles.msgWrap, styles.msgWrapFirst]}>
              <TypingDots />
            </View>
          ) : null}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={GRAY_50} />
            </View>
          ) : null}
          ListEmptyComponent={!otherIsTyping ? (
            <Text style={styles.emptyLabel}>{t('chat.empty')}</Text>
          ) : null}
        />

        {/* ── Input bar ──
            Fixed-height white footer with the input field and the send
            button on one horizontal line. `bottomPad` is the only dynamic
            bit: when the keyboard is open we lift the bar above it; when
            it's closed we still clear the nav-bar gesture area.
            Android edge-to-edge: `endCoordinates.height` excludes the
            bottom system inset, so we add it back when the keyboard is up. */}
        <View style={[styles.inputBarOuter, { position: 'absolute', left: 0, right: 0, bottom: 0 }]}>
          <View onLayout={e => setInputRowHeight(e.nativeEvent.layout.height)}>
          {/* Always render the text input row so the keyboard stays open while
              recording/previewing. The recording and preview UIs overlay on top. */}
          <View style={styles.inputRow}>
            <View style={styles.inputWrap} onLayout={e => setInputWrapWidth(e.nativeEvent.layout.width)}>
              <View style={styles.inputAnimWrap} pointerEvents={attachVisible ? 'none' : 'auto'}>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={onInputChange}
                  placeholder={tg('chat.inputPlaceholder', isMale)}
                  placeholderTextColor="rgba(0,0,0,0.35)"
                  multiline
                  blurOnSubmit={false}
                  autoFocus={false}
                />
              </View>
              <Pressable
                disabled={attachVisible}
                onPress={() => { tap(); setAttachMenuOpen(true) }}
                style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </Svg>
              </Pressable>
              {attachVisible && inputWrapWidth > 0 && (
                <ReAnimated.View
                  style={[styles.attachBar, { width: inputWrapWidth }, attachBarStyle]}
                >
                  <View style={[styles.attachBarInner, { width: inputWrapWidth }]}>
                    <View style={styles.attachBarItems}>
                      <Pressable
                        onPress={handlePickImage}
                        style={({ pressed }) => [styles.attachBarItem, pressed && styles.attachBarItemPressed]}
                      >
                        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M9 5h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2z" />
                          <Circle cx={12} cy={14} r={3.5} />
                        </Svg>
                        <Text style={styles.attachBarLabel}>{t('chat.attachMenu.image')}</Text>
                      </Pressable>
                      <View style={styles.attachBarDivider} />
                      <Pressable
                        onPress={handleShareLocation}
                        style={({ pressed }) => [styles.attachBarItem, pressed && styles.attachBarItemPressed]}
                      >
                        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                          <Circle cx={12} cy={9} r={2.5} />
                        </Svg>
                        <Text style={styles.attachBarLabel}>{t('chat.attachMenu.location')}</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => { tap(); setAttachMenuOpen(false) }}
                      style={({ pressed }) => [styles.attachBarClose, pressed && styles.attachBtnPressed]}
                    >
                      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M18 6L6 18M6 6l12 12" />
                      </Svg>
                    </Pressable>
                  </View>
                </ReAnimated.View>
              )}
            </View>
            <Pressable
              onPress={() => text.trim() ? handleSend() : handleMicPress()}
              disabled={!!text.trim() && sending}
              style={({ pressed }) => [
                styles.sendBtn,
                !!text.trim() && sending && styles.sendBtnDisabled,
                pressed && styles.sendBtnPressed,
              ]}
            >
              <ReAnimated.View style={micIconStyle}><MicIcon /></ReAnimated.View>
              <ReAnimated.View style={sendIconStyle}><SendIcon /></ReAnimated.View>
            </Pressable>

            {recordPhase === 'recording' && (
              <View style={[styles.inputRow, styles.recordOverlay]}>
                <Pressable onPress={handleCancelRecording} style={styles.recSideBtn} hitSlop={8}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={2.5} strokeLinecap="round">
                    <Path d="M18 6L6 18M6 6l12 12" />
                  </Svg>
                </Pressable>
                <View style={styles.recBar}>
                  <View style={styles.recDot} />
                  <Text style={styles.recTime} maxFontSizeMultiplier={FONT_SCALE.ui}>
                    {`${Math.floor(recordElapsed / 60)}:${String(recordElapsed % 60).padStart(2, '0')}`}
                  </Text>
                  <View style={styles.recWaveWrap} onLayout={e => setRecWaveWidth(e.nativeEvent.layout.width)}>
                    {recWaveWidth > 0 && (
                      <Svg width={recWaveWidth} height={24}>
                        <Path d={buildRecWavePath(liveBars, recWaveWidth, 24)} fill={GREEN} />
                      </Svg>
                    )}
                  </View>
                </View>
                <Pressable onPress={handleStopRecording} style={styles.sendBtn}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill={WHITE}>
                    <Rect x={4} y={4} width={16} height={16} rx={3} />
                  </Svg>
                </Pressable>
              </View>
            )}

            {recordPhase === 'preview' && (
              <View style={[styles.inputRow, styles.recordOverlay]}>
                <Pressable onPress={handleCancelRecording} style={styles.recSideBtn} hitSlop={8}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M3 6h18M19 6l-1 14H6L5 6M8 6V4h8v2" />
                  </Svg>
                </Pressable>
                <Pressable onPress={handlePreviewPlayPause} style={styles.recSideBtn} hitSlop={8}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill={TEXT}>
                    {previewPlaying
                      ? <Path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                      : <Path d="M8 5v14l11-7z" />}
                  </Svg>
                </Pressable>
                <View style={styles.previewWaveWrap}>
                  <Waveform
                    bars={previewBars}
                    height={28}
                    inactiveColor="rgba(0,0,0,0.18)"
                    activeColor={GREEN}
                    thumbColor={GREEN}
                    progressAnim={previewProgressAnim}
                    seekable={(previewStatus.duration ?? 0) > 0}
                    onScrub={r => {
                      if (r != null) {
                        const dur = previewStatus.duration ?? 0
                        setPreviewPos(Math.round(r * dur * 1000))
                      }
                    }}
                    onSeek={handlePreviewSeek}
                  />
                </View>
                <Text style={styles.previewDuration} maxFontSizeMultiplier={FONT_SCALE.ui}>
                  {(() => { const s = Math.floor((previewPlaying ? previewPos : audioDuration) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })()}
                </Text>
                <Pressable onPress={handleSendAudio} style={styles.sendBtn}>
                  <SendIcon />
                </Pressable>
              </View>
            )}
          </View>
          </View>
          <View style={{ height: safeBottom }} />
        </View>
      </ReAnimated.View>
      </View>

      {/* ── Menu dropdown ── */}
      {menuOpen && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <View style={[styles.menuAnchor, { top: topInset + 56 }]}>
            <Pressable style={styles.menuDropdown} onPress={e => e.stopPropagation()}>
              <View style={styles.menuCard}>

                <Pressable
                  onPress={toggleEnterSends}
                  style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                >
                  <Text style={styles.menuLabel}>{t('chat.enterSends')}</Text>
                  <View style={[styles.menuCheckbox, enterSends && styles.menuCheckboxOn]}>
                    {enterSends && (
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                        <Polyline points="20 6 9 17 4 12" stroke={WHITE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </View>
                </Pressable>

                <View style={styles.menuDivider} />

                <Pressable
                  onPress={() => { setMenuOpen(false); setConfirmAction('block') }}
                  style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                >
                  <Text style={[styles.menuLabel, styles.menuLabelDestructive]}>{t('chat.block')}</Text>
                </Pressable>

                <View style={styles.menuDivider} />

                <Pressable
                  onPress={() => { setMenuOpen(false); setConfirmAction('leave') }}
                  style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                >
                  <Text style={[styles.menuLabel, styles.menuLabelDestructive, styles.menuLabelEmphasis]}>{t('chat.leave')}</Text>
                </Pressable>

              </View>
            </Pressable>
          </View>
        </View>
      )}

      {lightboxUri && <LightboxModal uri={lightboxUri} onClose={() => setLightboxUri(null)} />}

      <ConfirmDialog
        visible={confirmAction === 'block'}
        title={t('chat.blockTitle')}
        description={t('chat.blockDesc')}
        confirmLabel={t('chat.blockConfirm')}
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => { await invoke('app/block'); setConfirmAction(null) }}
      />
      <ConfirmDialog
        visible={confirmAction === 'leave'}
        title={t('home.leaveTitle')}
        description={t('home.leaveDesc')}
        confirmLabel={t('home.leaveConfirm')}
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => { setConfirmAction(null); await invoke('app/leave') }}
      />
    </View>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────

function ImageBubble({ animate, isMine, isLast, msg, getChatImageUrl, time, onPress, status }: {
  animate: boolean
  isMine: boolean
  isLast: boolean
  msg: Message
  getChatImageUrl: (key: string) => Promise<string | null>
  time: string
  onPress?: (uri: string) => void
  status: 'pending' | 'failed' | 'sent' | 'read'
}) {
  const [uri, setUri] = useState<string | null>(msg._localUri ?? null)

  useEffect(() => {
    if (msg._localUri) { setUri(msg._localUri); return }
    if (!msg.image_key) return
    getChatImageUrl(msg.image_key).then(url => { if (url) setUri(url) })
  }, [msg.image_key, msg._localUri])

  const bubbleStyle = [
    styles.imageBubble,
    isMine ? styles.bubbleMine : styles.bubbleTheirs,
    isLast && (isMine ? styles.bubbleMineLast : styles.bubbleTheirsLast),
  ]

  return (
    <AnimatedBubble animate={animate} isMine={isMine} style={bubbleStyle}>
      {uri ? (
        <Pressable onPress={() => !msg._pending && onPress?.(uri)} disabled={!onPress || msg._pending} style={{ width: '100%' }}>
          <Image source={{ uri }} style={styles.chatImage} resizeMode="cover" />
          {msg._pending && (
            <View style={styles.chatImageSpinnerOverlay}>
              <ActivityIndicator color={WHITE} />
            </View>
          )}
        </Pressable>
      ) : (
        <View style={styles.chatImagePlaceholder}>
          <ActivityIndicator color={isMine ? WHITE : TEXT} />
        </View>
      )}
      <View style={[styles.imageTimeRow, { flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
        <Text style={styles.imageTimeText} maxFontSizeMultiplier={FONT_SCALE.ui}>
          {time}
        </Text>
        {isMine && status !== 'failed' && <CheckMark status={status} isMine />}
      </View>
    </AnimatedBubble>
  )
}

function LocationBubble({ animate, isMine, isLast, location, time, status }: {
  animate: boolean
  isMine: boolean
  isLast: boolean
  location: { lat: number; lng: number } | null
  time: string
  status: 'pending' | 'failed' | 'sent' | 'read'
}) {
  const handleOpen = () => {
    if (!location) return
    const url = Platform.OS === 'ios'
      ? `maps://?ll=${location.lat},${location.lng}`
      : `geo:${location.lat},${location.lng}?q=${location.lat},${location.lng}`
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${location!.lat},${location!.lng}`)
    })
  }

  const bubbleStyle = [
    styles.locationBubble,
    isMine ? styles.bubbleMine : styles.bubbleTheirs,
    isLast && (isMine ? styles.bubbleMineLast : styles.bubbleTheirsLast),
  ]

  const textColor = isMine ? WHITE : TEXT
  const subColor = isMine ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'
  const timeColor = isMine ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.35)'
  const iconBg = isMine ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)'

  return (
    <AnimatedBubble animate={animate} isMine={isMine} style={bubbleStyle}>
      <Pressable onPress={handleOpen} style={styles.locationInner} disabled={!location}>
        <View style={[styles.locationIconWrap, { backgroundColor: iconBg }]}>
          {location ? (
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke={textColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <Circle cx={12} cy={9} r={2.5} />
            </Svg>
          ) : (
            <ActivityIndicator size="small" color={textColor} />
          )}
        </View>
        <View style={styles.locationTextWrap}>
          <Text style={[styles.locationLabel, { color: textColor }]} numberOfLines={1}>
            {t('chat.locationLabel')}
          </Text>
          <Text style={[styles.locationSubLabel, { color: subColor }]} numberOfLines={1}>
            {t('chat.locationOpen')}
          </Text>
        </View>
      </Pressable>
      {location && (
        <View style={styles.locationFooter}>
          <Text style={[styles.inlineTime, { color: timeColor }]} maxFontSizeMultiplier={FONT_SCALE.ui}>
            {time}
          </Text>
          {isMine && status !== 'failed' && <CheckMark status={status} isMine />}
        </View>
      )}
    </AnimatedBubble>
  )
}

function AnimatedBubble({ style, children, animate, isMine }: {
  style: object | (object | false | undefined)[]
  children: React.ReactNode
  animate: boolean
  isMine: boolean
}) {
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current
  const translateY = useRef(new Animated.Value(animate ? 18 : 0)).current
  const translateX = useRef(new Animated.Value(animate ? (isMine ? 20 : -20) : 0)).current
  const scale = useRef(new Animated.Value(animate ? 0.88 : 1)).current

  useEffect(() => {
    if (!animate) return
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 320, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, damping: 22, stiffness: 320, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 22, stiffness: 320, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }, { translateX }, { scale }] }]}>
      {children}
    </Animated.View>
  )
}

function DaySeparator({ label, bold }: { label: string; bold?: boolean }) {
  return (
    <View style={styles.daySep}>
      <View style={styles.daySepLine} />
      <Text style={[styles.daySepLabel, bold && { fontWeight: '600' }]} maxFontSizeMultiplier={FONT_SCALE.ui}>{label}</Text>
      <View style={styles.daySepLine} />
    </View>
  )
}

// Three dots rising in a staggered loop — the same pattern iMessage/WhatsApp
// use. Each dot runs its own Animated.loop with a delay so the wave is
// smooth even if the component remounts mid-cycle.
function TypingDots() {
  const a = useRef(new Animated.Value(0)).current
  const b = useRef(new Animated.Value(0)).current
  const c = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loopFor = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(480 - delay),
        ]),
      )
    const loops = [loopFor(a, 0), loopFor(b, 140), loopFor(c, 280)]
    loops.forEach(l => l.start())
    return () => loops.forEach(l => l.stop())
  }, [])

  const dotStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  })

  return (
    <View style={[styles.bubble, styles.bubbleTheirs, styles.bubbleTheirsLast, styles.typingBubble]}>
      <Animated.View style={[styles.typingDot, dotStyle(a)]} />
      <Animated.View style={[styles.typingDot, dotStyle(b)]} />
      <Animated.View style={[styles.typingDot, dotStyle(c)]} />
    </View>
  )
}

function RecordingDot() {
  const blink = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.15, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])
  return <Animated.View style={[styles.recDot, { opacity: blink }]} />
}

function buildWavePath(bars: number[], width: number, height: number): string {
  if (bars.length < 2 || width <= 0) return ''
  const cy = height / 2
  const maxH = cy * 0.88
  const step = width / (bars.length - 1)
  const f = (n: number) => n.toFixed(1)
  function seg(pts: [number, number][], cmd: 'M' | 'L'): string {
    let d = `${cmd}${f(pts[0][0])} ${f(pts[0][1])}`
    for (let i = 0; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = (pts[i][1] + pts[i + 1][1]) / 2
      d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`
    }
    d += ` L${f(pts[pts.length - 1][0])} ${f(pts[pts.length - 1][1])}`
    return d
  }
  const top: [number, number][] = bars.map((h, i) => [i * step, cy - h * maxH])
  const bot: [number, number][] = bars.map((h, i) => [(bars.length - 1 - i) * step, cy + bars[bars.length - 1 - i] * maxH])
  return seg(top, 'M') + ' ' + seg(bot, 'L') + ' Z'
}

// Shared waveform with draggable seek thumb. Used by preview and AudioBubble.
// progressAnim is owned by the parent (drives the active-fill width animation).
// onScrub fires while dragging (ratio in [0,1] in audio-time space, regardless of RTL),
// then fires once more with null on release. onSeek fires once on release with the
// final ratio so the parent can call player.seekTo and restart its timing animation.
function Waveform({
  bars, height, inactiveColor, activeColor, thumbColor,
  progressAnim, seekable, onScrub, onSeek,
}: {
  bars: number[]
  height: number
  inactiveColor: string
  activeColor: string
  thumbColor: string
  progressAnim: Animated.Value
  seekable: boolean
  onScrub?: (ratio: number | null) => void
  onSeek?: (ratio: number) => void
}) {
  const [width, setWidth] = useState(0)
  const wavePath = useMemo(() => buildWavePath(bars, width, height), [bars, width, height])

  const xToRatio = (x: number) => {
    if (width <= 0) return 0
    const r = Math.max(0, Math.min(1, x / width))
    return isRTL ? 1 - r : r
  }

  const scrubStart = (x: number) => {
    if (!seekable) return
    const r = xToRatio(x)
    progressAnim.stopAnimation()
    progressAnim.setValue(r)
    onScrub?.(r)
  }
  const scrubMove = (x: number) => {
    if (!seekable) return
    const r = xToRatio(x)
    progressAnim.setValue(r)
    onScrub?.(r)
  }
  const scrubEnd = (x: number) => {
    if (!seekable) return
    const r = xToRatio(x)
    progressAnim.stopAnimation()
    progressAnim.setValue(r)
    onScrub?.(null)
    onSeek?.(r)
  }

  // activeOffsetX keeps vertical scroll responsive when the wave lives inside
  // a FlatList — the Pan only claims the touch after a small horizontal move.
  const pan = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .onStart(e => runOnJS(scrubStart)(e.x))
    .onUpdate(e => runOnJS(scrubMove)(e.x))
    .onEnd(e => runOnJS(scrubEnd)(e.x))

  const tap = Gesture.Tap()
    .onEnd((e, success) => { if (success) runOnJS(scrubEnd)(e.x) })

  const THUMB = 12

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        style={{ flex: 1, height, justifyContent: 'center' }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
      >
        {wavePath !== '' && width > 0 && (
          <>
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              <Path d={wavePath} fill={inactiveColor} />
            </Svg>
            <Animated.View style={{
              position: 'absolute', top: 0, bottom: 0,
              ...(isRTL ? { right: 0 } : { left: 0 }),
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, width] }),
              overflow: 'hidden',
            }}>
              <Svg
                width={width}
                height={height}
                style={isRTL ? { position: 'absolute', right: 0 } : undefined}
              >
                <Path d={wavePath} fill={activeColor} />
              </Svg>
            </Animated.View>
            {seekable && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: (height - THUMB) / 2,
                  left: 0,
                  width: THUMB,
                  height: THUMB,
                  borderRadius: THUMB / 2,
                  backgroundColor: thumbColor,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.18,
                  shadowRadius: 1.5,
                  elevation: 2,
                  transform: [{
                    translateX: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: isRTL
                        ? [width - THUMB / 2, -THUMB / 2]
                        : [-THUMB / 2, width - THUMB / 2],
                    }),
                  }],
                }}
              />
            )}
          </>
        )}
      </View>
    </GestureDetector>
  )
}

function AudioBubble({ animate, isMine, isLast, msg, getChatAudioUrl, time, msgStatus }: {
  animate: boolean
  isMine: boolean
  isLast: boolean
  msg: Message
  getChatAudioUrl: (key: string) => Promise<string | null>
  time: string
  msgStatus: 'pending' | 'failed' | 'sent' | 'read'
}) {
  const [pos, setPos] = useState(0)
  const [duration, setDuration] = useState(0)
  const [uri, setUri] = useState<string | null>(msg._audioUri ?? null)
  const [scrubMs, setScrubMs] = useState<number | null>(null)
  const progressAnim = useRef(new Animated.Value(0)).current
  const animRef = useRef<Animated.CompositeAnimation | null>(null)
  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)
  const playing = status.playing
  const replacedRef = useRef(false)
  const playOnLoadRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const ready = uri != null && !loading

  useEffect(() => {
    if (msg._audioUri) { setUri(msg._audioUri); return }
    if (!msg.audio_key) return
    getChatAudioUrl(msg.audio_key).then(url => { if (url) setUri(url) })
  }, [msg.audio_key, msg._audioUri])

  // Lazy: do NOT replace the player until the user taps play. This avoids the
  // expo-audio load cost on every bubble mount (felt as "loading delay" on
  // every app reload, even though the file is cached on disk).
  useEffect(() => {
    if (!loading) return
    if (status.isLoaded && playOnLoadRef.current) {
      playOnLoadRef.current = false
      player.play()
    }
    if (status.playing) setLoading(false)
  }, [status.isLoaded, status.playing, loading])

  // Update timer text and detect finish
  useEffect(() => {
    const dur = status.duration ?? 0
    if (!dur) return
    setDuration(Math.round(dur * 1000))
    if (status.playing) setPos(Math.round(status.currentTime * 1000))
    if (status.didJustFinish) {
      animRef.current?.stop()
      animRef.current = null
      setPos(0)
      progressAnim.setValue(0)
    }
  }, [status.currentTime, status.duration, status.didJustFinish])

  // Single continuous animation per play/pause — no polling jitter
  useEffect(() => {
    const dur = status.duration ?? 0
    if (status.playing && dur > 0) {
      const remaining = Math.max(0.05, dur - status.currentTime)
      animRef.current?.stop()
      progressAnim.setValue(status.currentTime / dur)
      animRef.current = Animated.timing(progressAnim, {
        toValue: 1,
        duration: remaining * 1000,
        useNativeDriver: false,
        easing: Easing.linear,
      })
      animRef.current.start()
    } else if (!status.playing) {
      animRef.current?.stop()
      animRef.current = null
      if (dur > 0) progressAnim.setValue(status.currentTime / dur)
    }
  }, [status.playing])

  const BARS = 60
  const seed = msg.audio_key ?? msg.created_at
  const bars = useMemo(() => {
    if (Array.isArray(msg.audio_bars) && msg.audio_bars.length >= 8) return msg.audio_bars
    let hash = 0
    return Array.from({ length: BARS }, (_, i) => {
      for (let c = 0; c < seed.length; c++) hash = ((hash << 5) - hash) + seed.charCodeAt(c)
      hash = ((hash << 5) - hash) + i * 1664525
      hash |= 0
      return 0.2 + (Math.abs(hash) % 80) / 100
    })
  }, [seed, msg.audio_bars])

  const handlePlayPause = async () => {
    if (!uri || loading) return
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    if (status.playing) {
      player.pause()
      return
    }
    if (!replacedRef.current) {
      replacedRef.current = true
      playOnLoadRef.current = true
      setLoading(true)
      player.replace({ uri })
      return
    }
    const dur = status.duration ?? 0
    if (dur > 0 && status.currentTime >= dur - 0.1) player.seekTo(0)
    player.play()
  }

  const handleSeek = (ratio: number) => {
    const dur = status.duration ?? 0
    if (dur <= 0) return
    const target = ratio * dur
    player.seekTo(target)
    setPos(Math.round(target * 1000))
    if (status.playing) {
      animRef.current?.stop()
      progressAnim.setValue(ratio)
      const remaining = Math.max(0.05, dur - target)
      animRef.current = Animated.timing(progressAnim, {
        toValue: 1,
        duration: remaining * 1000,
        useNativeDriver: false,
        easing: Easing.linear,
      })
      animRef.current.start()
    } else {
      progressAnim.setValue(ratio)
    }
  }

  const bubbleStyle = [
    styles.audioBubble,
    isMine ? styles.bubbleMine : styles.bubbleTheirs,
    isLast && (isMine ? styles.bubbleMineLast : styles.bubbleTheirsLast),
  ]
  const iconColor = isMine ? WHITE : TEXT
  const barActive = isMine ? 'rgba(255,255,255,0.9)' : GREEN
  const barInactive = isMine ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.14)'
  const timeColor = isMine ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.35)'
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

  return (
    <AnimatedBubble animate={animate} isMine={isMine} style={bubbleStyle}>
      <View style={styles.audioRow}>
        <Pressable
          onPress={handlePlayPause}
          disabled={!ready}
          style={[styles.audioPlayBtn, { backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)' }]}
          hitSlop={8}
        >
          {ready ? (
            <Svg width={16} height={16} viewBox="0 0 24 24" fill={iconColor}>
              {playing ? <Path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <Path d="M8 5v14l11-7z" />}
            </Svg>
          ) : (
            <ActivityIndicator size="small" color={iconColor} />
          )}
        </Pressable>
        <View style={styles.audioWave}>
          <Waveform
            bars={bars}
            height={26}
            inactiveColor={barInactive}
            activeColor={barActive}
            thumbColor={barActive}
            progressAnim={progressAnim}
            seekable={(status.duration ?? 0) > 0}
            onScrub={r => {
              if (r != null) {
                const dur = status.duration ?? 0
                setScrubMs(Math.round(r * dur * 1000))
              } else {
                setScrubMs(null)
              }
            }}
            onSeek={handleSeek}
          />
        </View>
      </View>
      <View style={styles.audioDurationRow}>
        <Text style={[styles.inlineTime, { color: timeColor }]} maxFontSizeMultiplier={FONT_SCALE.ui}>
          {scrubMs != null
            ? fmt(scrubMs)
            : duration > 0
              ? (playing ? fmt(pos) : fmt(duration))
              : (msg.audio_duration_ms ? fmt(msg.audio_duration_ms) : '–:––')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={[styles.inlineTime, { color: timeColor }]} maxFontSizeMultiplier={FONT_SCALE.ui}>{time}</Text>
          {isMine && msgStatus !== 'failed' && <CheckMark status={msgStatus} isMine />}
        </View>
      </View>
    </AnimatedBubble>
  )
}

// ── Event strip ──────────────────────────────────────────────────────────
// Renders a visual status change row: [actor avatar] ── chip ── [target avatar]
// Explicitly handles RTL so the actor (inviter) is always on the reading-
// start side and the target (invited) on the reading-end side.

const EVENT_COLORS = {
  invite:  { fg: 'rgba(0,0,0,0.6)', bg: 'rgba(0,0,0,0.06)' },
  approve: { fg: GREEN, bg: GREEN_BG },
} as const

function EventStrip({
  actorImage,
  targetImage,
  label,
  eventType,
  time,
}: {
  actorImage: string | undefined
  targetImage: string | undefined
  label: string
  eventType: string
  time: string
}) {
  const colors = EVENT_COLORS[eventType as keyof typeof EVENT_COLORS] ?? EVENT_COLORS.invite
  const startImage = isRTL ? targetImage : actorImage
  const endImage = isRTL ? actorImage : targetImage
  // Single row: [actor] [chip →] [target]
  return (
    <View style={evStyles.row}>
      <Image source={{ uri: startImage }} style={evStyles.avatar} />
      <View style={[evStyles.chip, { backgroundColor: colors.bg }]}>
        <Text style={[evStyles.chipLabel, { color: colors.fg }]}>{label}</Text>
        <Text style={[evStyles.chipTime, { color: colors.fg }]}>{time}</Text>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none"
          stroke={colors.fg} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d={isRTL ? 'M19 12H5M11 5l-6 7 6 7' : 'M5 12h14M13 5l6 7-6 7'} />
        </Svg>
      </View>
      <Image source={{ uri: endImage }} style={evStyles.avatar} />
    </View>
  )
}

const EV_AVATAR = 72
const evStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  avatar: {
    width: EV_AVATAR,
    height: EV_AVATAR,
    borderRadius: EV_AVATAR / 2,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 12,
    paddingEnd: 8,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 5,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTime: {
    fontSize: 11,
    opacity: 0.7,
  },
})

// ── Lightbox ──────────────────────────────────────────────────────────────

function LightboxModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const savedTx = useSharedValue(0)
  const savedTy = useSharedValue(0)

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5))
    })
    .onEnd(() => {
      savedScale.value = scale.value
    })

  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate(e => {
      tx.value = savedTx.value + e.translationX
      ty.value = savedTy.value + e.translationY
    })
    .onEnd(() => {
      savedTx.value = tx.value
      savedTy.value = ty.value
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1)
        savedScale.value = 1
        tx.value = withSpring(0); ty.value = withSpring(0)
        savedTx.value = 0; savedTy.value = 0
      } else {
        scale.value = withSpring(2.5)
        savedScale.value = 2.5
      }
    })

  const singleTap = Gesture.Tap()
    .onEnd((_e, success) => {
      if (success && scale.value <= 1) runOnJS(onClose)()
    })

  const gesture = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap),
  )

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }))

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={lbStyles.backdrop}>
        <GestureDetector gesture={gesture}>
          <ReAnimated.Image
            source={{ uri }}
            style={[lbStyles.image, animStyle]}
            resizeMode="contain"
          />
        </GestureDetector>
        <Pressable style={lbStyles.closeBtn} onPress={onClose} hitSlop={12}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.5} strokeLinecap="round">
            <Path d="M18 6L6 18M6 6l12 12" />
          </Svg>
        </Pressable>
      </View>
    </Modal>
  )
}

const lbStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    end: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WHITE },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: SINGLE,
    backgroundColor: WHITE,
    zIndex: 2,
  },
  // Icon slot: square 56×56 box. alignItems/justifyContent center the icon
  // on the exact same centerline as the header's own 56px height, so icons
  // and the middle status text all share one baseline.
  headerSlot: {
    width: 56, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnPressed: { opacity: 0.5 },
  menuBtn: {
    height: 36,
    width: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  backBtn: {
    height: 56,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  backBtnPressed: {
    opacity: 0.5,
  },
  // Center slot fills whatever space is left between the two icon boxes.
  headerCenter: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    fontSize: 17,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    // Android adds ~4px of invisible padding above text metrics that pushes
    // the visible glyphs below the geometric center of their bounding box.
    // Disable it so justifyContent:'center' on the wrapper actually centers.
    includeFontPadding: false,
  },
  statusOnline: { color: GREEN },

  body: { flex: 1 },
  messages: { flex: 1 },
  messagesContent: { padding: 10, flexGrow: 1 },
  emptyLabel: {
    marginTop: 'auto', marginBottom: 'auto', textAlign: 'center',
    color: 'rgba(0,0,0,0.35)', fontSize: 15, letterSpacing: 0.4,
  },

  msgWrap: { marginTop: 2 },
  msgWrapFirst: { marginTop: 8 },
  failedOpacity: { opacity: 0.6 },
  retryRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    paddingVertical: 2,
  },
  retryLabel: { fontSize: 11, color: RED },

  daySep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  daySepLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.12)' },
  daySepLabel: { fontSize: 11, color: 'rgba(0,0,0,0.5)' },

  bubble: {
    maxWidth: '80%',
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: SINGLE,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: GREEN },
  bubbleMineLast: { borderBottomEndRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: GRAY_BG },
  bubbleTheirsLast: { borderBottomStartRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: WHITE },
  bubbleTextTheirs: { color: TEXT },

  inlineTime: { fontSize: 11, lineHeight: 16, letterSpacing: 0.3 },
  inlineTimeMine: { color: 'rgba(255,255,255,0.75)' },
  inlineTimeTheirs: { color: 'rgba(0,0,0,0.35)' },
  bubbleTextRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  textBubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: 2, marginStart: 'auto' as any, paddingStart: 4, marginEnd: -6 },

  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 13, paddingHorizontal: 16 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.5)' },

  // Outer wrapper: holds the single-row input + send button plus the
  // dynamic bottom spacer that clears the nav bar / keyboard.
  inputBarOuter: {
    backgroundColor: WHITE,
    zIndex: 2,
  },
  inputRow: {
    flexDirection: 'row',
    // flex-end so the send button stays pinned to the bottom as the input
    // grows across multi-line content.
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 44,
    maxHeight: 174,
    borderRadius: SINGLE,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: WHITE,
    paddingEnd: 4,
    overflow: 'hidden',
  },
  inputAnimWrap: {
    flex: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 174,
    paddingStart: 18,
    paddingEnd: 6,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
    color: TEXT,
    textAlign: isRTL ? 'right' : 'left',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  sendBtn: {
    width: 49, height: 49, borderRadius: SINGLE,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnPressed: { opacity: 0.85 },

  menuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuAnchor: {
    position: 'absolute',
    end: SINGLE,
    width: 280,
    maxWidth: '92%',
  },
  menuDropdown: {
    backgroundColor: WHITE,
    borderRadius: 14,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  menuCard: {
    backgroundColor: WHITE,
    borderRadius: 10,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 50,
  },
  menuRowPressed: { backgroundColor: 'rgba(0,0,0,0.06)' },
  menuLabel: {
    fontSize: 15,
    color: 'rgba(0,0,0,0.5)',
    flex: 1,
  },
  menuLabelDestructive: { color: 'rgba(180,60,60,0.6)' },
  menuLabelEmphasis: { color: 'rgba(200,40,40,1)', fontWeight: '600' },
  menuCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
  },
  menuCheckboxOn: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginStart: 16,
  },

  // Attach popup (inline, above input bar)
  attachBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  attachBtnPressed: { opacity: 0.4 },
  attachBar: {
    position: 'absolute',
    end: 0, top: 0, bottom: 0,
    borderRadius: SINGLE,
    backgroundColor: GREEN,
    overflow: 'hidden',
  },
  attachBarInner: {
    position: 'absolute',
    end: 0, top: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  attachBarItems: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachBarItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  attachBarItemPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  attachBarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  attachBarLabel: { fontSize: 14, color: WHITE, fontWeight: '500' },
  attachBarClose: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },

  // Image bubble
  imageBubble: {
    width: '80%',
    borderRadius: SINGLE,
    overflow: 'hidden',
    padding: SINGLE,
  },
  chatImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: SINGLE,
  },
  chatImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: SINGLE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  chatImageSpinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SINGLE,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageTimeRow: {
    position: 'absolute',
    bottom: SINGLE + 8,
    end: SINGLE + 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  imageTimeText: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.9)',
  },

  // Audio bubble
  audioBubble: {
    width: '80%',
    borderRadius: SINGLE,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SINGLE,
  },
  audioPlayBtn: {
    width: 34, height: 34,
    borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  audioWave: {
    flex: 1,
    height: 26,
  },
  audioDurationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
    marginStart: 42,
  },

  // Recording / preview bar
  recordOverlay: {
    position: 'absolute',
    top: 0, start: 0, end: 0, bottom: 0,
    backgroundColor: WHITE,
  },
  recSideBtn: {
    width: 40, height: 49,
    alignItems: 'center', justifyContent: 'center',
  },
  recBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: RED,
  },
  recTime: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT,
    fontVariant: ['tabular-nums'],
  },
  recWaveWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  previewWaveWrap: {
    flex: 1,
    height: 49,
    justifyContent: 'center',
  },
  previewDuration: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.5)',
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'right',
    paddingEnd: 2,
  },

  // Location bubble
  locationBubble: {
    width: '80%',
    borderRadius: SINGLE,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  locationInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SINGLE,
  },
  locationIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  locationLabel: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  locationSubLabel: { fontSize: 12, lineHeight: 16, marginTop: 1 },
  locationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-end',
    marginTop: 4,
    marginEnd: -2,
  },
})
