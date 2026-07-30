import { useState } from 'react'
import { Dimensions } from 'react-native'
import { useEffect } from 'react'
import {
  makeMutable, runOnJS, scrollTo, useAnimatedReaction, useDerivedValue, useSharedValue,
  type AnimatedRef, type SharedValue,
} from 'react-native-reanimated'
import {
  useGenericKeyboardHandler,
  useKeyboardContext,
  useReanimatedFocusedInput,
  useResizeMode,
} from 'react-native-keyboard-controller'
import { LG, keyboardAirCut } from '../tokens'
import { useBottomInset } from './useBottomInset'

/** Re-exported so this file is the ONLY one that imports the keyboard library.
 *  Mounted once, at the root, above `KeyboardShrink` (app/_layout.tsx). */
export { KeyboardProvider } from 'react-native-keyboard-controller'

// THE keyboard module. Nothing else in the app may read a keyboard height.
//
// The contract (user directive 2026-07-30): the keyboard SHRINKS THE PAGE. The
// bottom of the page is flush against the top of the keyboard at every instant,
// on the way up and on the way down, and no screen, popup or component knows a
// keyboard exists. There are exactly TWO places that consume this module for
// layout, because the app has exactly two native windows:
//
//   1. `app/_layout.tsx` — the root, which covers every route and every
//      OverlaySheet (they are absoluteFill children of home's shell).
//   2. `components/BottomSheet.tsx` — a RN `Modal` is a separate window and
//      does NOT inherit the root's shrink, so the popup lifts itself.
//
// Everything else — the chat composer, the communities search, the bio editor,
// every popup body — simply sits at the bottom of a page that got shorter.
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

// The screen is the window: the app draws edge-to-edge and is portrait-locked,
// so this never changes and the focused field's `absoluteY` is in the same
// coordinates. (The library ships a `useWindowDimensions` that subscribes to a
// native resize event for this — pointless here, and one native subscription
// per scroll surface in the app.)
const SCREEN_H = Dimensions.get('screen').height

// How much a focused control keeps BELOW its text input and needs cleared along
// with it. Module-level because exactly one field is focused at a time, and a
// shared value because the reveal reads it from a worklet.
//
// The platform only ever tells us where the EditText itself is. That is not the
// same as the thing the user is interacting with: `EditableText` grows a footer
// with its Update button — the only save path — the moment it takes focus, so
// revealing just the input left the button behind the keyboard with no way to
// reach it (the group link, 2026-07-30). A control that puts chrome under its
// input has to say so.
const focusedFieldFooter = makeMutable(0)

/**
 * Declares that the focused control needs `height` px cleared BELOW its input.
 * Call from the control itself, with `active` true only while it is focused.
 */
export function useFocusedFieldFooter(height: number, active: boolean): void {
  useEffect(() => {
    if (!active) return
    focusedFieldFooter.value = height
    return () => { focusedFieldFooter.value = 0 }
  }, [height, active])
}

/**
 * Keeps the field the user is typing in inside the visible part of a scroll
 * surface. Shrinking the page is only half the job: a field that was near the
 * bottom is now simply below the fold of a shorter page, and no amount of
 * shrinking brings it back — the content has to move.
 *
 * It moves WITH the keyboard, not after it (user report 2026-07-30). Firing this
 * once the keyboard had settled was correct but read as a third act: keyboard
 * rises, page shortens, and then — visibly separately — the content jumps. So
 * the destination is computed at `onStart`, which already carries the keyboard's
 * FINAL height, and the scroll is then driven frame by frame on the UI thread
 * from `onMove`, against the same interpolation the keyboard itself is running.
 * The page shortening and the field rising are one motion.
 *
 * Wired once, into `PullScrollView` (the app's only scroll surface), so it
 * covers every list and form in the app.
 */
export function useKeyboardReveal(
  // An `useAnimatedRef`, so the scroll can be driven from a worklet — a JS
  // `scrollTo` per frame would land a frame late, which is the whole problem.
  scrollRef: AnimatedRef<any>,
  /** The surface's live offset. `scrollTo` takes an absolute position. */
  scrollOffset: SharedValue<number>,
  /** The surface's own node tag, for the containment check below. */
  scrollTag: SharedValue<number | null>,
): void {
  const { input } = useReanimatedFocusedInput()
  // The ride: where the content starts, where it must end, and the keyboard
  // heights those two correspond to.
  const from = useSharedValue(0)
  const to = useSharedValue(0)
  const fromHeight = useSharedValue(0)
  const toHeight = useSharedValue(0)
  const riding = useSharedValue(false)

  /** How far the content must move for the focused field to clear the keyboard
   *  at `keyboardHeight`, or 0 if it already does. */
  const overlapFor = (keyboardHeight: number): number => {
    'worklet'
    const focused = input.value
    if (!focused) return 0
    // Every scroll surface in the app runs this, so the one the field actually
    // lives in has to identify itself — otherwise a keyboard opening over a
    // popup would also scroll the list sitting behind it. The native side walks
    // up from the focused EditText to the nearest scrollable vertical
    // ScrollView and reports its tag; ours has to be that one.
    if (scrollTag.value == null || focused.parentScrollViewTarget !== scrollTag.value) return 0
    const fieldBottom = focused.layout.absoluteY + focused.layout.height + focusedFieldFooter.value
    return Math.max(0, fieldBottom + LG - (SCREEN_H - keyboardHeight))
  }

  useGenericKeyboardHandler(
    {
      onStart: (e) => {
        'worklet'
        // `e` carries the DESTINATION, so the whole ride is known before the
        // keyboard has moved a pixel.
        const overlap = e.progress === 1 ? overlapFor(e.height) : 0
        if (overlap <= 0) { riding.value = false; return }
        from.value = scrollOffset.value
        to.value = scrollOffset.value + overlap
        fromHeight.value = -1 // resolved on the first frame, see onMove
        toHeight.value = e.height
        riding.value = true
      },
      onMove: (e) => {
        'worklet'
        if (!riding.value) return
        // The keyboard may already be part-way up when this starts (a field
        // focused while another keyboard was closing), so the ride is anchored
        // to the height at its own first frame rather than to zero.
        if (fromHeight.value < 0) fromHeight.value = e.height
        const span = toHeight.value - fromHeight.value
        const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (e.height - fromHeight.value) / span))
        scrollTo(scrollRef, 0, from.value + (to.value - from.value) * t, false)
      },
      onEnd: () => {
        'worklet'
        if (!riding.value) return
        riding.value = false
        scrollTo(scrollRef, 0, to.value, false)
      },
    },
    [],
  )

  // Moving between fields while the keyboard is ALREADY up moves no keyboard, so
  // the handler above never fires — and the second field can easily be the one
  // behind it (the age popup chains from → to on submit, onboarding chains three
  // date fields). Watching which input is focused is what covers that.
  //
  // `!riding` is load-bearing, not a nicety: focusing a field ALSO changes the
  // focused input, so without it this fires a second time during the opening
  // animation, against a scroll offset the ride has not finished writing. The
  // two then stack instead of agreeing and the field shoots far past its target
  // (observed: ~630px of over-scroll on the create-group form).
  const kb = useKeyboardSV()
  /** Reveal without a keyboard movement to ride. Animated, and only here:
   *  nothing else is moving, so this IS the motion rather than a correction on
   *  top of one. Never while `riding` — that would stack with the ride. */
  const revealNow = () => {
    'worklet'
    if (kb.value <= 0 || riding.value) return
    const overlap = overlapFor(kb.value)
    if (overlap > 0) scrollTo(scrollRef, 0, scrollOffset.value + overlap, true)
  }

  useAnimatedReaction(
    () => input.value?.target,
    (target, previous) => {
      if (target == null || previous == null || target === previous) return
      revealNow()
    },
  )

  // The footer usually measures before the keyboard starts moving, so the ride
  // already accounts for it. This is the fallback for when it does not: a
  // control whose chrome lands late would otherwise stay half-covered until the
  // next focus.
  useAnimatedReaction(
    () => focusedFieldFooter.value,
    (height, previous) => {
      if (previous == null || height === previous || height === 0) return
      revealNow()
    },
  )
}
