import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View, Keyboard, Dimensions, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { GestureHandlerRootView, Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from './AppText'
import { SURFACE, PAGE, INK, INK_DIM } from '../colors'
import { MD, SM, RADIUS, TEXT, WEIGHT, lh, SWIPE_DISMISS_PX, SWIPE_DISMISS_VELOCITY, PAN_ACTIVE_OFFSET_Y, PAN_FAIL_OFFSET_Y, SHEET_SHADOW, SHEET_TOP_GAP, SCROLL_FADE, DRAG_HANDLE } from '../tokens'

// Off-screen start position for the slide-in. Screen height is guaranteed to
// exceed any sheet's height, so the sheet always begins fully hidden no matter
// how tall its content is — unlike the old magic 800, which let a taller sheet
// peek before it had been measured and made the slide distance feel wrong.
const SCREEN_H = Dimensions.get('screen').height

// Single source of truth for the bottom-sheet behavior used by every popup
// in the app: slide-up mount, slide-down dismiss, swipe-to-dismiss gesture,
// and the 20-layer translucent-black shadow gradient that lifts the sheet
// off the background.
//
// Composers (ConfirmDialog, AccountDetailsPopup, PhotoOptionsPopup, ...)
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
  // Disable the backdrop tap → dismiss (e.g. while a network call is in flight).
  // Defaults to allowed.
  disableBackdropDismiss?: boolean
  // Extra style override (e.g. Android keyboard lift via marginBottom).
  cardWrapStyle?: any
  // Inner padding on the sheet body. Defaults to standard.
  contentStyle?: any
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
}
const SheetScrollContext = createContext<SheetScrollWiring | null>(null)

export function BottomSheet({
  visible,
  onDismiss,
  onClosed,
  children,
  dragHandle = true,
  swipeToDismiss = true,
  disableBackdropDismiss,
  cardWrapStyle,
  contentStyle,
  scrollableGesture,
  scrollAtTop,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  const translateY = useSharedValue(SCREEN_H)
  const dragY = useSharedValue(0)
  const cardHeight = useSharedValue(SCREEN_H)
  // A body that runs long (a group's description, a long list) may grow the
  // sheet up to here and no further: the card's TOP never crosses the safe area
  // (user directive 2026-07-28). Everything above the cap used to be pushed off
  // the screen, head first. What gives inside the card is whatever declares
  // `flexShrink` — in practice a <SheetScroll>; every other part keeps its size.
  const maxHeight = Dimensions.get('window').height - insets.top - SHEET_TOP_GAP
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
    () => ({ native: bodyScroll, atTop: bodyAtTop, top: bodyScrollTop, bottom: bodyScrollBottom, cardRef }),
    [bodyScroll, bodyAtTop, bodyScrollTop, bodyScrollBottom],
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
      translateY.value = withTiming(cardHeight.value, undefined, () => {
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
    .enabled(swipeToDismiss)
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
        dragY.value = withTiming(cardHeight.value)
        runOnJS(onDismiss)()
      } else {
        dragY.value = withTiming(0)
      }
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }))

  const Inner = (
    <View style={styles.overlay}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={disableBackdropDismiss ? undefined : onDismiss}
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
              translateY.value = SCREEN_H
              translateY.value = withTiming(0)
            }
          }}
        >
          <View ref={cardRef} style={[styles.card, { maxHeight }, contentStyle]}>
            {dragHandle ? <View style={styles.dragHandle} /> : null}
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
      onRequestClose={disableBackdropDismiss ? undefined : onDismiss}
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
// Spacing is deliberately NOT in here: a popup's gap under its title belongs to
// that popup's layout (a desc follows in one, a list in another). Call sites
// pass it via `style`.
export const SHEET_TITLE: TextStyle = {
  fontSize: TEXT.lg,
  lineHeight: lh(TEXT.lg),
  fontWeight: WEIGHT.semibold,
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

function ScrollFade({ edge, show }: { edge: 'top' | 'bottom'; show: boolean }) {
  // Fades in and out rather than blinking on the frame the last line arrives —
  // default timing, like every other fade in the app.
  const fade = useSharedValue(0)
  useEffect(() => { fade.value = withTiming(show ? 1 : 0) }, [show, fade])
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))
  // Opaque at the card's edge, clear where the text carries on.
  const [near, far] = edge === 'top' ? ['1', '0'] : ['0', '1']
  return (
    <Animated.View
      style={[styles.scrollFade, edge === 'top' ? styles.scrollFadeTop : styles.scrollFadeBottom, fadeStyle]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={FADE_ID[edge]} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SURFACE} stopOpacity={near} />
            <Stop offset="1" stopColor={SURFACE} stopOpacity={far} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${FADE_ID[edge]})`} />
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
export function SheetScroll({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
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
      style={styles.scrollBody}
      showsVerticalScrollIndicator={false}
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
      <ScrollFade edge="top" show={above} />
      <ScrollFade edge="bottom" show={more} />
    </View>
  )
}

// One choice inside a sheet: a full-width soft tile with a leading glyph and
// its label. Every sheet that offers a list of actions (photo options, the
// chat's long-press message actions) composes this, so the tile geometry and
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
  cardWrap: {},
  card: {
    // WHITE (user directive 2026-07-28): EVERY popup is a white sheet. It is
    // the surface that LIFTS off the page — a dialog is a thing laid ON the
    // app, not the page itself rising — so it takes SURFACE, never the PAGE
    // tint. This is the single place the popup ground is set: ConfirmDialog,
    // BuyExtraPopup, SharedGroupsPopup and every action sheet compose this card.
    backgroundColor: SURFACE,
    boxShadow: SHEET_SHADOW,
  },
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PAGE,
    borderRadius: RADIUS,
    paddingVertical: MD,
    paddingHorizontal: MD,
    gap: MD,
    marginBottom: SM,
  },
  actionRowDisabled: {
    opacity: 0.55,
  },
  actionRowLabel: {
    fontSize: TEXT.md, fontWeight: WEIGHT.semibold, color: INK,
  },
  dragHandle: {
    alignSelf: 'center',
    width: DRAG_HANDLE.width,
    height: DRAG_HANDLE.height,
    borderRadius: DRAG_HANDLE.radius,
    backgroundColor: INK_DIM,
    marginTop: MD,
    marginBottom: MD,
  },
})
