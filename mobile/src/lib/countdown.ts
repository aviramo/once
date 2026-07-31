import { useEffect, useRef, useState } from 'react'

// ── THE invitation countdown ───────────────────────────────────────────────
// The tick that drives the clock and the way that clock is written, in one
// module — because the clock itself is now stated in exactly one place on
// screen: INSIDE the name/age chip, on the card of the person the invitation
// concerns (user directive 2026-07-30). It used to live in home.tsx beside the
// status cards that drew it; the card carries it now, so neither half belongs to
// that screen any more.
//
// Not to be confused with `useLapsed` (home.tsx), which answers the same
// question for a card with NO visible clock and therefore schedules a single
// timeout instead of ticking every second.

/** Seconds left until `expiresAt`, ticking every second, floored at 0.
 *
 *  `onZero` fires the moment the clock runs out — including on mount, when the
 *  target is already in the past. Exactly once per target: an expired
 *  invitation is a one-shot event, and the handler hits the network.
 *
 *  Held in a ref so callers can pass an inline arrow without restarting the
 *  interval every render, which would reset the countdown a caller never asked
 *  to reset. */
export function useSecsLeft(expiresAt: string | null | undefined, onZero?: () => void) {
  const target = expiresAt ? new Date(expiresAt).getTime() : 0
  const [secsLeft, setSecsLeft] = useState(() =>
    target ? Math.max(0, Math.floor((target - Date.now()) / 1000)) : 0
  )
  const onZeroRef = useRef(onZero)
  onZeroRef.current = onZero
  const firedRef = useRef(false)
  useEffect(() => {
    firedRef.current = false
    if (!target) { setSecsLeft(0); return }
    const tick = () => {
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000))
      setSecsLeft(left)
      if (left === 0 && !firedRef.current) {
        firedRef.current = true
        onZeroRef.current?.()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])
  return secsLeft
}

/** mm:ss, growing an hours field only when there is one. */
export function formatClock(secsLeft: number): string {
  const h = Math.floor(secsLeft / 3600)
  const m = Math.floor((secsLeft % 3600) / 60)
  const s = secsLeft % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
