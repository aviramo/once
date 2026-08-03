import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { INK_DIM } from '../colors'
import { DRAG_HANDLE } from '../tokens'

/** THE app's drag handle — the little bar that says "this surface is held and
 *  moved by the finger". Two hosts and no third without a reason:
 *
 *   • every `BottomSheet`, at the top of the card;
 *   • chat's `SheetHeader` (user directive 2026-08-02). That sheet has no title,
 *     no X and nothing painted on its top line at all, so the ONE way out of a
 *     long conversation — dragging that strip — was invisible: a screen of
 *     bubbles running to the very top edge, with no sign the band above them is
 *     a handle. The bar is not a control and says nothing; it marks the band.
 *
 *  It is DECORATION and never a target: the drag belongs to the surface's own
 *  pan, which covers the whole band, so this is `pointerEvents:'none'` and must
 *  stay that way — a handle that swallowed its own touch would be a smaller
 *  drag area than the band it advertises.
 *
 *  It carries NO spacing of its own. Where it stands is the host's (a popup's
 *  top air, a header row's chrome line), exactly as a title's gap belongs to
 *  whatever comes next. */
/** ONE bar, and it is the same bar in both hosts (user directive 2026-08-03):
 *  the same ink, the same size, no variant. A chat that painted a white bar with
 *  a halo of its own read as a different object at the top of a different kind
 *  of page. What makes it legible over a conversation is not the mark but what
 *  it STANDS ON — the strip of the page's own ground the bubbles stop under,
 *  which is `SheetHeader`'s and not the handle's. */
export function DragHandle({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.bar, style]} pointerEvents="none" />
}

const styles = StyleSheet.create({
  bar: {
    width: DRAG_HANDLE.width,
    height: DRAG_HANDLE.height,
    borderRadius: DRAG_HANDLE.radius,
    backgroundColor: INK_DIM,
  },
})
