import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { GREEN } from '../colors'

// The green band behind the OS status bar. Single source of truth for the
// status-strip fade, used by the root layout AND by any full-screen Modal —
// a Modal is a separate native window, so the root layout's band does NOT
// paint over it and each modal must render its own.
//
// Android 15 (targetSdk 35) enforces edge-to-edge and IGNORES every API that
// used to colour the status bar — `androidStatusBar.backgroundColor` in
// app.json and expo-status-bar's `backgroundColor` prop are both no-ops there.
// So the app draws the strip itself.
//
// Deliberately ABSOLUTE and pointerEvents="none": it paints over the top strip
// without taking layout space. If it were a normal child it would push every
// screen down by the inset, and screens that already pad by `insets.top` (home's
// floating chrome, the sheets) would end up double-inset.
//
// It is a vertical FADE, not a flat fill: solid green under the system glyphs
// at the top, dissolving to nothing at the bottom edge, so the band meets
// whatever the screen is (a photo, a beige page) without drawing a hard line
// across it.
export function StatusBarBand({ topInset }: { topInset?: number } = {}) {
  const insets = useSafeAreaInsets()
  // A Modal's own SafeAreaProvider context may not carry the real inset, so a
  // caller inside one passes it explicitly; elsewhere the hook is the source.
  const top = topInset ?? insets.top
  if (top <= 0) return null
  return (
    <View pointerEvents="none" style={[styles.statusBand, { height: top }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="statusBand" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={GREEN} stopOpacity={1} />
            <Stop offset="1" stopColor={GREEN} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#statusBand)" />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  statusBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 100,
  },
})
