import { StatusBar } from 'expo-status-bar'
import { BG } from '../colors'

// Single source of truth for the OS status bar appearance.
//
// The scheme is light, so DARK icons are the default and are correct on every
// surface the app paints itself: the warm off-white BG, a white card, a sheet.
//
// The one exception is a screen whose top edge is a USER PHOTO. The app is
// edge-to-edge (see app.json), so the photo draws behind the status bar, and a
// photo can be any brightness — home passes `style="light"` and gets white
// icons, which is the only readable choice over an arbitrary image. This is
// why the style is a prop rather than a constant: the rule is "match what is
// physically behind the bar", and only the screen knows that.
//
// expo-status-bar applies imperatively and never restores its value on
// unmount, so a screen that forgets to set it would silently inherit whatever
// the previous screen left behind. Centralising the config here — and
// rendering exactly one <AppStatusBar> per full-screen route — means the rule
// is defined once and can't drift.
export function AppStatusBar({
  backgroundColor,
  style = 'dark',
}: {
  /** Override only the bar background. */
  backgroundColor?: string
  /** Icon/text colour. Default 'dark' (an app-painted light surface behind
   * the bar); pass 'light' when a user photo sits behind it. */
  style?: 'light' | 'dark'
} = {}) {
  return (
    <StatusBar
      style={style}
      backgroundColor={backgroundColor ?? BG}
      translucent={false}
    />
  )
}
