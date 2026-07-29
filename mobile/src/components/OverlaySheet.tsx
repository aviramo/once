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
import { SM, TEXT, WEIGHT, ICON, OVERLAY, ROUND_BUTTON_SIZE_SM, lh } from '../tokens'
import { FONT_SCALE, inkOffset } from '../fonts'
import { INK, PAGE, SURFACE, SHADOW_BLACK } from '../colors'
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
      onClose={() => { tap(); onClose() }}
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

// The height the device actually draws ONE line of a sheet title at. It depends
// on nothing per-header — only on the title's font size (one token) and the OS
// font scale — so the first header to be laid out in a run measures it and
// every later one opens against the real number. Keyed by the font scale it was
// taken at: RN re-renders with a new one if the system font changes under a
// live app, and the old measurement must not survive that.
const TITLE_LINE_BOX = new Map<number, number>()

// What the very first header lays out against, for the one frame before the
// text engine answers: the old arithmetic, which is exact at font scale 1 and
// over-tall above it. Never used as the final value.
const estimateLineBox = (fontScale: number) =>
  Math.round(lh(TEXT.lg) * Math.min(fontScale, FONT_SCALE.body))

export function SheetHeader({
  title,
  titleTrailing,
  trailing,
  center,
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
  /** Max title lines before ellipsizing. Default 1; the communities sheet passes
   *  2 so a long group name wraps instead of truncating. */
  titleLines?: number
}) {
  const DismissIcon = closeIcon === 'back' ? BackIcon : CloseIcon
  // Where line one of the title sits, measured against the close button's
  // circle. It cannot be a static style value, because the two do NOT grow
  // together: the button is a fixed dp box whose glyph is capped at
  // FONT_SCALE.ui, while the heading's line box follows the OS font scale.
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
  const titleTop = (ROUND_BUTTON_SIZE_SM - lineBox) / 2 - inkOffset(TEXT.lg)
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
        { paddingTop: topInset + OVERLAY.chromeGap },
        floating ? styles.headerFloating : styles.headerBar,
        !floating && barBg ? { backgroundColor: barBg } : null,
      ]}
      pointerEvents="box-none"
      onLayout={e => onMeasured?.(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
    >
      {/* Both side columns are held at the same width and the TITLE takes the
          rest, centring itself inside it — so the title sits on the row's true
          centre however much (or little) each side carries. */}
      <View style={[styles.side, { minWidth: sideWidth }]}>
        <View style={styles.sideInner} onLayout={measureSide('start')}>
          <RoundButton
            size={ROUND_BUTTON_SIZE_SM}
            onPress={onClose}
            accessibilityLabel={closeAccessibilityLabel}
            // On a solid (white) bar the X wears the PAGE tint — the same pairing
            // every chip uses off-photo, and quiet enough that a dismiss never
            // competes with a trailing control that may be a stronger action
            // (chat's solid-purple "End"). Floating over a photo it keeps
            // RoundButton's default white chrome + shadow so it stays legible.
            bg={floating ? undefined : PAGE}
            shadow={!!floating}
          >
            <DismissIcon color={INK} size={ICON.round} />
          </RoundButton>
        </View>
      </View>
      {center ? (
        <View style={styles.centerWrap}>{center}</View>
      ) : title ? (
        <View style={[styles.titleWrap, { marginTop: titleTop }]} pointerEvents="none">
          <Text style={styles.title} numberOfLines={titleLines} onTextLayout={measureTitleLine}>{title}</Text>
          {titleTrailing}
        </View>
      ) : null}
      {center && !trailing ? null : (
        <View style={[styles.side, styles.sideEnd, { minWidth: sideWidth }]}>
          <View style={styles.sideInner} onLayout={measureSide('end')}>
            {trailing ?? <View style={styles.trailingSpacer} />}
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    // The white SURFACE, a step lighter than the page tint it rises over, so
    // the sheet lifts off home instead of blending into it.
    backgroundColor: SURFACE,
    // Soft upward lift so the sheet reads as sitting above home.
    shadowColor: SHADOW_BLACK,
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
  // Columns hang from the TOP of the row, not its middle: a title that runs to
  // a second line grows DOWNWARD and leaves the close button — and its own
  // first line — exactly where they sit on a one-line header. Centring instead
  // would slide the whole block up by half a line the moment a name wrapped.
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    // flex:1 + textAlign, NOT a shrink-to-fit box centred by the parent. A Text
    // that only shrinks is measured at its MIN-CONTENT width — its longest word
    // — and keeps that width even once the row hands it the whole free span, so
    // a name broke one word per line with half the row left empty beside it.
    // Growing to the full span and centring the glyphs inside it wraps the text
    // where the space actually ends.
    flex: 1,
    textAlign: 'center',
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
})
