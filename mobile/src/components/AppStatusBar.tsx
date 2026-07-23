import { StatusBar } from 'expo-status-bar'
import { GREEN } from '../colors'

// Single source of truth for the OS status bar appearance.
//
// The bar is a SOLID GREEN band across every screen, carrying WHITE system
// icons, and the app starts BELOW it — nothing is drawn behind the bar.
//
// That requires `edgeToEdgeEnabled: false` in app.json. While it was true,
// Android forced a transparent status bar and drew the app underneath it, so
// `backgroundColor` here was silently ignored and the page tone showed through
// no matter what this component asked for. If the bar ever goes see-through
// again, check that flag before touching anything in this file.
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
