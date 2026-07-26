// ── OverlaySheet ─────────────────────────────────────────────────────────
//
// THE bottom-up surface. The app is ONE screen (page1 / home); the menu, the
// chat, the incoming invitation and the settings sub-pages are all full-screen
// sheets that rise over it and are dismissed by swiping down. Every one of
// them is this component — there is no second sheet implementation and no
// per-screen rise/dismiss code.
//
// It composes three existing pieces rather than reinventing any of them:
//   PullPane + usePullBehavior  the swipe-down gesture (the SAME machinery as
//                               page1's pull-to-skip, which is the point: the
//                               dismiss gesture must feel identical to the
//                               skip gesture)
//   RisingCard                  the bottom-up mount / unmount motion
//   SheetHeader (below)         the close X, and optional title + trailing
//
// (BottomSheet.tsx is a different thing and stays: small dialogs anchored to
// the bottom edge. This is for full-surface sheets.)

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { GestureType } from 'react-native-gesture-handler'
import { PullPane, usePullBehavior, type PullActivation, type PullAxis, type PullBehavior } from './PullPane'
import { RisingCard } from './RisingCard'
import { RoundButton } from './RoundButton'
import { CloseIcon, BackIcon } from './icons'
import { Text } from './AppText'
import { tap } from '../lib/haptics'
import { SM, TEXT, WEIGHT, ICON, OVERLAY, ROUND_BUTTON_SIZE_SM, lh } from '../tokens'
import { GREEN, GREEN_WASH, SURFACE, SCRIM_BLACK, INK } from '../colors'

/** Wiring a scrollable sheet body needs so its inner scroll cooperates with
 *  the sheet's dismiss pan instead of fighting it. This is exactly the prop
 *  set PreviewFieldPage already takes, so that page satisfies the contract
 *  as-is; SettingsPage was given the same four. */
export type OverlaySheetBody = {
  dismissGestureRef: React.MutableRefObject<GestureType | undefined>
  onScrollAtTop: (atTop: boolean) => void
  headerBottomShared: SharedValue<number>
  pulling: boolean
}

export type OverlaySheetProps = {
  open: boolean
  /** Both the close X and a committed swipe call this. With commit='confirm'
   *  the swipe calls it as a REQUEST — the sheet springs back and the handler
   *  decides what happens (the invite's decline confirm dialog). */
  onClose: () => void
  /** 'dismiss' (default): a committed swipe rides the sheet off-screen and it
   *  closes. 'confirm': the sheet stays put and onClose is a request. */
  commit?: 'dismiss' | 'confirm'
  /** 'sheet' (default) = a scrollable body, with header-vs-scroll touch
   *  arbitration. 'scrollPan' = the body is a card that owns a PullContext
   *  (the invite's MatchCard). */
  activation?: PullActivation
  /** 'header' seeds scrollAtTop=false so ONLY a drag starting on the header
   *  row pulls. Required for bodies whose scroll can't report at-top — chat's
   *  FlatList is inverted, so without this every drag in the message list
   *  would be stolen by the dismiss pan. */
  dragFrom?: 'header' | 'anywhere'
  /** 'y' (default) rises from the bottom and closes downward. 'x' is a DRAWER:
   *  it slides in from the START edge and closes back toward it, and the
   *  dismiss drag becomes horizontal. The menu is the only 'x' sheet, because
   *  it is opened by the hamburger that sits on that same edge. */
  axis?: PullAxis
  /** False while another sheet is stacked above this one. Disables this
   *  sheet's pan so the two never arbitrate against each other (a swipe on the
   *  settings sub-page must not also close the menu underneath it). */
  isTop?: boolean
  /** The body draws its own chrome, so no SheetHeader is rendered
   *  (PreviewFieldPage has its own back header). */
  chromeless?: boolean
  /** Header renders as transparent chrome floating OVER the body rather than
   *  as a solid bar above it. For sheets whose body is a full-bleed photo. */
  floatingHeader?: boolean
  /** Overrides the solid header bar's background (default SURFACE). Chat's body
   *  is the page BG, a shade darker than SURFACE, so its header takes BG too and
   *  the two read as one continuous surface instead of a lighter top band. */
  headerBg?: string
  title?: string
  /** Rendered at the end of the header row, opposite the close X. */
  headerTrailing?: ReactNode
  /** Rendered next to the title (a presence dot). */
  titleTrailing?: ReactNode
  zIndex?: number
  cardStyle?: StyleProp<ViewStyle>
  closeAccessibilityLabel?: string
  /** Externally-owned pull behavior, for a surface the HOST also drags IN.
   *  Normally the sheet creates its own and nobody else can reach it — but a
   *  drawer that tracks the finger while OPENING needs the opening pan (which
   *  lives on the shell, since a closed sheet is off-screen and catches
   *  nothing) to drive the very same `pullY` the closing pan does. One value,
   *  both directions, no second source of truth for where the sheet sits.
   *  When set, the caller also owns the rest position: the reset-on-open below
   *  is skipped, because "open" no longer implies "starts at 0" (a drag-open
   *  starts parked off-screen and is pulled to 0 by hand).
   *  Note the sheet still owns `headerBottom` for SheetHeader, so an external
   *  pull is not wired to it. That only matters on the 'y' axis, where the
   *  header is a drag handle; the 'x' drawer never reads it. */
  pull?: PullBehavior
  /** False mounts the sheet at rest with no slide-in — for a drag-open, where
   *  the finger supplies the motion and an entrance animation would fight it. */
  animateEnter?: boolean
  /** False removes the sheet with no slide-out. Required, not cosmetic, for a
   *  sheet that can unmount MID-GESTURE — see RisingCard's animateExit. */
  animateExit?: boolean
  /** Keeps the body mounted while closed, parked off-screen by the host's
   *  `pull`. For the drawer, whose position IS the open/closed state: it must
   *  already exist to be dragged in, and mounting it mid-gesture crashes
   *  Fabric. With this set, `open` means "interactive", not "mounted". */
  keepMounted?: boolean
  children: ReactNode | ((ctx: OverlaySheetBody) => ReactNode)
}

export function OverlaySheet({
  open,
  onClose,
  commit = 'dismiss',
  activation = 'sheet',
  dragFrom = 'anywhere',
  axis = 'y',
  isTop = true,
  chromeless,
  floatingHeader,
  headerBg,
  title,
  headerTrailing,
  titleTrailing,
  zIndex,
  cardStyle,
  closeAccessibilityLabel,
  pull: externalPull,
  animateEnter = true,
  animateExit = true,
  keepMounted = false,
  children,
}: OverlaySheetProps) {
  const { top: topInset } = useSafeAreaInsets()
  const headerBottom = useSharedValue(0)

  // Keep the gesture's onCommit stable so usePullBehavior's useMemo doesn't
  // rebuild the Pan every render (a rebuilt gesture mid-drag drops the touch).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const requestClose = useCallback(() => { onCloseRef.current() }, [])

  // Called unconditionally (rules of hooks); ignored when the host owns one.
  const ownPull = usePullBehavior({
    activation,
    enabled: open && isTop && !externalPull,
    commit: commit === 'confirm' ? 'snapBack' : 'slideOff',
    axis,
    onCommit: requestClose,
    headerBottom: activation === 'sheet' ? headerBottom : undefined,
  })
  const pull = externalPull ?? ownPull

  // `keepMounted` with the sheet's OWN pull (no host `pull` prop): the body
  // stays mounted across close/open, and its POSITION — not its mounting — is
  // the open/closed state, exactly like the menu drawer. This lets a heavy
  // body (ChatPage: history fetch, realtime + presence channels, cached
  // messages) survive a close so reopening never remounts or reloads it. The
  // caller unmounts the whole sheet (this component leaves the tree) when the
  // surface is truly finished — e.g. the chat ending. The menu is `keepMounted`
  // too but drives an EXTERNAL pull itself, so it opts out of the motion here.
  const selfPark = keepMounted && !externalPull
  const { reset, setScrollAtTop, pullY, screenSpan, slidOut } = pull
  // First paint should not animate a park (mounting already-closed must not
  // flash), but a first paint that mounts already-open (a fresh match raising
  // chat) should still ride up.
  const firstParkRef = useRef(true)
  useEffect(() => {
    if (externalPull) return
    if (!selfPark) {
      // Mount/unmount sheets: RisingCard owns the rise. A 'slideOff' close
      // parks pullY at screenSpan, so without this reset a reopened sheet would
      // mount already translated off-screen. Also (re)seeds the dragFrom
      // policy. Only on open — a closing sheet is unmounting anyway.
      if (open) { reset(); setScrollAtTop(dragFrom !== 'header') }
      return
    }
    // Own-pull keepMounted: pull-driven rise/park, so RisingCard's slide is
    // disabled below (the transform and a layout animation would fight).
    setScrollAtTop(dragFrom !== 'header')
    slidOut.value = false
    if (firstParkRef.current) {
      firstParkRef.current = false
      if (open) { pullY.value = screenSpan; pullY.value = withTiming(0) }
      else pullY.value = screenSpan
      return
    }
    pullY.value = withTiming(open ? 0 : screenSpan)
  }, [open, dragFrom, externalPull, selfPark, reset, setScrollAtTop, pullY, screenSpan, slidOut])

  const ctx: OverlaySheetBody = {
    dismissGestureRef: pull.panRef,
    onScrollAtTop: pull.setScrollAtTop,
    headerBottomShared: headerBottom,
    pulling: pull.pulling,
  }

  const header = chromeless ? null : (
    <SheetHeader
      title={title}
      titleTrailing={titleTrailing}
      trailing={headerTrailing}
      floating={floatingHeader}
      barBg={headerBg}
      topInset={topInset}
      // The 'x' drawer (the menu) closes back toward its START edge, so its
      // dismiss control is a back arrow pointing that way rather than an X.
      // Every other sheet rises from the bottom and closes with the plain X.
      closeIcon={axis === 'x' ? 'back' : 'close'}
      closeAccessibilityLabel={closeAccessibilityLabel}
      onClose={() => { tap(); onClose() }}
      onMeasured={h => { headerBottom.value = h }}
    />
  )

  return (
    <PullPane
      gesture={pull.gesture}
      pullY={pull.pullY}
      pulling={pull.pulling}
      axis={axis}
      style={[StyleSheet.absoluteFill, zIndex != null ? { zIndex } : null]}
      pointerEvents={open ? 'box-none' : 'none'}
      pullContext={pull.pullCtx}
    >
      {open || keepMounted ? (
        <RisingCard
          from={axis === 'x' ? 'side' : 'up'}
          // selfPark drives the rise/park through pullY (above), so the layout
          // slide must be off or the two transforms clobber each other.
          animateEnter={selfPark ? false : animateEnter}
          animateExit={selfPark ? false : animateExit}
          style={[styles.card, cardStyle]}
        >
          {floatingHeader ? (
            <>
              <View style={styles.body}>
                {typeof children === 'function' ? children(ctx) : children}
              </View>
              {header}
            </>
          ) : (
            <>
              {header}
              <View style={styles.body}>
                {typeof children === 'function' ? children(ctx) : children}
              </View>
            </>
          )}
        </RisingCard>
      ) : null}
    </PullPane>
  )
}

// ── SheetHeader ──────────────────────────────────────────────────────────
//
// The one header row every overlay sheet wears: a close X at the START, an
// optional centred title, an optional trailing control. Reports its own bottom
// edge so the sheet's pan knows what counts as "dragging the header" (a drag
// started here always pulls, even when the body's scroll is not at the top).

/** Height SheetHeader occupies for a given top inset. Mirrors the `header`
 *  style below (paddingTop + button + paddingBottom) and must move with it.
 *  A `floatingHeader` sheet draws the header OVER its body, so a body that
 *  wants to bleed artwork up behind it — the menu's profile photo — needs to
 *  know exactly how much room that is. */
export function sheetHeaderHeight(topInset: number): number {
  return topInset + OVERLAY.chromeGap + ROUND_BUTTON_SIZE_SM + SM
}

export function SheetHeader({
  title,
  titleTrailing,
  trailing,
  floating,
  barBg,
  topInset,
  onClose,
  onMeasured,
  closeIcon = 'close',
  closeAccessibilityLabel,
}: {
  title?: string
  titleTrailing?: ReactNode
  trailing?: ReactNode
  floating?: boolean
  /** Solid-bar background override (default SURFACE via styles.headerBar). */
  barBg?: string
  topInset: number
  onClose: () => void
  onMeasured?: (bottom: number) => void
  /** 'close' (default) = the dismiss X. 'back' = a start-edge back arrow, for
   *  the drawer that slides off toward that edge. */
  closeIcon?: 'close' | 'back'
  closeAccessibilityLabel?: string
}) {
  const DismissIcon = closeIcon === 'back' ? BackIcon : CloseIcon
  return (
    <View
      style={[
        styles.header,
        { paddingTop: topInset + OVERLAY.chromeGap },
        floating ? styles.headerFloating : styles.headerBar,
        !floating && barBg ? { backgroundColor: barBg } : null,
      ]}
      pointerEvents="box-none"
      onLayout={e => onMeasured?.(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
    >
      {/* Both side columns are flex:1 (equal width), so the title sits at the
          TRUE centre of the row regardless of how wide the trailing control is
          — a text button ("End") no longer shoves the title off-centre the way
          a fixed-width RoundButton used to keep it balanced only by luck. */}
      <View style={styles.side}>
        <RoundButton
          size={ROUND_BUTTON_SIZE_SM}
          onPress={onClose}
          accessibilityLabel={closeAccessibilityLabel}
          // On a solid bar the X wears the calm pale-green wash — a dismiss is
          // the quiet default, so it never competes with a trailing control that
          // may be a stronger action (chat's solid-green "End"). Floating over a
          // photo it keeps RoundButton's default white chrome + shadow so it
          // stays legible.
          bg={floating ? undefined : GREEN_WASH}
          shadow={!!floating}
        >
          <DismissIcon color={GREEN} size={ICON.round} />
        </RoundButton>
      </View>
      {title ? (
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {titleTrailing}
        </View>
      ) : null}
      <View style={[styles.side, styles.sideEnd]}>
        {trailing ?? <View style={styles.trailingSpacer} />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    // The light-beige SURFACE (beige-3), a step lighter than the home page it
    // rises over, so the sheet lifts off it instead of blending in.
    backgroundColor: SURFACE,
    // Soft upward lift so the sheet reads as sitting above home.
    shadowColor: SCRIM_BLACK,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  body: {
    flex: 1,
  },
  // The close X and any trailing control sit on OVERLAY.chromeInset, the same
  // gutter as the home hamburger and the card's report flag. That alignment is
  // load-bearing: opening a sheet over home, the hamburger becomes the X in the
  // exact same spot rather than jumping a few pixels toward the edge.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: OVERLAY.chromeInset,
    paddingBottom: SM,
    gap: SM,
  },
  headerBar: {
    backgroundColor: SURFACE,
  },
  headerFloating: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    backgroundColor: 'transparent',
  },
  // Equal-width side columns flank the centred title so it stays on the row's
  // true centre no matter what each side holds.
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideEnd: {
    justifyContent: 'flex-end',
  },
  titleWrap: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SM,
  },
  title: {
    // The header sits on the beige SURFACE, so the title is INK like every other heading.
    color: INK,
    fontSize: TEXT.lg,
    lineHeight: lh(TEXT.lg),
    fontWeight: WEIGHT.extrabold,
    flexShrink: 1,
  },
  trailingSpacer: {
    width: ROUND_BUTTON_SIZE_SM,
  },
})
