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
//   SheetHeader (below)         the close X (droppable), and optional title +
//                               trailing
//
// (BottomSheet.tsx is a different thing and stays: small dialogs anchored to
// the bottom edge. This is for full-surface sheets.)

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type NativeSyntheticEvent, type StyleProp, type TextLayoutEventData, type ViewStyle } from 'react-native'
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { GestureType } from 'react-native-gesture-handler'
import { PullPane, usePullBehavior, type PullActivation, type PullAxis, type PullBehavior } from './PullPane'
import { RisingCard } from './RisingCard'
import { RoundButton } from './RoundButton'
import { CloseIcon, BackIcon } from './icons'
import { Text } from './AppText'
import { tap } from '../lib/haptics'
import { SM, TEXT, WEIGHT, ICON, OVERLAY, ROUND_BUTTON_SIZE_SM, chromeTop, lh } from '../tokens'
import { FONT_SCALE, inkOffset } from '../fonts'
import { INK, PAGE, SURFACE } from '../colors'
import { SHEET_TITLE } from './BottomSheet'

/** Wiring a scrollable sheet body needs so its inner scroll cooperates with
 *  the sheet's dismiss pan instead of fighting it. This is exactly the prop
 *  set PreviewFieldPage already takes, so that page satisfies the contract
 *  as-is; SettingsPage was given the same four. */
export type OverlaySheetBody = {
  dismissGestureRef: React.MutableRefObject<GestureType | undefined>
  onScrollAtTop: (atTop: boolean) => void
  headerBottomShared: SharedValue<number>
  /** True on the UI thread while the sheet's dismiss pan is being dragged. A
   *  shared value, not a boolean: a body that re-rendered every time a drag
   *  began stuttered the very swipe that started it. Feed it to a PullCtx and
   *  PullScrollView takes it from there. */
  pullEngaged: SharedValue<boolean>
}

export type OverlaySheetProps = {
  open: boolean
  /** Both the close X and a committed swipe call this. With commit='confirm'
   *  the swipe calls it as a REQUEST — the sheet springs back and the handler
   *  decides what happens (the invite's decline confirm dialog). */
  onClose: () => void
  /** 'dismiss' (default): a committed swipe rides the sheet off-screen and it
   *  closes. 'confirm': the sheet stays put and onClose is a request.
   *  'confirm' currently has NO call site — the invite was its only one, and on
   *  2026-07-30 a pending invitation stopped being swipeable at all
   *  (swipeToClose below), which is the stronger form of the same idea. Like the
   *  'x' axis, the machinery underneath it (PullPane's 'snapBack') is still
   *  wired end to end; retire the two together, in a change of their own. */
  commit?: 'dismiss' | 'confirm'
  /** False turns the dismiss drag OFF: the surface does not move under the
   *  finger at all. For a sheet the user did not open and may not simply put
   *  away — a pending invitation, which is answered by a named button and
   *  nothing else (user directive 2026-07-30). Not the same as commit='confirm',
   *  which still drags and springs back; here there is no gesture to arbitrate,
   *  so a body scroll keeps every touch. */
  swipeToClose?: boolean
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
  /** The body draws its own chrome, so no SheetHeader is rendered at all. */
  chromeless?: boolean
  /** False keeps the header ROW and drops only the close X. Not the same as
   *  `chromeless`: on a `dragFrom="header"` sheet that row IS the drag band, so
   *  it has to go on existing after the button in it does. Chat is the one
   *  (user directive 2026-07-31) — the top strip of the screen keeps closing it
   *  by drag, which is how it was already being closed mid-conversation. */
  showClose?: boolean
  /** Header renders as transparent chrome floating OVER the body rather than
   *  as a solid bar above it. For sheets whose body is a full-bleed photo. */
  floatingHeader?: boolean
  /** Overrides the solid header bar's background (default SURFACE). Chat's body
   *  is the page PAGE, a shade darker than SURFACE, so its header takes PAGE too and
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
  swipeToClose = true,
  activation = 'sheet',
  dragFrom = 'anywhere',
  axis = 'y',
  isTop = true,
  chromeless,
  showClose = true,
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
    enabled: open && isTop && swipeToClose && !externalPull,
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
    pullEngaged: pull.pullEngaged,
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
      // No handler = no button. The row still lays out and still reports its
      // bottom edge, which is what a header-drag sheet needs from it.
      onClose={showClose ? () => { tap(); onClose() } : undefined}
      onMeasured={h => { headerBottom.value = h }}
    />
  )

  return (
    <PullPane
      gesture={pull.gesture}
      pullY={pull.pullY}
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
// The one header row every overlay sheet wears: a close X at the END, an
// optional title (centred, or leading the row — see `align`), and an optional
// control on the other side. Reports its own bottom edge so the sheet's pan
// knows what counts as "dragging the header" (a drag started here always pulls,
// even when the body's scroll is not at the top). The X moved END on 2026-07-30
// — see the render — and became DROPPABLE on 2026-07-31, for a surface whose
// every page leaves by the same swipe (the Communities stack).

// (`sheetHeaderHeight` stood here — the room a floating header occupies, which
// only the menu page needed, to bleed its profile photo up behind the X. It went
// with the drawer on 2026-07-30. The sheets left either draw a real header or,
// like chat, deliberately reserve NO band for the floating one.)

// The height the device actually draws ONE line of a sheet title at. It depends
// on nothing per-header — only on the title's font size (one token) and the OS
// font scale — so the first header to be laid out in a run measures it and
// every later one opens against the real number. Keyed by the font scale it was
// taken at: RN re-renders with a new one if the system font changes under a
// live app, and the old measurement must not survive that.
const TITLE_LINE_BOX = new Map<number, number>()

// The bar's FLOOR. It has always been exactly one small chrome circle tall,
// because a dismiss circle stood in every one of them — nothing declared it. Now
// that the X is droppable (see `onClose`), a row carrying nothing but a line of
// text comes out shorter than the row beside it, and pushing from a page that has
// a control to one that has none would shift the whole page up by the difference.
// So the height the bar always had is stated, once, and every page keeps it
// whatever it happens to carry. `minHeight` is measured over the PADDING box,
// which is why the row's own padding is in the sum.
const HEADER_PAD_BOTTOM = SM
const headerFloor = (topInset: number) => chromeTop(topInset) + ROUND_BUTTON_SIZE_SM + HEADER_PAD_BOTTOM

// What the very first header lays out against, for the one frame before the
// text engine answers: the old arithmetic, which is exact at font scale 1 and
// over-tall above it. Never used as the final value.
const estimateLineBox = (fontScale: number) =>
  Math.round(lh(TEXT.lg) * Math.min(fontScale, FONT_SCALE))

export function SheetHeader({
  title,
  titleTrailing,
  trailing,
  center,
  align = 'center',
  startInset = 0,
  floating,
  barBg,
  topInset,
  onClose,
  onMeasured,
  closeIcon = 'close',
  closeAccessibilityLabel,
  titleLines = 1,
}: {
  title?: string
  titleTrailing?: ReactNode
  trailing?: ReactNode
  /** Takes the title's place and the whole span it would have had: for a page
   *  whose heading IS a control (the communities search field). With this set
   *  the end column is dropped unless there is a real `trailing` — the spacer
   *  only ever existed to centre a title, and nothing is being centred. */
  center?: ReactNode
  /** Where the page's name stands. 'center' (default) is a sheet's heading on
   *  the row's true centre, held there by two matched side columns. 'start'
   *  hands it the START of the row and lets it read from the edge reading
   *  begins at, with everything the page can DO following at the far end (the
   *  Communities stack, user directive 2026-07-31) — the same order the match
   *  card's heading tile takes. Nothing is centred then, so the side-column
   *  matching below is skipped and each column is exactly as wide as what it
   *  carries. */
  align?: 'center' | 'start'
  /** Extra room before the row's FIRST slot, on the START side only. The bar's
   *  own gutter is the page's (`OVERLAY.chromeInset`), which is where floating
   *  chrome stands — but a start-aligned title is not chrome in the margin, it is
   *  the heading of the list under it, and that list's text is indented by its
   *  card's own gutter as well. Only this side takes it (user directive
   *  2026-07-31): the controls at the far end ARE chrome, and they stay on the
   *  page's line with every other mark in that margin. */
  startInset?: number
  floating?: boolean
  /** Solid-bar background override (default SURFACE via styles.headerBar). */
  barBg?: string
  topInset: number
  /** Omitted = NO dismiss control at all, for a surface where every page leaves
   *  by the swipe it already has (every Communities page, user directive
   *  2026-07-31). The row is then whatever the page says plus whatever it can
   *  do, and nothing else. */
  onClose?: () => void
  onMeasured?: (bottom: number) => void
  /** 'close' (default) = the dismiss X. 'back' = a start-edge back arrow, for
   *  the drawer that slides off toward that edge. */
  closeIcon?: 'close' | 'back'
  closeAccessibilityLabel?: string
  /** Max title lines before ellipsizing. Default 1; the communities sheet passes
   *  2 so a long group name wraps instead of truncating. */
  titleLines?: number
}) {
  const DismissIcon = closeIcon === 'back' ? BackIcon : CloseIcon
  // Where line one of the title sits, measured against the close button's
  // circle. It cannot be a static style value, because the two do NOT grow
  // together: the button is a fixed dp box whose glyph is pinned at
  // FIXED_BOX_SCALE, while the heading's line box follows the OS font scale.
  //
  // And it cannot be ARITHMETIC either, which is what shipped until now
  // (`lh(TEXT.lg) × min(fontScale, cap)`): a line box is not knowable from JS.
  // Android runs `lineHeight` through the OS's non-linear font-scale curve, so
  // on a large-font device a 28dp line box comes back ~27 at font_scale 1.15
  // and ~33 at 1.3 — SHORTER than the capped multiplication predicts, not
  // taller — and the title was lifted by half that error above the chrome
  // beside it (~2.5dp at 1.15, visible on a real device, 2026-07-29). Same
  // trap GlyphSlot documents, same answer: the line is MEASURED, by the text
  // engine that draws it (`onTextLayout` → the first line's real height), and
  // then lifted by `inkOffset` — Noto's Hebrew ink sits below the centre of
  // its line box, so box-centring alone still reads low against a glyph
  // centred in a circle. That correction stays computable: it is a pure
  // function of the font size, which IS capped.
  //
  // A margin, not padding — Yoga clamps a negative padding to zero, and the
  // offset genuinely goes negative once the line outgrows the button.
  const { fontScale } = useWindowDimensions()
  const [, setMeasured] = useState(0)
  const lineBox = TITLE_LINE_BOX.get(fontScale) ?? estimateLineBox(fontScale)
  const measureTitleLine = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const h = e.nativeEvent.lines[0]?.height
    if (!h || Math.abs(lineBox - h) < 0.5) return
    TITLE_LINE_BOX.set(fontScale, h)
    setMeasured(h)
  }
  // The title's own script picks the ink correction, not the app's direction: a
  // page's heading is as often a GROUP's name as a UI string (see inkOffset).
  const titleTop = (ROUND_BUTTON_SIZE_SM - lineBox) / 2 - inkOffset(TEXT.lg, FONT_SCALE, title)
  // Both side columns are padded out to the WIDER of the two, so the span left
  // for the title is symmetric about the row and the title lands on the SCREEN's
  // true centre — not on the centre of whatever is left between a lone close X
  // and a pair of trailing controls, which pulled it visibly toward the start
  // (user directive 2026-07-28). The INNER wrapper is what gets measured, never
  // the padded column itself: measuring the column would feed its own padding
  // back in and the wider side could then never shrink again.
  const sideContent = useRef({ start: 0, end: 0 })
  const [sideWidth, setSideWidth] = useState(ROUND_BUTTON_SIZE_SM)
  const measureSide = (which: 'start' | 'end') => (e: LayoutChangeEvent) => {
    sideContent.current[which] = e.nativeEvent.layout.width
    const w = Math.max(sideContent.current.start, sideContent.current.end, ROUND_BUTTON_SIZE_SM)
    setSideWidth(prev => (Math.abs(prev - w) < 1 ? prev : w))
  }
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: chromeTop(topInset),
          minHeight: headerFloor(topInset),
          // A start-edge padding OUTRANKS the horizontal one in Yoga, so this is
          // the whole of that side rather than something added to it.
          paddingStart: OVERLAY.chromeInset + startInset,
        },
        floating ? styles.headerFloating : styles.headerBar,
        !floating && barBg ? { backgroundColor: barBg } : null,
      ]}
      pointerEvents="box-none"
      onLayout={e => onMeasured?.(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
    >
      {/* A CENTRED title (the default): both side columns are held at the same
          width and the TITLE takes the rest, centring itself inside it — so the
          title sits on the row's true centre however much (or little) each side
          carries. A START-aligned one takes the row's first slot and centres
          nothing, so no column is padded out to match another.

          THE DISMISS SITS AT THE END (user directive 2026-07-30). It was at the
          START for as long as home's hamburger was, so that opening a sheet
          turned one into the other without either moving; the hamburger is gone
          and the card's heading tile stands in that corner now, so the X moved
          across rather than the heading being pushed out of the corner it reads
          from. The `back` arrow of an 'x'-axis drawer is the exception and stays
          at the START, because a back arrow points at the edge it returns to
          (that axis has no call site today — see CLAUDE.md).

          `trailing` therefore takes whichever column the dismiss does not, and
          the DROPPABLE column is that one: a `center` with nothing beside it
          takes the whole span, and so does a start-aligned title, which balances
          nothing. The dismiss itself is dropped only by leaving `onClose` out —
          a sheet that HAS one never hides it. */}
      {(() => {
        const dismissAtStart = closeIcon === 'back'
        // Only a centred title needs the two sides matched (`sideWidth`); with
        // the title leading the row there is nothing to be symmetric about, and
        // measuring for it would just hold the trailing corner off its gutter.
        const balanced = align === 'center'
        const column = (content: ReactNode, atEnd: boolean, which: 'start' | 'end') => (
          <View style={[styles.side, atEnd ? styles.sideEnd : null, balanced ? { minWidth: sideWidth } : null]}>
            <View style={styles.sideInner} onLayout={balanced ? measureSide(which) : undefined}>
              {content}
            </View>
          </View>
        )
        const dismiss = onClose ? column((
          <RoundButton
            size={ROUND_BUTTON_SIZE_SM}
            onPress={onClose}
            accessibilityLabel={closeAccessibilityLabel}
            // On a solid (white) bar the X wears the PAGE tint — the same
            // pairing every chip uses off-photo, and quiet enough that a
            // dismiss never competes with a control that may be a stronger
            // action. Floating over a photo it keeps RoundButton's default
            // white chrome + shadow so it stays legible.
            bg={floating ? undefined : PAGE}
            shadow={!!floating}
          >
            <DismissIcon color={INK} size={ICON.round} />
          </RoundButton>
        ), !dismissAtStart, dismissAtStart ? 'start' : 'end') : null
        // The spacer exists to CENTRE a title and for nothing else, so it is
        // rendered only when there is a centred title to hold in place.
        const otherContent = trailing ?? (balanced && !center ? <View style={styles.trailingSpacer} /> : null)
        const other = otherContent
          ? column(otherContent, dismissAtStart, dismissAtStart ? 'end' : 'start')
          : null
        const middle = center ? (
          <View style={styles.centerWrap}>{center}</View>
        ) : title ? (
          <View style={[styles.titleWrap, { marginTop: titleTop }]} pointerEvents="none">
            <Text
              // SHEET_TITLE centres itself — every OTHER heading in the app is a
              // popup's, standing on its own line — so a start-aligned one has to
              // say so: only a textAlign undoes a textAlign. See `titleStart` for
              // why the one that undoes it is `'auto'` and not a physical edge.
              style={[styles.title, balanced ? null : styles.titleStart]}
              numberOfLines={titleLines}
              onTextLayout={measureTitleLine}
            >{title}</Text>
            {titleTrailing}
          </View>
        ) : (
          // A FLOATING header over a photo carries neither (chat, the profile
          // preview, the invite) — and the free space between the two side
          // columns still has to be held by something, or they bunch together at
          // the START and the dismiss lands mid-row instead of at the edge, right
          // on top of the card's heading tile. It cost nothing while the X WAS
          // the first column; it is the whole layout now that it is the last.
          <View style={styles.middleSpacer} />
        )
        // A start-aligned row reads exactly as it is written: the name, then
        // what the page can do, then the way out if it has one.
        if (!balanced) return <>{middle}{other}{dismiss}</>
        return dismissAtStart
          ? <>{dismiss}{middle}{other}</>
          : <>{other}{middle}{dismiss}</>
      })()}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    // The white SURFACE, a step lighter than the page tint it rises over, so
    // the sheet lifts off home instead of blending into it.
    backgroundColor: SURFACE,
    // The upward lift that says the sheet is a layer above home is NOT here: it
    // is RisingCard's, for every surface that rises (RISE_SHADOW). This card
    // used to hand-roll its own shadowOffset/shadowOpacity/elevation set — the
    // same idea stated a second time, and stated too faintly to read against
    // the page underneath it.
  },
  body: {
    flex: 1,
  },
  // The close X and the control opposite it sit on OVERLAY.chromeInset, the page
  // gutter, so a sheet's chrome lines up with everything else the app floats in a
  // corner. (It used to be load-bearing for a second reason — home's hamburger
  // sat at the same START point, so opening a sheet turned one into the other
  // without either moving. The hamburger is deleted and the X is at the END now.)
  // Columns hang from the TOP of the row, not its middle: a title that runs to
  // a second line grows DOWNWARD and leaves the close button — and its own
  // first line — exactly where they sit on a one-line header. Centring instead
  // would slide the whole block up by half a line the moment a name wrapped.
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: OVERLAY.chromeInset,
    paddingBottom: HEADER_PAD_BOTTOM,
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
  // The side columns hold their content plus whatever padding the opposite side
  // needs to match them (`sideWidth` above), and never grow beyond it. They used
  // to be flex:1, which is what truncated long titles: a shrinkable multi-line
  // Text measures at its MIN-CONTENT width (its longest word), so the two
  // growing columns swallowed all the leftover and the title was handed a column
  // barely one word wide, ellipsizing a name that had room to fit twice over.
  side: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideEnd: {
    justifyContent: 'flex-end',
  },
  // The measured box: exactly as wide as the controls it holds, so the width
  // that feeds `sideWidth` is content, never content + matching padding.
  sideInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Takes every pixel the two side columns leave and hands it all to the title
  // (which centres its own glyphs), so the text wraps only at the real edge of
  // the free space rather than at its longest word. The vertical offset — what
  // a one-line title would get from being centred against the close button —
  // rides on the element as `marginTop` rather than living here, because it
  // depends on the OS font scale: see `titleTop` in SheetHeader. Applying it to
  // the top means line one lands on the very same baseline whether the title is
  // one line or three, and the rest of the name flows down under it.
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: SM,
  },
  title: {
    // THE popup title, shared with every BottomSheet-based popup (SHEET_TITLE in
    // BottomSheet.tsx) so a full-screen sheet's heading and a dialog's heading
    // are the same rank of text. It already carries the INK the white SURFACE
    // wants, the size and the weight; only the layout below is this header's own.
    ...SHEET_TITLE,
    // flex:1, NOT a shrink-to-fit box laid out by the parent. A Text that only
    // shrinks is measured at its MIN-CONTENT width — its longest word — and keeps
    // that width even once the row hands it the whole free span, so a name broke
    // one word per line with half the row left empty beside it. Growing to the
    // full span wraps the text where the space actually ends, whichever edge the
    // glyphs inside it are aligned to.
    flex: 1,
  },
  // Where the glyphs sit inside that full span. Centred is SHEET_TITLE's own
  // doing and needs nothing here; the start-aligned variant has to overrule it,
  // and it does so with **`'auto'`** — "wherever this text naturally begins" —
  // never with a physical edge. `'auto'` is exactly the state every other
  // start-aligned label in the app is in (none of them declares a textAlign at
  // all), so it is right in both directions by construction. Writing the START
  // edge out physically instead (`isRTL ? 'right' : 'left'`, the form a FIELD's
  // placeholder needs) landed the LTR build correctly and left the RTL one
  // centred, i.e. the value did not survive at all — reported on Hebrew_Big
  // against a same-build English device, 2026-07-31.
  titleStart: {
    textAlign: 'auto',
  },
  trailingSpacer: {
    width: ROUND_BUTTON_SIZE_SM,
  },
  // A `center` slot is a CONTROL, not text: it takes the whole span the title
  // would have had and lays itself out inside it, so nothing here centres or
  // offsets it the way titleWrap does for a heading.
  centerWrap: {
    flex: 1,
  },
  // What stands where a title or a `center` would, on a header that has neither:
  // the free span itself, so the side columns end up on the two edges of the row.
  middleSpacer: {
    flex: 1,
  },
})
