import { useEffect, useRef } from 'react'
import { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { COUNT_BLINK } from '../tokens'

// ── A MARK THAT CHANGED BLINKS ─────────────────────────────────────────────
//
// Three times over two seconds, on COUNT_BLINK (user directive 2026-07-31 for
// the dock's numbers, 2026-08-02 for the heading chip's clock). These marks
// change while the user is looking at the card in the middle of the screen — a
// request arrives, a credit is spent, an invitation starts its clock or runs
// out — and one thing quietly becoming another in a corner is a change nobody
// is there to see. The blink is the mark saying it just changed, without taking
// the screen to do it: the dot's own principle, which is why it is a BLINK and
// not the continuous PULSE.
//
// ONE implementation, because it is one gesture wherever it appears — the
// dock's markers and the name chip's trailing block are the same statement in
// two places.
//
// What must never blink is a surface simply APPEARING with the mark already on
// it, so the first value each caller ever hands over is recorded and not
// announced. `undefined`/`null` is a value like any other here, which is what
// makes a mark ARRIVING (nothing → a clock) a change rather than a mount; only
// a present value blinks, so a mark going away does nothing but get recorded.
//
// The style is meant for the WRAPPER, not for the ink: only paint changes, so
// nothing about the blink can move what it is annotating. It owns that
// `opacity` outright — a second one there would be overwritten by it or have to
// be multiplied into every frame — so a caller that wants a mark FAINTER states
// it on the colour.
export function useCountBlink(
  key: string | number | null | undefined,
  /** Announce the FIRST value too. For a mark whose component comes and goes
   *  with what it says (the name chip's trailing block, which is unmounted
   *  while the card has nothing to put there), the arrival IS the change and
   *  there is no earlier value to compare it against — so the host, which is
   *  the only thing that knows whether it is arriving or is simply what the
   *  surface has always carried, says which of the two this mount is. A host
   *  that stays mounted (the dock's markers) leaves it alone. */
  announceFirst = false,
) {
  const blink = useSharedValue(1)
  const seen = useRef(announceFirst ? undefined : key)
  useEffect(() => {
    const changed = key != null && key !== seen.current
    // Recorded either way, absence included: a mark coming back after the slot
    // had nothing to say is a mark ARRIVING, and it blinks like any other.
    seen.current = key
    if (!changed) return
    // One blink is away AND back, stated as a sequence rather than as a reversed
    // repeat of a single timing: the way back names its own destination, so a
    // change landing mid-blink (this assignment cancels the one running, which
    // is what it should do) dips from wherever the mark currently is and still
    // ends at full strength. A reversed repeat would end wherever it was
    // interrupted.
    blink.value = withRepeat(
      withSequence(
        withTiming(COUNT_BLINK.opacity, { duration: COUNT_BLINK.phaseMs }),
        withTiming(1, { duration: COUNT_BLINK.phaseMs }),
      ),
      COUNT_BLINK.times,
      false,
    )
  }, [key])
  return useAnimatedStyle(() => ({ opacity: blink.value }))
}
