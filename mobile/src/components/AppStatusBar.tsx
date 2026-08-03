import { StatusBar } from 'expo-status-bar'

// Single source of truth for the OS status bar appearance: it sets the GLYPH
// colour and nothing else. The shade behind the glyphs is painted by the app
// itself (`StatusBarBand` in `ScreenEdgeShade.tsx`), not by the OS.
//
// It sets ONLY `style` on purpose. The app runs edge-to-edge
// (`android.edgeToEdgeEnabled: true`), where every bar-COLOUR API is a no-op:
// `backgroundColor`/`translucent` here call `Window.setStatusBarColor` /
// `setNavigationBarColor`, deprecated in Android 15 and ignored under
// edge-to-edge. Google Play flags apps that still call them, so this file must
// never pass a colour again — recolour the band component instead.
//
// expo-status-bar applies imperatively and never restores its value on
// unmount, so a screen that forgets to set it would silently inherit whatever
// the previous screen left behind. Centralising the config here — and
// rendering exactly one <AppStatusBar> per full-screen route — means the rule
// is defined once and can't drift.
export function AppStatusBar({
  style = 'light',
}: {
  /** Icon/text colour. Default 'light' — white glyphs on the purple band. */
  style?: 'light' | 'dark'
} = {}) {
  return <StatusBar style={style} />
}
