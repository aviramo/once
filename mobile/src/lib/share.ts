// Handing an invitation on — a circle's link, or my own friend/referral link.
//
// HEBREW GOES STRAIGHT TO WHATSAPP (user directive 2026-08-03). For a device
// running in Hebrew, WhatsApp is where an invitation is passed on, and the OS
// share sheet is a list of apps standing between the tap and the one app that
// was always going to be chosen. Every other language keeps the sheet.
//
// The text is unchanged either way — only which app receives it moves. If
// WhatsApp is not installed (or the scheme is refused), the share sheet is the
// fallback, so the invitation is never a dead tap.
import { Linking, Share } from 'react-native'

import { lang } from '../i18n'

/** The one language that skips the picker. */
const WHATSAPP_LANG = 'he'

function whatsappUrl(message: string): string {
  return `whatsapp://send?text=${encodeURIComponent(message)}`
}

/** Pass an invitation on. Resolves once the hand-off has been raised (or has
 *  failed), never throwing at the call site. */
export async function shareInvitation(message: string): Promise<boolean> {
  if (lang === WHATSAPP_LANG) {
    try {
      await Linking.openURL(whatsappUrl(message))
      return true
    } catch {
      // No WhatsApp on this device: fall through to the sheet.
    }
  }
  try {
    // Android reads `message` only, so the URL has to be inside it (see the
    // callers, which put it on its own line so it unfurls into a preview card).
    await Share.share({ message })
    return true
  } catch {
    return false
  }
}
