import { useEffect, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View, Platform, Keyboard, KeyboardAvoidingView } from 'react-native'
import { GestureHandlerRootView, Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
  type SharedValue,
} from 'react-native-reanimated'
import { BLACK, WHITE, BLACK_SOFT } from '../colors'
import {
  DURATION, EASE,
  SWIPE_DISMISS_PX, SWIPE_DISMISS_VELOCITY, PAN_ACTIVE_OFFSET_Y, PAN_FAIL_OFFSET_Y,
  SHADOW_GRADIENT_STOPS, SHADOW_GRADIENT_HEIGHT,
  DRAG_HANDLE,
} from '../tokens'

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
  children: ReactNode
  // True → render the small gray drag handle at the top of the sheet body.
  // Default true since every sheet currently shows it.
  dragHandle?: boolean
  // True → enable swipe-down-to-dismiss gesture. Default true.
  swipeToDismiss?: boolean
  // True → wrap content in KeyboardAvoidingView (iOS padding behavior). Used
  // by sheets that contain a TextInput.
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
  const cardHeight = useSharedValue(800)
  // Captured at gesture start: was the scrollable child at its top? Drives
  // whether this pan can dismiss the sheet or whether it should yield to the
  // scroll. Default true so non-scrollable sheets behave as before.
  const wasAtTop = useSharedValue(true)
  // Track mount/unmount separately so the slide-out animation runs to
  // completion before the Modal disappears.
  const [modalVisible, setModalVisible] = useState(false)

  useEffect(() => {
    if (visible) {
      dragY.value = 0
      translateY.value = cardHeight.value
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: DURATION.sheetIn, easing: EASE.out })
      })
    } else if (modalVisible) {
      if (keyboardAvoiding) Keyboard.dismiss()
      translateY.value = withTiming(cardHeight.value, { duration: DURATION.sheetOut, easing: EASE.in }, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

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
        dragY.value = withTiming(cardHeight.value, { duration: DURATION.med, easing: EASE.in })
        runOnJS(onDismiss)()
      } else {
        dragY.value = withTiming(0, { duration: DURATION.slow, easing: EASE.out })
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
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {Inner}
          </KeyboardAvoidingView>
        ) : (
          Inner
        )}
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  rootView: { flex: 1 },
  flex: { flex: 1 },
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
    backgroundColor: BLACK_SOFT,
    marginTop: 12,
    marginBottom: 16,
  },
})
