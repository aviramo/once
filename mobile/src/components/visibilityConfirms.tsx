import type { ReactNode } from 'react'
import { t } from '../i18n'
import { WHITE } from '../colors'
import { ICON } from '../tokens'
import { MegaphoneOffIcon, EyeOffIcon } from './icons'

// Single source of truth for the two confirm-popup variants the app uses
// when a press is about to disrupt other users' visibility into the actor:
// stopping a live broadcast, or hiding while watchers are pinned.
//
// Every surface that can trigger this destructive ripple — the visibility
// toggle's Hide button (home.tsx) and the settings Pause button
// (GameModeCard in settings.tsx) — pulls its title / description / button
// label / icon / destructive styling from here, so changes propagate to
// every popup instance in one edit.
//
// Note: `t(...)` is called eagerly inside each helper so the strings track
// the current language at every render. Don't hoist to module-level
// constants — the snapshot would freeze on the language at first import.

export type VisibilityConfirmConfig = {
  title: string
  description: string
  confirmLabel: string
  confirmIcon: ReactNode
  destructive: boolean
}

/** "You're broadcasting — stop?" Used when a destination press would end an
 * in-flight broadcast (kicking the candidates pulled into page2.profiles). */
export function exitBroadcastConfirm(): VisibilityConfirmConfig {
  return {
    title: t('home.exitBroadcastConfirmTitle'),
    description: t('home.exitBroadcastConfirmDesc'),
    confirmLabel: t('home.exitBroadcastConfirmButton'),
    confirmIcon: <MegaphoneOffIcon color={WHITE} size={ICON.xxl} />,
    destructive: false,
  }
}

/** "Hide your profile?" Used when going hidden would kick existing watchers
 * (each receives page1=locked + 'remove' push). */
export function hideProfileConfirm(): VisibilityConfirmConfig {
  return {
    title: t('home.hideConfirmTitle'),
    description: t('home.hideConfirmDesc'),
    confirmLabel: t('home.hideConfirmButton'),
    confirmIcon: <EyeOffIcon color={WHITE} size={ICON.xxl} />,
    destructive: true,
  }
}

/** Resolves the right confirm-popup config for a given visibility-state
 * snapshot. Mirrors the toggle's branching:
 *   broadcasting → exitBroadcastConfirm
 *   watchers > 0 → hideProfileConfirm
 *   neither       → null (caller falls back to its own copy or no popup) */
export function visibilityConfirmFor({
  broadcastActive,
  watchersCount,
}: {
  broadcastActive: boolean
  watchersCount: number
}): VisibilityConfirmConfig | null {
  if (broadcastActive) return exitBroadcastConfirm()
  if (watchersCount > 0) return hideProfileConfirm()
  return null
}
