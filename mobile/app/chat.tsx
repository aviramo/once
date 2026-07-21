import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, AppState, Dimensions, Easing, FlatList, I18nManager, Image, InteractionManager, Keyboard, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, useAudioPlayerStatus, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio'
import { Text, TextInput } from '../src/components/AppText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import ReAnimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolateColor } from 'react-native-reanimated'
import { supabase } from '../src/lib/supabase'
import { invoke } from '../src/lib/api'
import { tap, tapMedium, tapSuccess } from '../src/lib/haptics'
import { t, tg, lang as appLang } from '../src/i18n'
import { useUserStore } from '../src/stores/userStore'
import { FONT_SCALE } from '../src/fonts'
import { XS, SM, MD, RADIUS, RADII, TEXT, WEIGHT, STROKE, MOTION, lh, ICON } from '../src/tokens'
import { INK, SURFACE, SURFACE_SUNK, BG, GOLD, BLACK, WHITE, PRIMARY, PRIMARY_BG, BLACK_SOFT, BLACK_STRONG, BLACK_MID, WHITE_SOFT, WHITE_MID, WHITE_STRONG } from '../src/colors'
import { SendIcon, MicIcon } from '../src/components/icons'
import { chatCacheKey, chatLastReadKey } from '../src/keys'
import { defaultWeekStart, familyHasAnyDayMarked, startOfDisplayedWeek, weekendDays } from '../src/lib/family'

const isRTL = I18nManager.isRTL
const N_REC_BARS = 34

// Auto-growing message input: one line = one line-height, capped at 10 lines.
// The floor keeps the empty field square-ish; the ceiling turns the field into
// a scroll view once the text passes ten lines.
const INPUT_VPAD = SM * 2
const INPUT_MIN_HEIGHT = 44
const INPUT_MAX_LINES = 10
const INPUT_MAX_HEIGHT = lh(TEXT.md) * INPUT_MAX_LINES + INPUT_VPAD

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
  schedule?: { anchor: string; weeks: boolean[][] } | null
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

// ── Icons (chat-specific only; shared icons live in src/components/icons.tsx) ─

function CheckMark({ status, isMine }: { status: 'pending' | 'sent' | 'read'; isMine: boolean }) {
  const c = isMine ? WHITE_STRONG : BLACK_MID
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
  // True while the chat pane is the visible pane in the home shell. Incoming
  // messages only count toward the unread badge when this is false.
  isActive?: boolean
  onUnreadChange?: (count: number) => void
  // Reports the partner's live online status (from the presence channel) so
  // the home shell can show a green dot beside the chat tab icon.
  onOnlineChange?: (online: boolean) => void
  autoFocusInput?: boolean
}

export default function ChatPage({ topInset = 0, isActive = true, onUnreadChange, onOnlineChange, autoFocusInput }: ChatPageProps = {}) {
  const insets = useSafeAreaInsets()
  const { profile } = useUserStore()
  const userId = profile?.user_id ?? ''
  const match = profile?.relations?.match
  const otherId = match?.user_id ?? ''
  const isMale = profile?.is_male ?? null
  const matchIsMale = match?.is_male ?? null
  const [messages, setMessagesRaw] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT)
  const [sending, setSending] = useState(false)
  const [otherIsOnline, setOtherIsOnline] = useState(false)
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const [otherLastRead, setOtherLastRead] = useState<string | null>(null)

  // ── Cache helpers ──────────────────────────────────────────────────────
  const cacheKey = otherId ? chatCacheKey(otherId) : ''
  const readReceiptKey = otherId ? chatLastReadKey(otherId) : ''
  const setMessages = useCallback((update: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesRaw(update)
  }, [])

  useEffect(() => {
    if (!cacheKey || !userId || !otherId) return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      const clean = messages
        .filter(m =>
          !m._pending && !m._failed &&
          ((m.user_id === userId && m.other_id === otherId) ||
            (m.user_id === otherId && m.other_id === userId)),
        )
        .map(({ _pending, _failed, _localUri, _audioUri, _loadingLocation, ...rest }) => rest)
      if (clean.length > 0) AsyncStorage.setItem(cacheKey, JSON.stringify(clean)).catch(() => {})
    }, 800)
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current) }
  }, [messages, cacheKey, userId, otherId])

  const scrollRef = useRef<FlatList>(null)
  const inputRef = useRef<any>(null)
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
  // Newest partner-message ts we've persisted to the durable `chat_reads`
  // backstop (separate from lastReadSentRef, which tracks the ephemeral
  // presence broadcast — the two paths dedup independently).
  const lastReadPersistedRef = useRef<string | null>(null)
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
  const [attachConfirm, setAttachConfirm] = useState<'location' | 'schedule' | null>(null)
  const [inputWrapWidth, setInputWrapWidth] = useState(0)
  // True while the OS image picker is loading. Keeps the attach menu's image
  // tile visibly "picking" so the user gets immediate feedback during the
  // launchImageLibraryAsync cold-start window instead of a blank screen.
  const [pickingImage, setPickingImage] = useState(false)

  // Warm up the image picker once on chat mount: a no-op permission read
  // initializes the native bridge so the first launchImageLibraryAsync after
  // this is dramatically faster.
  useEffect(() => { ImagePicker.getMediaLibraryPermissionsAsync().catch(() => {}) }, [])
  const attachAnim = useSharedValue(0)
  useEffect(() => {
    if (attachMenuOpen) {
      setAttachVisible(true)
      attachAnim.value = withTiming(1)
    } else {
      attachAnim.value = withTiming(0, undefined, (finished) => {
        if (finished) runOnJS(setAttachVisible)(false)
      })
    }
  }, [attachMenuOpen])
  const attachBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (isRTL ? 1 : -1) * inputWrapWidth * (1 - attachAnim.value) }],
  }))
  const inputWrapBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(attachAnim.value, [0, 1], [BLACK_SOFT, PRIMARY]),
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
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true })
  const recorderState = useAudioRecorderState(audioRecorder, 50)
  const previewPlayer = useAudioPlayer(null)
  const previewStatus = useAudioPlayerStatus(previewPlayer)
  // Subtle transition tone played between auto-played voice messages.
  const tickPlayer = useAudioPlayer(null)
  const tickReadyRef = useRef(false)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordElapsedRef = useRef(0)
  const amplitudeBufferRef = useRef<number[]>([])
  const signedAudioUrlCache = useRef<Map<string, string>>(new Map())

  // Audio output routing: false = loud speaker, true = earpiece (receiver)
  const [routedToEarpiece, setRoutedToEarpiece] = useState(false)
  const toggleAudioRouting = useCallback(() => {
    tap()
    setRoutedToEarpiece(prev => {
      const next = !prev
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: next,
        shouldRouteThroughEarpiece: next,
      }).catch(() => {})
      return next
    })
  }, [])

  // Generate a tiny WAV transition tone once and load it into tickPlayer so
  // we can fire .play() instantly without per-call file I/O. The file is a
  // 90 ms 660 Hz sine wrapped in a half-cosine envelope (no clicks at the
  // edges), 8 kHz mono 16-bit PCM (~1.5 KB on disk).
  useEffect(() => {
    const path = FileSystem.cacheDirectory + 'audio-transition-tick.wav'
    const ensure = async () => {
      const info = await FileSystem.getInfoAsync(path)
      if (!info.exists) {
        const sampleRate = 8000
        const numSamples = Math.floor(sampleRate * 0.09)
        const dataSize = numSamples * 2
        const buf = new ArrayBuffer(44 + dataSize)
        const view = new DataView(buf)
        const writeStr = (off: number, s: string) => {
          for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
        }
        writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE')
        writeStr(12, 'fmt '); view.setUint32(16, 16, true)
        view.setUint16(20, 1, true); view.setUint16(22, 1, true)
        view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true)
        view.setUint16(32, 2, true); view.setUint16(34, 16, true)
        writeStr(36, 'data'); view.setUint32(40, dataSize, true)
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate
          const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / numSamples)
          const s = Math.sin(2 * Math.PI * 660 * t) * env * 0.18
          view.setInt16(44 + i * 2, Math.round(s * 32767), true)
        }
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        await FileSystem.writeAsStringAsync(path, btoa(bin), { encoding: FileSystem.EncodingType.Base64 })
      }
      tickPlayer.replace({ uri: path })
      tickReadyRef.current = true
    }
    ensure().catch(() => {})
  }, [])

  const playTransitionTick = useCallback(() => {
    if (!tickReadyRef.current) return
    try {
      tickPlayer.seekTo(0)
      tickPlayer.play()
    } catch {}
  }, [])

  // Single-active-player coordination: whichever bubble is currently
  // playing sets this to its audio_key; every other bubble pauses on change.
  const [activePlayingKey, setActivePlayingKey] = useState<string | null>(null)
  const handlePlayStart = useCallback((key: string) => setActivePlayingKey(key), [])

  // Auto-play next voice message after the current one finishes naturally.
  // Only advances when the immediately-next message is also a voice message,
  // so a broken voice-message run (interrupted by text/image/etc.) stops here.
  const [autoPlayKey, setAutoPlayKey] = useState<string | null>(null)
  const handleAudioFinished = useCallback((finishedKey: string) => {
    const msgs = messagesRef.current
    const idx = msgs.findIndex(m => m.audio_key === finishedKey)
    if (idx === -1) return
    const next = msgs[idx + 1]
    if (next && next.audio_key) {
      playTransitionTick()
      setAutoPlayKey(next.audio_key)
    }
  }, [playTransitionTick])
  const consumeAutoPlay = useCallback(() => setAutoPlayKey(null), [])

  // ── Reversed messages for inverted FlatList ──────────────────────────────
  const reversedMessages = useMemo(() => messages.reduceRight<Message[]>((acc, m) => { acc.push(m); return acc }, []), [messages])

  // Backward-clamp displayed timestamps so each bubble's time never exceeds
  // its newer neighbor's. The raw created_at value is whoever-sent-it's local
  // clock, so two users with skewed clocks produce out-of-order times even
  // though the messages themselves are in correct order. We trust the visual
  // position, not the clock: walking newest → oldest, each message's display
  // time = min(raw, newer-neighbor's display). The keys are user_id+created_at
  // (the same composite used everywhere else as a message identity).
  const displayTimes = useMemo(() => {
    const result = new Map<string, string>()
    let maxAllowed = Infinity
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      const raw = Date.parse(m.created_at)
      const clamped = Number.isFinite(raw) ? Math.min(raw, maxAllowed) : maxAllowed
      if (Number.isFinite(clamped)) maxAllowed = clamped
      result.set(m.user_id + m.created_at, Number.isFinite(clamped) ? new Date(clamped).toISOString() : m.created_at)
    }
    return result
  }, [messages])

  useEffect(() => {
    signedUrlCache.current = new Map()
    signedAudioUrlCache.current = new Map()
  }, [otherId])

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      audioRecorder.stop().catch(() => {})
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!recorderState.isRecording) return
    const db = recorderState.metering ?? -50
    const amp = Math.max(0.07, Math.min(1, 1 + db / 40))
    amplitudeBufferRef.current.push(amp)
    const buf = amplitudeBufferRef.current
    const tail = buf.length >= N_REC_BARS ? buf.slice(-N_REC_BARS) : buf
    const pad = Array(N_REC_BARS - tail.length).fill(0.07)
    setLiveBars([...pad, ...tail])
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

  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])
  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])

  // ── Unread counter ───────────────────────────────────────────────────────
  // Incremented inside the realtime INSERT handler when the chat pane is not
  // the active pane; reset to 0 the moment it becomes active again. A ref
  // mirrors `isActive` so the subscription closure (captured once) can read
  // the live value without re-subscribing on every toggle.
  const isActiveRef = useRef(isActive)
  useEffect(() => { isActiveRef.current = isActive }, [isActive])
  useEffect(() => {
    if (!autoFocusInput) return
    const task = InteractionManager.runAfterInteractions(() => { inputRef.current?.focus() })
    return () => task.cancel()
  }, [])
  const [unread, setUnread] = useState(0)
  useEffect(() => { if (isActive) setUnread(0) }, [isActive])
  useEffect(() => { onUnreadChange?.(unread) }, [unread, onUnreadChange])
  // Lift the partner's online status to the home shell (green dot on the
  // chat tab). On unmount the home shell's `chatAvailable` gate covers the
  // stale value, so no explicit reset is needed here.
  useEffect(() => { onOnlineChange?.(otherIsOnline) }, [otherIsOnline, onOnlineChange])
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
  // RN's KeyboardAvoidingView doesn't cope with the chat sitting inside the
  // home pager shell on Android edge-to-edge, so we drive bottom padding
  // ourselves: the spacer below the input row grows by the keyboard height
  // when it's open, pushing the input row above the keyboard.
  const safeBottom = Math.max(insets.bottom, 8)
  const hasTextShared = useSharedValue(0)
  const micIconStyle = useAnimatedStyle(() => ({ opacity: hasTextShared.value === 0 ? 1 : 0 }))
  const sendIconStyle = useAnimatedStyle(() => ({ opacity: hasTextShared.value === 1 ? 1 : 0, position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }))

  const [kbHeight, setKbHeight] = useState(0)
  useEffect(() => {
    // Compute the keyboard's visible bottom area from screen geometry rather
    // than from `endCoordinates.height` directly: Gboard's clipboard /
    // suggestion strip lives in the screen between `screenY` and the bottom
    // of the device, but isn't always counted in `height`. screenHeight −
    // screenY gives the full strip + keyboard area.
    //
    // We listen to `keyboardWillShow` on both platforms so the spacer
    // updates *before* the keyboard animation starts — that way the input
    // bar rides up in sync with the keyboard instead of jumping after it.
    const onShow = (e: any) => {
      const screenH = Dimensions.get('screen').height
      const fromScreenY = screenH - (e.endCoordinates?.screenY ?? screenH)
      const reportedH = e.endCoordinates?.height ?? 0
      setKbHeight(Math.max(reportedH, fromScreenY))
    }
    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', () => setKbHeight(0)),
      Keyboard.addListener('keyboardDidHide', () => setKbHeight(0)),
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
    lastReadPersistedRef.current = null
    setHasMore(false)
    hasMoreRef.current = false
    if (!cacheKey || !userId || !otherId) return
    AsyncStorage.getItem(cacheKey).then(raw => {
      if (cancelled || !raw) return
      try {
        const cached = (JSON.parse(raw) as Message[]).filter(m =>
          (m.user_id === userId && m.other_id === otherId) ||
          (m.user_id === otherId && m.other_id === userId),
        )
        if (cached.length > 0) {
          cached.forEach(m => seenSet.current.add(m.user_id + m.created_at))
          setMessagesRaw(cached)
        }
      } catch {}
    })
    return () => { cancelled = true }
  }, [cacheKey, userId, otherId])

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

  // ── Durable read receipt: seed from server on open ───────────────────────
  // Presence only carries the partner's read state while both are connected
  // at the same moment. The `chat_reads` row is the async backstop: on open,
  // pull the partner's latest read timestamp so a receipt they sent while we
  // were offline is reflected immediately (max-merge, never regresses).
  useEffect(() => {
    if (!userId || !otherId) return
    let cancelled = false
    supabase
      .from('chat_reads')
      .select('last_read_at')
      .eq('reader_id', otherId)
      .eq('peer_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { last_read_at?: string } | null)?.last_read_at
        if (cancelled || !v) return
        setOtherLastRead(prev => !prev || Date.parse(v) > Date.parse(prev) ? v : prev)
      }, () => {})
    return () => { cancelled = true }
  }, [userId, otherId])

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
      // Durable read receipts: the partner upserts a `chat_reads` row when
      // they read our messages. Even offline-then-online, this UPDATE/INSERT
      // arrives over Realtime and advances the ✓✓ boundary (max-merge).
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'chat_reads', filter: `peer_id=eq.${userId}` },
        (payload: any) => {
          const row = payload?.new as { reader_id?: string; last_read_at?: string } | undefined
          if (!row || row.reader_id !== otherId || !row.last_read_at) return
          const next = row.last_read_at
          setOtherLastRead(prev => !prev || Date.parse(next) > Date.parse(prev) ? next : prev)
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

  // ── Persist read receipt to the durable backstop ─────────────────────────
  // Independent of presence (no presenceReady gate) so it lands even when the
  // socket isn't up. Fire-and-forget upsert; a BEFORE trigger clamps
  // last_read_at monotonically forward server-side, so out-of-order writes
  // can't regress it.
  useEffect(() => {
    if (!isActive || !userId || !otherId) return
    const latest = messages
      .filter(m => m.user_id === otherId)
      .reduce((max, m) => m.created_at > max ? m.created_at : max, '')
    if (latest && latest !== lastReadPersistedRef.current) {
      lastReadPersistedRef.current = latest
      supabase
        .from('chat_reads')
        .upsert(
          { reader_id: userId, peer_id: otherId, last_read_at: latest },
          { onConflict: 'reader_id,peer_id' },
        )
        .then(undefined, () => {})
    }
  }, [isActive, messages, userId, otherId])

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
          if (m.user_id === otherId)
            newMsgKeysRef.current.add(m.user_id + m.created_at)
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
              : m.schedule ? p.schedule?.anchor === m.schedule?.anchor && p.created_at === m.created_at
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
    tap()
    setSending(true)
    setText('')
    setInputHeight(INPUT_MIN_HEIGHT)
    hasTextShared.value = 0
    const now = new Date().toISOString()
    seenSet.current.add(userId + now)
    newMsgKeysRef.current.add(userId + now)
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
    if (pickingImage) return
    setPickingImage(true)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    }).finally(() => {
      setPickingImage(false)
      setAttachMenuOpen(false)
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
    newMsgKeysRef.current.add(userId + now)
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
  }, [userId, otherId, pickingImage])

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
    setAttachConfirm(null)
    const perm = await Location.requestForegroundPermissionsAsync()
    if (perm.status !== 'granted') { tap(); return }
    // Show spinner bubble immediately while GPS acquires precise fix
    const now = new Date().toISOString()
    const loadingKey = userId + now
    seenSet.current.add(loadingKey)
    newMsgKeysRef.current.add(loadingKey)
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

  const myFamily = profile?.family ?? null
  const canSendSchedule = !!(
    myFamily?.hasKids
    && myFamily.schedule
    && familyHasAnyDayMarked(myFamily.schedule.weeks)
  )

  const handleSendSchedule = useCallback(async () => {
    setAttachConfirm(null)
    if (!userId || !otherId) return
    const sched = myFamily?.schedule
    if (!sched || !familyHasAnyDayMarked(sched.weeks)) return
    const anchor = sched.anchor
    if (!anchor) return
    const cleanWeeks = sched.weeks.filter(w => w.some(d => d))
    const snapshot = { anchor, weeks: cleanWeeks }
    const now = new Date().toISOString()
    const key = userId + now
    seenSet.current.add(key)
    newMsgKeysRef.current.add(key)
    setMessages(prev => [...prev, {
      user_id: userId, other_id: otherId, created_at: now,
      schedule: snapshot, _pending: true,
    }])
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
    try {
      await invoke('app/chat', { chat: { schedule: snapshot, created_at: now } })
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
  }, [userId, otherId, myFamily])

  const handleRetrySchedule = useCallback(async (failedMsg: Message) => {
    if (!failedMsg.schedule || !userId || !otherId) return
    setMessages(prev => prev.map(m =>
      m._failed && m.user_id === userId && m.created_at === failedMsg.created_at
        ? { ...m, _failed: false, _pending: true } : m
    ))
    try {
      await invoke('app/chat', { chat: { schedule: failedMsg.schedule, created_at: failedMsg.created_at } })
      setMessages(prev => prev.map(m =>
        m._pending && m.user_id === userId && m.created_at === failedMsg.created_at
          ? { ...m, _pending: false } : m
      ))
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
    tapMedium()
    amplitudeBufferRef.current = []
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
    tapMedium()
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
    tap()
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
    tap()
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
    tapSuccess()
    const key = `${userId}/${Date.now()}.m4a`
    const now = new Date().toISOString()
    seenSet.current.add(userId + now)
    newMsgKeysRef.current.add(userId + now)
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
    // While recording or previewing audio, keep the keyboard open (TextInput
    // stays mounted+focused) but drop any typed input so it doesn't land in
    // the field behind the recording overlay.
    if (recordPhase !== 'idle') return
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
    const displayTime = formatTime(displayTimes.get(msgAnimKey) ?? msg.created_at)
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
              time={displayTime}
              msgStatus={msgStatus}
              routedToEarpiece={routedToEarpiece}
              onToggleRouting={toggleAudioRouting}
              autoPlayKey={autoPlayKey}
              onAudioFinished={handleAudioFinished}
              onAutoPlayConsumed={consumeAutoPlay}
              activePlayingKey={activePlayingKey}
              onPlayStart={handlePlayStart}
            />
          ) : msg.image_key || msg._localUri ? (
            <ImageBubble
              animate={animateIn}
              isMine={isMine}
              isLast={isLastInGroup}
              msg={msg}
              getChatImageUrl={getChatImageUrl}
              time={displayTime}
              onPress={uri => setLightboxUri(uri)}
              status={msgStatus}
            />
          ) : msg.location || msg._loadingLocation ? (
            <LocationBubble
              animate={animateIn}
              isMine={isMine}
              isLast={isLastInGroup}
              location={msg.location ?? null}
              time={displayTime}
              status={msgStatus}
            />
          ) : msg.schedule ? (
            <ScheduleBubble
              animate={animateIn}
              isMine={isMine}
              isLast={isLastInGroup}
              schedule={msg.schedule}
              senderIsMale={isMine ? isMale : matchIsMale}
              time={displayTime}
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
                    {displayTime}
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
              else if (msg.schedule) handleRetrySchedule(msg)
            }}
            style={styles.retryRow}
            hitSlop={6}
          >
            <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 9v4M12 17h.01" />
              <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </Svg>
            <Text style={styles.retryLabel}>{t('chat.retry')}</Text>
          </Pressable>
        )}
      </View>
    )
  }, [reversedMessages, messages.length, firstNewIdx, userId, otherLastRead, getChatImageUrl, getChatAudioUrl,
      handleRetryText, handleRetryImage, handleRetryAudio, handleRetryLocation, handleRetrySchedule,
      isMale, matchIsMale, displayTimes,
      routedToEarpiece, toggleAudioRouting, autoPlayKey, handleAudioFinished, consumeAutoPlay,
      activePlayingKey, handlePlayStart])

  return (
    <View style={[styles.root, { paddingTop: topInset, paddingBottom: Math.max(safeBottom, kbHeight > 0 ? kbHeight + 8 : 0) }]}>
      {/* ── Messages ──
          The body uses a plain View. Keyboard avoidance is driven entirely
          by the bottom spacer below the input row: spacer = kbHeight when
          the keyboard is open pushes the input row to sit exactly on top of
          the keyboard, regardless of platform-specific OS resize behavior. */}
      <View style={styles.body}>
        <FlatList
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
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
          ListHeaderComponent={<TypingIndicator visible={otherIsTyping} />}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: MD, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={BLACK_SOFT} />
            </View>
          ) : null}
          ListEmptyComponent={!otherIsTyping ? (
            <Text style={styles.emptyLabel}>{t('chat.empty')}</Text>
          ) : null}
        />

        {/* ── Input bar ──
            Fixed-height white footer with the input field and the send
            button on one horizontal line. The root view's paddingBottom
            (Math.max(safeBottom, kbHeight)) carries the bottom inset for
            both the nav-bar / home-indicator gesture area when the keyboard
            is closed and the keyboard height when it's open, so the input
            bar lands just above whatever sits at the bottom of the screen
            via flex layout — no per-platform spacer needed. */}
        <View style={styles.inputBarOuter}>
          {attachConfirm && (
            <View style={styles.attachConfirm}>
              <Text style={styles.attachConfirmText}>
                {attachConfirm === 'location'
                  ? tg('chat.confirmSend.location', isMale)
                  : tg('chat.confirmSend.schedule', isMale)}
              </Text>
              <Pressable
                onPress={() => {
                  tap()
                  if (attachConfirm === 'location') handleShareLocation()
                  else handleSendSchedule()
                }}
                style={({ pressed }) => [styles.attachConfirmSend, pressed && styles.attachConfirmSendPressed]}
              >
                <Text style={styles.attachConfirmSendLabel}>{t('chat.confirmSend.send')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { tap(); setAttachConfirm(null) }}
                hitSlop={8}
                style={({ pressed }) => [styles.attachConfirmClose, pressed && styles.attachBarItemPressed]}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M18 6L6 18M6 6l12 12" />
                </Svg>
              </Pressable>
            </View>
          )}
          {/* Always render the text input row so the keyboard stays open while
              recording/previewing. The recording and preview UIs overlay on top. */}
          <View style={styles.inputRow}>
            <ReAnimated.View style={[styles.inputWrap, inputWrapBorderStyle]} onLayout={e => setInputWrapWidth(e.nativeEvent.layout.width)}>
              <View style={styles.inputAnimWrap}>
                <TextInput
                  ref={inputRef}
                  style={[styles.input, { height: inputHeight }]}
                  value={text}
                  onChangeText={onInputChange}
                  onContentSizeChange={e => {
                    const h = e.nativeEvent.contentSize.height
                    setInputHeight(Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, h)))
                  }}
                  scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
                  placeholder={tg('chat.inputPlaceholder', isMale)}
                  placeholderTextColor={BLACK_MID}
                  multiline
                  blurOnSubmit={false}
                  autoFocus={false}
                />
              </View>
              <Pressable
                disabled={attachVisible}
                onPress={() => { tap(); setAttachConfirm(null); setAttachMenuOpen(true) }}
                style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BLACK_MID} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
                        disabled={pickingImage}
                        accessibilityLabel={t('chat.attachMenu.image')}
                        style={({ pressed }) => [styles.attachBarItem, pressed && styles.attachBarItemPressed]}
                      >
                        {pickingImage ? (
                          <ActivityIndicator size="small" color={WHITE} />
                        ) : (
                          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M9 5h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2z" />
                            <Circle cx={12} cy={14} r={3.5} />
                          </Svg>
                        )}
                      </Pressable>
                      <View style={styles.attachBarDivider} />
                      <Pressable
                        onPress={() => { tap(); setAttachMenuOpen(false); setAttachConfirm('location') }}
                        accessibilityLabel={t('chat.attachMenu.location')}
                        style={({ pressed }) => [styles.attachBarItem, pressed && styles.attachBarItemPressed]}
                      >
                        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                          <Circle cx={12} cy={9} r={2.5} />
                        </Svg>
                      </Pressable>
                      {canSendSchedule && (
                        <>
                          <View style={styles.attachBarDivider} />
                          <Pressable
                            onPress={() => { tap(); setAttachMenuOpen(false); setAttachConfirm('schedule') }}
                            accessibilityLabel={t('chat.attachMenu.schedule')}
                            style={({ pressed }) => [styles.attachBarItem, pressed && styles.attachBarItemPressed]}
                          >
                            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              <Rect x={3} y={4.5} width={18} height={16} rx={2.5} />
                              <Path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
                            </Svg>
                          </Pressable>
                        </>
                      )}
                      <View style={styles.attachBarDivider} />
                      <Pressable
                        onPress={() => { tap(); setAttachMenuOpen(false) }}
                        style={({ pressed }) => [styles.attachBarClose, pressed && styles.attachBarItemPressed]}
                      >
                        <View style={styles.attachBarCloseCircle}>
                          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M18 6L6 18M6 6l12 12" />
                          </Svg>
                        </View>
                      </Pressable>
                    </View>
                  </View>
                </ReAnimated.View>
              )}
            </ReAnimated.View>
            <Pressable
              onPress={() => text.trim() ? handleSend() : handleMicPress()}
              disabled={!!text.trim() && sending}
              style={({ pressed }) => [
                styles.sendBtn,
                !!text.trim() && sending && styles.sendBtnDisabled,
                pressed && styles.sendBtnPressed,
              ]}
            >
              <ReAnimated.View style={micIconStyle}><MicIcon size={ICON.lg} /></ReAnimated.View>
              <ReAnimated.View style={sendIconStyle}><SendIcon size={ICON.lg} /></ReAnimated.View>
            </Pressable>

            {recordPhase === 'recording' && (
              <View style={[styles.inputRow, styles.recordOverlay]}>
                <Pressable onPress={handleCancelRecording} style={styles.recSideBtn} hitSlop={8}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={BLACK_STRONG} strokeWidth={2.5} strokeLinecap="round">
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
                        <Path d={buildRecWavePath(liveBars, recWaveWidth, 24)} fill={PRIMARY} />
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
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={BLACK_STRONG} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M3 6h18M19 6l-1 14H6L5 6M8 6V4h8v2" />
                  </Svg>
                </Pressable>
                <Pressable onPress={handlePreviewPlayPause} style={styles.recSideBtn} hitSlop={8}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill={BLACK}>
                    {previewPlaying
                      ? <Path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                      : <Path d="M8 5v14l11-7z" />}
                  </Svg>
                </Pressable>
                <View style={styles.previewWaveWrap}>
                  <Waveform
                    bars={previewBars}
                    height={28}
                    inactiveColor={BLACK_MID}
                    activeColor={PRIMARY}
                    thumbColor={PRIMARY}
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
                  <SendIcon size={ICON.lg} />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>

      {lightboxUri && <LightboxModal uri={lightboxUri} onClose={() => setLightboxUri(null)} />}
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
          <ActivityIndicator color={isMine ? WHITE : BLACK} />
        </View>
      )}
      <View style={[styles.imageTimeRow, { flexDirection: 'row', alignItems: 'center', gap: XS }]}>
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

  const textColor = isMine ? WHITE : BLACK
  const subColor = isMine ? WHITE_STRONG : BLACK_STRONG
  const timeColor = isMine ? WHITE_STRONG : BLACK_MID
  const iconBg = isMine ? WHITE_SOFT : BLACK_SOFT

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

// Renders a snapshot kid-schedule shared in chat. The snapshot is frozen at
// send time (sender's `{anchor, weeks}`); this bubble re-renders it through the
// receiver's lens — their weekStart preference orders the columns, their
// locale formats the dates, and the rows start at the receiver's current
// displayed week so all dates shown are this-week-or-later. Each cell looks up
// kid-day/kid-free against the snapshot's weekly pattern using anchor-aware
// modular arithmetic, the same approach as the server's schedule_overlap and
// the client's familyScheduleOverlap.
//
// Visual semantics: the storage marks days the kids ARE WITH the sender, but
// the chat bubble inverts this to highlight FREE (no-kids) days — that's the
// useful signal for a partner reading the message. The header reads "Days I'm
// free (no kids)" so the inversion is unambiguous.
function ScheduleBubble({ animate, isMine, isLast, schedule, senderIsMale, time, status }: {
  animate: boolean
  isMine: boolean
  isLast: boolean
  schedule: { anchor: string; weeks: boolean[][] }
  senderIsMale: boolean | null | undefined
  time: string
  status: 'pending' | 'failed' | 'sent' | 'read'
}) {
  const viewerWeekStart = useUserStore(s => s.profile?.weekStart) ?? defaultWeekStart(appLang)
  const weekendSet = useMemo(() => new Set(weekendDays(appLang)), [])
  const dateFmt = useMemo(() => {
    try { return new Intl.DateTimeFormat(isRTL ? 'he' : 'en', { day: 'numeric', month: 'numeric' }) }
    catch { return null }
  }, [])
  const today = useMemo(() => new Date(), [])
  const todayDisplayedStart = useMemo(
    () => startOfDisplayedWeek(today, viewerWeekStart),
    [today, viewerWeekStart],
  )

  // We deliberately mirror the settings editor's indexing — `weeks[wi][absWeekday]`
  // where `wi` is the row in the displayed grid and `absWeekday = (weekStart + col) % 7`.
  // Reading anchor-relative (`floor((date−anchor)/7)` + `date.getDay()`) instead would
  // disagree with the editor on Sundays whenever `weekStart != Sunday`, because the
  // editor's "displayed week 1" crosses the storage week boundary (anchor is the
  // absolute Sunday). Keeping both surfaces on the same `wi` indexing means the
  // bubble visually matches what the sender saw in the editor at save time.
  const cycleLen = schedule.weeks.length

  const bubbleStyle = [
    styles.scheduleBubble,
    isMine ? styles.bubbleMine : styles.bubbleTheirs,
    isLast && (isMine ? styles.bubbleMineLast : styles.bubbleTheirsLast),
  ]
  const timeColor = isMine ? WHITE_STRONG : BLACK_MID

  return (
    <AnimatedBubble animate={animate} isMine={isMine} style={bubbleStyle}>
      <Text style={[styles.scheduleTitle, isMine && styles.scheduleTitleMine]} numberOfLines={2}>
        {tg('chat.scheduleTitle', senderIsMale ?? null)}
      </Text>
      {schedule.weeks.map((_w, wi) => (
        <View key={wi} style={styles.scheduleRow}>
          {[0, 1, 2, 3, 4, 5, 6].map(col => {
            const absWeekday = (viewerWeekStart + col) % 7
            const cellDate = new Date(todayDisplayedStart)
            cellDate.setDate(cellDate.getDate() + wi * 7 + col)
            const cycleWeek = ((wi % cycleLen) + cycleLen) % cycleLen
            const free = !schedule.weeks[cycleWeek]?.[absWeekday]
            const weekend = weekendSet.has(absWeekday)
            return (
              <View key={col} style={styles.scheduleCell}>
                <View style={[
                  styles.scheduleDayBubble,
                  isMine && !free && styles.scheduleDayBubbleMine,
                  weekend && !free && styles.scheduleDayBubbleWeekend,
                  weekend && !free && isMine && styles.scheduleDayBubbleWeekendMine,
                  free && styles.scheduleDayBubbleSelected,
                  free && isMine && styles.scheduleDayBubbleSelectedMine,
                ]}>
                  <Text style={[
                    styles.scheduleDayLetter,
                    isMine && styles.scheduleDayLetterMine,
                    weekend && !free && styles.scheduleDayLetterWeekend,
                    weekend && !free && isMine && styles.scheduleDayLetterWeekendMine,
                    free && styles.scheduleDayLetterSelected,
                    free && isMine && styles.scheduleDayLetterSelectedMine,
                  ]}>{t(`family.dayShort.${absWeekday}` as never)}</Text>
                </View>
                <Text style={[styles.scheduleDayDate, isMine && styles.scheduleDayDateMine]}>
                  {dateFmt ? dateFmt.format(cellDate) : `${cellDate.getMonth() + 1}/${cellDate.getDate()}`}
                </Text>
              </View>
            )
          })}
        </View>
      ))}
      <View style={styles.scheduleFooter}>
        <Text style={[styles.inlineTime, { color: timeColor }]} maxFontSizeMultiplier={FONT_SCALE.ui}>
          {time}
        </Text>
        {isMine && status !== 'failed' && <CheckMark status={status} isMine />}
      </View>
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
      Animated.timing(opacity, { toValue: 1, duration: MOTION.fast, useNativeDriver: true }),
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
      <Text style={[styles.daySepLabel, bold && { fontWeight: WEIGHT.semibold }]} maxFontSizeMultiplier={FONT_SCALE.ui}>{label}</Text>
      <View style={styles.daySepLine} />
    </View>
  )
}

// Three dots rising in a staggered loop — the same pattern iMessage/WhatsApp
// use. Each dot runs its own Animated.loop with a delay so the wave is
// smooth even if the component remounts mid-cycle.
function TypingIndicator({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(visible)
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current
  const translateY = useRef(new Animated.Value(visible ? 0 : 8)).current
  const scale = useRef(new Animated.Value(visible ? 1 : 0.9)).current

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: MOTION.fast, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 320, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, damping: 22, stiffness: 320, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: MOTION.fast, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 8, duration: MOTION.fast, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: MOTION.fast, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false) })
    }
  }, [visible])

  if (!mounted && !visible) return null
  return (
    <Animated.View style={[styles.msgWrap, styles.msgWrapFirst, { opacity, transform: [{ translateY }, { scale }] }]}>
      <TypingDots />
    </Animated.View>
  )
}

function TypingDots() {
  const a = useRef(new Animated.Value(0)).current
  const b = useRef(new Animated.Value(0)).current
  const c = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loopFor = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: MOTION.base, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: MOTION.base, useNativeDriver: true }),
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
  const bot: [number, number][] = bars.map((_h, i) => [(bars.length - 1 - i) * step, cy + bars[bars.length - 1 - i] * maxH])
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
    return Math.max(0, Math.min(1, x / width))
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
                  ...(isRTL ? { right: 0 } : { left: 0 }),
                  width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, width] }),
                  height: THUMB,
                }}
              >
                <View style={{
                  position: 'absolute',
                  top: 0,
                  ...(isRTL ? { left: -THUMB / 2 } : { right: -THUMB / 2 }),
                  width: THUMB,
                  height: THUMB,
                  borderRadius: THUMB / 2,
                  backgroundColor: thumbColor,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.18,
                  shadowRadius: 1.5,
                  elevation: 2,
                }} />
              </Animated.View>
            )}
          </>
        )}
      </View>
    </GestureDetector>
  )
}

function AudioBubble({ animate, isMine, isLast, msg, getChatAudioUrl, time, msgStatus, routedToEarpiece, onToggleRouting, autoPlayKey, onAudioFinished, onAutoPlayConsumed, activePlayingKey, onPlayStart }: {
  animate: boolean
  isMine: boolean
  isLast: boolean
  msg: Message
  getChatAudioUrl: (key: string) => Promise<string | null>
  time: string
  msgStatus: 'pending' | 'failed' | 'sent' | 'read'
  routedToEarpiece: boolean
  onToggleRouting: () => void
  autoPlayKey: string | null
  onAudioFinished: (key: string) => void
  onAutoPlayConsumed: () => void
  activePlayingKey: string | null
  onPlayStart: (key: string) => void
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
      if (msg.audio_key) onAudioFinished(msg.audio_key)
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

  // Pause this bubble whenever another bubble becomes the active player.
  useEffect(() => {
    if (!activePlayingKey) return
    if (activePlayingKey === msg.audio_key) return
    if (status.playing) player.pause()
  }, [activePlayingKey, status.playing])

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

  const startPlay = async () => {
    if (!uri || loading) return
    if (msg.audio_key) onPlayStart(msg.audio_key)
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: routedToEarpiece,
      shouldRouteThroughEarpiece: routedToEarpiece,
    })
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

  const handlePlayPause = async () => {
    if (!uri || loading) return
    tap()
    if (status.playing) {
      player.pause()
      return
    }
    await startPlay()
  }

  // Auto-play when chat signals this bubble is the next to play.
  useEffect(() => {
    if (!autoPlayKey || autoPlayKey !== msg.audio_key) return
    onAutoPlayConsumed()
    startPlay().catch(() => {})
  }, [autoPlayKey])

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
  const iconColor = isMine ? WHITE : BLACK
  const barActive = isMine ? WHITE_STRONG : PRIMARY
  const barInactive = isMine ? WHITE_MID : BLACK_MID
  const timeColor = isMine ? WHITE_STRONG : BLACK_MID
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

  const routeBtn = playing ? (
    <Pressable
      onPress={onToggleRouting}
      style={[styles.audioRouteBtn, routedToEarpiece && styles.audioRouteBtnActive]}
      hitSlop={8}
    >
      {routedToEarpiece ? (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill={WHITE}>
          <Path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.05-.24c1.16.39 2.41.6 3.7.6a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A18 18 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.29.21 2.54.6 3.7a1 1 0 0 1-.24 1.05l-2.2 2.04z" />
        </Svg>
      ) : (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill={BLACK}>
          <Path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06a8 8 0 0 1 0 14.66v2.06a10 10 0 0 0 0-18.78z" />
        </Svg>
      )}
    </Pressable>
  ) : null

  return (
    <View style={[styles.audioOuter, { justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
      {isMine && routeBtn}
      <AnimatedBubble animate={animate} isMine={isMine} style={bubbleStyle}>
        <View style={styles.audioRow}>
          <Pressable
            onPress={handlePlayPause}
            disabled={!ready}
            style={[styles.audioPlayBtn, { backgroundColor: isMine ? WHITE_SOFT : BLACK_SOFT }]}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: XS }}>
            <Text style={[styles.inlineTime, { color: timeColor }]} maxFontSizeMultiplier={FONT_SCALE.ui}>{time}</Text>
            {isMine && msgStatus !== 'failed' && <CheckMark status={msgStatus} isMine />}
          </View>
        </View>
      </AnimatedBubble>
      {!isMine && routeBtn}
    </View>
  )
}

// ── Event strip ──────────────────────────────────────────────────────────
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
    backgroundColor: SURFACE_SUNK,
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
    backgroundColor: WHITE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  body: { flex: 1 },
  messages: { flex: 1 },
  messagesContent: { padding: SM, flexGrow: 1 },
  emptyLabel: {
    marginTop: 'auto', marginBottom: 'auto', textAlign: 'center',
    color: BLACK_MID, fontSize: TEXT.md, letterSpacing: 0.4,
  },

  msgWrap: { marginTop: XS },
  msgWrapFirst: { marginTop: SM },
  failedOpacity: { opacity: 0.6 },
  retryRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: XS,
    marginTop: XS,
    paddingVertical: XS,
  },
  retryLabel: { fontSize: TEXT.xs, color: INK },

  daySep: { flexDirection: 'row', alignItems: 'center', gap: SM, paddingVertical: SM },
  daySepLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BLACK_SOFT },
  daySepLabel: { fontSize: TEXT.xs, color: BLACK_STRONG },

  bubble: {
    maxWidth: '80%',
    paddingVertical: SM,
    paddingHorizontal: MD,
    borderRadius: RADIUS,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: PRIMARY },
  bubbleMineLast: { borderBottomEndRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: BLACK_SOFT },
  bubbleTheirsLast: { borderBottomStartRadius: 4 },
  bubbleText: { fontSize: TEXT.md, lineHeight: lh(TEXT.md), flexShrink: 1 },
  bubbleTextMine: { color: WHITE },
  bubbleTextTheirs: { color: BLACK },

  inlineTime: { fontSize: TEXT.xs, lineHeight: lh(TEXT.xs), letterSpacing: 0.3 },
  inlineTimeMine: { color: WHITE_STRONG },
  inlineTimeTheirs: { color: BLACK_MID },
  bubbleTextRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SM },
  textBubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: XS, marginEnd: -SM },

  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: SM, paddingVertical: MD, paddingHorizontal: MD },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: BLACK_STRONG },

  // Outer wrapper: holds the single-row input + send button plus the
  // dynamic bottom spacer that clears the nav bar / keyboard.
  inputBarOuter: {
    backgroundColor: SURFACE,
    zIndex: 2,
  },
  inputRow: {
    flexDirection: 'row',
    // flex-end so the send button stays pinned to the bottom as the input
    // grows across multi-line content.
    alignItems: 'flex-end',
    paddingTop: SM,
    paddingHorizontal: SM,
    gap: SM,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    borderRadius: RADIUS,
    borderWidth: STROKE.thin,
    borderColor: BLACK_SOFT,
    backgroundColor: SURFACE,
    paddingEnd: XS,
    overflow: 'hidden',
  },
  inputAnimWrap: {
    flex: 1,
  },
  input: {
    // Height is driven imperatively from onContentSizeChange (see the input
    // row); a `flex: 1` here made the field fill its parent instead of
    // growing it from content, so it never expanded past one line.
    width: '100%',
    paddingStart: MD,
    paddingEnd: SM,
    paddingVertical: SM,
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    color: BLACK,
    textAlign: isRTL ? 'right' : 'left',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  sendBtn: {
    width: 49, height: 49, borderRadius: RADIUS,
    backgroundColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnPressed: { opacity: 0.85 },

  // Attach popup (inline, above input bar)
  attachBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SM,
  },
  attachBtnPressed: { opacity: 0.4 },
  attachBar: {
    position: 'absolute',
    end: 0, top: 0, bottom: 0,
    backgroundColor: PRIMARY,
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
    gap: SM,
    alignSelf: 'stretch',
  },
  attachBarItemPressed: { backgroundColor: WHITE_SOFT },
  attachBarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: WHITE_MID,
  },
  attachBarClose: {
    alignSelf: 'stretch',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachBarCloseCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: WHITE_SOFT,
    alignItems: 'center', justifyContent: 'center',
  },

  // Confirm-send popup (above input bar, keyboard stays open)
  attachConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
    paddingHorizontal: MD,
    paddingVertical: SM,
    backgroundColor: PRIMARY,
  },
  attachConfirmText: {
    flex: 1,
    fontSize: TEXT.sm,
    color: WHITE,
    fontWeight: WEIGHT.semibold,
  },
  attachConfirmClose: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 16,
  },
  attachConfirmSend: {
    paddingHorizontal: MD,
    height: 32,
    borderRadius: 16,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachConfirmSendPressed: { opacity: 0.7 },
  attachConfirmSendLabel: {
    fontSize: TEXT.sm,
    color: INK,
    fontWeight: WEIGHT.extrabold,
  },

  // Image bubble
  imageBubble: {
    width: '80%',
    borderRadius: RADIUS,
    overflow: 'hidden',
    padding: SM,
  },
  chatImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: RADIUS,
  },
  chatImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BLACK_SOFT,
  },
  chatImageSpinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS,
    backgroundColor: BLACK_MID,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageTimeRow: {
    position: 'absolute',
    bottom: SM + SM,
    end: SM + SM,
    backgroundColor: BLACK_MID,
    borderRadius: RADII.sm,
    paddingHorizontal: SM,
    paddingVertical: XS,
  },
  imageTimeText: {
    fontSize: TEXT.xs,
    lineHeight: lh(TEXT.xs),
    letterSpacing: 0.3,
    color: WHITE_STRONG,
  },

  // Audio bubble
  audioOuter: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },
  audioBubble: {
    width: '80%',
    borderRadius: RADIUS,
    paddingVertical: SM,
    paddingHorizontal: SM,
  },
  audioRouteBtn: {
    width: 32, height: 32,
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: BLACK_SOFT,
  },
  audioRouteBtnActive: {
    backgroundColor: PRIMARY,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },
  audioPlayBtn: {
    width: 34, height: 34,
    borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  audioWave: {
    flex: 1,
    height: 26,
    marginHorizontal: SM,
  },
  audioDurationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: XS,
    // SM + audioPlayBtn width (34) = 42; aligns text with waveform start.
    marginStart: SM + 34,
  },

  // Recording / preview bar
  recordOverlay: {
    position: 'absolute',
    top: 0, start: 0, end: 0, bottom: 0,
    backgroundColor: SURFACE,
  },
  recSideBtn: {
    width: 40, height: 49,
    alignItems: 'center', justifyContent: 'center',
  },
  recBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },
  recDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: PRIMARY,
  },
  recTime: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.semibold,
    color: BLACK,
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
    fontSize: TEXT.sm,
    color: BLACK_STRONG,
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'right',
    paddingEnd: XS,
  },

  // Location bubble
  locationBubble: {
    width: '80%',
    borderRadius: RADIUS,
    paddingVertical: SM,
    paddingHorizontal: SM,
  },
  locationInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
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
  locationLabel: { fontSize: TEXT.md, lineHeight: lh(TEXT.md), fontWeight: WEIGHT.semibold },
  locationSubLabel: { fontSize: TEXT.sm, lineHeight: 16, marginTop: 1 },
  locationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: XS,
    alignSelf: 'flex-end',
    marginTop: XS,
    marginEnd: -XS,
  },

  // Schedule bubble. Shape mirrors the settings family-schedule grid (M T W T F S S
  // header with date underneath); kid-day cells are filled, weekend cells are
  // tinted, kid-free cells are outlined. Bubble adapts to mine vs theirs:
  // theirs uses the same colors as the settings UI (PRIMARY accents on white);
  // mine inverts (white accents on PRIMARY) to stay legible against the orange
  // outgoing-bubble background.
  scheduleBubble: {
    paddingVertical: SM,
    paddingHorizontal: MD,
    borderRadius: RADIUS,
    gap: SM,
  },
  scheduleTitle: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: BLACK, marginBottom: XS },
  scheduleTitleMine: { color: WHITE },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SM },
  scheduleCell: { alignItems: 'center', justifyContent: 'flex-start', gap: XS },
  scheduleDayBubble: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE, borderWidth: STROKE.thin, borderColor: BLACK_SOFT,
  },
  scheduleDayBubbleMine: { backgroundColor: 'transparent', borderColor: WHITE_MID },
  scheduleDayBubbleSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  scheduleDayBubbleSelectedMine: { backgroundColor: GOLD, borderColor: GOLD },
  scheduleDayBubbleWeekend: { backgroundColor: PRIMARY_BG, borderColor: PRIMARY_BG },
  scheduleDayBubbleWeekendMine: { backgroundColor: WHITE_SOFT, borderColor: WHITE_SOFT },
  scheduleDayLetter: { fontSize: TEXT.sm, color: BLACK },
  scheduleDayLetterMine: { color: WHITE },
  scheduleDayLetterSelected: { color: WHITE },
  scheduleDayLetterSelectedMine: { color: PRIMARY },
  scheduleDayLetterWeekend: { color: GOLD },
  scheduleDayLetterWeekendMine: { color: WHITE },
  scheduleDayDate: { fontSize: TEXT.xs, color: BLACK_STRONG },
  scheduleDayDateMine: { color: WHITE_STRONG },
  scheduleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: XS,
    alignSelf: 'flex-end',
    marginEnd: -XS,
  },
})
