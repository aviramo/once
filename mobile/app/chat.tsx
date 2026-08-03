import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, AppState, BackHandler, Dimensions, Easing, FlatList, I18nManager, Image, InteractionManager, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, useAudioPlayerStatus, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio'
import { Text, TextInput } from '../src/components/AppText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler'
import ReAnimated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming, runOnJS } from 'react-native-reanimated'
import { supabase } from '../src/lib/supabase'
import { invoke } from '../src/lib/api'
import { tap, tapMedium, tapSuccess } from '../src/lib/haptics'
import { t, tg, genderize, lang as appLang } from '../src/i18n'
import { useUserStore } from '../src/stores/userStore'
import { XS, SM, MD, LG, RADIUS, RADII, TEXT, WEIGHT, STROKE, MOTION, lh, ICON, bottomGap, LONG_PRESS_MS, OVERLAY, ROUND_BUTTON_SIZE_SM, TAP_SLOP, CARD_SHADOW } from '../src/tokens'
import { inkOffset } from '../src/fonts'
import { FIELD_SKIN } from '../src/field'
import { INK, SURFACE, SURFACE_SUNK, PAGE, INK_MUTED, INK_PALE, INK_WASH, LINE, WHITE, INK_SUBTLE, INK_HINT, INK_DIM, WHITE_SOFT, WHITE_MID, WHITE_STRONG, SHADOW_BLACK } from '../src/colors'
import { SendIcon, MicIcon, StopIcon, PlusIcon, ReplyIcon, CopyIcon, TrashIcon } from '../src/components/icons'
import { BottomSheet, SheetActionRow, SheetActions } from '../src/components/BottomSheet'
import { Chip } from '../src/components/Chip'
import { copyToClipboard } from '../src/lib/clipboard'
import { PullPane, usePullBehavior, useScrollReach, PullContext, PullScrollView, type PullCtx } from '../src/components/PullPane'
import { RisingCard } from '../src/components/RisingCard'
import { SheetHeader, type OverlaySheetBody } from '../src/components/OverlaySheet'
import { ChatArt } from '../src/components/ChatArt'
import { AppStatusBar } from '../src/components/AppStatusBar'
import { StatusBarBand, BottomEdgeShade } from '../src/components/ScreenEdgeShade'
import { useBottomInset } from '../src/hooks/useBottomInset'
import { KeyboardSurface, useKeyboardOpen } from '../src/hooks/useKeyboard'
import { chatCacheKey, chatLastOpenedKey, chatLastReadKey } from '../src/keys'
import { defaultWeekStart, familyHasAnyDayMarked, startOfDisplayedWeek } from '../src/lib/family'
import { nameFromTitle } from '../src/lib/profileTitle'

const isRTL = I18nManager.isRTL
const N_REC_BARS = 34

// One thing that can be added to a message: the mark, the word beside it, and
// what the tap does. Local to the composer — this strip lives INSIDE the field's
// own pill, so it is not the app's `OptionStrip` (a mark with a caption under it,
// standing along the foot of a surface).
type AttachOption = {
  key: string
  label: string
  icon: React.ReactNode
  onPress: () => void
}

// How long the message list waits before mirroring itself to disk. Long enough
// that a burst of arrivals is one write, short enough that the cache is never
// meaningfully behind the screen. Backgrounding flushes it early.
const CACHE_PERSIST_MS = 800

// Auto-growing message input: one line = one line-height, capped at 10 lines.
// The ceiling turns the field into a scroll view once the text passes ten lines.
//
// INPUT_MIN_HEIGHT is the PILL's box — the composer's own compact height, not
// tokens' 56dp form field (a name that collides; do not import that one here).
// The TEXT is NOT stretched to it: the field is exactly as tall as its content
// and is CENTRED in the box, which is how every other field in the app is built
// (login's and onboarding's wraps state the box height and centre a
// content-sized input in it). It used to be the other way round — the input
// itself was floored at the box height — and a box taller than its content puts
// the text wherever the platform happens to align it: Android centres it
// (`textAlignVertical`), iOS top-aligns it, so the placeholder sat ~3dp above
// the centre of the pill and above the two glyph discs beside it, which is the
// off-centre text the user reported on an iPhone (2026-07-30). `textAlignVertical`
// could never have fixed it — it is an Android-only prop, and the fix has to be
// geometry, not an OS-specific alignment hint.
//
// INPUT_REST_HEIGHT is what one line measures, and it is only the SEED: the text
// engine reports the real content height on the first layout (`lh` is an
// estimate — exact at font scale 1, see tokens.ts). Nothing lays out against it
// for longer than that first frame.
const INPUT_VPAD = SM * 2
const INPUT_MIN_HEIGHT = 44
const INPUT_REST_HEIGHT = lh(TEXT.md) + INPUT_VPAD
const INPUT_MAX_LINES = 10
const INPUT_MAX_HEIGHT = lh(TEXT.md) * INPUT_MAX_LINES + INPUT_VPAD

// The audio bar's two fixed pieces, shared by BOTH of the pill's audio states so
// they are literally the same bar (user directive 2026-07-30): the leading MARK's
// cell — the recording dot, and in preview the play glyph standing on exactly its
// footprint — and the track's height. Everything after the mark (the clock, then
// the track filling the rest) is the same row with the same gaps, so the track
// starts at the same x and is the same size whichever state the pill is in.
const REC_MARK = SM
const REC_WAVE_H = 24

// mm:ss, the one clock in the composer and the bubbles.
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

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


// A reply points at the message it answers via that message's identity
// (user_id + created_at, the composite used everywhere else) and carries a
// frozen preview snapshot so the quote renders without the original needing
// to be loaded in the (paginated) list. `kind` picks the icon/label; `preview`
// is a short text excerpt for text messages, absent for media.
type ReplyKind = 'text' | 'image' | 'audio' | 'location' | 'schedule'
const REPLY_PREVIEW_MAX = 140
// Typing indicator: how long the dots survive on the last received "typing"
// broadcast, and how often we send one while the user keeps typing. The idle
// window must comfortably outlast the send interval or the dots flicker
// between two keystrokes.
const TYPING_IDLE_MS = 3000
const TYPING_SEND_EVERY_MS = 2000
// Entrance offsets for the floating dots (also their exit target).
const TYPING_RISE = 8
const TYPING_ENTER_SCALE = 0.9
interface ReplySnapshot {
  user_id: string
  created_at: string
  kind: ReplyKind
  preview?: string | null
}

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
  reply_to?: ReplySnapshot | null
  // A message its sender deleted. The row survives — both sides keep the same
  // history and a reply quoting it still points somewhere — with every content
  // column stripped server-side, so this stamp is the whole message: the bubble
  // says "this message was deleted", on the sending side and the receiving side
  // alike.
  deleted_at?: string | null
  is_event?: boolean
  _pending?: boolean
  _failed?: boolean
  _localUri?: string  // optimistic image preview before upload completes
  _loadingLocation?: boolean  // spinner while GPS acquires precise fix
  _audioUri?: string  // local URI for optimistic audio preview
}

// Classify a message into a ReplyKind by the same content-dispatch order the
// renderer uses, so a quote's icon always matches how the original renders.
function replyKindOf(m: Message): ReplyKind {
  if (m.audio_key || m._audioUri) return 'audio'
  if (m.image_key || m._localUri) return 'image'
  if (m.location || m._loadingLocation) return 'location'
  if (m.schedule) return 'schedule'
  return 'text'
}

// The tombstone, client-side: exactly what the server writes on the row, so the
// bubble the deleter sees the instant he taps is the bubble that comes back off
// the wire. Every content field goes, the local previews with them.
function markDeleted(m: Message): Message {
  return {
    user_id: m.user_id,
    other_id: m.other_id,
    created_at: m.created_at,
    deleted_at: new Date().toISOString(),
  }
}

// Freeze the snapshot stored on the reply we're about to send.
function buildReplySnapshot(m: Message): ReplySnapshot {
  const kind = replyKindOf(m)
  return {
    user_id: m.user_id,
    created_at: m.created_at,
    kind,
    preview: kind === 'text' ? (m.text ?? '').slice(0, REPLY_PREVIEW_MAX) : null,
  }
}

// The one-line label a quote shows for a non-text message (text quotes show
// their excerpt instead). Reused by the bubble quote and the composer bar.
function replyPreviewLabel(kind: ReplyKind): string {
  switch (kind) {
    case 'image': return t('chat.reply.image')
    case 'audio': return t('chat.reply.audio')
    case 'location': return t('chat.reply.location')
    case 'schedule': return t('chat.reply.schedule')
    default: return ''
  }
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
  const c = isMine ? WHITE_STRONG : INK_MUTED
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
  // the home shell can show a presence dot beside the chat tab icon.
  onOnlineChange?: (online: boolean) => void
  autoFocusInput?: boolean
  // Wiring handed down by the enclosing OverlaySheet so the message list can
  // tell the sheet's dismiss pan when a downward drag on the body should close
  // it. The chat sheet opens with `dragFrom="header"` (see home.tsx), so only
  // the header dismisses UNLESS this reports "at top" — which we do whenever a
  // downward drag genuinely can't scroll: the inverted list is empty/fits the
  // viewport, or it is scrolled to the oldest end with nothing more to page in.
  // See the "Sheet dismiss coordination" block below.
  sheetBody?: OverlaySheetBody
}

export default function ChatPage({ topInset = 0, isActive = true, onUnreadChange, onOnlineChange, autoFocusInput, sheetBody }: ChatPageProps = {}) {
  const insets = useSafeAreaInsets()
  const bottomInset = useBottomInset()
  const { profile } = useUserStore()
  const userId = profile?.user_id ?? ''
  const match = profile?.relations?.match
  const otherId = match?.user_id ?? ''
  const isMale = profile?.is_male ?? null
  const matchIsMale = match?.is_male ?? null
  const [messages, setMessagesRaw] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [contentHeight, setContentHeight] = useState(INPUT_REST_HEIGHT)
  // A LINE THE USER HAS OPENED IS A LINE, EMPTY OR NOT (2026-08-03). iOS's
  // UITextView leaves a TRAILING empty line out of its contentSize, and reports
  // no content-size change at all for the Enter that opened it — so the field
  // grew by nothing and the caret stood outside the pill until a character was
  // typed on the new line. Android counts it and is untouched. The height is
  // therefore DERIVED from the text on every render rather than being whatever
  // the last measurement said: the keystroke is the event, since there is no
  // other. The line unit is MEASURED (the smallest content height ever reported,
  // less our own vertical padding) and never `lh`, which is an estimate.
  //
  // AND THE OPEN LINES ARE COUNTED FROM A FIXED BASE, NEVER ADDED TO WHAT WAS
  // MEASURED. A UITextView's contentSize grows to fill its own frame, so the
  // taller frame we hand it for an open line comes straight back as a content
  // report: added on top of the report, one Enter ran the field away up the
  // screen; rejected instead, the field had no honest measurement to return to
  // and collapsed to one line the moment a character was typed (iOS emits
  // nothing for that character — by then its contentSize already holds the
  // height our own frame gave it). So the report is ALWAYS accepted, and the
  // open lines are measured off the height the text had WITHOUT them
  // (`baseRef`), which is exactly what the report settles on. The two agree
  // instead of chasing each other: nothing is added twice, and nothing shrinks.
  const lineUnitRef = useRef(lh(TEXT.md))
  const baseRef = useRef(INPUT_REST_HEIGHT)
  const openLines = Platform.OS === 'ios' ? (text.match(/\n+$/)?.[0].length ?? 0) : 0
  if (!openLines) {
    baseRef.current = contentHeight
    lineUnitRef.current = Math.min(lineUnitRef.current, Math.max(1, contentHeight - INPUT_VPAD))
  }
  const inputHeight = Math.min(
    INPUT_MAX_HEIGHT,
    Math.max(contentHeight, baseRef.current + openLines * lineUnitRef.current),
  )
  // Centring the field's line BOX in the pill still leaves the INK sitting low
  // in it: a line box is not symmetric about the letters it carries, and in
  // Hebrew the ink centre falls ~0.09 em below the box centre (inkOffset, the
  // app's one correction for this — the same number GlyphSlot nudges a glyph by
  // to stand on a label's ink). Taken off the top padding and given back to the
  // bottom, so the ink lands on the pill's centre — level with the plus and the
  // send disc, which are glyph-centred in their own square slots — while the
  // field's total height is still INPUT_VPAD + its lines, which is what the
  // grow/cap arithmetic above counts.
  const inkPad = inkOffset(TEXT.md)
  const [sending, setSending] = useState(false)
  const [otherIsOnline, setOtherIsOnline] = useState(false)
  // The dots are chrome, not a message: they float next to the sheet's close X
  // and are OUT of the list entirely (user directive 2026-07-27). Nothing about
  // them touches layout, so showing/hiding them can never move the page — which
  // is what made them jump when they lived in the list as its header row.
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const [otherLastRead, setOtherLastRead] = useState<string | null>(null)
  // The message the composer is currently answering (null = normal compose).
  // Mirrored to a ref so the send handlers (memoized without replyTo in deps)
  // can read-and-clear it without re-creating on every keystroke.
  const [replyTo, setReplyTo] = useState<ReplySnapshot | null>(null)
  const replyToRef = useRef<ReplySnapshot | null>(null)
  useEffect(() => { replyToRef.current = replyTo }, [replyTo])
  const takeReply = useCallback((): ReplySnapshot | undefined => {
    const r = replyToRef.current
    if (r) { replyToRef.current = null; setReplyTo(null) }
    return r ?? undefined
  }, [])

  // ── Cache helpers ──────────────────────────────────────────────────────
  const cacheKey = otherId ? chatCacheKey(otherId) : ''
  const readReceiptKey = otherId ? chatLastReadKey(otherId) : ''
  const setMessages = useCallback((update: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesRaw(update)
  }, [])

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Everything the write needs, parked so the flush can run from OUTSIDE the
  // effect that scheduled it (backgrounding, below). `dirty` is what makes the
  // debounce a debounce: filtering and serializing the whole list is the
  // expensive part, so it happens once per flush, not once per message.
  const persistInputRef = useRef<{ key: string; userId: string; otherId: string; messages: Message[] } | null>(null)
  const persistDirtyRef = useRef(false)

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null }
    const input = persistInputRef.current
    if (!persistDirtyRef.current || !input) return
    persistDirtyRef.current = false
    const clean = input.messages
      .filter(m =>
        !m._pending && !m._failed &&
        ((m.user_id === input.userId && m.other_id === input.otherId) ||
          (m.user_id === input.otherId && m.other_id === input.userId)),
      )
      .map(({ _pending, _failed, _localUri, _audioUri, _loadingLocation, ...rest }) => rest)
    if (clean.length === 0) return
    AsyncStorage.setItem(input.key, JSON.stringify(clean)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cacheKey || !userId || !otherId) return
    persistInputRef.current = { key: cacheKey, userId, otherId, messages }
    persistDirtyRef.current = true
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(flushPersist, CACHE_PERSIST_MS)
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current) }
  }, [messages, cacheKey, userId, otherId, flushPersist])

  // The debounce is the only thing between a just-arrived message and the disk,
  // and a process the OS kills from the background never gets to run it — the
  // last message would be missing from the cache on the next launch. Leaving
  // 'active' is the last moment we are guaranteed, so write there. Deliberately
  // NOT flushed on unmount: unmount means the chat ended, and home.tsx is
  // deleting this very key at that moment (see clearChatCache).
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s !== 'active') flushPersist() })
    return () => sub.remove()
  }, [flushPersist])

  const scrollRef = useRef<FlatList>(null)
  const inputRef = useRef<any>(null)
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
  const [attachConfirm, setAttachConfirm] = useState<'location' | 'schedule' | null>(null)
  // A picker is on its way up. NOTHING IS DRAWN FOR IT (user directive
  // 2026-08-01): the picker is its own answer to the tap, and a spinner is for
  // the photo going to the server — which is what the pending bubble already
  // says. A ref, so the guard against a second picker costs no render.
  const pickerOpen = useRef(false)

  // Warm up the image picker once on chat mount: a no-op permission read
  // initializes the native bridge so the first launchImageLibraryAsync after
  // this is dramatically faster.
  useEffect(() => { ImagePicker.getMediaLibraryPermissionsAsync().catch(() => {}) }, [])
  // THE STRIP IS ONE STATE OF THE FIELD, AND THE CONFIRMATION IS ANOTHER OF THE
  // SAME ONE (user directive 2026-08-02). Choosing a place or a schedule used to
  // put the options away and raise a purple bar ABOVE the composer with its own
  // send button and its own X — three controls saying what the field's own two
  // already say. It stays in the box: the sentence rises where the options were,
  // the pill's own send mark sends it and the plus, still turned as an X, is what
  // cancels it. So the strip is open for both, and one flag says so.
  const attachOpen = attachMenuOpen || !!attachConfirm
  const attachAnim = useSharedValue(0)
  useEffect(() => { attachAnim.value = withTiming(attachOpen ? 1 : 0) }, [attachOpen])
  // BACK PUTS THE STRIP AWAY BEFORE IT PUTS THE CHAT AWAY (user directive
  // 2026-08-02) — from both of its states, and back to an ordinary field either
  // way, which is exactly what the X beside it does. Registered here rather than
  // in the shell: chat mounts after home, and the last handler registered is the
  // first one asked, so this stands in front of the overlay's own pop and falls
  // through to it (returning false) whenever the field is already at rest.
  useEffect(() => {
    if (!attachOpen) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (attachConfirm) { setAttachConfirm(null); return true }
      if (attachMenuOpen) { setAttachMenuOpen(false); return true }
      return false
    })
    return () => sub.remove()
  }, [attachOpen, attachConfirm, attachMenuOpen])
  // ── THE ADD GLYPH IS THE CLOSE GLYPH, TURNED ───────────────────────────────
  // The options do not slide in over the field from the side any more: the plus
  // TURNS 45° into an X and the options RISE INTO THE FIELD from below, so the one
  // mark that opened them is the one that puts them away. There is therefore no
  // second X in the row — a strip whose own opener is standing there as a close
  // mark has nothing left to carry one for.
  const attachPlusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${attachAnim.value * 45}deg` }],
  }))
  // The strip rises through the pill's own clip, out of the bottom edge and back
  // down into it. Its travel is the resting line's height, which is the box it
  // lands in — nothing here is measured.
  const attachStripStyle = useAnimatedStyle(() => ({
    opacity: attachAnim.value,
    transform: [{ translateY: INPUT_MIN_HEIGHT * (1 - attachAnim.value) }],
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

  // ── Reply-to-message ─────────────────────────────────────────────────────
  // Arm the composer to answer `m`, and focus the field so the keyboard is
  // ready. The quote snapshot is frozen here (see buildReplySnapshot).
  const beginReply = useCallback((m: Message) => {
    setReplyTo(buildReplySnapshot(m))
    inputRef.current?.focus()
  }, [])

  // ── Message actions (long press) ─────────────────────────────────────────
  // The swipe-to-reply gesture is easy to miss and easy to lose to the list's
  // scroll, so a long press on any bubble opens the same reply as an explicit
  // choice, alongside copy-the-text. The sheet is a Modal: a follow-up that
  // touches the keyboard (reply focuses the composer) must run only after it
  // has unmounted, so actions are stashed and fired from onClosed — the same
  // chaining every other sheet in the app uses.
  const [actionsMsg, setActionsMsg] = useState<Message | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsAfterRef = useRef<(() => void) | null>(null)
  const openMsgActions = useCallback((m: Message) => {
    if (!msgActionsAvailable(m, m.user_id === userId)) return
    setActionsMsg(m)
    setActionsOpen(true)
  }, [userId])
  const closeMsgActions = useCallback(() => setActionsOpen(false), [])
  const handleActionsClosed = useCallback(() => {
    const after = actionsAfterRef.current
    actionsAfterRef.current = null
    setActionsMsg(null)
    after?.()
  }, [])
  const handleActionReply = useCallback((m: Message) => {
    tap()
    actionsAfterRef.current = () => beginReply(m)
    setActionsOpen(false)
  }, [beginReply])
  const handleActionCopy = useCallback((m: Message) => {
    tapSuccess()
    copyToClipboard(m.text ?? '')
    setActionsOpen(false)
  }, [])
  // Deleting is ONE tap, with no confirm behind it (user directive 2026-08-03):
  // the row names the action and the sheet is the surface it was decided on, so
  // asking again is the app asking the user to agree with himself. A send that
  // never reached the server has no row to tombstone and is simply dropped from
  // the list; anything else becomes the tombstone locally at once — the server
  // stamps the same row, and the partner's client hears it over Realtime.
  const handleActionDelete = useCallback((m: Message) => {
    tapSuccess()
    setActionsOpen(false)
    const key = m.user_id + m.created_at
    if (m._failed || m._pending) {
      setMessages(prev => prev.filter(p => p.user_id + p.created_at !== key))
      return
    }
    setMessages(prev => prev.map(p => p.user_id + p.created_at === key ? markDeleted(p) : p))
    invoke('app/chat_delete', { chat_delete: { created_at: m.created_at } }).catch(() => {})
  }, [])
  // The message a quote-tap just jumped to, flashed briefly as a "here it is"
  // hint. `n` is a nonce so tapping the same quote again re-triggers the flash;
  // the whole thing is cleared after the pulse so it never lingers.
  const [highlight, setHighlight] = useState<{ key: string; n: number } | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (highlightTimer.current) clearTimeout(highlightTimer.current) }, [])
  // Jump to the original message a quote points at, when it's loaded in the
  // list, and flash it. Silently no-ops if it's been paged out (older than the
  // loaded page).
  const scrollToOriginal = useCallback((snap: ReplySnapshot) => {
    const idx = reversedMessages.findIndex(m => m.user_id === snap.user_id && m.created_at === snap.created_at)
    if (idx < 0) return
    scrollRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 })
    setHighlight(prev => ({ key: snap.user_id + snap.created_at, n: (prev?.n ?? 0) + 1 }))
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlight(null), HIGHLIGHT_TOTAL_MS)
  }, [reversedMessages])

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
  // Lift the partner's online status to the home shell (presence dot on the
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

  // No keyboard avoidance here, and none anywhere else either. THIS PAGE ends
  // near the top of the keyboard (its own `KeyboardSurface`, since 2026-08-03 —
  // the app root shrinks nothing), so the composer — an ordinary flex sibling at
  // the bottom of this page — rides it up and down with nothing to do. ONE
  // number, stated once: the app's bottom air, which the shrink spends HALF of
  // while the keyboard is up (the band this air clears is
  // under the keyboard) and none of at rest. Nothing about that is this file's
  // business, and there is deliberately no second, keyboard-aware value here.
  const safeBottom = bottomGap(bottomInset, SM)
  const keyboardOpen = useKeyboardOpen()

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
      // The disk usually wins, but not always: on a warm connection with a
      // short history the server load below can land first, and the user can
      // have sent an optimistic message by now too. Either way the cache has
      // become the STALE copy — it may only ever fill an empty list, never
      // overwrite what is already on screen.
      if (initialLoaded.current) return
      try {
        const cached = (JSON.parse(raw) as Message[]).filter(m =>
          (m.user_id === userId && m.other_id === otherId) ||
          (m.user_id === otherId && m.other_id === userId),
        )
        if (cached.length > 0) {
          cached.forEach(m => seenSet.current.add(m.user_id + m.created_at))
          setMessagesRaw(prev => prev.length > 0 ? prev : cached)
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
      const key = chatLastOpenedKey(otherId)
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
      // The partner deleting one of their own messages: the row stays and is
      // stamped, so what arrives is an UPDATE on a message we already hold. The
      // bubble becomes the tombstone in place — its OWN created_at string is
      // kept, because that string is the list's key everywhere else and the wire
      // may format the same instant differently, so the row is matched on the
      // instant and rewritten rather than swapped for the payload. An event that
      // never lands (socket asleep) costs nothing: the next history load reads
      // the same stamped row.
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'chat', filter: `other_id=eq.${userId}` },
        (payload: any) => {
          const row = payload?.new as Message | undefined
          if (!row?.deleted_at || row.user_id !== otherId) return
          const at = Date.parse(row.created_at)
          setMessages(prev => prev.map(m =>
            m.user_id === row.user_id && Date.parse(m.created_at) === at ? markDeleted(m) : m))
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
        if (key === otherId) {
          setOtherIsOnline(false)
          clearTimeout(typingTimerRef.current)
          setOtherIsTyping(false)
        }
      })
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: { uid: string } }) => {
        if (payload.uid === otherId) {
          setOtherIsTyping(true)
          clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setOtherIsTyping(false), TYPING_IDLE_MS)
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
        if (fresh.some(m => m.user_id === otherId)) {
          clearTimeout(typingTimerRef.current)
          setOtherIsTyping(false)
        }
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

  // The keyboard opening or closing re-pins the inverted list to its bottom
  // (offset 0). NOT animated, deliberately: the page is already shrinking to the
  // keyboard over the same quarter-second, and a second animation running
  // alongside it is precisely what makes the whole thing read as two motions
  // instead of one (user report 2026-07-30). `useKeyboardOpen` flips at the
  // START of an opening, so this lands before the shrink begins rather than
  // competing with it — and when the list is already at 0, which is the common
  // case, it is a no-op.
  //
  // The typing indicator deliberately does NOT re-pin: it is the list's header,
  // i.e. the bottom-most row of an inverted list, so at offset 0 it is already
  // on screen, and firing a scroll here only raced the one the arriving message
  // schedules and made the list lurch.
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: false }))
  }, [keyboardOpen])

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
    // A page of history rises the way an arriving message does (user directive
    // 2026-08-02). It is marked per KEY rather than as a block because the list
    // only mounts the handful of rows the user has actually scrolled to: each
    // bubble plays its entrance as it comes into view, and the key is spent by
    // that first paint (see renderItem), so scrolling back past it later paints
    // it still.
    older.forEach(m => {
      seenSet.current.add(m.user_id + m.created_at)
      newMsgKeysRef.current.add(m.user_id + m.created_at)
    })
    setMessages(prev => [...older, ...prev])
    setLoadingMore(false)
    loadingMoreRef.current = false
  }, [userId, otherId])

  // Stable ref so handleEndReached (empty deps) can always call the latest loadMore.
  const loadMoreRef = useRef(loadMore)
  useEffect(() => { loadMoreRef.current = loadMore }, [loadMore])

  // ── Sheet dismiss coordination ────────────────────────────────────────────
  // NOTHING TO COORDINATE ANY MORE. The message list is inverted, so a drag
  // downward scrolls INTO history at offset 0 and runs out only at the list's
  // MAX offset — and that is now one term in the pull's own arithmetic
  // (`inverted` on ScrollReach), asked of the scroll on the frame the gesture
  // decides. What stood here was this page's way of answering a boolean the
  // gesture used to depend on: its own layout/content measurements, a
  // scrollability flag, a re-assert on every open to survive the sheet's seed,
  // and the two mechanisms that turned all of that back into a drag. All of it
  // is deleted, and with it the bug it carried — a FlatList hands its onLayout
  // to more than its own box, so the box that came out of it (222dp holding
  // 835dp of content) said the list had plenty left to scroll and the sheet
  // refused a body swipe for the rest of its life.
  //
  // What remains is the wiring the list needs to run over PullScrollView at all:
  // the sheet's own pan as a simultaneous handler, so the pan can claim the
  // boundary overscroll while the pinned native scroll cannot move.
  const { dismissGestureRef, pullEngaged: sheetPullEngaged, reach: sheetReach } = sheetBody ?? {}
  const idlePull = useSharedValue(false)
  const idleReach = useScrollReach()
  const pullCtx = useMemo<PullCtx | null>(() => dismissGestureRef ? {
    panRef: dismissGestureRef,
    extraRefs: [],
    reach: sheetReach ?? idleReach,
    pullEngaged: sheetPullEngaged ?? idlePull,
  } : null, [dismissGestureRef, sheetPullEngaged, sheetReach, idlePull, idleReach])
  // Keyed off the stable dismissGestureRef, so a new renderScrollComponent can
  // never remount the scroll view mid-drag. `inverted` is what tells the pull
  // which end of this list is "nothing left to give".
  const renderScrollComponent = useMemo(
    () => dismissGestureRef ? (props: any) => <PullScrollView {...props} inverted /> : undefined,
    [dismissGestureRef],
  )

  // ── Scroll handlers ───────────────────────────────────────────────────────
  // The page's own reading of the offset, for its jump-to-latest button and its
  // read receipts. The PULL reads the scroll for itself (see above), so nothing
  // here feeds a gesture any more.
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
    setContentHeight(INPUT_REST_HEIGHT)
    const now = new Date().toISOString()
    const reply = takeReply()
    seenSet.current.add(userId + now)
    newMsgKeysRef.current.add(userId + now)
    setMessages(prev => [...prev, { user_id: userId, other_id: otherId, created_at: now, text: msg, reply_to: reply, _pending: true }])
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
    try {
      await invoke('app/chat', { chat: { text: msg, reply_to: reply, created_at: now } })
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
  }, [text, sending, userId, otherId, takeReply])

  const handleRetryText = useCallback(async (failedMsg: Message) => {
    if (!failedMsg.text || !userId || !otherId) return
    setMessages(prev => prev.map(m =>
      m._failed && m.user_id === userId && m.created_at === failedMsg.created_at
        ? { ...m, _failed: false, _pending: true } : m
    ))
    try {
      await invoke('app/chat', { chat: { text: failedMsg.text, reply_to: failedMsg.reply_to ?? undefined, created_at: failedMsg.created_at } })
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
    if (pickerOpen.current) return
    // The tap is answered by the picker, so the strip that raised it closes on
    // the tap like every other choice in it. Nothing is drawn for the picker's
    // own cold start: the bubble's spinner is for the upload.
    setAttachMenuOpen(false)
    pickerOpen.current = true
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
    }).finally(() => { pickerOpen.current = false })
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
    const reply = takeReply()
    // Optimistic bubble with local preview
    seenSet.current.add(userId + now)
    newMsgKeysRef.current.add(userId + now)
    setMessages(prev => [...prev, {
      user_id: userId, other_id: otherId, created_at: now,
      image_key: key, reply_to: reply, _localUri: localUri, _pending: true,
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
      await invoke('app/chat', { chat: { image_key: key, reply_to: reply, created_at: now } })
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
  }, [userId, otherId, takeReply])

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
      await invoke('app/chat', { chat: { image_key: key, reply_to: failedMsg.reply_to ?? undefined, created_at: failedMsg.created_at } })
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
    const reply = takeReply()
    const loadingKey = userId + now
    seenSet.current.add(loadingKey)
    newMsgKeysRef.current.add(loadingKey)
    setMessages(prev => [...prev, {
      user_id: userId, other_id: otherId, created_at: now,
      reply_to: reply, _pending: true, _loadingLocation: true,
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
      await invoke('app/chat', { chat: { location, reply_to: reply, created_at: now } })
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
  }, [userId, otherId, takeReply])

  const handleRetryLocation = useCallback(async (failedMsg: Message) => {
    if (!failedMsg.location || !userId || !otherId) return
    setMessages(prev => prev.map(m =>
      m._failed && m.user_id === userId && m.created_at === failedMsg.created_at
        ? { ...m, _failed: false, _pending: true } : m
    ))
    try {
      await invoke('app/chat', { chat: { location: failedMsg.location, reply_to: failedMsg.reply_to ?? undefined, created_at: failedMsg.created_at } })
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
    const reply = takeReply()
    const key = userId + now
    seenSet.current.add(key)
    newMsgKeysRef.current.add(key)
    setMessages(prev => [...prev, {
      user_id: userId, other_id: otherId, created_at: now,
      schedule: snapshot, reply_to: reply, _pending: true,
    }])
    requestAnimationFrame(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }))
    try {
      await invoke('app/chat', { chat: { schedule: snapshot, reply_to: reply, created_at: now } })
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
  }, [userId, otherId, myFamily, takeReply])

  // What can be added to this message. Each option puts the strip away as it
  // goes: the plus turns back into a plus in the same movement. The glyphs are
  // ICON.md — a mark standing beside a line of text, sized as the send and mic
  // marks in the same pill are.
  const attachOptions = useMemo<AttachOption[]>(() => [
    {
      key: 'image',
      label: t('chat.attachMenu.image'),
      icon: (
        <Svg width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M9 5h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2z" />
          <Circle cx={12} cy={14} r={3.5} />
        </Svg>
      ),
      onPress: handlePickImage,
    },
    {
      key: 'location',
      label: t('chat.attachMenu.location'),
      icon: (
        <Svg width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <Circle cx={12} cy={9} r={2.5} />
        </Svg>
      ),
      onPress: () => { tap(); setAttachMenuOpen(false); setAttachConfirm('location') },
    },
    ...(canSendSchedule ? [{
      key: 'schedule',
      label: t('chat.attachMenu.schedule'),
      icon: (
        <Svg width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={3} y={4.5} width={18} height={16} rx={2.5} />
          <Path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </Svg>
      ),
      onPress: () => { tap(); setAttachMenuOpen(false); setAttachConfirm('schedule') },
    } as AttachOption] : []),
  ], [canSendSchedule, handlePickImage])

  const handleRetrySchedule = useCallback(async (failedMsg: Message) => {
    if (!failedMsg.schedule || !userId || !otherId) return
    setMessages(prev => prev.map(m =>
      m._failed && m.user_id === userId && m.created_at === failedMsg.created_at
        ? { ...m, _failed: false, _pending: true } : m
    ))
    try {
      await invoke('app/chat', { chat: { schedule: failedMsg.schedule, reply_to: failedMsg.reply_to ?? undefined, created_at: failedMsg.created_at } })
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
    const reply = takeReply()
    setMessages(prev => [...prev, {
      user_id: userId, other_id: otherId, created_at: now,
      audio_key: key, audio_bars: bars, audio_duration_ms: durationMs,
      reply_to: reply, _audioUri: localUri, _pending: true,
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
      await invoke('app/chat', { chat: { audio_key: key, audio_bars: bars, audio_duration_ms: durationMs, reply_to: reply, created_at: now } })
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
  }, [audioUri, userId, otherId, previewBars, audioDuration, takeReply])

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
      await invoke('app/chat', { chat: { audio_key: key, audio_bars: failedMsg.audio_bars ?? null, audio_duration_ms: failedMsg.audio_duration_ms ?? null, reply_to: failedMsg.reply_to ?? undefined, created_at: failedMsg.created_at } })
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
    const now = Date.now()
    if (presenceChannelRef.current && now - lastTypingSentRef.current > TYPING_SEND_EVERY_MS) {
      lastTypingSentRef.current = now
      presenceChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { uid: userId } })
    }
  }


  // ── Derived ──────────────────────────────────────────────────────────────
  // The composer holds something sendable → the round button is Send, not Mic.
  const hasText = text.trim().length > 0
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
    // Spent by the first paint: `delete` answers whether the key was there AND
    // takes it away. An entrance is something a bubble does ONCE. The list
    // recycles its rows, so a key left standing would replay the rise every time
    // the user scrolled past that message again, which reads as the history
    // re-arriving. AnimatedBubble reads `animate` at mount only, so a later
    // re-render of the same bubble (a read receipt landing) sees false and
    // correctly changes nothing.
    const animateIn = newMsgKeysRef.current.delete(msgAnimKey)
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
        <HighlightFlash active={highlight?.key === msgAnimKey} pulse={highlight?.n ?? 0}>
        <SwipeToReply enabled={!msg._failed && !msg.deleted_at} onReply={() => beginReply(msg)} onLongPress={() => openMsgActions(msg)}>
        <View style={msg._failed ? styles.failedOpacity : undefined}>
          {msg.deleted_at ? (
            // The tombstone, and it is DELIBERATELY NOT A BUBBLE (user directive
            // 2026-08-03). A bubble is a message — a filled tile lifted off the
            // page, purple for mine and white for theirs — and there is no
            // message here any more, so what is left keeps only the two things
            // that are still true: which side it came from, and when. No fill,
            // no lift, just the app's hairline around a line of muted ink, so it
            // reads as a GAP in the conversation rather than as something said.
            // The ink is the same on both sides for the same reason: a message
            // that is gone is the same nothing whoever wrote it. No ticks —
            // whether a message that is gone was read says nothing.
            <AnimatedBubble
              animate={animateIn}
              isMine={isMine}
              style={[
                styles.bubble,
                styles.bubbleDeleted,
                isMine ? styles.bubbleDeletedMine : styles.bubbleDeletedTheirs,
              ]}
            >
              <View style={styles.bubbleTextRow}>
                <TrashIcon color={INK_HINT} size={ICON.sm} />
                <Text style={[styles.bubbleText, styles.bubbleTextDeleted]}>
                  {t('chat.deleted')}
                </Text>
                <View style={styles.textBubbleFooter}>
                  <Text style={[styles.inlineTime, styles.inlineTimeDeleted]}>
                    {displayTime}
                  </Text>
                </View>
              </View>
            </AnimatedBubble>
          ) : msg.audio_key || msg._audioUri ? (
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
              reply={msg.reply_to}
              onReplyPress={() => msg.reply_to && scrollToOriginal(msg.reply_to)}
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
              reply={msg.reply_to}
              onReplyPress={() => msg.reply_to && scrollToOriginal(msg.reply_to)}
            />
          ) : msg.location || msg._loadingLocation ? (
            <LocationBubble
              animate={animateIn}
              isMine={isMine}
              isLast={isLastInGroup}
              location={msg.location ?? null}
              time={displayTime}
              status={msgStatus}
              reply={msg.reply_to}
              onReplyPress={() => msg.reply_to && scrollToOriginal(msg.reply_to)}
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
              reply={msg.reply_to}
              onReplyPress={() => msg.reply_to && scrollToOriginal(msg.reply_to)}
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
              {msg.reply_to && (
                <ReplyQuote
                  snapshot={msg.reply_to}
                  tone={isMine ? 'mine' : 'theirs'}
                  onPress={() => msg.reply_to && scrollToOriginal(msg.reply_to)}
                />
              )}
              <View style={styles.bubbleTextRow}>
                <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                  {msg.text}
                </Text>
                <View style={styles.textBubbleFooter}>
                  <Text style={[styles.inlineTime, isMine ? styles.inlineTimeMine : styles.inlineTimeTheirs]}>
                    {displayTime}
                  </Text>
                  {isMine && msgStatus !== 'failed' && <CheckMark status={msgStatus} isMine />}
                </View>
              </View>
            </AnimatedBubble>
          )}
        </View>
        </SwipeToReply>
        </HighlightFlash>
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
            <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 9v4M12 17h.01" />
              <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </Svg>
            <Text style={styles.retryLabel}>{genderize(t('chat.retry'), isMale)}</Text>
          </Pressable>
        )}
      </View>
    )
  }, [reversedMessages, messages.length, firstNewIdx, userId, otherLastRead, getChatImageUrl, getChatAudioUrl,
      handleRetryText, handleRetryImage, handleRetryAudio, handleRetryLocation, handleRetrySchedule,
      isMale, matchIsMale, displayTimes, beginReply, openMsgActions, scrollToOriginal, highlight,
      routedToEarpiece, toggleAudioRouting, autoPlayKey, handleAudioFinished, consumeAutoPlay,
      activePlayingKey, handlePlayStart])

  return (
    // The composer is a text field, so the CHAT PAGE is what ends at the top of
    // the keyboard (user directive 2026-08-03) — the app's root shrinks nothing
    // any more, so home behind this sheet keeps the whole screen whatever the
    // keyboard is doing. See KeyboardSurface.
    <KeyboardSurface style={[styles.root, { paddingTop: topInset, paddingBottom: safeBottom }]}>
      {/* ── Messages ──
          A plain View, and one bottom padding for every case: the page itself
          ends at the top of the keyboard, so this is the design gap above it. */}
      <View style={styles.body}>
        {/* THE BOX IS MEASURED ON A VIEW WE OWN, NEVER ON THE LIST.
            A FlatList hands the `onLayout` it is given to more than its own
            box — the inner content container reports through it too (x=8,
            i.e. messagesContent's own padding) — and the handler cannot tell
            the two apart, so whichever event lands LAST wins. When that was
            the inner box, the list read as "222 tall holding 835 of content",
            i.e. plenty left to scroll, and the sheet refused to close on a
            body drag for the rest of its life: a short chat fires no scroll,
            no further layout and no content-size event to correct it. Which
            of the two lands last is pure timing — it showed on a physical
            device and never on the emulator. This wrapper is a plain View of
            ours and the list fills it, so its height is the list's, once. */}
        <View style={styles.messagesArea}>
        <PullContext.Provider value={pullCtx}>
        <FlatList
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          automaticallyAdjustKeyboardInsets={false}
          // Route scroll through PullScrollView so the dismiss pan can run
          // simultaneously and claim the boundary overscroll at the oldest end.
          renderScrollComponent={renderScrollComponent}
          data={reversedMessages}
          keyExtractor={(item) => `${item.user_id}-${item.created_at}`}
          renderItem={renderItem}
          inverted
          // The scroll stays ON at every length. A list with nothing to scroll
          // reports max 0, which IS "nothing left to give", so the drag reaches
          // the sheet's pan without the list having to be switched off for it.
          onScroll={handleScroll}
          keyboardShouldPersistTaps="handled"
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          onScrollToIndexFailed={() => {}}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: MD, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={INK_MUTED} />
            </View>
          ) : null}
          // ── A chat with nothing in it yet ──
          // The picture LEADS and the line states the fact under it, the same
          // order the empty Circles page reads in: a conversation nobody has
          // started is not a list that failed to load, so what the page shows
          // is the moment it is waiting for (see ChatArt).
          //
          // The wrapper has to be the element itself: an inverted list composes
          // its own flip onto whatever it is handed as the empty component
          // (`_renderEmptyComponent`), so the drawing would come out upside
          // down inside anything that swallowed that style.
          ListEmptyComponent={(
            <View style={styles.empty}>
              <ChatArt />
              <Text style={styles.emptyLabel}>{t('chat.empty')}</Text>
            </View>
          )}
        />
        </PullContext.Provider>
        {/* The dots are page chrome, not a message: they float on the sheet's
            own header line and never enter the list, so nothing they do can
            move a bubble (user directive 2026-07-27). Geometry mirrors
            SheetHeader — chromeGap below the safe-area top — and that line
            carries nothing else now that the close X is gone (2026-07-31). */}
        <View
          pointerEvents="none"
          style={[styles.typingFloat, { top: insets.top + OVERLAY.chromeGap }]}
        >
          <TypingIndicator visible={otherIsTyping} />
        </View>
          {/* Tapping the messages area dismisses the open attach menu. Mounted
              only while it's open, so it never intercepts normal scroll/taps. */}
          {attachOpen && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => { setAttachMenuOpen(false); setAttachConfirm(null) }}
            />
          )}
        </View>

        {/* ── Input bar ──
            Fixed-height white footer with the input field and the send button
            on one horizontal line. It is an ordinary flex sibling at the bottom
            of the page and knows nothing about the keyboard: the page's own
            bottom edge is the keyboard's top edge, so the composer lands above
            it by layout alone. */}
        <View style={styles.inputBarOuter}>
          {replyTo && (
            <View style={styles.replyComposer}>
              <View style={styles.replyComposerQuote}>
                <ReplyQuote snapshot={replyTo} tone="composer" onPress={() => scrollToOriginal(replyTo)} />
              </View>
              <Pressable
                onPress={() => { tap(); setReplyTo(null) }}
                hitSlop={8}
                accessibilityLabel={t('chat.reply.a11y')}
                style={({ pressed }) => [styles.replyComposerClose, pressed && styles.glyphOnInkPressed]}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={INK_MUTED} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M18 6L6 18M6 6l12 12" />
                </Svg>
              </Pressable>
            </View>
          )}
          {/* Always render the text input row so the keyboard stays open while
              recording/previewing. The recording and preview UIs overlay on top. */}
          <View style={styles.inputRow}>
            <View style={styles.inputWrap}>
              {/* Add — the LEADING glyph, standing before the first character of
                  the message. A plus rather than a paperclip: what opens behind
                  it is a photo / a place / a time, which is "add something to
                  this message", not "attach a file to it". */}
              <ComposerGlyph
                steady
                onPress={() => {
                  tap()
                  // Turned into an X it is the one way back out of both states:
                  // a confirmation it CANCELS, the options it simply closes.
                  if (attachConfirm) { setAttachConfirm(null); return }
                  setAttachMenuOpen(o => !o)
                }}
              >
                <ReAnimated.View style={attachPlusStyle}>
                  <PlusIcon size={ICON.xl} color={INK} />
                </ReAnimated.View>
              </ComposerGlyph>
              <View style={styles.inputAnimWrap}>
                <TextInput
                  ref={inputRef}
                  style={[styles.input, { height: inputHeight, paddingTop: INPUT_VPAD / 2 - inkPad, paddingBottom: INPUT_VPAD / 2 + inkPad }]}
                  value={text}
                  onChangeText={onInputChange}
                  onContentSizeChange={e => {
                    // The field is its CONTENT tall — no floor at the pill's box
                    // height, which is what left the text top-aligned in a taller
                    // box on iOS. The box is the wrap's (inputAnimWrap), and it
                    // centres this.
                    // What is measured is the CONTENT; the trailing open line
                    // iOS omits is added where the height is derived (see
                    // `openLine`), so this stays the raw report.
                    const h = e.nativeEvent.contentSize.height
                    if (h > 0) setContentHeight(Math.min(INPUT_MAX_HEIGHT, h))
                  }}
                  scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
                  placeholder={tg('chat.inputPlaceholder', isMale)}
                  placeholderTextColor={INK_MUTED}
                  multiline
                  blurOnSubmit={false}
                  autoFocus={false}
                />
              </View>
              {/* Mic or send, INSIDE the field at its trailing edge, off the SAME
                  state that renders the character in it. It used to be a second
                  source of truth — a shared value written alongside setText —
                  which could sit at 0 while the field already held text, leaving
                  the mic up on a composed message. One source can't drift, and it
                  flips in the very commit the character lands. */}
              {/* A confirmation is a message waiting to be sent, so the mark that
                  sends it is the field's OWN send mark — the same glyph in the
                  same berth, never a second send button raised beside the
                  sentence (user directive 2026-08-02). */}
              <ComposerGlyph
                disabled={!attachConfirm && hasText && sending}
                onPress={() => {
                  if (attachConfirm) {
                    tap()
                    if (attachConfirm === 'location') handleShareLocation()
                    else handleSendSchedule()
                    return
                  }
                  hasText ? handleSend() : handleMicPress()
                }}
              >
                {attachConfirm || hasText
                  ? <SendIcon size={ICON.md} color={INK} />
                  : <MicIcon size={ICON.md} color={INK} />}
              </ComposerGlyph>
              {/* ── What can be added to this message ──
                  For as long as it is open the strip IS the field: it stands in
                  the pill's own box, on the field's own white, from the plus's
                  berth to the far edge — so the mark that opened it is beside it
                  the whole time, as the X that closes it. Each option is a glyph
                  with its word BESIDE it (a line of text in a line-tall box, not
                  a caption under a mark), and the app's one hairline divides
                  two. It rides up through the pill's own clip; nothing about it
                  is measured.

                  A CONFIRMATION IS THE SAME STRIP, SAYING ONE THING, AND IT SAYS
                  IT ON A CHIP: the app's small tile — INK on the PAGE tint, the
                  chip's own small type — hugging the sentence at the start edge,
                  where the options stood. It stops short of the trailing berth
                  (`attachStripSending`) because there the send mark is what it is
                  FOR; the options cover that end, having nothing to send yet.

                  IT IS MOUNTED WHETHER OR NOT IT IS OPEN, and hidden by the
                  animation alone (user report 2026-08-02: the options appeared
                  with no rise at all). Mounting it on the tap put a whole render
                  — a strip of chips and glyphs — between the finger and the first
                  frame of the movement, so most of the travel was over before
                  anything was on the screen. Nothing here is expensive to keep. */}
              <ReAnimated.View
                pointerEvents={attachOpen ? 'auto' : 'none'}
                style={[
                  styles.attachStrip,
                  attachConfirm && styles.attachStripSending,
                  attachStripStyle,
                ]}
              >
                  {attachConfirm ? (
                    <View style={styles.attachStripSentence}>
                      <Chip
                        small
                        text={attachConfirm === 'location'
                          ? tg('chat.confirmSend.location', isMale)
                          : tg('chat.confirmSend.schedule', isMale)}
                      />
                    </View>
                  ) : attachOptions.map((o, i) => (
                    <Fragment key={o.key}>
                      {i > 0 ? <View style={styles.attachStripDivider} /> : null}
                      <Pressable
                        onPress={o.onPress}
                        accessibilityRole="button"
                        accessibilityLabel={o.label}
                        style={({ pressed }) => [styles.attachStripItem, pressed && styles.composerSlotPressed]}
                      >
                        {o.icon}
                        <Text style={styles.attachStripLabel} numberOfLines={1}>{o.label}</Text>
                      </Pressable>
                    </Fragment>
                  ))}
              </ReAnimated.View>
            </View>

            {/* Recording and preview are the SAME box in another state, so they
                wear the same pill with the same bare glyphs inside it — never a
                control standing beside the field. Centred rather than flex-end:
                nothing here is a growing line of text. */}
            {recordPhase === 'recording' && (
              <View style={[styles.inputRow, styles.recordOverlay]}>
                <View style={[styles.inputWrap, styles.inputWrapCentered]}>
                  <ComposerGlyph onPress={handleCancelRecording}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={INK_SUBTLE} strokeWidth={2.5} strokeLinecap="round">
                      <Path d="M18 6L6 18M6 6l12 12" />
                    </Svg>
                  </ComposerGlyph>
                  <View style={styles.recBar}>
                    <View style={styles.recDot} />
                    <Text style={styles.recTime}>{clock(recordElapsed)}</Text>
                    <View style={styles.recWaveWrap} onLayout={e => setRecWaveWidth(e.nativeEvent.layout.width)}>
                      {recWaveWidth > 0 && (
                        <Svg width={recWaveWidth} height={REC_WAVE_H}>
                          <Path d={buildRecWavePath(liveBars, recWaveWidth, REC_WAVE_H)} fill={INK} />
                        </Svg>
                      )}
                    </View>
                  </View>
                  <ComposerGlyph onPress={handleStopRecording}>
                    <StopIcon size={ICON.md} color={INK} />
                  </ComposerGlyph>
                </View>
              </View>
            )}

            {recordPhase === 'preview' && (
              <View style={[styles.inputRow, styles.recordOverlay]}>
                <View style={[styles.inputWrap, styles.inputWrapCentered]}>
                  <ComposerGlyph onPress={handleCancelRecording}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={INK_SUBTLE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M3 6h18M19 6l-1 14H6L5 6M8 6V4h8v2" />
                    </Svg>
                  </ComposerGlyph>
                  {/* The SAME bar the recording state wears: the play stands on the
                      recording dot's own cell, the clock follows it, and the track
                      fills the rest — so the track begins at the same x and is the
                      same size in both states (user directive 2026-07-30). It used
                      to be a second full-width glyph berth beside the trash, with
                      the track hard against it and the clock exiled to the far end. */}
                  <View style={styles.recBar}>
                    <ComposerGlyph mark onPress={handlePreviewPlayPause}>
                      <Svg width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill={INK}>
                        {previewPlaying
                          ? <Path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                          : <Path d="M8 5v14l11-7z" />}
                      </Svg>
                    </ComposerGlyph>
                    <Text style={styles.recTime}>
                      {clock((previewPlaying ? previewPos : audioDuration) / 1000)}
                    </Text>
                    <Waveform
                      bars={previewBars}
                      height={REC_WAVE_H}
                      inactiveColor={INK_MUTED}
                      activeColor={INK}
                      thumbColor={INK}
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
                  <ComposerGlyph onPress={handleSendAudio}>
                    <SendIcon size={ICON.md} color={INK} />
                  </ComposerGlyph>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>

      <MessageActionsSheet
        msg={actionsMsg}
        mine={!!actionsMsg && actionsMsg.user_id === userId}
        visible={actionsOpen}
        onDismiss={closeMsgActions}
        onClosed={handleActionsClosed}
        onReply={handleActionReply}
        onCopy={handleActionCopy}
        onDelete={handleActionDelete}
      />

      {lightboxUri && <LightboxModal uri={lightboxUri} topInset={insets.top} onClose={() => setLightboxUri(null)} />}
    </KeyboardSurface>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────

// Every control that stands INSIDE the composer pill: the add plus at the
// leading edge, mic/send at the trailing one, and the recording states' cancel /
// play / stop. One element, six uses.
//
// **A glyph and nothing else** (user directive 2026-07-30) — no background, no
// border, no shadow, purple ink, in a berth exactly as tall as the resting line
// (`composerSlot`). Both ends of the field are therefore the same object, and the
// field reads as one box carrying its own text and its own marks rather than a
// box with buttons parked in it. It went through a filled INK disc and then a
// full-height INK tile on the way here; neither survives, and neither should
// come back for one end without the other.
//
// A bare mark is read as its INK, so it is sized as a mark beside a line of text
// and not as the standalone ICON.xxl a glyph centred in a filled tile could
// carry: the same 24 that looked right inside a purple disc read heavy the moment
// the disc was gone (user directive 2026-07-30). Send / mic / stop are dense
// glyphs — they paint nearly their whole box — so they take ICON.md, which lands
// their ink about where the 16dp line beside them does. The plus takes ICON.xl,
// the tokens' optical half-step, for the opposite reason: its cross paints only
// the middle 14 of its 24 box, so the same nominal size would read as the
// smaller mark. Checked at font_scale 2.0 (where FONT_SCALE caps both the text
// and the glyph at 1.15), which is where a too-large mark shows first.
//
// `mark`: the one glyph that does NOT stand at an edge of the field — preview's
// play, which stands INSIDE the audio bar on the recording dot's own cell. The
// square berth exists so the marks at the two ENDS sit the same distance in from
// their own edge; an interior mark instead has to sit exactly where the dot it
// replaces sits, or the clock and the track after it start at a different x than
// they do while recording. Its berth is therefore the dot's width and its tap
// target comes from the slop, which reaches only into the bar's own air (it stops
// short of the trash's ink on one side and of the clock on the other).
function ComposerGlyph({ onPress, disabled, mark, steady, children }: {
  onPress: () => void
  disabled?: boolean
  mark?: boolean
  /** ITS OWN MOVEMENT IS THE FEEDBACK, so it does not also fade under the finger
   *  (the add mark, which turns into an X on the tap). A fade on top of a turn
   *  reads as the mark going grey rather than as a press — and Android is free to
   *  hold `pressed` across the re-render the tap causes, which left it faded
   *  after the finger was gone. */
  steady?: boolean
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      // Kept inside the slot's own footprint: a wider slop would reach over the
      // text and fire on a tap meant to place the caret.
      hitSlop={mark ? TAP_SLOP : XS}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.composerSlot,
        mark && styles.composerMarkSlot,
        disabled && styles.composerSlotDisabled,
        pressed && !disabled && !steady && styles.composerSlotPressed,
      ]}
    >
      {children}
    </Pressable>
  )
}

// ── Reply-to-message ───────────────────────────────────────────────────────

// Finger travel that commits a swipe-to-reply. Local to the chat gesture,
// distinct from the shell's PULL_* thresholds (which govern full-surface
// pulls, not a per-bubble horizontal nudge).
const REPLY_TRIGGER_PX = 56

// Quote-tap highlight choreography, composed from MOTION tiers: a quick fade
// in, a hold so the eye lands on it, then a gentle fade out — ~1s total. The
// clear timer (HIGHLIGHT_TOTAL_MS) matches the sequence so state is dropped the
// instant the pulse ends and never lingers.
const HIGHLIGHT_HOLD_MS = MOTION.base * 2
const HIGHLIGHT_TOTAL_MS = MOTION.fast + HIGHLIGHT_HOLD_MS + MOTION.base

// A brief accent band behind a message row, used as the "here it is" cue when a
// quote-tap scrolls to the original. Fades in, holds, fades out (see the MOTION
// composition above); an off-screen row that scrolls into view plays it on
// mount, and re-tapping the same quote re-fires it via the `pulse` nonce.
function HighlightFlash({ active, pulse, children }: {
  active: boolean
  pulse: number
  children: React.ReactNode
}) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!active) return
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: MOTION.fast, useNativeDriver: true }),
      Animated.delay(HIGHLIGHT_HOLD_MS),
      Animated.timing(v, { toValue: 0, duration: MOTION.base, useNativeDriver: true }),
    ]).start()
  }, [active, pulse])
  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.highlightFlash, { opacity: v }]} />
      {children}
    </View>
  )
}

function ReplyKindIcon({ kind, color }: { kind: ReplyKind; color: string }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'image': return <Svg {...p}><Rect x={3} y={5} width={18} height={14} rx={2.5} /><Circle cx={9} cy={11} r={2} /><Path d="M21 16l-4.5-4.5L8 19" /></Svg>
    case 'audio': return <Svg {...p}><Rect x={9} y={3} width={6} height={11} rx={3} /><Path d="M6 11a6 6 0 0 0 12 0M12 17v3" /></Svg>
    case 'location': return <Svg {...p}><Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><Circle cx={12} cy={9} r={2.5} /></Svg>
    case 'schedule': return <Svg {...p}><Rect x={3} y={4.5} width={18} height={16} rx={2.5} /><Path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></Svg>
    default: return null
  }
}

// The frozen quote of the message being answered. Rendered both inside the
// answering bubble (tone mine/theirs, matching the bubble it sits in) and in
// the composer bar above the input (tone composer). `onPress` scrolls to the
// original when it's loaded in the list.
function ReplyQuote({ snapshot, tone, onPress }: {
  snapshot: ReplySnapshot
  tone: 'mine' | 'theirs' | 'composer'
  onPress?: () => void
}) {
  const profile = useUserStore(s => s.profile)
  // Resolve the quoted message's author to a display name: the partner's name
  // (split from their combined title) or a gendered "You" for our own messages.
  const senderName = snapshot.user_id === profile?.user_id
    ? tg('chat.reply.you', profile?.is_male ?? null)
    : nameFromTitle(profile?.relations?.match?.title)
  const c = tone === 'mine'
    ? { bg: WHITE_SOFT, bar: WHITE_STRONG, text: WHITE_STRONG }
    : { bg: INK_WASH, bar: INK, text: INK }
  // A text quote always shows its written text (never the media label); media
  // kinds show an icon + short label.
  const isText = snapshot.kind === 'text'
  const body = (
    <View style={[styles.replyQuote, { backgroundColor: c.bg }]}>
      <View style={[styles.replyQuoteBar, { backgroundColor: c.bar }]} />
      <View style={styles.replyQuoteBody}>
        {!!senderName && (
          <Text style={[styles.replyQuoteName, { color: c.bar }]} numberOfLines={1}>
            {senderName}
          </Text>
        )}
        {isText ? (
          <Text style={[styles.replyQuoteText, { color: c.text }]} numberOfLines={1}>
            {snapshot.preview}
          </Text>
        ) : (
          <View style={styles.replyQuoteMediaRow}>
            <ReplyKindIcon kind={snapshot.kind} color={c.text} />
            <Text style={[styles.replyQuoteText, { color: c.text }]} numberOfLines={1}>
              {replyPreviewLabel(snapshot.kind)}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
  if (!onPress) return body
  return <Pressable onPress={onPress} hitSlop={4}>{body}</Pressable>
}

// Wraps a bubble in its two per-bubble gestures:
//   • swipe-to-reply — a short horizontal drag toward the reveal edge slides the
//     bubble and fades in a reply arrow behind it; releasing past
//     REPLY_TRIGGER_PX fires onReply. Horizontal-only activation (failOffsetY)
//     keeps the vertical FlatList scroll untouched. RTL mirrors the direction.
//   • long press — opens the message-actions sheet (onLongPress), the explicit
//     fallback for when the swipe is missed or lost to the scroll.
// They race: a finger that travels activates the pan, a finger that rests
// activates the long press, and only one of them can win. Both are per-bubble
// and neither is a swipe-down, so neither belongs to PullPane.
function SwipeToReply({ enabled, onReply, onLongPress, children }: {
  enabled: boolean
  onReply: () => void
  onLongPress: () => void
  children: React.ReactNode
}) {
  const tx = useSharedValue(0)
  const REVEAL = isRTL ? -1 : 1
  const fire = useCallback(() => { tapMedium(); onReply() }, [onReply])
  const fireLong = useCallback(() => { tapMedium(); onLongPress() }, [onLongPress])
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(enabled)
      .activeOffsetX(isRTL ? [-12, 9999] : [-9999, 12])
      .failOffsetY([-14, 14])
      .onUpdate(e => {
        'worklet'
        const d = e.translationX * REVEAL
        tx.value = d > 0 ? Math.min(d, REPLY_TRIGGER_PX * 1.4) : 0
      })
      .onEnd(e => {
        'worklet'
        if (e.translationX * REVEAL >= REPLY_TRIGGER_PX) runOnJS(fire)()
        tx.value = withTiming(0, { duration: MOTION.fast })
      })
    const longPress = Gesture.LongPress()
      .minDuration(LONG_PRESS_MS)
      .onStart(() => {
        'worklet'
        runOnJS(fireLong)()
      })
    return Gesture.Race(pan, longPress)
  }, [enabled, fire, fireLong])
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value * REVEAL }] }))
  const iconStyle = useAnimatedStyle(() => {
    const prog = Math.min(tx.value / REPLY_TRIGGER_PX, 1)
    return { opacity: prog, transform: [{ scale: 0.6 + 0.4 * prog }] }
  })
  return (
    <View>
      <ReAnimated.View style={[styles.swipeReplyIcon, iconStyle]} pointerEvents="none">
        <ReplyIcon color={INK_MUTED} />
      </ReAnimated.View>
      <GestureDetector gesture={gesture}>
        <ReAnimated.View style={rowStyle}>{children}</ReAnimated.View>
      </GestureDetector>
    </View>
  )
}

// What a long press can offer for this message: replying (anything that isn't a
// failed send, which has no server row to point a quote at), copying (text only)
// and deleting (my own messages, whatever kind they are). A message with none of
// the three — a message already deleted — never opens the sheet.
function msgActionsAvailable(m: Message, mine: boolean): boolean {
  if (m.deleted_at) return false
  return mine || !m._failed || !!m.text?.trim()
}

// The long-press sheet itself. Rows are the shared SheetActionRow, so it reads
// as the same fabric as the photo-options sheet.
function MessageActionsSheet({ msg, mine, visible, onDismiss, onClosed, onReply, onCopy, onDelete }: {
  msg: Message | null
  mine: boolean
  visible: boolean
  onDismiss: () => void
  onClosed: () => void
  onReply: (m: Message) => void
  onCopy: (m: Message) => void
  onDelete: (m: Message) => void
}) {
  if (!msg) return null
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onClosed={onClosed}
      // The one thing this sheet overrides about the popup frame: a tighter
      // gutter, because its body is a list of full-width tinted tiles (the same
      // override the photo-options sheet makes). Every other gap — above the
      // first row, under the last — is the popup's own.
      contentStyle={styles.msgActionsSheet}
    >
      <SheetActions flush>
        {!msg._failed && (
          <SheetActionRow
            icon={<ReplyIcon color={INK} size={ICON.xxl} />}
            label={t('chat.msgActions.reply')}
            onPress={() => onReply(msg)}
          />
        )}
        {!!msg.text?.trim() && (
          <SheetActionRow
            icon={<CopyIcon color={INK} size={ICON.xxl} />}
            label={t('chat.msgActions.copy')}
            onPress={() => onCopy(msg)}
          />
        )}
        {mine && (
          <SheetActionRow
            icon={<TrashIcon color={INK} size={ICON.xxl} />}
            label={t('chat.msgActions.delete')}
            onPress={() => onDelete(msg)}
          />
        )}
      </SheetActions>
    </BottomSheet>
  )
}

function ImageBubble({ animate, isMine, isLast, msg, getChatImageUrl, time, onPress, status, reply, onReplyPress }: {
  animate: boolean
  isMine: boolean
  isLast: boolean
  msg: Message
  getChatImageUrl: (key: string) => Promise<string | null>
  time: string
  onPress?: (uri: string) => void
  status: 'pending' | 'failed' | 'sent' | 'read'
  reply?: ReplySnapshot | null
  onReplyPress?: () => void
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
      {reply && <ReplyQuote snapshot={reply} tone={isMine ? 'mine' : 'theirs'} onPress={onReplyPress} />}
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
          <ActivityIndicator color={isMine ? WHITE : INK} />
        </View>
      )}
      <View style={[styles.imageTimeRow, { flexDirection: 'row', alignItems: 'center', gap: XS }]}>
        <Text style={styles.imageTimeText}>
          {time}
        </Text>
        {isMine && status !== 'failed' && <CheckMark status={status} isMine />}
      </View>
    </AnimatedBubble>
  )
}

function LocationBubble({ animate, isMine, isLast, location, time, status, reply, onReplyPress }: {
  animate: boolean
  isMine: boolean
  isLast: boolean
  location: { lat: number; lng: number } | null
  time: string
  status: 'pending' | 'failed' | 'sent' | 'read'
  reply?: ReplySnapshot | null
  onReplyPress?: () => void
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

  const textColor = isMine ? WHITE : INK
  const subColor = isMine ? WHITE_STRONG : INK
  const timeColor = isMine ? WHITE_STRONG : INK_MUTED
  const iconBg = isMine ? WHITE_SOFT : INK_WASH

  return (
    <AnimatedBubble animate={animate} isMine={isMine} style={bubbleStyle}>
      {reply && <ReplyQuote snapshot={reply} tone={isMine ? 'mine' : 'theirs'} onPress={onReplyPress} />}
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
          <Text style={[styles.inlineTime, { color: timeColor }]}>
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
function ScheduleBubble({ animate, isMine, isLast, schedule, senderIsMale, time, status, reply, onReplyPress }: {
  animate: boolean
  isMine: boolean
  isLast: boolean
  schedule: { anchor: string; weeks: boolean[][] }
  senderIsMale: boolean | null | undefined
  time: string
  status: 'pending' | 'failed' | 'sent' | 'read'
  reply?: ReplySnapshot | null
  onReplyPress?: () => void
}) {
  const viewerWeekStart = useUserStore(s => s.profile?.weekStart) ?? defaultWeekStart(appLang)
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
  const timeColor = isMine ? WHITE_STRONG : INK_MUTED

  return (
    <AnimatedBubble animate={animate} isMine={isMine} style={bubbleStyle}>
      {reply && <ReplyQuote snapshot={reply} tone={isMine ? 'mine' : 'theirs'} onPress={onReplyPress} />}
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
            return (
              <View key={col} style={styles.scheduleCell}>
                <View style={[
                  styles.scheduleDayBubble,
                  free && (isMine ? styles.scheduleDayBubbleSelectedMine : styles.scheduleDayBubbleSelected),
                ]}>
                  <Text style={[
                    styles.scheduleDayLetter,
                    isMine && styles.scheduleDayLetterMine,
                    free && (isMine ? styles.scheduleDayLetterSelectedMine : styles.scheduleDayLetterSelected),
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
        <Text style={[styles.inlineTime, { color: timeColor }]}>
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
      <Text style={[styles.daySepLabel, bold && { fontWeight: WEIGHT.medium }]}>{label}</Text>
      <View style={styles.daySepLine} />
    </View>
  )
}

// The dots, floating on the header line beside the close X. It is absolutely
// positioned chrome, so its whole show/hide costs the list exactly nothing —
// no row appears, no height is released, no bubble moves. A message arriving
// is then just a message arriving: it lifts the page with its own entrance,
// the way every other message does.
function TypingIndicator({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(visible)
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current
  const translateY = useRef(new Animated.Value(visible ? 0 : TYPING_RISE)).current
  const scale = useRef(new Animated.Value(visible ? 1 : TYPING_ENTER_SCALE)).current

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
        Animated.timing(translateY, { toValue: TYPING_RISE, duration: MOTION.fast, useNativeDriver: true }),
        Animated.timing(scale, { toValue: TYPING_ENTER_SCALE, duration: MOTION.fast, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false) })
    }
  }, [visible])

  if (!mounted && !visible) return null
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
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
    <View style={styles.typingPill}>
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
                  shadowColor: SHADOW_BLACK,
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

function AudioBubble({ animate, isMine, isLast, msg, getChatAudioUrl, time, msgStatus, routedToEarpiece, onToggleRouting, autoPlayKey, onAudioFinished, onAutoPlayConsumed, activePlayingKey, onPlayStart, reply, onReplyPress }: {
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
  reply?: ReplySnapshot | null
  onReplyPress?: () => void
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
  const iconColor = isMine ? WHITE : INK
  // Progress is shown as strong-vs-faint WITHIN the bubble's own ink family, so
  // both directions read the same way: mine is bright-vs-dim white on the solid
  // purple bubble, theirs is INK-vs-INK_MUTED on the pale purple bubble. The
  // solid purple is the SENDER's fill; painting a received message's played
  // bars with it made them look like they belonged to me, which is what broke
  // the coherence, the played half of a voice note must stay in its bubble.
  const barActive = isMine ? WHITE_STRONG : INK
  const barInactive = isMine ? WHITE_MID : INK_MUTED
  const timeColor = isMine ? WHITE_STRONG : INK_MUTED
  const fmt = (ms: number) => clock(ms / 1000)

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
        <Svg width={16} height={16} viewBox="0 0 24 24" fill={INK}>
          <Path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06a8 8 0 0 1 0 14.66v2.06a10 10 0 0 0 0-18.78z" />
        </Svg>
      )}
    </Pressable>
  ) : null

  return (
    <View style={[styles.audioOuter, { justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
      {isMine && routeBtn}
      <AnimatedBubble animate={animate} isMine={isMine} style={bubbleStyle}>
        {reply && <ReplyQuote snapshot={reply} tone={isMine ? 'mine' : 'theirs'} onPress={onReplyPress} />}
        <View style={styles.audioRow}>
          <Pressable
            onPress={handlePlayPause}
            disabled={!ready}
            style={[styles.audioPlayBtn, { backgroundColor: isMine ? WHITE_SOFT : INK_WASH }]}
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
          <Text style={[styles.inlineTime, { color: timeColor }]}>
            {scrubMs != null
              ? fmt(scrubMs)
              : duration > 0
                ? (playing ? fmt(pos) : fmt(duration))
                : (msg.audio_duration_ms ? fmt(msg.audio_duration_ms) : '–:––')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: XS }}>
            <Text style={[styles.inlineTime, { color: timeColor }]}>{time}</Text>
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

// Zoom bounds for the lightbox: a pinch caps here, and a double-tap toggles
// between rest (1) and this preset. Single definitions, referenced by both
// gestures below.
const LIGHTBOX_MAX_ZOOM = 4
const LIGHTBOX_DOUBLE_TAP_ZOOM = 2.5

// Full-screen image viewer. It rises from the bottom like every card surface
// and swipes down to close, so it composes the SAME sanctioned pieces as
// OverlaySheet — PullPane + usePullBehavior (the one swipe-down mechanism,
// never a hand-rolled Pan) + RisingCard (the bottom-up mount motion) +
// SheetHeader (the floating close X at top-START). It is NOT an OverlaySheet
// itself because it must float ABOVE the chat sheet's solid header, which only
// a Modal (its own native window) achieves; and OverlaySheet's lifetime is
// `open`-driven with an off-screen parked rest state, which a Modal has no
// equivalent for.
//
// Pinch/double-tap zoom coexists with the swipe-down close by reusing the
// pull's own `armed` switch as the arbiter: while zoomed it is set false,
// so a one-finger drag PANS the enlarged image instead of closing; back at
// rest it is true, so a downward drag closes. (The X always closes regardless.)
function LightboxModal({ uri, topInset, onClose }: { uri: string; topInset: number; onClose: () => void }) {
  const { height: screenH } = Dimensions.get('window')
  // SheetHeader's measured bottom, so a drag starting on the floating header
  // still pulls (the sheet activation's header-vs-scroll rule).
  const headerBottom = useSharedValue(0)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const noop = useCallback(() => {}, [])
  const pull = usePullBehavior({

    enabled: true,
    onCommit: noop,
    commit: 'slideOff',
    headerBottom,
  } as any)

  // A Modal is a separate window with no parked-off-screen rest state, so —
  // unlike an in-tree OverlaySheet — nothing keeps it mounted through the fall.
  // Unmount only once the card has fully ridden off the bottom, so neither a
  // committed swipe nor the X button cuts the motion short.
  useAnimatedReaction(
    () => pull.pullY.value,
    v => { if (v >= screenH) runOnJS(onCloseRef.current)() },
  )

  // The X button rides the card off with the SAME motion (and pullY) as a
  // committed swipe, so both close paths animate identically.
  const slideClose = useCallback(() => {
    tap()
    pull.pullY.value = withTiming(screenH)
  }, [pull.pullY, screenH])

  // The cream backdrop fades out as the card falls, so the frame before unmount
  // is already transparent — no hard cut back to the chat behind it.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, pull.pullY.value / screenH),
  }))

  // ── Zoom ─────────────────────────────────────────────────────────────
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const savedTx = useSharedValue(0)
  const savedTy = useSharedValue(0)
  // true = a one-finger drag closes the lightbox; false (while zoomed) = it pans
  // the enlarged image. It rides `armed`, the pull's own "this drag is spoken
  // for" switch, rather than pretending to be a scroll position — which is what
  // it did while the gesture asked a single at-top boolean about everything.
  const setCloseArmed = useCallback((v: boolean) => { pull.armed.value = v }, [pull.armed])

  const zoomGesture = useMemo(() => {
    const resetZoom = () => {
      'worklet'
      scale.value = withTiming(1)
      savedScale.value = 1
      tx.value = withTiming(0)
      ty.value = withTiming(0)
      savedTx.value = 0
      savedTy.value = 0
    }
    const pinch = Gesture.Pinch()
      // Disarm the close for the whole pinch, so its finger motion can never
      // start riding the card off while the user is scaling.
      .onStart(() => runOnJS(setCloseArmed)(false))
      .onUpdate(e => {
        scale.value = Math.max(1, Math.min(savedScale.value * e.scale, LIGHTBOX_MAX_ZOOM))
      })
      .onEnd(() => {
        savedScale.value = scale.value
        if (scale.value <= 1) { resetZoom(); runOnJS(setCloseArmed)(true) }
      })
    // Moves the enlarged image; a no-op at rest, where the drag belongs to the
    // pull (close) instead.
    const imagePan = Gesture.Pan()
      .onUpdate(e => {
        if (scale.value <= 1) return
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
          resetZoom()
          runOnJS(setCloseArmed)(true)
        } else {
          scale.value = withTiming(LIGHTBOX_DOUBLE_TAP_ZOOM)
          savedScale.value = LIGHTBOX_DOUBLE_TAP_ZOOM
          runOnJS(setCloseArmed)(false)
        }
      })
    return Gesture.Simultaneous(pinch, imagePan, doubleTap)
    // Shared values + setCloseArmed are stable; only rebuild is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCloseArmed])

  // The swipe-down close and the zoom gestures share one detector (PullPane's).
  // Simultaneous, so the pull's own `armed` gate — not gesture arbitration —
  // decides whether a one-finger drag closes or pans.
  const gesture = useMemo(
    () => Gesture.Simultaneous(pull.gesture, zoomGesture),
    [pull.gesture, zoomGesture],
  )

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }))

  return (
    <Modal visible transparent animationType="fade" onRequestClose={slideClose} statusBarTranslucent>
      {/* A Modal is its own native window, so the root layout's status bar
          chrome does NOT reach it. Re-assert all of it here: light glyphs
          (AppStatusBar) and the app's own two screen edges (ScreenEdgeShade —
          the top one passed the inset explicitly, since a Modal's
          SafeAreaProvider context may read it as 0). Without the top shade the
          pale backdrop shows through the always-transparent edge-to-edge
          status strip. */}
      <AppStatusBar />
      {/* RNGH gestures don't reach into a Modal (its own window) without a
          GestureHandlerRootView inside it — same as BottomSheet. Without this
          the swipe-down-to-close would silently do nothing on Android. */}
      <GestureHandlerRootView style={lbStyles.root}>
        <ReAnimated.View style={[lbStyles.backdrop, backdropStyle]} pointerEvents="none" />
        <PullPane
          gesture={gesture}
          pullY={pull.pullY}
          leaving={pull.leaving}
          pointerEvents="box-none"
        >
          <RisingCard animateExit={false} style={lbStyles.card}>
            <View style={lbStyles.body}>
              <ReAnimated.Image source={{ uri }} style={[lbStyles.image, imageStyle]} resizeMode="contain" />
            </View>
            {/* Same floating X as every sheet, at top-END, over the photo. */}
            <SheetHeader
              floating
              topInset={topInset}
              onClose={slideClose}
              closeAccessibilityLabel={t('chat.a11y.closeImage')}
              onMeasured={h => { headerBottom.value = h }}
            />
          </RisingCard>
        </PullPane>
        <StatusBarBand topInset={topInset} />
        <BottomEdgeShade />
      </GestureHandlerRootView>
    </Modal>
  )
}

const lbStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SURFACE_SUNK,
  },
  card: {
    flex: 1,
    backgroundColor: SURFACE_SUNK,
  },
  body: {
    flex: 1,
    // Clip a zoomed/panned image to the card so it never spills past the frame.
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
})

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE },
  // The long-press sheet's gutter — see the sheet itself for why it is tighter
  // than the app's standard popup one.
  msgActionsSheet: { paddingHorizontal: SM },

  body: { flex: 1 },
  messagesArea: { flex: 1 },
  messages: { flex: 1 },
  messagesContent: { padding: SM, flexGrow: 1 },
  // Centred in whatever height the list has left, so the block sits in the
  // middle of the page with the keyboard down and in the middle of the shorter
  // page with it up — the page shrinks, and nothing here knows that it did.
  empty: { marginTop: 'auto', marginBottom: 'auto', alignItems: 'center' },
  // The gap the drawing and the line under it stand at everywhere in the app
  // (the empty Circles page's picture and its heading).
  emptyLabel: {
    marginTop: LG, textAlign: 'center',
    color: INK_MUTED, fontSize: TEXT.md, letterSpacing: 0.4,
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
  retryLabel: { fontSize: TEXT.sm, color: INK },

  // ── Reply-to-message ──
  // Accent band flashed behind a message row when a quote-tap lands on it. A
  // slight horizontal bleed past the row padding so the cue reads as the whole
  // message, not just the bubble; sits behind the bubble (opaque) so the tint
  // shows in the row gutters around it.
  highlightFlash: {
    position: 'absolute',
    top: 0, bottom: 0, start: -XS, end: -XS,
    backgroundColor: INK_WASH,
    borderRadius: RADIUS,
  },
  // The reply arrow revealed behind a bubble as it's swiped, parked at the
  // START edge (mirrors under RTL). Absolute so it doesn't shift layout.
  swipeReplyIcon: {
    position: 'absolute',
    top: 0, bottom: 0, start: SM,
    alignItems: 'center', justifyContent: 'center',
  },
  // The frozen quote block — inside a bubble and inside the composer bar. A
  // translucent tile with a leading accent rule; colours are passed per-tone.
  replyQuote: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SM,
    borderRadius: RADII.sm,
    paddingVertical: XS,
    paddingEnd: SM,
    overflow: 'hidden',
    marginBottom: XS,
  },
  replyQuoteBar: { width: 3, borderRadius: RADII.pill },
  replyQuoteBody: { flex: 1, justifyContent: 'center' },
  replyQuoteName: { fontSize: TEXT.sm, fontWeight: WEIGHT.medium },
  replyQuoteMediaRow: { flexDirection: 'row', alignItems: 'center', gap: XS },
  replyQuoteText: { fontSize: TEXT.md },

  // The composer bar above the input while answering a message.
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
    paddingHorizontal: SM,
    paddingTop: SM,
  },
  replyComposerQuote: { flex: 1 },
  replyComposerClose: {
    width: 32, height: 32,
    borderRadius: RADII.pill,
    alignItems: 'center', justifyContent: 'center',
  },

  daySep: { flexDirection: 'row', alignItems: 'center', gap: SM, paddingVertical: SM },
  daySepLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: LINE },
  daySepLabel: { fontSize: TEXT.sm, color: INK },

  bubble: {
    maxWidth: '80%',
    paddingVertical: SM,
    paddingHorizontal: MD,
    borderRadius: RADIUS,
    // A bubble is a tile lying on the page like every other one in the app, so
    // it wears the one lift (user directive 2026-08-03) — which is also what
    // holds an outgoing INK bubble and an incoming white one apart from the
    // PAGE tint they both stand on.
    boxShadow: CARD_SHADOW,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: INK },
  bubbleMineLast: { borderBottomEndRadius: 4 },
  // Incoming bubbles are WHITE (user directive 2026-07-28): they sit on the
  // chat PAGE tint, so the pale purple they used to wear barely lifted off it.
  // White vs the solid INK of mine is the same pairing as everywhere else.
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: SURFACE },
  bubbleTheirsLast: { borderBottomStartRadius: 4 },
  bubbleText: { fontSize: TEXT.md, flexShrink: 1 },
  bubbleTextMine: { color: WHITE },
  bubbleTextTheirs: { color: INK },
  // A tombstone is not a message, so it is not a message's tile: the fill and
  // the lift come off and the app's one hairline is left around it. It keeps
  // the bubble's radius and its box, so the row it stands in is exactly as tall
  // as the message it replaces — the history does not re-flow because something
  // in it was taken away. Its corners are the plain ones: the pinched last-in-
  // group corner is the tail of somebody SPEAKING.
  bubbleDeleted: { backgroundColor: 'transparent', boxShadow: undefined, borderWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  bubbleDeletedMine: { alignSelf: 'flex-end' },
  bubbleDeletedTheirs: { alignSelf: 'flex-start' },
  bubbleTextDeleted: { color: INK_SUBTLE },
  inlineTimeDeleted: { color: INK_HINT },

  inlineTime: { fontSize: TEXT.sm, letterSpacing: 0.3 },
  inlineTimeMine: { color: WHITE_STRONG },
  inlineTimeTheirs: { color: INK_MUTED },
  bubbleTextRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SM },
  textBubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: XS, marginEnd: -SM },

  // Floating chrome on the sheet's header line, at the page gutter — the line
  // is its own now. It used to be pushed in by a button's width and the row's
  // gap, from when the close X stood at the START of that row; the X crossed to
  // the END in 2026-07-30 and left the pill hanging 44dp inside an empty edge,
  // then went altogether 2026-07-31. Never in the list, so it cannot move a
  // single bubble (user directive 2026-07-27).
  // It stands at the START corner, which is the side the partner's own bubbles
  // stand on (`bubbleTheirs` is `flex-start`) — and those are WHITE, so an INK
  // pill is only ever purple on white there. Centred it rode over the middle of
  // the list, where an outgoing INK bubble passes behind it (2026-08-02).
  typingFloat: {
    position: 'absolute',
    start: OVERLAY.chromeInset,
    alignItems: 'flex-start',
  },
  // Not a bubble — chrome standing beside the close X, so it takes that
  // button's exact height and the regular purple with white dots, not the
  // washed incoming-bubble purple (user directive 2026-07-27). Capsule radius:
  // at the same height as a circular button, anything squarer reads as a
  // mismatch next to it. Same CARD_SHADOW that button casts (the one RoundButton
  // and Chip already share), so the two float off the page as one fabric.
  typingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
    height: ROUND_BUTTON_SIZE_SM,
    paddingHorizontal: MD,
    borderRadius: RADII.pill,
    backgroundColor: INK,
    boxShadow: CARD_SHADOW,
  },
  typingDot: { width: 7, height: 7, borderRadius: RADII.pill, backgroundColor: WHITE },

  // Outer wrapper: holds the single-row input + send button plus the
  // dynamic bottom spacer that clears the nav bar / keyboard. Deliberately
  // TRANSPARENT: a full-width white band under the row read as a second
  // surface stacked on the sheet. The field's own pill is the only thing that
  // should look like a control; the bar itself is just page.
  inputBarOuter: {
    zIndex: 2,
  },
  inputRow: {
    flexDirection: 'row',
    // flex-end so the pill stays pinned to the bottom as the input grows across
    // multi-line content.
    alignItems: 'flex-end',
    paddingTop: SM,
    paddingHorizontal: SM,
  },
  inputWrap: {
    // The composer is a typing surface, so it wears the standard field skin, and
    // it wears it in EVERY state: the box does not change because the options are
    // open (user directive 2026-08-02). Its border used to animate to INK with
    // them, which made a field the user is still typing in read as a different
    // control for as long as a menu was up.
    //
    // It is the row's ONLY child, so it spans the whole width: both of its
    // controls stand inside it, each a bare glyph in a `composerSlot` (see
    // ComposerGlyph). No horizontal padding of its own — the attach bar slides in
    // over the full pill, and an inset containing block would leave a sliver of
    // white down its edges.
    ...FIELD_SKIN,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    overflow: 'hidden',
  },
  // The recording / preview states of the same pill: fixed-height content, so
  // it centres instead of hanging off the last text line.
  inputWrapCentered: { alignItems: 'center' },
  // Every in-pill glyph's berth (see ComposerGlyph): a square as tall as the
  // resting line, so a glyph at either end of the field stands the same distance
  // in from its own edge. Nothing paints here — the box is a hit target and a
  // centring frame, and the mark inside it is the whole control. Full-height
  // (with the wrap's flex-end) keeps it on the LAST line as the field grows.
  composerSlot: {
    width: INPUT_MIN_HEIGHT, height: INPUT_MIN_HEIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  // An interior mark's berth (see ComposerGlyph `mark`): the leading cell of the
  // audio bar, i.e. exactly the recording dot's width, so preview's play sits on
  // the dot's footprint and everything after it lines up with the recording state.
  // The height stays the pill's — only the cell narrows.
  composerMarkSlot: { width: REC_MARK },
  composerSlotPressed: { opacity: 0.4 },
  composerSlotDisabled: { opacity: 0.3 },
  // THE box the typed text lives in, and the thing that centres it: the field
  // inside is exactly its content tall (see INPUT_REST_HEIGHT), so at rest a
  // single line is centred in the pill's own height, and once the text wraps the
  // column simply grows with it and centring costs nothing. Same shape as every
  // other field in the app (login / onboarding: the wrap holds the box height and
  // centres a content-sized input).
  inputAnimWrap: {
    flex: 1,
    minHeight: INPUT_MIN_HEIGHT,
    justifyContent: 'center',
  },
  input: {
    // Height is driven imperatively from onContentSizeChange (see the input
    // row); a `flex: 1` here made the field fill its parent instead of
    // growing it from content, so it never expanded past one line.
    width: '100%',
    // A breath off the glyphs either side; the slots already carry the indent
    // from the pill's own edges.
    paddingStart: XS,
    paddingEnd: XS,
    // The vertical pair is INPUT_VPAD, split unevenly to centre the ink rather
    // than the line box — applied at the call site, where the font scale is
    // live (`inkPad`).
    fontSize: TEXT.md,
    color: INK,
    textAlign: isRTL ? 'right' : 'left',
    // A no-op now that the box is content-sized, and kept only as a floor for the
    // one case that can still overflow it: text past INPUT_MAX_LINES, where the
    // field scrolls inside a capped box. It is Android-only in any case — the
    // vertical placement of this text is geometry, not this prop.
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  // ── The options, INSIDE the field ──────────────────────────────────────────
  // For as long as it is open the strip IS the field, so it takes the pill's own
  // box — the field's white, the resting line's height, bottom-anchored so it
  // stays on the last line exactly as the glyphs beside it do. Its START edge is
  // the plus's berth: the mark that opened it is never covered, because it is the
  // X that closes it. It rides in and out through the pill's own `overflow`, so
  // nothing here is measured and no width is pinned to an edge.
  attachStrip: {
    position: 'absolute',
    start: INPUT_MIN_HEIGHT, end: 0, bottom: 0,
    height: INPUT_MIN_HEIGHT,
    backgroundColor: SURFACE,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  // One option: the mark and its word on one line, an equal share of the strip.
  attachStripItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: XS,
    paddingHorizontal: XS,
  },
  // THE hairline, the app's one, between two options and nowhere else.
  attachStripDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: SM,
    backgroundColor: LINE,
  },
  // The word beside the mark: the rank below the field's own text, in its ink.
  attachStripLabel: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: INK,
  },
  // The confirmation's own end: the trailing berth stays clear, because the send
  // mark standing in it is the button this sentence is asking about.
  attachStripSending: { end: INPUT_MIN_HEIGHT },
  // The sentence's berth: it stands on the app's small `Chip` — INK on the PAGE
  // tint, the chip's own small type — which hugs the words, so the tile is the
  // sentence's own width and never a band across the field. Start-aligned, where
  // the first character of a typed message would be, and centred on the line.
  attachStripSentence: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: XS,
  },
  // The press flash for a bare glyph standing ON the purple (the reply strip's
  // close mark) — white laid thin over the ink, since there is no tile of its own
  // to tint.
  glyphOnInkPressed: { backgroundColor: WHITE_SOFT },

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
    backgroundColor: INK_PALE,
  },
  chatImageSpinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS,
    backgroundColor: INK_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageTimeRow: {
    position: 'absolute',
    bottom: SM + SM,
    end: SM + SM,
    backgroundColor: INK_DIM,
    borderRadius: RADII.sm,
    paddingHorizontal: SM,
    paddingVertical: XS,
  },
  imageTimeText: {
    fontSize: TEXT.sm,
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
    borderRadius: RADII.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: INK_PALE,
    boxShadow: CARD_SHADOW,
  },
  audioRouteBtnActive: {
    backgroundColor: INK,
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
    boxShadow: CARD_SHADOW,
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
  // Opaque so it hides the text row underneath — the page colour, not white,
  // now that the input bar itself carries no band.
  recordOverlay: {
    position: 'absolute',
    top: 0, start: 0, end: 0, bottom: 0,
    backgroundColor: PAGE,
  },
  recBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
  },
  recDot: {
    width: REC_MARK, height: REC_MARK,
    borderRadius: RADII.pill,
    backgroundColor: INK,
  },
  // Both states' clock. Tabular figures so a running count never shifts the track
  // that starts after it.
  recTime: {
    fontSize: TEXT.md,
    fontWeight: WEIGHT.medium,
    color: INK,
    fontVariant: ['tabular-nums'],
  },
  recWaveWrap: {
    flex: 1,
    justifyContent: 'center',
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
  locationLabel: { fontSize: TEXT.md, fontWeight: WEIGHT.medium },
  // The line under the location name: the rank BELOW the body, so TEXT.sm. The
  // old 1px marginTop was an optical nudge against a hand-set 16 lineHeight;
  // with the standard 1.4x line box there is nothing left to nudge.
  locationSubLabel: { fontSize: TEXT.sm },
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
  // theirs uses the same colors as the settings UI (INK accents on white);
  // mine inverts (white accents on INK) to stay legible against the solid
  // purple outgoing-bubble background.
  scheduleBubble: {
    paddingVertical: SM,
    paddingHorizontal: MD,
    borderRadius: RADIUS,
    gap: SM,
  },
  scheduleTitle: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: INK, marginBottom: XS },
  scheduleTitleMine: { color: WHITE },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SM },
  scheduleCell: { alignItems: 'center', justifyContent: 'flex-start', gap: XS },
  // ONE mark, and it means ONE thing: a disc stands on a day I am FREE, and a
  // day I am not is the bare letter (user directive 2026-08-02). The cell used
  // to be circled in every state — an outline for a kid day, a tint for a
  // weekend, a fill for a free one — so the card the title calls "the days I
  // am free" was a row of seven circles the reader had to rank. The weekend
  // tint went with them: it only ever painted a NOT-free day, which is the one
  // thing this grid must not draw attention to. The disc is the app's small
  // chrome circle, so it is the same object every other in-line circle is.
  scheduleDayBubble: {
    width: ROUND_BUTTON_SIZE_SM, height: ROUND_BUTTON_SIZE_SM, borderRadius: ROUND_BUTTON_SIZE_SM / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  scheduleDayBubbleSelected: { backgroundColor: INK, boxShadow: CARD_SHADOW },
  // My own bubble is already INK, so the free day inverts to white on it —
  // an INK fill there painted nothing at all, and the card read as its own
  // opposite (user report 2026-08-02).
  scheduleDayBubbleSelectedMine: { backgroundColor: WHITE, boxShadow: CARD_SHADOW },
  scheduleDayLetter: { fontSize: TEXT.md, color: INK_SUBTLE },
  scheduleDayLetterMine: { color: WHITE_STRONG },
  scheduleDayLetterSelected: { color: WHITE },
  scheduleDayLetterSelectedMine: { color: INK },
  scheduleDayDate: { fontSize: TEXT.sm, color: INK_SUBTLE },
  scheduleDayDateMine: { color: WHITE_STRONG },
  scheduleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: XS,
    alignSelf: 'flex-end',
    marginEnd: -XS,
  },
})
