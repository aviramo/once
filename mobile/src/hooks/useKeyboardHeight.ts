import { useEffect, useState } from 'react'
import { Keyboard, Platform } from 'react-native'

// Single source of truth for "how tall is the on-screen keyboard right now"
// (0 when hidden). See CLAUDE.md "Keyboard avoidance for any text input in a
// popup/sheet": a RN `Modal` + `statusBarTranslucent` does NOT get the
// activity's window resize, so a bottom-anchored sheet does not rise on its
// own. The structural fix is a PER-SCREEN nudge — pass this height into a
// `BottomSheet` `cardWrapStyle` `marginBottom` (and/or a height reduction) at
// the composing sheet, NOT a global transform lift inside `BottomSheet`
// (that double-applied with the per-screen nudge and over-shot — the rule the
// user inverted on 2026-05-19). iOS uses will*, Android did* (no will* there),
// matching the proven settings.tsx handling this hook replaces.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, e => setHeight(e.endCoordinates?.height ?? 0))
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [])
  return height
}
