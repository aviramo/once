import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View, Keyboard, Dimensions } from 'react-native'
import { GestureHandlerRootView, Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
  type SharedValue,
} from 'react-native-reanimated'
import { BLACK, WHITE, BLACK_MID } from '../colors'
import { MD, SWIPE_DISMISS_PX, SWIPE_DISMISS_VELOCITY, PAN_ACTIVE_OFFSET_Y, PAN_FAIL_OFFSET_Y, SHADOW_GRADIENT_STOPS, SHADOW_GRADIENT_HEIGHT, DRAG_HANDLE } from '../tokens'

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
  // True → lift the whole sheet by the keyboard height while it's open, so a
  // TextInput in the sheet body stays visible. Set this for ANY sheet that
  // contains a focusable text field. RN's KeyboardAvoidingView does NOT work
  // here: the sheet lives inside a RN Modal, and on Android a Modal gets its
  // own window that never receives the activity's adjustResize, so the field
  // sits behind the keyboard. We instead drive a transform lift off the
  // Keyboard events (the same approach chat.tsx uses), which works on both
  // platforms. Single source of truth: fixing it here fixes every popup.
  keyboardAvoiding?: boolean
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

export function BottomSheet({
  visible,
  onDismiss,
  onClosed,
  children,
  dragHandle = true,
  swipeToDismiss = true,
  keyboardAvoiding = false,
  disableBackdropDismiss,
  cardWrapStyle,
  contentStyle,
  scrollableGesture,
  scrollAtTop,
}: BottomSheetProps) {
  const translateY = useSharedValue(800)
  const dragY = useSharedValue(0)
  // Keyboard-height lift (see `keyboardAvoiding` doc above). 0 when closed.
  const keyboardOffset = useSharedValue(0)
  const cardHeight = useSharedValue(800)
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
      translateY.value = cardHeight.value
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0)
      })
    } else if (modalVisible) {
      if (keyboardAvoiding) Keyboard.dismiss()
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

  // Lift the sheet by the keyboard height while a field in it is focused.
  // Height is derived from screen geometry (screenH − endCoordinates.screenY)
  // rather than `endCoordinates.height` — Gboard's clipboard/suggestion strip
  // isn't always counted in `height`. We listen to *willShow* + *didShow* so
  // the lift starts in sync with the keyboard on iOS, and still catches the
  // Android case (no willShow). Mirrors chat.tsx's proven handling.
  useEffect(() => {
    if (!keyboardAvoiding) return
    const onShow = (e: any) => {
      const screenH = Dimensions.get('screen').height
      const fromScreenY = screenH - (e.endCoordinates?.screenY ?? screenH)
      const reportedH = e.endCoordinates?.height ?? 0
      keyboardOffset.value = withTiming(Math.max(reportedH, fromScreenY))
    }
    const onHide = () => { keyboardOffset.value = withTiming(0) }
    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ]
    return () => { subs.forEach(s => s.remove()); keyboardOffset.value = 0 }
  }, [keyboardAvoiding])

  const panBase = Gesture.Pan()
    .enabled(swipeToDismiss)
    .activeOffsetY(PAN_ACTIVE_OFFSET_Y)
    .failOffsetY(PAN_FAIL_OFFSET_Y)
  const pan = (scrollableGesture ? panBase.simultaneousWithExternalGesture(scrollableGesture) : panBase)
    .onBegin(() => {
      'worklet'
      // Snapshot whether the scroll is at the top right when the user touches
      // down. The dismiss decision uses this snapshot for the whole pan, so a
      // drag that starts mid-scroll won't suddenly start dismissing once the
      // user happens to scroll back to the top during the same drag.
      wasAtTop.value = scrollAtTop ? scrollAtTop.value : true
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
    transform: [{ translateY: translateY.value + dragY.value - keyboardOffset.value }],
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
          onLayout={e => { cardHeight.value = e.nativeEvent.layout.height }}
        >
          <View style={styles.shadowGradient} pointerEvents="none">
            {SHADOW_GRADIENT_STOPS.map((o, i) => (
              <View key={i} style={[styles.shadowLayer, { opacity: o }]} />
            ))}
          </View>
          <View style={[styles.card, contentStyle]}>
            {dragHandle ? <View style={styles.dragHandle} /> : null}
            {children}
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

const styles = StyleSheet.create({
  rootView: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  cardWrap: {},
  shadowGradient: { height: SHADOW_GRADIENT_HEIGHT, marginBottom: -1 },
  shadowLayer: { flex: 1, backgroundColor: BLACK },
  card: {
    backgroundColor: WHITE,
  },
  dragHandle: {
    alignSelf: 'center',
    width: DRAG_HANDLE.width,
    height: DRAG_HANDLE.height,
    borderRadius: DRAG_HANDLE.radius,
    backgroundColor: BLACK_MID,
    marginTop: MD,
    marginBottom: MD,
  },
})
