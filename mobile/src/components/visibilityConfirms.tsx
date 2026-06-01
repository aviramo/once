import type { ReactNode } from 'react'
import { t, tg } from '../i18n'
import { PRIMARY } from '../colors'
import { MegaphoneOffIcon, EyeOffIcon } from './icons'

// Single source of truth for the two confirm-popup variants the app uses
// when a press is about to disrupt other users' visibility into the actor:
// stopping a live broadcast, or hiding while watchers are pinned.
//
// Every surface that can trigger this destructive ripple — the visibility
// toggle's Hide button (home.tsx) and the settings Pause button
// (GameModeCard in settings.tsx) — pulls its title / description / button
// label / top action icon from here, so changes propagate to every popup
// instance in one edit.
//
// Note: `t(...)` is called eagerly inside each helper so the strings track
// the current language at every render. Don't hoist to module-level
// constants — the snapshot would freeze on the language at first import.

export type VisibilityConfirmConfig = {
  title: string
  description: string
  confirmLabel: string
  /** Action icon shown in the dialog's tinted circle. Sized to the
   * ConfirmDialog convention (`color={PRIMARY} size={32}`). */
  topIcon: ReactNode
}

/** "You're broadcasting — stop?" Used when a destination press would end an
 * in-flight broadcast (kicking the candidates pulled into page2.profiles).
 * The description body is gendered (אתה / את + matching verb forms) and is
 * picked via `tg(_m/_f)` against the caller's `userIsMale`. */
export function exitBroadcastConfirm(userIsMale?: boolean | null): VisibilityConfirmConfig {
  return {
    title: t('home.exitBroadcastConfirmTitle'),
    description: tg('home.exitBroadcastConfirmDesc', userIsMale ?? null),
    confirmLabel: t('home.exitBroadcastConfirmButton'),
    topIcon: <MegaphoneOffIcon color={PRIMARY} size={32} />,
  }
}

/** "Hide your profile?" Used when going hidden would kick existing watchers
 * (each receives page1=locked + 'remove' push). */
export function hideProfileConfirm(): VisibilityConfirmConfig {
  return {
    title: t('home.hideConfirmTitle'),
    description: t('home.hideConfirmDesc'),
    confirmLabel: t('home.hideConfirmButton'),
    topIcon: <EyeOffIcon color={PRIMARY} size={32} />,
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
  userIsMale,
}: {
  broadcastActive: boolean
  watchersCount: number
  userIsMale?: boolean | null
}): VisibilityConfirmConfig | null {
  if (broadcastActive) return exitBroadcastConfirm(userIsMale)
  if (watchersCount > 0) return hideProfileConfirm()
  return null
}
