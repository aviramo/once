import { useEffect, useState } from 'react'
import { Dimensions, Keyboard } from 'react-native'
import { KeyboardState, runOnJS, useAnimatedKeyboard, useAnimatedReaction } from 'react-native-reanimated'

// Single source of truth for "how tall is the on-screen keyboard right now"
// (0 when hidden). See CLAUDE.md "Keyboard avoidance in popups/sheets": a RN
// `Modal` + `statusBarTranslucent` does NOT get the activity's window resize,
// and the app draws edge-to-edge on Android so the window does not resize
// there either — a bottom-anchored surface therefore does not rise on its own.
// The structural fix is a PER-SCREEN nudge — pass this height into a
// `BottomSheet` `cardWrapStyle` `marginBottom` (and/or a height reduction) at
// the composing sheet, NOT a global transform lift inside `BottomSheet`
// (that double-applied with the per-screen nudge and over-shot — the rule the
// user inverted on 2026-05-19). The chat screen feeds it into the padding
// under its message list, which is what lifts the composer.
//
// TWO signals feed the one number, because neither is sufficient alone:
//
//  1. RN's keyboard events. They carry the FINAL height at the moment the
//     keyboard STARTS to appear, so the surface moves together with it instead
//     of a quarter-second behind. Read the visible bottom area from screen
//     geometry rather than `endCoordinates.height` directly: Gboard's
//     clipboard / suggestion strip lives between `screenY` and the bottom of
//     the device but is not always counted in `height`, and `screenHeight −
//     screenY` gives the full strip + keyboard area. `keyboardWillShow` is
//     listened to on both platforms (Android only emits `did*`) so the surface
//     starts moving before the keyboard animation does.
//
//  2. The live IME window inset (Reanimated's `useAnimatedKeyboard`, which
//     reads `WindowInsets.ime()` on Android / the keyboard frame on iOS).
//     Signal 1 fires when the keyboard APPEARS and disappears, but NOT when a
//     keyboard that is already up merely CHANGES HEIGHT under the same focused
//     field: switching Gboard to its emoji panel — visibly taller than the
//     letters keyboard — left the height stale and buried the chat composer
//     under the panel (user report 2026-07-29). The inset is read straight
//     from the window, so it is right for whatever the IME is showing.
//     Only SETTLED values are published (see below): the inset animates frame
//     by frame while the keyboard slides, and re-rendering every screen that
//     reads this hook 60 times per open is not worth the smoothness.
// NOTE — no options object is passed to `useAnimatedKeyboard`. The inset must
// be measured from the bottom of the SCREEN (otherwise Reanimated subtracts
// the system bars and reports a short keyboard), and edge-to-edge already
// guarantees exactly that: with `android.edgeToEdgeEnabled` on, Reanimated
// forces both translucency flags true internally and WARNS in dev that any
// values you pass are ignored. Do not reintroduce
// `isStatusBarTranslucentAndroid` / `isNavigationBarTranslucentAndroid` here.

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const onShow = (e: { endCoordinates?: { height?: number; screenY?: number } }) => {
      const screenH = Dimensions.get('screen').height
      const fromScreenY = screenH - (e.endCoordinates?.screenY ?? screenH)
      const reportedH = e.endCoordinates?.height ?? 0
      setHeight(Math.max(reportedH, fromScreenY))
    }
    const onHide = () => setHeight(0)
    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ]
    return () => { subs.forEach(s => s.remove()) }
  }, [])

  const keyboard = useAnimatedKeyboard()
  useAnimatedReaction(
    () => {
      const state = keyboard.state.value
      // Mid-animation the inset is a moving number and signal 1 has already
      // put the destination on screen, so publish nothing until it settles.
      if (state === KeyboardState.OPENING || state === KeyboardState.CLOSING) return null
      return state === KeyboardState.CLOSED ? 0 : keyboard.height.value
    },
    (settled, previous) => {
      if (settled != null && settled !== previous) runOnJS(setHeight)(settled)
    },
  )

  return height
}
