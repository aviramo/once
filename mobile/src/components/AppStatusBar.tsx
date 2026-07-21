import { StatusBar } from 'expo-status-bar'
import { BG } from '../colors'

// Single source of truth for the OS status bar appearance.
//
// Product rule (absolute, no exceptions): the status bar text/icons are
// ALWAYS dark, on every screen in the app. The scheme is light — every
// full-screen surface is the warm off-white BG or a white card — so dark
// icons read with strong contrast everywhere. There is no dark-background
// screen left, hence no "light icons" variant.
//
// expo-status-bar applies imperatively and never restores its value on
// unmount, so a screen that forgets to set it would silently inherit
// whatever the previous screen left behind. Centralising the config here
// — and rendering exactly one <AppStatusBar> per full-screen route —
// means the rule is defined once and can't drift.
export function AppStatusBar({
  backgroundColor,
}: {
  // Override only the bar background. The text style is fixed (always
  // dark) and never changes.
  backgroundColor?: string
} = {}) {
  return (
    <StatusBar
      style="dark"
      backgroundColor={backgroundColor ?? BG}
      translucent={false}
    />
  )
}
