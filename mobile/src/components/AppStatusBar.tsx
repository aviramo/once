import { StatusBar } from 'expo-status-bar'
import { GREEN } from '../colors'

// Single source of truth for the OS status bar appearance.
//
// The bar is a solid GREEN band across every screen, carrying WHITE system
// icons. It is deliberately NOT the page tone: a green strip gives the app a
// fixed top edge regardless of what the screen underneath is doing (a light
// sheet, a user photo), so the clock and battery never have to survive an
// arbitrary background.
//
// `style` stays a prop for the rare screen that paints its own bar background
// and needs dark glyphs on it.
//
// expo-status-bar applies imperatively and never restores its value on
// unmount, so a screen that forgets to set it would silently inherit whatever
// the previous screen left behind. Centralising the config here — and
// rendering exactly one <AppStatusBar> per full-screen route — means the rule
// is defined once and can't drift.
export function AppStatusBar({
  backgroundColor,
  style = 'light',
}: {
  /** Override only the bar background. */
  backgroundColor?: string
  /** Icon/text colour. Default 'light' — white glyphs on the green band. */
  style?: 'light' | 'dark'
} = {}) {
  return (
    <StatusBar
      style={style}
      backgroundColor={backgroundColor ?? GREEN}
      translucent={false}
    />
  )
}
