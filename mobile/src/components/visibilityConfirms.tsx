import type { ReactNode } from 'react'
import { t } from '../i18n'
import { PRIMARY } from '../colors'
import { EyeOffIcon } from './icons'

// Confirm-popup copy for a press that is about to disrupt other users'
// visibility into the actor. Going hidden kicks every watcher pinned to the
// user, so the destructive ripple is surfaced before it happens.
//
// Broadcast was retired from the client on 2026-07-19, so exitBroadcastConfirm
// and visibilityConfirmFor (which only existed to choose between the two
// variants) went with it.
//
// Note: `t(...)` is called eagerly inside the helper so the strings track the
// current language at every render. Don't hoist to module-level constants —
// the snapshot would freeze on the language at first import.

export type VisibilityConfirmConfig = {
  title: string
  description: string
  confirmLabel: string
  /** Action icon shown in the dialog's tinted circle. Sized to the
   * ConfirmDialog convention (`color={PRIMARY} size={32}`). */
  topIcon: ReactNode
}

/** "Hide your profile?" Used when going hidden would kick existing watchers
 * (each receives page1=locked + 'remove' push). */
export function hideProfileConfirm(): VisibilityConfirmConfig {
  return {
    title: t('settings.hideConfirmTitle'),
    description: t('settings.hideConfirmDesc'),
    confirmLabel: t('settings.hideConfirmButton'),
    topIcon: <EyeOffIcon color={PRIMARY} size={32} />,
  }
}
