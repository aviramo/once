import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated, AppState, Easing, I18nManager, Keyboard, Modal, Platform, Pressable,
  ScrollView, StyleSheet, View,
} from 'react-native'
import { Text, TextInput } from '../src/components/AppText'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Circle, Path, Polyline } from 'react-native-svg'
import { supabase } from '../src/lib/supabase'
import { invoke } from '../src/lib/api'
import { tap } from '../src/lib/haptics'
import { t, tg } from '../src/i18n'
import { IconPressable } from '../src/components/IconPressable'
import { ConfirmDialog } from '../src/components/ConfirmDialog'
import { useUserStore } from '../src/stores/userStore'
import { FONT_SCALE } from '../src/fonts'

const isRTL = I18nManager.isRTL

interface Message {
  user_id: string
  other_id: string
  created_at: string
  text: string
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
function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return t('match.justNow')
  if (diff < 3600) return `${Math.floor(diff / 60)}${t('match.minsAgo')}`
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t('match.hrsAgo')}`
  return `${Math.floor(diff / 86400)}${t('match.daysAgo')}`
}

// ── Icons ──────────────────────────────────────────────────────────────────

function BackIcon() {
  // Chat lives on the *opposite* side of settings, so the chevron mirrors
  // the settings back button — points toward home from the chat side.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={isRTL ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </Svg>
  )
}
function DotsIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#111">
      <Circle cx={12} cy={5} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={12} cy={19} r={1.6} />
    </Svg>
  )
}
function SendIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={isRTL ? 'M2 2L13 13M2 2L9 22l4-9 9-4L2 2z' : 'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z'} />
    </Svg>
  )
}

// ── Component ──────────────────────────────────────────────────────────────

type ChatPageProps = {
  onBack?: () => void
  // True while the chat pane is the visible pane in the home shell. Incoming
  // messages only count toward the unread badge when this is false.
  isActive?: boolean
  onUnreadChange?: (count: number) => void
}

export default function ChatPage({ onBack, isActive = true, onUnreadChange }: ChatPageProps = {}) {
  const insets = useSafeAreaInsets()
  const { profile } = useUserStore()
  const userId = profile?.user_id ?? ''
  const otherId = profile?.match?.user_id ?? ''
  const matchLastSeen = profile?.match?.last_seen ?? null
  const isMale = profile?.is_male ?? null

  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [enterSends, setEnterSends] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'block' | 'leave' | null>(null)
  const [otherIsOnline, setOtherIsOnline] = useState(false)
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  // Bump to re-render the last-seen label on an interval without touching
  // the message list (which would re-animate bubbles).
  const [, setTick] = useState(0)

  const scrollRef = useRef<ScrollView>(null)
  const seenSet = useRef<Set<string>>(new Set())
  const initialLoaded = useRef(false)
  // Mirror of the messages array used by effects (seen-set flush on pane
  // leave) that need the live list without re-running on every append.
  const messagesRef = useRef<Message[]>([])
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastTypingSentRef = useRef(0)
  const lastMsgTimeRef = useRef<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presenceChannelRef = useRef<any>(null)

  // ── Last-seen ticker ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

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
  // RN's KeyboardAvoidingView doesn't cope with the chat sitting inside the
  // home pager shell (absolute-positioned pane) on Android edge-to-edge, so
  // we drive bottom padding ourselves. `keyboardDidShow/Hide` on Android and
  // `keyboardWillShow/Hide` on iOS give the smoothest timing on each.
  const [kbHeight, setKbHeight] = useState(0)
  useEffect(() => {
    const showEvt = 'keyboardWillShow'
    const hideEvt = 'keyboardWillHide'
    const fallbackShow = 'keyboardDidShow'
    const fallbackHide = 'keyboardDidHide'
    const subs = [
      Keyboard.addListener(showEvt, e => setKbHeight(e.endCoordinates.height)),
      Keyboard.addListener(hideEvt, () => setKbHeight(0)),
      Keyboard.addListener(fallbackShow, e => setKbHeight(e.endCoordinates.height)),
      Keyboard.addListener(fallbackHide, () => setKbHeight(0)),
    ]
    return () => { subs.forEach(s => s.remove()) }
  }, [])

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
        .order('created_at', { ascending: true })
      if (cancelled || !data) return
      data.forEach((m: Message) => {
        // Own messages are always "seen"; theirs are seen only if they
        // predate our last-opened marker. New incoming ones animate in.
        if (m.user_id === userId || m.created_at <= lastOpened)
          seenSet.current.add(m.user_id + m.created_at)
      })
      initialLoaded.current = true
      setMessages(data as Message[])
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
          clearTimeout(typingTimerRef.current)
          setOtherIsTyping(false)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, otherId])

  // ── Presence + typing broadcast ──────────────────────────────────────────
  useEffect(() => {
    if (!userId || !otherId) return
    const roomId = [userId, otherId].sort().join(':')
    const ch = supabase.channel(`chat-presence:${roomId}`, {
      config: { presence: { key: userId } },
    })
    presenceChannelRef.current = ch
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState()
      setOtherIsOnline(otherId in state)
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
        if (status === 'SUBSCRIBED') await ch.track({ uid: userId })
      })
    return () => {
      clearTimeout(typingTimerRef.current)
      presenceChannelRef.current = null
      supabase.removeChannel(ch)
    }
  }, [userId, otherId])

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
        setMessages(prev => {
          const existing = new Set(prev.map(m => m.user_id + m.created_at))
          const fresh = (data as Message[]).filter(m => !existing.has(m.user_id + m.created_at))
          if (!fresh.length) return prev
          // Own messages are always seen. Incoming messages are seen only if
          // the chat pane is currently active — otherwise leave them unseen
          // so the "new messages" separator renders on the next visit.
          fresh.forEach(m => {
            if (m.user_id === userId || isActiveRef.current)
              seenSet.current.add(m.user_id + m.created_at)
          })
          if (!isActiveRef.current) {
            const incoming = fresh.filter(m => m.user_id === otherId).length
            if (incoming > 0) setUnread(c => c + incoming)
          }
          return [...prev, ...fresh]
        })
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

  // ── Autoscroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [messages.length, otherIsTyping, kbHeight])

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (override?: string) => {
    const msg = (override ?? text).trim()
    if (!msg || sending || !userId || !otherId) return
    setSending(true)
    setText('')
    const now = new Date().toISOString()
    seenSet.current.add(userId + now)
    setMessages(prev => [...prev, { user_id: userId, other_id: otherId, created_at: now, text: msg }])
    try { await invoke('app/chat', { chat: { text: msg } }) } catch {}
    setSending(false)
  }, [text, sending, userId, otherId])

  const onInputChange = (value: string) => {
    // On mobile, multiline TextInput turns the soft-keyboard Enter into a
    // literal '\n' in the value rather than firing onKeyPress/onSubmitEditing.
    // When "Enter sends message" is on, detect the inserted newline here and
    // dispatch send instead of letting it land in the input.
    if (enterSends && value.includes('\n')) {
      const msg = value.replace(/\n+/g, ' ').trim()
      if (msg) handleSend(msg)
      else setText('')
      return
    }
    setText(value)
    const now = Date.now()
    if (presenceChannelRef.current && now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now
      presenceChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { uid: userId } })
    }
  }

  const toggleTime = (key: string) => setExpandedKey(prev => (prev === key ? null : key))

  // ── Derived ──────────────────────────────────────────────────────────────
  const firstNewIdx = useMemo(
    () => messages.findIndex(m => initialLoaded.current && !seenSet.current.has(m.user_id + m.created_at)),
    [messages],
  )

  const statusText = otherIsOnline ? t('match.connected') : formatLastSeen(matchLastSeen)

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />

      {/* ── Header ──
          Simple 3-slot row, fixed 56px tall. Each slot is a 56×56 box with
          its own alignItems/justifyContent centering, so icons and the
          status text all land on the exact same centerline regardless of
          Android's font metrics. No flex, no absolute overlays — the slot
          widths carry the layout. */}
      <View style={styles.header}>
        <IconPressable
          style={styles.menuBtn}
          pressedStyle={styles.menuBtnPressed}
          onPress={() => { tap(); setMenuOpen(true) }}
        >
          <DotsIcon />
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
          style={styles.backBtn}
          pressedStyle={styles.backBtnPressed}
          onPress={() => { tap(); onBack?.() }}
        >
          <BackIcon />
        </IconPressable>
      </View>

      {/* ── Messages ── */}
      <View style={styles.body}>
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && !otherIsTyping && (
            <Text style={styles.emptyLabel}>{t('chat.empty')}</Text>
          )}
          {messages.map((msg, i) => {
            const key = `${msg.user_id}-${msg.created_at}-${i}`
            const isMine = msg.user_id === userId
            const showSep = i === 0 || !isSameDay(messages[i - 1].created_at, msg.created_at)
            const isFirstInGroup = showSep || messages[i - 1]?.user_id !== msg.user_id
            const isLastInGroup =
              i === messages.length - 1 ||
              messages[i + 1].user_id !== msg.user_id ||
              !isSameDay(msg.created_at, messages[i + 1].created_at)
            const showTime = expandedKey === key
            const showNewSep = firstNewIdx === i

            return (
              <View key={key} style={[styles.msgWrap, isFirstInGroup && styles.msgWrapFirst]}>
                {showSep && <DaySeparator label={dateSeparatorLabel(msg.created_at)} />}
                {showNewSep && !showSep && <DaySeparator label={t('chat.newMessages')} bold />}
                <Pressable
                  onPress={() => toggleTime(key)}
                  style={[
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleTheirs,
                    isLastInGroup && (isMine ? styles.bubbleMineLast : styles.bubbleTheirsLast),
                  ]}
                >
                  <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                    {msg.text}
                  </Text>
                </Pressable>
                {showTime && (
                  <Text style={[styles.time, isMine ? styles.timeMine : styles.timeTheirs]} maxFontSizeMultiplier={FONT_SCALE.ui}>
                    {formatTime(msg.created_at)}
                  </Text>
                )}
              </View>
            )
          })}
          {otherIsTyping && (
            <View style={[styles.msgWrap, styles.msgWrapFirst]}>
              <TypingDots />
            </View>
          )}
        </ScrollView>

        {/* ── Input bar ──
            Fixed-height white footer with the input field and the send
            button on one horizontal line. `bottomPad` is the only dynamic
            bit: when the keyboard is open we lift the bar above it; when
            it's closed we still clear the nav-bar gesture area.
            Android edge-to-edge: `endCoordinates.height` excludes the
            bottom system inset, so we add it back when the keyboard is up. */}
        <View style={styles.inputBarOuter}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={onInputChange}
              placeholder={tg('chat.inputPlaceholder', isMale)}
              placeholderTextColor="rgba(0,0,0,0.35)"
              multiline
              blurOnSubmit={false}
            />
            <Pressable
              onPress={() => handleSend()}
              disabled={!text.trim() || sending}
              style={({ pressed }) => [
                styles.sendBtn,
                (!text.trim() || sending) && styles.sendBtnDisabled,
                pressed && styles.sendBtnPressed,
              ]}
            >
              <SendIcon />
            </Pressable>
          </View>
          <View style={{ height: kbHeight > 0 ? kbHeight + (Platform.OS === 'ios' ? 0 : insets.bottom) + 8 : Math.max(insets.bottom, 8) }} />
        </View>
      </View>

      {/* ── Menu dropdown ──
          Anchored below the 3-dots button on the same (start) side.
          Transparent backdrop dismisses; tapping the panel itself stays open. */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menuAnchor, { top: insets.top + 56 + 4 }]}>
            <Pressable style={styles.menuDropdown} onPress={e => e.stopPropagation()}>
              <Pressable
                onPress={toggleEnterSends}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              >
                <Text style={styles.menuItemText}>{t('chat.enterSends')}</Text>
                <View style={[styles.menuCheckbox, enterSends && styles.menuCheckboxOn]}>
                  {enterSends && (
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                      <Polyline points="20 6 9 17 4 12" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  )}
                </View>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                onPress={() => { setMenuOpen(false); setConfirmAction('block') }}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              >
                <Text style={styles.menuItemText}>{t('chat.block')}</Text>
              </Pressable>
              <View style={styles.menuEndBtnWrap}>
                <Pressable
                  onPress={() => { setMenuOpen(false); setConfirmAction('leave') }}
                  style={({ pressed }) => [styles.menuEndBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.menuEndBtnText}>{t('chat.leave')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={confirmAction === 'block'}
        title={t('chat.blockTitle')}
        description={t('chat.blockDesc')}
        confirmLabel={t('chat.blockConfirm')}
        cancelLabel={t('chat.menuCancel')}
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => { await invoke('app/block'); setConfirmAction(null) }}
      />
      <ConfirmDialog
        visible={confirmAction === 'leave'}
        title={t('home.leaveTitle')}
        description={t('home.leaveDesc')}
        confirmLabel={t('home.leaveConfirm')}
        cancelLabel={t('home.leaveBack')}
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => { setConfirmAction(null); await invoke('app/leave') }}
      />
    </SafeAreaView>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────

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

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef0f3' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 20,
    backgroundColor: '#eef0f3',
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
    height: 40,
    width: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  backBtn: {
    height: 40,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
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
    color: 'rgba(0,0,0,0.55)',
    textAlign: 'center',
    // Android adds ~4px of invisible padding above text metrics that pushes
    // the visible glyphs below the geometric center of their bounding box.
    // Disable it so justifyContent:'center' on the wrapper actually centers.
    includeFontPadding: false,
  },
  statusOnline: { color: '#16a34a' },

  body: { flex: 1 },
  messages: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 12, flexGrow: 1 },
  emptyLabel: {
    marginTop: 'auto', marginBottom: 'auto', textAlign: 'center',
    color: 'rgba(0,0,0,0.35)', fontSize: 15, letterSpacing: 0.4,
  },

  msgWrap: { marginTop: 2 },
  msgWrapFirst: { marginTop: 8 },

  daySep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  daySepLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.12)' },
  daySepLabel: { fontSize: 11, color: 'rgba(0,0,0,0.42)' },

  bubble: {
    maxWidth: '72%',
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 18,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#111' },
  bubbleMineLast: { borderBottomEndRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.07)' },
  bubbleTheirsLast: { borderBottomStartRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: '#111' },

  time: { fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 4, letterSpacing: 0.5 },
  timeMine: { alignSelf: 'flex-end', paddingEnd: 6 },
  timeTheirs: { alignSelf: 'flex-start', paddingStart: 6 },

  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 13, paddingHorizontal: 16 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.45)' },

  // Outer wrapper: holds the single-row input + send button plus the
  // dynamic bottom spacer that clears the nav bar / keyboard.
  inputBarOuter: {
    backgroundColor: '#eef0f3',
    zIndex: 2,
  },
  inputRow: {
    flexDirection: 'row',
    // flex-end so the send button stays pinned to the bottom as the input
    // grows across multi-line content.
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    // Caps at 7 lines: 7 * lineHeight 22 + 2 * paddingVertical 10 = 174.
    // Beyond that, the input scrolls internally.
    maxHeight: 174,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: '#fff',
    fontSize: 15,
    lineHeight: 22,
    color: '#111',
    textAlign: isRTL ? 'right' : 'left',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#111',
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
    start: 8,
    width: 280,
    maxWidth: '92%',
  },
  menuDropdown: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 6,
  },
  // The app is Hebrew-only, so layout is hard-coded to RTL: text pinned to
  // the visual right, accessory pinned to the visual left. Using physical
  // left/right (not logical start/end) to avoid auto-swap surprises when
  // I18nManager.isRTL happens to be false at module-evaluation time.
  menuItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 10,
    minHeight: 50,
    gap: 12,
  },
  menuItemPressed: { backgroundColor: 'rgba(0,0,0,0.04)' },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  menuCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  menuCheckboxOn: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 2,
    marginHorizontal: 4,
  },
  menuEndBtnWrap: { marginTop: 10, paddingHorizontal: 2 },
  menuEndBtn: {
    backgroundColor: '#e53e3e',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuEndBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
