import { cloneElement, createContext, isValidElement, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View, Keyboard, Dimensions, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { GestureHandlerRootView, Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from './AppText'
import { OptionStrip, type StripOption } from './OptionStrip'
import { DragHandle } from './DragHandle'
import { SURFACE, PAGE, INK } from '../colors'
import { useBottomInset } from '../hooks/useBottomInset'
import { useKeyboardShrinkSV } from '../hooks/useKeyboard'
import { MD, SM, LG, RADIUS, TEXT, WEIGHT, lh, bottomGap, SWIPE_DISMISS_PX, SWIPE_DISMISS_VELOCITY, PAN_ACTIVE_OFFSET_Y, PAN_FAIL_OFFSET_Y, RISE_SHADOW, SHEET_TOP_GAP, SHEET_GAP, SCROLL_FADE, MOTION, CARD_SHADOW } from '../tokens'

// Off-screen start position for the slide-in. Screen height is guaranteed to
// exceed any sheet's height, so the sheet always begins fully hidden no matter
// how tall its content is — unlike the old magic 800, which let a taller sheet
// peek before it had been measured and made the slide distance feel wrong.
const SCREEN_H = Dimensions.get('screen').height

// The popup's arrival and departure, at the app's one rise duration (MOTION.rise
// — the same one RisingCard's pages take, so a popup and a page arrive at the
// same speed). Stated once here so the entrance, the dismiss and the swipe's
// ride-off can never drift apart. No easing named: the framework's own is what
// the preset used and only the duration is being said.
const RISE_TIMING = { duration: MOTION.rise } as const

// Single source of truth for the bottom-sheet behavior used by every popup
// in the app: slide-up mount, slide-down dismiss, swipe-to-dismiss gesture,
// and the 20-layer translucent-black shadow gradient that lifts the sheet
// off the background.
//
// Composers (ConfirmDialog, AccountDetailsPopup, ProfileAddPopup, ...)
// pass their own `children` for the sheet body and don't re-implement the
// animation, gesture, or shadow.

type BottomSheetProps = {
  visible: boolean
  onDismiss: () => void
  // Fires after the slide-out animation completes and the underlying Modal
  // has unmounted. Use this to chain a follow-up that opens another
  // Modal-based component — two iOS Modals racing on the same parent stack
  // causes the new one to silently fail to present.
  onClosed?: () => void
  children: ReactNode
  // True → render the small gray drag handle at the top of the sheet body.
  // Default true since every sheet currently shows it.
  dragHandle?: boolean
  // True → enable swipe-down-to-dismiss gesture. Default true.
  swipeToDismiss?: boolean
  // AN ACTION TAKEN ON THIS POPUP IS IN FLIGHT, SO THE POPUP CANNOT BE PUT AWAY
  // (user directive 2026-08-02). A press that rewrites the user's state holds
  // the surface it was taken on — with the pressed button's own spinner — until
  // the server has answered, and only then does the screen express the new
  // state. So while this is true ALL THREE ways out are shut together: the
  // backdrop tap, hardware back, and the swipe down. It was `disableBackdropDismiss`
  // and shut only the first two, which left the user able to drag away a popup
  // whose request was still out and land on a board that had not changed yet.
  // Every call site passed exactly `busy`, so the prop says that now.
  busy?: boolean
  // Extra style override on the card wrapper (e.g. a `maxHeight` cap a body
  // wants to impose on itself). NEVER a keyboard lift: the sheet handles the
  // keyboard itself, below, and a second lift at a call site double-applies.
  cardWrapStyle?: any
  // Metrics override on the sheet body, for the few popups whose content is not
  // a column of text and buttons: an edge-to-edge list of rows
  // (`paddingHorizontal: 0`), a tighter gutter around full-width tiles, a
  // `flex`/`flexShrink` a tall body needs.
  //
  // NOT the standard frame: the gutter, the air above the first block and the air
  // under the last one are the SHEET's (see the card below), one set of values
  // for every popup in the app, and the vertical rhythm inside the body belongs
  // to SheetTitle/SheetDesc/SheetActions. A `paddingBottom` here has no effect at
  // all — it is applied after this style.
  contentStyle?: any
  // THE CARD'S OWN COLOUR, and the ONE thing a call site may say about it.
  // Every popup is white (see `card` below) and this exists for the single
  // surface that is not: the address search, which is a PAGE holding white
  // cards — the field and the run of results — exactly as home and Circles are
  // (user directive 2026-08-03). It is a prop and not a `contentStyle`
  // background because the ground is not only the card's: the scroll fades are
  // painted in it too, and a fade left white over a tinted card would be a band
  // of the wrong colour at the edge of the list.
  ground?: string
  // When the sheet body contains a scrollable child (e.g. a ScrollView wrapped
  // in <GestureDetector gesture={Gesture.Native()}>), pass that native gesture
  // here so the dismiss-pan and the scroll can run simultaneously. Combined
  // with `scrollAtTop`, the sheet only dismisses on a downward drag that
  // started while the scroll was at its top; otherwise the scroll wins.
  scrollableGesture?: GestureType
  // Shared bool tracking whether the scrollable child is at scrollY === 0.
  // Pan reads this on gesture begin: if false, the drag scrolls the list
  // instead of dismissing the sheet.
  scrollAtTop?: SharedValue<boolean>
}

// ── The scrollable block inside a sheet ────────────────────────────────────
// The wiring a <SheetScroll> needs from the sheet around it: the native scroll
// gesture the dismiss-pan must run simultaneously with, the at-top flag it
// reads on touch-down, and WHERE the scrollable block sits inside the card.
// Handed down by context rather than by props so a body can drop a scrollable
// block in without the popup that composes it having to thread anything
// through — the pair can never be half-connected.
// (The `scrollableGesture`/`scrollAtTop` props above are the older, explicit
// path for a body that owns its own ScrollView; both feed the same pan.)
//
// The bounds are what keep the iron rule honest: the inner scroll outranks the
// dismiss-pan ONLY over the strip a finger could have scrolled instead. Without
// them the at-top flag gated the whole card, so a popup whose description had
// been scrolled once could not be swiped away from anywhere — not the drag
// handle, not the title, not the buttons.
type SheetScrollWiring = {
  native: GestureType
  atTop: SharedValue<boolean>
  /** Top/bottom edge of the scrollable block, in the card's own coordinates
   *  (which are the pan's, since the handler is attached to the card wrap and
   *  the card sits at its origin). Parked as an empty range while no
   *  <SheetScroll> is mounted. */
  top: SharedValue<number>
  bottom: SharedValue<number>
  /** The card the block measures itself against. A layout-relative measure, not
   *  a window one: the card rides the entrance slide on a transform, so its
   *  on-screen position is a moving target while the popup is opening. */
  cardRef: React.RefObject<View | null>
  /** The card's own colour, so the block's fades dissolve into the ground they
   *  actually stand on rather than into an assumed white. */
  ground: string
}
const SheetScrollContext = createContext<SheetScrollWiring | null>(null)

export function BottomSheet({
  visible,
  onDismiss,
  onClosed,
  children,
  dragHandle = true,
  swipeToDismiss = true,
  busy,
  cardWrapStyle,
  contentStyle,
  ground = SURFACE,
  scrollableGesture,
  scrollAtTop,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  // THE air under the last thing in a popup, for EVERY popup (user directive
  // 2026-07-29). It belongs to the sheet and to nothing else: the card used to
  // declare no bottom padding at all, so all fourteen call sites invented one
  // (LG here, MD there, XL on the select lists, three different
  // `bottomGap(...)` gaps in settings) and no two popups ended the same
  // distance above the screen. It is applied AFTER `contentStyle` below, so a
  // body style can no longer quietly differ — the one number wins.
  // `bottomGap` because the device's safe area absorbs the design gap rather
  // than stacking with it (tokens.ts).
  const bottomInset = useBottomInset()
  const bottomPad = bottomGap(bottomInset, LG)
  const translateY = useSharedValue(SCREEN_H)
  const dragY = useSharedValue(0)
  const cardHeight = useSharedValue(SCREEN_H)
  // A body that runs long (a group's description, a long list) may grow the
  // sheet up to here and no further: the card's TOP never crosses the safe area
  // (user directive 2026-07-28). Everything above the cap used to be pushed off
  // the screen, head first. What gives inside the card is whatever declares
  // `flexShrink` — in practice a <SheetScroll>; every other part keeps its size.
  // ...and the same reserve as PADDING on the container, because `maxHeight`
  // alone stops governing the moment the keyboard is up: what bounds the card
  // then is `flexShrink` against the space left over the keyboard, and that
  // space starts at the top of the SCREEN. A sheet tall enough to want all of it
  // (the address search) climbed under the status bar. Padding the container is
  // what puts the safe area out of reach of the shrink too.
  const maxHeight = Dimensions.get('window').height - insets.top - SHEET_TOP_GAP
  const topReserve = insets.top + SHEET_TOP_GAP
  // The wiring for a <SheetScroll> anywhere in the body. Created here, once, so
  // the dismiss-pan can be told about it before it exists.
  const bodyScroll = useMemo(() => Gesture.Native(), [])
  const bodyAtTop = useSharedValue(true)
  // An empty range until a <SheetScroll> measures itself: a sheet with no
  // scrollable block must never have a strip that refuses the dismiss.
  const bodyScrollTop = useSharedValue(Number.POSITIVE_INFINITY)
  const bodyScrollBottom = useSharedValue(Number.NEGATIVE_INFINITY)
  const cardRef = useRef<View | null>(null)
  const scrollWiring = useMemo<SheetScrollWiring>(
    () => ({ native: bodyScroll, atTop: bodyAtTop, top: bodyScrollTop, bottom: bodyScrollBottom, cardRef, ground }),
    [bodyScroll, bodyAtTop, bodyScrollTop, bodyScrollBottom, ground],
  )
  // Armed when an open is requested; the slide-in fires from the sheet's first
  // onLayout (the earliest moment the content is mounted AND the native Modal
  // view is attached), instead of a blind requestAnimationFrame that only
  // guessed when both were ready. Consumed on the first layout so a later
  // relayout (keyboard, dynamic body) never re-triggers the entrance.
  const openingRef = useRef(false)
  // Captured at gesture start: was the scrollable child at its top? Drives
  // whether this pan can dismiss the sheet or whether it should yield to the
  // scroll. Default true so non-scrollable sheets behave as before.
  const wasAtTop = useSharedValue(true)
  // Track mount/unmount separately so the slide-out animation runs to
  // completion before the Modal disappears.
  const [modalVisible, setModalVisible] = useState(false)
  const wasMountedRef = useRef(false)

  useEffect(() => {
    if (visible) {
      dragY.value = 0
      // A body's scroll is unmounted between opens, so nothing would reset the
      // flag it left behind: without this, a sheet closed while scrolled would
      // reopen refusing to swipe away.
      bodyAtTop.value = true
      bodyScrollTop.value = Number.POSITIVE_INFINITY
      bodyScrollBottom.value = Number.NEGATIVE_INFINITY
      // Start fully off-screen and arm the entrance. The slide-in is kicked
      // from onLayout (view mounted + attached), not a guessed rAF, so it
      // begins at the earliest correct frame and from a known start.
      translateY.value = SCREEN_H
      openingRef.current = true
      setModalVisible(true)
    } else if (modalVisible) {
      openingRef.current = false
      // Always drop the keyboard when any sheet closes so it never lingers
      // over the screen behind. No-op when no field was focused.
      Keyboard.dismiss()
      translateY.value = withTiming(cardHeight.value, RISE_TIMING, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

  useEffect(() => {
    if (modalVisible) {
      wasMountedRef.current = true
      return
    }
    if (!wasMountedRef.current) return
    wasMountedRef.current = false
    if (!onClosed) return
    // Wait one frame after the Modal unmounts so iOS finishes
    // dismissViewController before any chained action (e.g. opening another
    // Modal-based dialog) tries to present a new view controller.
    const raf = requestAnimationFrame(() => onClosed())
    return () => cancelAnimationFrame(raf)
  }, [modalVisible, onClosed])

  const panBase = Gesture.Pan()
    .enabled(swipeToDismiss && !busy)
    .activeOffsetY(PAN_ACTIVE_OFFSET_Y)
    .failOffsetY(PAN_FAIL_OFFSET_Y)
  const pan = (scrollableGesture
    ? panBase.simultaneousWithExternalGesture(scrollableGesture, bodyScroll)
    : panBase.simultaneousWithExternalGesture(bodyScroll))
    .onBegin(e => {
      'worklet'
      // Snapshot whether the scroll is at the top right when the user touches
      // down. The dismiss decision uses this snapshot for the whole pan, so a
      // drag that starts mid-scroll won't suddenly start dismissing once the
      // user happens to scroll back to the top during the same drag.
      // BOTH scrolls must be at their top — the body's own (the older prop
      // path) and any <SheetScroll> in it. A scroll with something left to give
      // outranks the dismiss, always.
      //
      // But only WHERE it could have been scrolled: the <SheetScroll> gate
      // applies to touches that land inside that block and nowhere else. The
      // drag handle, the title, the buttons and every other part of the card
      // still dismiss whatever the description has been scrolled to — gating
      // the whole card on it is what made this popup impossible to close.
      const onScrollBlock = e.y >= bodyScrollTop.value && e.y <= bodyScrollBottom.value
      wasAtTop.value = (scrollAtTop ? scrollAtTop.value : true) && (!onScrollBlock || bodyAtTop.value)
    })
    .onUpdate(e => {
      'worklet'
      if (!wasAtTop.value) return
      dragY.value = Math.max(0, e.translationY)
    })
    .onEnd(e => {
      'worklet'
      const eligible = wasAtTop.value
      if (eligible && (e.translationY > SWIPE_DISMISS_PX || e.velocityY > SWIPE_DISMISS_VELOCITY)) {
        dragY.value = withTiming(cardHeight.value, RISE_TIMING)
        runOnJS(onDismiss)()
      } else {
        dragY.value = withTiming(0, RISE_TIMING)
      }
    })

  // APPLICATION POINT 2 of 2 for the keyboard (see src/hooks/useKeyboard.ts).
  //
  // A RN `Modal` is its own native window: it never resizes for the IME on
  // either platform, and it inherits no shrink from any page (the app root shrinks nothing, 2026-08-03). So
  // THE POPUP LIFTS ITSELF, here, once, for all fourteen popups — a call site
  // must never nudge itself again (that double-applied and overshot, which is
  // what the per-screen rule of 2026-05-19 was working around; with the lift in
  // exactly one place there is nothing left to double).
  //
  // `marginBottom` and not a transform, because it has to do two jobs at once:
  // stand the card on top of the keyboard AND take that height out of the space
  // the card is allowed to occupy, so a tall sheet gives at the bottom instead
  // of growing off the top of the screen. `flexShrink` on the wrap and the card
  // (styles below) is what carries the reduction down to the <SheetScroll>.
  //
  // The value is the page's own (`useKeyboardShrinkSV`): the keyboard's height
  // less half the app's bottom air, so `bottomPad` above ends up half-spent over
  // a keyboard and whole over the navigation bar — the same air a page's chrome
  // keeps, from the same hook, since a popup must not sit at a different height
  // above the keyboard than the composer under it does.
  const kb = useKeyboardShrinkSV()
  const animStyle = useAnimatedStyle(() => ({
    marginBottom: kb.value,
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const Inner = (
    <View style={[styles.overlay, { paddingTop: topReserve }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={busy ? undefined : onDismiss}
      />
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.cardWrap, cardWrapStyle, animStyle]}
          pointerEvents="box-none"
          onLayout={e => {
            cardHeight.value = e.nativeEvent.layout.height
            // First layout after an open request = content mounted and the
            // Modal view attached. Kick the slide-in now (from the off-screen
            // start) — the earliest correct frame, no blind rAF.
            if (openingRef.current) {
              openingRef.current = false
              // START AT THE CARD'S OWN HEIGHT, NEVER AT THE SCREEN'S. The
              // entrance is bottom-anchored: at translateY == cardHeight the
              // card is exactly off the bottom edge, which is where "rises from
              // the bottom of the screen" begins. Seeded with SCREEN_H it began
              // a whole screen lower and spent the first half of the 300ms
              // travelling below the edge, unseen — a third of a second in which
              // nothing happened and then the card crossed its own height at
              // speed, worst of all on a SHORT popup, which inherits the most
              // dead time. Measured here and not before, because this is the one
              // frame the height is known (it is written to cardHeight above);
              // the close already rides that same number.
              translateY.value = e.nativeEvent.layout.height
              translateY.value = withTiming(0, RISE_TIMING)
            }
          }}
        >
          <View
            ref={cardRef}
            style={[
              styles.card,
              // The air above the popup's first block. With a drag handle it
              // comes from the handle's own bottom margin, so only a handle-less
              // sheet needs it here — either way it is the same one number, so
              // every popup starts its content at the same height.
              !dragHandle && styles.cardNoHandle,
              { maxHeight },
              contentStyle,
              // After `contentStyle`, like the bottom gap below it: the ground
              // is the sheet's to state, never a body style's.
              { backgroundColor: ground },
              { paddingBottom: bottomPad },
            ]}
          >
            {dragHandle ? <DragHandle style={styles.dragHandle} /> : null}
            <SheetScrollContext.Provider value={scrollWiring}>
              {children}
            </SheetScrollContext.Provider>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  )

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={busy ? undefined : onDismiss}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.rootView}>
        {Inner}
      </GestureHandlerRootView>
    </Modal>
  )
}

// THE title of a popup — every one of them, whatever kind (user directive
// 2026-07-28). A confirm dialog, the buy-credits sheet, a group sheet, the
// inline value picker and the full-screen OverlaySheet header all render their
// heading through this one style, so no popup can ever look like a different
// rank of surface than the popup beside it.
//
// TEXT.lg, not xl: the sheet header (OverlaySheet) was already 18 and so were
// four of the six popups, so 18 is the size that makes the whole family agree.
// The old 24 on ConfirmDialog/BuyExtraPopup also carried a -0.3 letterSpacing
// to claw back the width it cost — at 18 there is nothing to claw back, so the
// tracking goes with it.
//
// No spacing in here, and none at the call site either: the gap under a title
// belongs to whatever comes NEXT, and that thing knows which gap it is — the
// description's own (SheetDesc), the between-blocks one (a list, a field), or the
// actions' (SheetActions). Every one of them is SHEET_GAP in tokens.ts. A title
// declaring its own marginBottom on top of that is how two of these popups ended
// up 4px apart from the rest.
export const SHEET_TITLE: TextStyle = {
  fontSize: TEXT.lg,
  fontWeight: WEIGHT.medium,
  color: INK,
  textAlign: 'center',
}

export function SheetTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[SHEET_TITLE, style]}>{children}</Text>
}

// ── SheetScroll ────────────────────────────────────────────────────────────
// The popup's own white, arriving over the strip of text that runs past the
// edge — so the words dissolve into the card instead of being cut by a hard
// line. BOTH edges wear one (user directive 2026-07-28): text scrolled up past
// the top of the block was being sliced mid-glyph exactly as it was at the
// bottom, and one fade without the other reads as "the block starts here".
// ONE component, told which edge it is: the two are the same gradient, flipped.
const FADE_ID = { top: 'sheetScrollFadeTop', bottom: 'sheetScrollFadeBottom' } as const

function ScrollFade({ edge, show, ground }: { edge: 'top' | 'bottom'; show: boolean; ground: string }) {
  // Fades in and out rather than blinking on the frame the last line arrives —
  // default timing, like every other fade in the app.
  const fade = useSharedValue(0)
  useEffect(() => { fade.value = withTiming(show ? 1 : 0) }, [show, fade])
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))
  // Opaque at the card's edge, clear where the text carries on.
  const [near, far] = edge === 'top' ? ['1', '0'] : ['0', '1']
  // The gradient's id carries the colour, not just the edge: two popups can be
  // on screen at once (a sheet nested in a sheet) and now no longer share a
  // ground, so an id that named only the edge would let one block's fade be
  // painted in the other's colour.
  const fadeId = `${FADE_ID[edge]}_${ground.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <Animated.View
      style={[styles.scrollFade, edge === 'top' ? styles.scrollFadeTop : styles.scrollFadeBottom, fadeStyle]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ground} stopOpacity={near} />
            <Stop offset="1" stopColor={ground} stopOpacity={far} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fadeId})`} />
      </Svg>
    </Animated.View>
  )
}

// The ONE part of a popup that is allowed to run long: user-written text with
// no length the layout can count on (a group's description). Everything else in
// the sheet keeps its natural height, and this block takes whatever is left
// under the cap — it is the only child that declares `flexShrink`, so the
// overflow lands here by construction rather than by a measured maxHeight that
// would have to be recomputed per popup.
//
// It scrolls, and it SAYS it scrolls: the popup's own white fades up over its
// bottom edge while there is more below, and lifts the moment the end is
// reached. That fade is the app's one gradient (user directive 2026-07-28) —
// everything else stays flat — because a hard cut at the last line reads as the
// text ENDING there, which is exactly the misreading the block has to prevent.
//
// The inner scroll always outranks the sheet's swipe-to-dismiss: it takes the
// wiring from the BottomSheet around it (context), so a drag with scrolling
// still to do scrolls, and only a drag that begins at the top can dismiss.
export function SheetScroll({ children, style, scrollRef }: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** For a list that has to place ITSELF when it opens — the height picker
   *  scrolls the ticked row into view. The block still owns its scroll in every
   *  other respect; this is only a way in. */
  scrollRef?: React.RefObject<ScrollView | null>
}) {
  const wiring = useContext(SheetScrollContext)
  // Is there anything above or below the fold right now? Kept in refs and
  // reduced to two booleans, so a scroll frame re-renders nothing unless one of
  // the ANSWERS changed.
  const boxH = useRef(0)
  const contentH = useRef(0)
  const offsetY = useRef(0)
  const [more, setMore] = useState(false)
  const [above, setAbove] = useState(false)
  const sync = () => {
    setMore(contentH.current - offsetY.current - boxH.current > 1)
    setAbove(offsetY.current > 1)
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y
    if (wiring) wiring.atTop.value = offsetY.current <= 0
    sync()
  }

  // Where this block sits inside the card, for the dismiss-pan: the finger owns
  // the scroll HERE and the sheet everywhere else. Measured against the card
  // rather than the window, since the card is mid-slide while the popup opens.
  const boxRef = useRef<View | null>(null)
  const syncBounds = () => {
    const card = wiring?.cardRef.current
    if (!card || !boxRef.current) return
    boxRef.current.measureLayout(
      card as never,
      (_x, y, _w, h) => { wiring.top.value = y; wiring.bottom.value = y + h },
      () => {},
    )
  }
  // Gone with the block: a card that no longer has a scrollable strip must not
  // keep one that refuses the swipe.
  useEffect(() => () => {
    if (!wiring) return
    wiring.top.value = Number.POSITIVE_INFINITY
    wiring.bottom.value = Number.NEGATIVE_INFINITY
  }, [wiring])

  const scroll = (
    <ScrollView
      ref={scrollRef}
      style={styles.scrollBody}
      showsVerticalScrollIndicator={false}
      // The app-wide keyboard rule, for the one field-bearing scroll surface
      // that is not a `PullScrollView` (see PullPane.tsx): scrolling never
      // closes the keyboard — no `keyboardDismissMode`, so it stays `none` —
      // and a tap the body does not handle does.
      keyboardShouldPersistTaps="handled"
      // The sheet is already a bounce-free surface; a rubber band here would
      // fight the dismiss-pan for the same drag at the top.
      bounces={false}
      nestedScrollEnabled
      scrollEventThrottle={16}
      onScroll={onScroll}
      onLayout={e => { boxH.current = e.nativeEvent.layout.height; sync() }}
      onContentSizeChange={(_w, h) => { contentH.current = h; sync() }}
    >
      {children}
    </ScrollView>
  )

  return (
    <View ref={boxRef} style={[styles.scrollBox, style]} onLayout={syncBounds}>
      {wiring ? <GestureDetector gesture={wiring.native}>{scroll}</GestureDetector> : scroll}
      <ScrollFade edge="top" show={above} ground={wiring?.ground ?? SURFACE} />
      <ScrollFade edge="bottom" show={more} ground={wiring?.ground ?? SURFACE} />
    </View>
  )
}

// One choice inside a sheet: a full-width soft tile with a leading glyph and
// its label. Every sheet that offers a list of actions (the chat's long-press
// message actions, the card's leave/block pair) composes this, so the geometry and
// its disabled treatment are defined once. The haptic stays at the call site —
// a destructive row wants a different one from a neutral one.
export function SheetActionRow({ icon, label, onPress, disabled }: {
  icon: ReactNode
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      style={[styles.actionRow, disabled && styles.actionRowDisabled]}
      onPress={() => { if (!disabled) onPress() }}
      accessibilityRole="button"
    >
      {icon}
      <Text style={styles.actionRowLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  rootView: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  // `flexShrink` on both, so the keyboard's `marginBottom` (above) does not just
  // push the card up but genuinely takes the room away: the overlay column is
  // over-subscribed by exactly the keyboard's height, and these two are what let
  // that reduction travel down to the one child that can absorb it, the
  // <SheetScroll>'s `scrollBox`. Inert when the keyboard is down — nothing is
  // over-subscribed, so nothing shrinks.
  cardWrap: { flexShrink: 1 },
  card: {
    flexShrink: 1,
    // WHITE (user directive 2026-07-28): EVERY popup is a white sheet. It is
    // the surface that LIFTS off the page — a dialog is a thing laid ON the
    // app, not the page itself rising — so it takes SURFACE, never the PAGE
    // tint. This is the single place the popup ground is set: ConfirmDialog,
    // BuyExtraPopup, SharedCirclesPopup and every action sheet compose this card.
    backgroundColor: SURFACE,
    // The app's ONE lift for a surface that came from below (RISE_SHADOW in
    // tokens.ts) — the same one home's dock and every rising page wear. A popup
    // used to have a fainter, wider-blurred one of its own and next to the dock
    // it read as flat (user directive 2026-08-03).
    boxShadow: RISE_SHADOW,
    // THE gutter of every popup in the app, exactly as the bottom gap below is
    // THE air under its last row (user directive 2026-07-30). It used to be the
    // call site's: LG in ConfirmDialog, MD on the group and shared-lists popups,
    // MD-inside-MD in the groups sheet, so no two popups indented their title to
    // the same place. A body that genuinely is not a text column — an
    // edge-to-edge row list, a grid of tiles — overrides it through
    // `contentStyle`, and nothing else may.
    paddingHorizontal: MD,
  },
  cardNoHandle: { paddingTop: SHEET_GAP.title },
  // The box a <SheetScroll> claims: whatever height is left under the cap, and
  // never a pixel more than its own text needs. `flexShrink` is what hands the
  // overflow to it; `flexGrow: 0` is what keeps a SHORT description from
  // stretching to fill the card. It clips, so the fade sits over real text.
  scrollBox: { flexGrow: 0, flexShrink: 1, overflow: 'hidden' },
  // The scroll fills the box; the box is what was bounded.
  scrollBody: { flexGrow: 0, flexShrink: 1 },
  // One band, pinned to whichever edge it is fading — same height either way, so
  // the block reads the same at its head as at its foot.
  scrollFade: { position: 'absolute', start: 0, end: 0, height: SCROLL_FADE },
  scrollFadeTop: { top: 0 },
  scrollFadeBottom: { bottom: 0 },
  // No margin of its own: a list of these rows is a <SheetActions flush>, so the
  // gap between them is the same one that separates any two buttons in a popup,
  // and the last row does not leave an extra SM standing on top of the sheet's
  // bottom gap (which is what made the photo-options and message-actions sheets
  // end lower than every other popup).
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PAGE,
    borderRadius: RADIUS,
    paddingVertical: MD,
    paddingHorizontal: MD,
    gap: MD,
    // A filled tile on a surface takes the app's one lift (2026-08-03).
    boxShadow: CARD_SHADOW,
  },
  actionRowDisabled: {
    opacity: 0.55,
  },
  actionRowLabel: {
    fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: INK,
  },
  // The BAR itself is DragHandle's (one handle in the app, shared with chat's
  // header row). What is left here is only where it stands in a POPUP.
  dragHandle: {
    alignSelf: 'center',
    marginTop: MD,
    // The handle stands IN the popup's top air rather than beside it: what
    // follows it is the same distance below it as a handle-less popup's first
    // block is below the card's edge (`cardNoHandle`).
    marginBottom: SHEET_GAP.title,
  },
  // ── The popup's own vertical rhythm ──────────────────────────────────────
  // The three gaps a popup body is built from, in the three components below.
  // Nothing else in the app may declare them (SHEET_GAP in tokens.ts).
  desc: {
    marginTop: SHEET_GAP.desc,
    // Regular purple, FULL strength: popup body text is the regular INK purple,
    // never a faded step (user directive 2026-07-26). A muted INK_SUBTLE /
    // INK_DIM reads as washed-out grey on the white sheet — which is what the
    // groups sheet's own hint style was doing until this replaced it.
    fontSize: TEXT.md,
    color: INK,
    textAlign: 'center',
  },
  actions: { marginTop: SHEET_GAP.actions, gap: SM },
  actionsFlush: { marginTop: 0 },
  actionsRow: { flexDirection: 'row', gap: MD },
  // ── The pair (SheetActionPair) ───────────────────────────────────────────
  // The quiet strip beside the purple: its own width (OptionStrip's `hug`), and
  // the first to give when the row is tight, so the action being offered keeps
  // its word on one line.
  pairQuiet: { flexShrink: 1 },
  // The action takes everything left of the row — and keeps its own height in
  // it. A Button stretches to its row by itself (`wrap`'s alignSelf), so it
  // rides a slot that centres it instead: a popup's button may not come out
  // taller than every other popup's because of what is standing beside it.
  pairAction: { flex: 1, justifyContent: 'center' },
})

// THE sentence under a popup's title — every popup that has one. Same size,
// same full-strength ink, same centring and, above all, the same distance under
// the title, whether the popup is a confirm dialog, a group sheet or the invite
// prompt. Rich content is allowed (a bold <Text> span inside it inherits the
// size and colour and overrides only what it sets).
export const SHEET_DESC: TextStyle = styles.desc

export function SheetDesc({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.desc, style]}>{children}</Text>
}

// THE block of buttons at the foot of a popup. It owns the one gap that stands
// between whatever the popup said and what the user can do about it — the widest
// gap in the popup, so the actions never read as another line of the paragraph.
// `row` lays two buttons side by side (a cancel/confirm pair); without it they
// stack full-width.
//
// `flush` is for the action sheets that are NOTHING BUT buttons (chat's message
// actions — reply/copy): there is nothing above them to stand clear of, so the
// popup's own top air is the only gap and this adds none. The chat's leave/block
// pair was the other one until 2026-08-02, when it absorbed the confirm that
// used to stand behind it and grew a title and a sentence of its own.
export function SheetActions({ children, row, flush, style }: {
  children: ReactNode
  row?: boolean
  flush?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.actions, flush && styles.actionsFlush, row && styles.actionsRow, style]}>
      {children}
    </View>
  )
}

// WHAT I MAY DO, BESIDE WHAT I AM BEING OFFERED — the foot of a popup (user
// directive 2026-07-31). Three popups end this way — the group's, the account's
// and chat's leave/block — so the shape is stated once here rather than assembled
// at each:
//
//   [ 🗑 delete ]  [ ⎋ sign out ]
//
// The QUIET options lead — bare marks on no ground at all (`OptionStrip`), things
// I may do, passed on the way past — and the ONE action the popup is asking for
// ENDS the block, in the app's purple, under the thumb.
//
// THE PAIR IS ONE SHAPE, and only the fill tells the two apart: the action is
// handed `stack` (the mark over the word, in the strip's own mark size, gap and
// caption rank — see Button) the moment it stands beside an option. A glyph
// beside a label next to a glyph above one reads as two unrelated controls that
// happen to share a row.
//
// `stacked` is the other arrangement, and it is the group popup's (user directive
// 2026-08-02): the strip is the WHOLE row, its options dividing it evenly, and
// the purple runs the full width UNDER it with its mark beside the label like any
// other button in the app.
//
//   [ 🌐 more details │ ⎋ leave ]
//   [      ⇧ share invite link      ]
//
// One row cannot hold both — a strip of two hugging its own words beside a purple
// tile leaves each side a third of the popup — and a group is the one popup here
// whose options are more than one. It wears this arrangement at EVERY count,
// including one (user directive 2026-08-02, evening): what a circle's foot looks
// like, and how big the word on its purple is, may not change with how many
// things I happen to be allowed to do in that particular circle.
// Which arrangement a popup wears is the call
// site's to state, and nothing else about the foot is: the gap above it, the case
// where one side is missing and the case where neither is are this component's.
//
// Either side may be absent, and then the other one is the full width by itself
// and no row forms: a private group with nothing to share, an account popup is
// always both. With neither there is no block at all — an empty one would leave
// the actions' own XL of dead white above the popup's edge.
export function SheetActionPair({ options, action, stacked, flush }: {
  /** The things I MAY do, as `OptionStrip` data. */
  options?: StripOption[]
  /** The one thing the popup is OFFERING: a `<Button>`, whose props are the call
   *  site's to state — except `stack`, which is this row's business and is
   *  injected, exactly as `Button` injects the size of the glyph it is handed. */
  action?: ReactNode
  /** The strip over the action instead of beside it, each of them the full width
   *  (see above). The action is then an ORDINARY button and is handed nothing. */
  stacked?: boolean
  /** `SheetActions`' own: for a popup that is NOTHING BUT this row, where there
   *  is nothing above it to stand clear of and the popup's top air is the only
   *  gap. Chat's leave/block pair was the one, and since 2026-08-02 it carries
   *  the title and sentence of the confirm it absorbed, so no host passes this
   *  today — every popup that ends on the pair says something first. */
  flush?: boolean
}) {
  const opts = options ?? []
  const beside = opts.length > 0 && !!action && !stacked
  if (!opts.length && !action) return null
  return (
    <SheetActions row={beside} flush={flush}>
      {opts.length > 0 ? (
        <OptionStrip options={opts} hug={beside} style={beside ? styles.pairQuiet : undefined} />
      ) : null}
      {beside && isValidElement(action)
        ? <View style={styles.pairAction}>{cloneElement(action as ReactElement<{ stack?: boolean }>, { stack: true })}</View>
        : action}
    </SheetActions>
  )
}
