import { useCallback, useState, type ReactNode } from 'react'
import { invoke } from '../lib/api'
import { tap, tapWarning } from '../lib/haptics'
import { useUserStore, type Profile } from '../stores/userStore'
import { t, tg } from '../i18n'
import { PRIMARY } from '../colors'
import { PauseIcon } from '../components/icons'
import { visibilityConfirmFor } from '../components/visibilityConfirms'

// Single source of truth for the "Game mode" pause/resume control. Was the
// settings GameModeCard's inline logic; extracted so the SAME behaviour
// (resume / pause / destructive-ripple confirm) can be driven from the Home
// tab's pause glyph (home.tsx) without duplicating the state machine. The
// hook owns the decision logic + confirm copy + busy/confirm state; the
// consumer renders the trigger glyph and a <ConfirmDialog> fed by `confirm`.

export type GameModeConfirmProps = {
  visible: boolean
  title: string
  description: string
  confirmLabel: string
  icon: ReactNode
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
}

export type GameModeControl = {
  /** False while a transient interaction (outgoing waiting / incoming
   * pending / live chat) owns its own resolution flow — the control would be
   * inert there, so the consumer should not render it. */
  visible: boolean
  /** True while game mode is paused (both pages locked, no live partner /
   * invite). The control should then read as RESUME (Play); otherwise it
   * reads as PAUSE. */
  paused: boolean
  busy: boolean
  /** Tap handler implementing the full settings semantics: resume when
   * paused, pause directly when nothing else is disrupted, otherwise open
   * the destructive-ripple confirm. */
  onPress: () => void
  /** Props for the <ConfirmDialog> the consumer renders. */
  confirm: GameModeConfirmProps
}

export function useGameMode(): GameModeControl {
  const profile = useUserStore(s => s.profile)
  const relations = profile?.relations as {
    page2State?: 'free' | 'pending' | 'chat' | 'locked'
    watchers?: Profile[]
    page2?: unknown
    page1?: { state?: 'free' | 'watching' | 'waiting' | 'chat' | 'locked'; profile?: Profile }
    last_add_at?: string
  } | null | undefined

  const page1State = relations?.page1?.state
  const page1HasPartner = !!relations?.page1?.profile?.user_id
  const page2State = relations?.page2State
  const page2Raw = relations?.page2
  const page2InviteObj = page2Raw && !Array.isArray(page2Raw) ? page2Raw : null
  const watchers = Array.isArray(relations?.watchers) ? relations!.watchers! : []

  // Broadcast is "active" while the 30m app_add cooldown is still running
  // (canonical derivation lives in home.tsx). Pausing while broadcasting
  // kicks every freshly-pulled candidate — same destructive ripple as
  // pausing with watchers present — so it routes through the confirm path.
  const ADD_COOLDOWN_MS = 30 * 60 * 1000
  const lastAddAtMs = (() => {
    const raw = relations?.last_add_at
    if (typeof raw !== 'string') return 0
    const ts = Date.parse(raw)
    return Number.isFinite(ts) ? ts : 0
  })()
  const broadcastActive = !!lastAddAtMs && (Date.now() - lastAddAtMs) < ADD_COOLDOWN_MS

  // "Paused" reads off the canonical pair: both pages locked with no live
  // partner/profile on either side. Anything else counts as Game mode.
  const isOff = page1State === 'locked' && page2State === 'locked'
    && !page1HasPartner && !page2InviteObj
  // An active invitation (outgoing waiting / incoming pending) or a live chat
  // on EITHER page is a transient state whose own pane owns the resolution
  // flow. The control is inert there — the consumer hides it.
  const hidden =
    page1State === 'waiting' || page1State === 'chat'
    || page2State === 'pending' || page2State === 'chat'

  // Whether switching to pause mode would notify someone: broadcasting in
  // flight, watchers in page2.profiles[], a pending invite incoming, a
  // watching/waiting/chat partner on page1. When none of those apply, the
  // press commits without a confirm prompt.
  const hasSideEffects = broadcastActive
    || watchers.length > 0
    || page2State === 'pending'
    || (page1HasPartner && page1State !== 'locked' && page1State !== 'free')

  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const performToggle = useCallback(async (endpoint: 'app/pause' | 'app/resume') => {
    setBusy(true)
    try {
      await invoke(endpoint, {})
    } catch (e) {
      console.error(e)
    }
    setBusy(false)
  }, [])

  const onPress = useCallback(() => {
    if (busy) return
    if (hidden) { tapWarning(); return }
    tap()
    if (isOff) {
      performToggle('app/resume')
    } else if (!hasSideEffects) {
      performToggle('app/pause')
    } else {
      setConfirmOpen(true)
    }
  }, [busy, hidden, isOff, hasSideEffects, performToggle])

  // Confirm-popup copy/icon mirrors the visibility-toggle popups: ask the
  // same question we'd ask if the user reached for the same destructive
  // ripple via the toggle. The shared resolver returns the broadcast or
  // hide-profile variant when one applies; otherwise (a watching partner on
  // page1, etc.) we fall back to the generic pause copy. The confirm action
  // itself is `app/pause` regardless of which variant is shown.
  const sharedConfirm = visibilityConfirmFor({ broadcastActive, watchersCount: watchers.length })
  const confirm: GameModeConfirmProps = {
    visible: confirmOpen,
    title: sharedConfirm?.title ?? t('settings.gameMode.offConfirmTitle'),
    description: sharedConfirm?.description ?? tg('settings.gameMode.offConfirmDesc', profile?.is_male),
    confirmLabel: sharedConfirm?.confirmLabel ?? t('settings.gameMode.offConfirmButton'),
    icon: sharedConfirm?.topIcon ?? <PauseIcon color={PRIMARY} size={32} />,
    onCancel: () => { if (!busy) setConfirmOpen(false) },
    onConfirm: () => { performToggle('app/pause'); setConfirmOpen(false) },
    busy,
  }

  return { visible: !hidden, paused: isOff, busy, onPress, confirm }
}
