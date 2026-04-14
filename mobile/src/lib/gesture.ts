// Module-level flag flipped by sliders while their thumb is being dragged.
// Every horizontal pan responder in the app checks this in its
// onMoveShouldSetPanResponder so no pager steals a horizontal gesture away
// from a slider mid-drag. Module scope is fine here because only one slider
// can be dragged at a time.
export const slidingActiveRef: { current: boolean } = { current: false }
