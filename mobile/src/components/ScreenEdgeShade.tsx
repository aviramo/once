import { View, StyleSheet, useWindowDimensions } from 'react-native'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SHADOW_BLACK } from '../colors'
import { EDGE_SHADE_ALPHA, EDGE_SHADE_REACH } from '../tokens'

// ── The screen's own two edges ─────────────────────────────────────────────
// THE APP IS BOUNDED, TOP AND BOTTOM, BY ONE SHADE — AND NO PAGE DRAWS IT (user
// directive 2026-08-03). The same black at the same stop as the app's own lift
// (RISE_SHADOW), falling inwards off each edge of the display, so a seam INSIDE
// the app and the edge OF the app read as one treatment.
//
// It replaced two different situations, and the point is that they are one now:
// the top was a PURPLE 0.5 → 0 gradient painted by home alone, which read as a
// tint laid over the photo rather than as the edge of the screen, while the
// BOTTOM had nothing at all except on the one screen that happens to carry the
// dock, so a Circles page or the sign-in page simply ran off the display. Never
// put either of these on a page again: a screen that wants an edge already has
// one.
//
// Android 15 (targetSdk 35) enforces edge-to-edge and IGNORES every API that
// used to colour the status bar — `androidStatusBar.backgroundColor` in
// app.json and expo-status-bar's `backgroundColor` prop are both no-ops there.
// So the app draws its own top edge, and this is it.
//
// IT IS PAINTED, NOT CAST. Two shadow builds were tried first and neither
// survives both platforms (2026-08-03): an ordinary OUTSET shadow from a box
// hung just past the edge drew nothing on Android, because a view group clips
// its children and a child at a negative offset is cut away with its shadow;
// and the INSET `boxShadow` that replaced it drew nothing on iPHONE, where the
// user could not see the top edge at all however deep it was made. What is left
// is the one fade mechanism the app already runs on both platforms — the SVG
// band a popup's bounded block fades out under (`ScrollFade` in
// `BottomSheet.tsx`) — in the shadow's own black at the shadow's own stop, so
// nothing about how the edge LOOKS changed with the mechanism. This is also why
// it is not the app's no-gradients rule being bent: an edge that falls off is
// the same hint that rule already admits, and the alternative is a hard line
// across the screen.
//
// Deliberately ABSOLUTE and pointerEvents="none": these paint over the screen
// without taking layout space. As normal children they would push every screen
// in by the insets, and screens that already pad by `insets.top` would end up
// double-inset.
//
// Both are rendered ONCE, by the root layout — plus by any full-screen Modal: a
// Modal is a separate native window, so the root layout's pair does not paint
// over it and each one must render its own.

/** One band, fading from the edge it stands on to nothing at its far side. */
function EdgeShade({ edge, reach }: { edge: 'top' | 'bottom'; reach: number }) {
  const { width } = useWindowDimensions()
  // The id names the edge: both bands are on screen at once and a shared id
  // would let one of them be painted with the other's direction.
  const id = `edgeShade_${edge}`
  // Ascending offsets, with the STRENGTH at whichever end is the screen's edge:
  // a gradient's stops must run 0 → 1 whatever direction the fade goes.
  const [top, bottom] = edge === 'top' ? [EDGE_SHADE_ALPHA, 0] : [0, EDGE_SHADE_ALPHA]
  return (
    <View pointerEvents="none" style={[styles[edge], { height: reach }]}>
      {/* EXPLICIT PIXELS, never '100%': this band renders ONCE and never again,
          so a percentage that resolved against an unmeasured box on the first
          pass would stay zero for the life of the app with no re-render to
          correct it — which is exactly how the whole shade vanished from both
          platforms (2026-08-03). A popup's ScrollFade gets away with percentages
          only because scrolling re-renders it. */}
      <Svg width={width} height={reach}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2={reach} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={SHADOW_BLACK} stopOpacity={top} />
            <Stop offset="1" stopColor={SHADOW_BLACK} stopOpacity={bottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={reach} fill={`url(#${id})`} />
      </Svg>
    </View>
  )
}

/** The shade behind the OS status glyphs. */
export function StatusBarBand({ topInset }: { topInset?: number } = {}) {
  const insets = useSafeAreaInsets()
  // A Modal's own SafeAreaProvider context may not carry the real inset, so a
  // caller inside one passes it explicitly; elsewhere the hook is the source.
  //
  // It decides whether this window has a system strip to stand behind, and HOW
  // DEEP that strip is. THE TOP SHADE IS AS DEEP AS THE GLYPHS IT CARRIES (user
  // report 2026-08-03): the reach below is the fade's own and is right for the
  // BOTTOM edge, where there is nothing but the edge, but an Android strip is
  // ~24-30dp and a notched iPhone reports 47-59 — so a fixed 26 had already
  // fallen to nothing well above the clock, and the top of an iPhone read as
  // having no edge at all. A shallower strip leaves the fade as it is.
  const top = topInset ?? insets.top
  if (top <= 0) return null
  return <EdgeShade edge="top" reach={Math.max(EDGE_SHADE_REACH, top)} />
}

/** The shade at the foot of the screen, on every page, dock or no dock. */
export function BottomEdgeShade() {
  return <EdgeShade edge="bottom" reach={EDGE_SHADE_REACH} />
}

const edge = {
  position: 'absolute',
  left: 0,
  right: 0,
  // Over everything a screen can draw, and both numbers together: `zIndex` is
  // what orders it on iOS and inside a single Android view group, `elevation`
  // what orders it against an Android sibling that lifted itself.
  zIndex: 100,
  elevation: 100,
} as const

const styles = StyleSheet.create({
  // Each band sits flush against the edge it marks and falls inwards from
  // there — strongest right at the edge, exactly as the dock's shade sits right
  // at the top of the strip.
  top: { ...edge, top: 0 },
  bottom: { ...edge, bottom: 0 },
})
