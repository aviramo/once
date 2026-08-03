import { useState, type ReactNode } from 'react'
import { Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useEffect } from 'react'
import Animated, {
  runOnJS, useAnimatedStyle, useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated'
import {
  useGenericKeyboardHandler,
  useKeyboardContext,
  useResizeMode,
} from 'react-native-keyboard-controller'
import { keyboardAirCut } from '../tokens'
import { useBottomInset } from './useBottomInset'

/** Re-exported so this file is the ONLY one that imports the keyboard library.
 *  Mounted once, at the root, above `KeyboardMode` (app/_layout.tsx). */
export { KeyboardProvider } from 'react-native-keyboard-controller'

// THE keyboard module. Nothing else in the app may read a keyboard height.
//
// The contract (user directive 2026-07-30): the keyboard SHRINKS THE PAGE. The
// bottom of the page is flush against the top of the keyboard at every instant,
// on the way up and on the way down, and nothing INSIDE that page knows a
// keyboard exists — the chat composer, the Circles search, the bio editor, every
// popup body simply sits at the bottom of a box that got shorter.
//
// WHICH page is the part that changed on 2026-08-03 (user directive). It used to
// be the app: one `paddingBottom` on the root in `app/_layout.tsx`, which shrank
// every route and every OverlaySheet with it — including the pages that own no
// text field at all. Home is the one that showed what is wrong with that: a chat
// put away with its keyboard still coming down left home laid out short, its
// card cropped and the dock parked halfway up the screen over a keyboard that
// belonged to nothing. So the keyboard is attached PER PAGE now:
//
//   · `KeyboardSurface` (below) — declared by each surface that can be typed
//     into: app/login, app/onboarding, app/chat, CirclesPage, PreviewFieldPage.
//   · `components/BottomSheet.tsx` — a RN `Modal` is its own native window and
//     inherits nothing, so the popup lifts itself by the same value.
//
// HOME DECLARES NEITHER, and is always the whole screen.
//
// Why `react-native-keyboard-controller` and not RN's `Keyboard` events or
// Reanimated's `useAnimatedKeyboard`: this is the only one that reports the
// keyboard FRAME BY FRAME from the platform's own animation
// (`WindowInsetsAnimationCallback` on Android, the keyboard layer on iOS), so a
// surface RIDES the keyboard instead of jumping to where it will end up. RN's
// events also never fire when a keyboard that is already up merely changes
// height under the same focused field — switching Gboard to its taller emoji
// panel buried the chat composer under it (2026-07-29). The native callback has
// no such blind spot.
//
// NOTE on the reported height: on Android the library subtracts the navigation
// bar from the IME inset ONLY when the navigation bar is opaque
// (`KeyboardAnimationCallback.getCurrentKeyboardHeight`). The app is
// edge-to-edge, so the bar is translucent and the height we get is the FULL
// `WindowInsets.ime()` inset, measured from the bottom of the screen — exactly
// the distance the page must give up to sit flush on the keyboard. iOS reports
// the keyboard frame the same way, from the bottom of the screen, so the
// home-indicator band is inside that number too — on both platforms this height
// already contains the system's bottom band, which is exactly why a surface may
// spend half its bottom air against it (`useKeyboardShrinkSV` below).

/**
 * Sets Android's soft-input mode to `adjustResize`. Call this exactly ONCE, at
 * the root, in a component that never unmounts — the library's `useResizeMode`
 * restores the default mode on unmount, so a second caller that unmounts would
 * silently take the mode away from the app.
 *
 * The manifest already declares `adjustResize` (via `app.json`
 * `softwareKeyboardLayoutMode: "resize"`); this makes the app independent of
 * that config drifting. Under edge-to-edge the window still does not physically
 * resize — the mode is what makes the inset animation callbacks fire.
 */
export function useKeyboardResizeMode(): void {
  useResizeMode()
}

/**
 * The live keyboard height as a POSITIVE magnitude, updated on the UI thread
 * every frame of the keyboard's movement (including an interactive drag-dismiss).
 * 0 when the keyboard is closed.
 *
 * Positive because that is the app's convention for a distance driven by a
 * gesture — the same one `PullPane`'s `pullY` follows: the value is a magnitude
 * and only the style that consumes it knows which way it points. The library
 * publishes it negative, ready for a bare `translateY`.
 *
 * MODULE-PRIVATE on purpose: the raw height is the wrong value for a surface to
 * lay itself out against (it holds none of the air rule below), and the two
 * application points are the only layout that may read a keyboard at all. What
 * leaves this file is `useKeyboardShrinkSV`. It never crosses to JS, so reading
 * it costs no renders.
 */
function useKeyboardSV(): SharedValue<number> {
  // `useKeyboardContext` rather than `useReanimatedKeyboardAnimation`: the
  // latter also calls `useResizeMode`, and this hook is read from a component
  // that unmounts (the popup), which would reset the input mode on close.
  const { reanimated } = useKeyboardContext()
  return useDerivedValue(() => -reanimated.height.value)
}

/**
 * How much of itself a surface gives up to the keyboard, per frame — the value
 * BOTH application points consume, so the page and the popup can never come
 * apart. It is the keyboard's height less the half of the app's bottom air that
 * the keyboard makes unnecessary (`keyboardAirCut`, tokens.ts): the surface ends
 * half its air above the keyboard instead of a full one, because the air is there
 * to clear the system's bottom band and the keyboard has covered it.
 *
 * `max(0, …)` so a closed keyboard takes nothing: the cut only ever eats into
 * height the keyboard has actually claimed, which also makes the first pixels of
 * the movement carry the air from whole to half. Continuous by construction — the
 * cut is a session constant (the inset's high-water mark) sitting inside a value
 * that is already interpolating, so nothing re-renders and there is no step.
 */
export function useKeyboardShrinkSV(): SharedValue<number> {
  const kb = useKeyboardSV()
  const cut = keyboardAirCut(useBottomInset())
  return useDerivedValue(() => Math.max(0, kb.value - cut))
}

/**
 * THE KEYBOARD IS ATTACHED TO A PAGE, NOT TO THE APP (user directive
 * 2026-08-03). This is the one wrapper that does it: a `flex: 1` box that gives
 * up `useKeyboardShrinkSV()` of its own bottom, every frame, so the surface
 * inside it ends flush on the keyboard and is simply laid out shorter.
 *
 * It replaces the root-wide shrink of 2026-07-30, which padded the WHOLE app in
 * `app/_layout.tsx` and therefore shrank pages that own no text field at all —
 * home most of all: a chat closed with its keyboard still coming down left home
 * cropped, its card cut off and the dock parked halfway up the screen over a
 * keyboard belonging to nothing (emulator, 2026-08-03). A page that cannot be
 * typed into has no business moving for a keyboard.
 *
 * SO EVERY SURFACE WITH A TEXT FIELD DECLARES ONE, AND HOME NEVER DOES. The
 * call sites are exactly the pages that can be typed into: `app/login.tsx`,
 * `app/onboarding.tsx`, `app/chat.tsx`, `CirclesPage`, `PreviewFieldPage` — plus
 * `BottomSheet`, which is a `Modal`, i.e. its own native window, and lifts
 * itself with the same value rather than wrapping (see application point 2).
 * Adding a field to a page means adding this; nothing else about a keyboard is
 * ever written at a call site (see the ban list in the project instructions).
 *
 * `paddingBottom` and not a transform: the page must SHRINK, not slide — a
 * translate would push its top off the screen.
 */
export function KeyboardSurface(
  { children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> },
) {
  const shrink = useKeyboardShrinkSV()
  const pad = useAnimatedStyle(() => ({ paddingBottom: shrink.value }))
  // TWO BOXES, AND THE HOST'S STYLE IS ON THE INNER ONE. The shrink is a
  // `paddingBottom`, and so is half the bottom chrome in the app: flattened into
  // one style object the animated value WINS, so a page handing its own frame in
  // (chat: `paddingBottom: safeBottom`) silently lost that padding — the composer
  // came out flush against the bottom edge of the screen with the keyboard down
  // (emulator, 2026-08-03). The outer box owns the keyboard and nothing else; the
  // page is laid out inside it exactly as it was laid out inside the screen.
  return (
    <Animated.View style={[styles.surface, pad]}>
      <View style={[styles.surface, style]}>{children}</View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({ surface: { flex: 1 } })

/**
 * Whether the keyboard is up. Plain React state, so it re-renders — one flip per
 * open and one per close, never per frame. For logic that must run in JS
 * (re-pinning a list, measuring a focused field); never for the shrink itself.
 *
 * The two edges are deliberately asymmetric, so that "open" covers the WHOLE
 * time the page is short — which is what its consumers need, both of them being
 * a full-height pager re-pinning itself against a viewport that changed size
 * (MatchCard's reel, chat's inverted list):
 *  - OPENING it flips at `onStart`, which carries the DESTINATION values, i.e.
 *    before the keyboard has moved and before the page has given up a pixel.
 *  - CLOSING it flips at `onEnd`, not `onStart`. Through the whole close the
 *    page is still partly shrunk, so it must not read "closed" until the
 *    keyboard is actually gone.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)

  useGenericKeyboardHandler(
    {
      onStart: (e) => {
        'worklet'
        if (e.progress === 1) runOnJS(setOpen)(true)
      },
      onEnd: (e) => {
        'worklet'
        if (e.progress !== 1) runOnJS(setOpen)(false)
      },
    },
    [],
  )

  return open
}

// (THE KEYBOARD REVEAL STOOD HERE, and is deleted — user directive 2026-08-03.
// `useKeyboardReveal` scrolled the surface under a focused field as the keyboard
// came up, riding it frame by frame, and `useFocusedFieldFooter` let a control
// declare chrome under its input so the ride cleared that too. Between them they
// were the only reason a text field ever moved its own page, and a page moving
// itself under the finger is what the user asked to be rid of ("there are
// unnecessary events on text fields that scroll pages"). What the app does about
// a keyboard is now the whole story: the page it is attached to gets shorter. A
// field below the fold of that shorter page is reached by scrolling to it, which
// is always available — scrolling never ends an edit.)
