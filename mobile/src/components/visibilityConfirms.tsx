import type { ReactNode } from 'react'
import { t } from '../i18n'
import { INK, PRIMARY } from '../colors'
import { ICON } from '../tokens'
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
}

/** "Hide your profile?" Used when going hidden would kick existing watchers
 * (each receives page1=locked + 'remove' push).
 *
 * `watcherCount` makes the ripple concrete — "your 3 watchers" instead of the
 * abstract "all your watchers". Three variants because Hebrew inflects the
 * verb for a single watcher, and because 0 watchers must not claim a number
 * that isn't there (the generic line still applies: someone can start watching
 * between this render and the tap). */
export function hideProfileConfirm(watcherCount: number): VisibilityConfirmConfig {
  const description =
    watcherCount <= 0 ? t('settings.hideConfirmDesc')
    : watcherCount === 1 ? t('settings.hideConfirmDescOne')
    : t('settings.hideConfirmDescMany').replace('{count}', String(watcherCount))
  return {
    title: t('settings.hideConfirmTitle'),
    description,
    confirmLabel: t('settings.hideConfirmButton'),
  }
}
