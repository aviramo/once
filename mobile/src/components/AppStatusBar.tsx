import { StatusBar } from 'expo-status-bar'
import { PRIMARY } from '../colors'

// Single source of truth for the OS status bar appearance.
//
// Product rule (absolute, no exceptions): the status bar text/icons are
// ALWAYS white, on every screen in the app. Every full-screen surface is
// the deep-wine PRIMARY (or a dark chrome like the paused BLACK_MID
// header), so white icons read with strong contrast everywhere. There is
// no light-background screen left, hence no "dark icons" variant.
//
// expo-status-bar applies imperatively and never restores its value on
// unmount, so a screen that forgets to set it would silently inherit
// whatever the previous screen left behind. Centralising the config here
// — and rendering exactly one <AppStatusBar> per full-screen route —
// means the rule is defined once and can't drift.
export function AppStatusBar({
  backgroundColor,
}: {
  // Override only the bar background (e.g. home's paused BLACK_MID
  // chrome). The text style is fixed (always white) and never changes.
  backgroundColor?: string
} = {}) {
  return (
    <StatusBar
      style="light"
      backgroundColor={backgroundColor ?? PRIMARY}
      translucent={false}
    />
  )
}
