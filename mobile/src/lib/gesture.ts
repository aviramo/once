// Module-level flag flipped by sliders while their thumb is being dragged.
// The settings/shell pagers react to changes via `useSlidingActive` so their
// Pan gesture gets disabled the moment the thumb grants — otherwise the
// gesture-handler Pan would claim the gesture at its 10px activeOffsetX and
// cut off the slider's legacy PanResponder mid-drag.
import { useSyncExternalStore } from 'react'

let sliding = false
const listeners = new Set<() => void>()

export const slidingActiveRef = {
  get current() { return sliding },
  set current(v: boolean) {
    if (v === sliding) return
    sliding = v
    listeners.forEach(l => l())
  },
}

export function useSlidingActive(): boolean {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => sliding,
    () => sliding,
  )
}
