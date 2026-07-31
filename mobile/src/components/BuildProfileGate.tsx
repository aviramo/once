import React from 'react'
import { useRouter } from 'expo-router'
import { ConfirmDialog } from './ConfirmDialog'
import { UserPlusIcon } from './icons'
import { WHITE } from '../colors'
import { t } from '../i18n'

/** The popup behind every door a not-yet-built profile is refused at.
 *
 *  There are three of them and they are the same object: sending an invitation
 *  (home's invite prompt), Circles (the members-only gate) and being visible at
 *  all (the preferences popup's visibility row). Only the SENTENCE differs from
 *  door to door, because only the sentence knows what was blocked; the title
 *  slot, the one button, its glyph and where that button goes are the popup's
 *  own and are stated here once. The button is always the fix, never an
 *  acknowledgement: a popup that says what is missing is also what completes it.
 *
 *  `onConfirm` exists for the one caller that cannot navigate on the spot: the
 *  visibility row lives INSIDE a popup, and pushing a route under an open Modal
 *  would leave that Modal standing over onboarding, so it closes its own sheet
 *  first and navigates from the sheet's `onClosed`. Everyone else gets the
 *  default and states nothing. */
export function BuildProfileGate({ visible, title, description, onClose, onConfirm }: {
  visible: boolean
  title: string
  /** What is shut, and why building the profile opens it. */
  description: string
  onClose: () => void
  /** Replaces the jump to onboarding. Runs after this popup has closed itself. */
  onConfirm?: () => void
}) {
  const router = useRouter()
  return (
    <ConfirmDialog
      visible={visible}
      title={title}
      description={description}
      confirmLabel={t('settings.buildProfile')}
      confirmIconStart={<UserPlusIcon color={WHITE} />}
      onConfirm={() => {
        onClose()
        if (onConfirm) onConfirm()
        else router.push('/onboarding')
      }}
      onCancel={onClose}
    />
  )
}
