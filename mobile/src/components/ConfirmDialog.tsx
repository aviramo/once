import { useEffect, useRef } from 'react'
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from './Button'

// App-wide confirmation / info dialog. Replaces the native Alert.alert so
// every prompt in the app uses the same card style and the same Button
// component (press animation, disabled, loading) as the rest of the app.
//
// Two shapes:
//   - Confirm (both labels): cancel + confirm buttons side-by-side.
//   - Info (only confirmLabel): single full-width confirm button.
// `destructive` paints the confirm button red instead of black, for
// irreversible actions like delete-account.

export function ConfirmDialog({
  visible,
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive,
  onCancel,
  onConfirm,
}: {
  visible: boolean
  title: string
  description?: string
  cancelLabel?: string
  confirmLabel: string
  destructive?: boolean
  onCancel?: () => void
  onConfirm: () => void
}) {
  // Fade + slight slide-up when the modal shows. Pure opacity feels flat for
  // a dialog this prominent, and a full slide is too heavy — so we do both
  // at reduced amplitude.
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [visible])

  const overlayOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
  const cardTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] })

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel ?? onConfirm}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel ?? onConfirm} />
        <SafeAreaView edges={['bottom']} style={styles.safe} pointerEvents="box-none">
          <Animated.View style={[styles.card, { opacity: anim, transform: [{ translateY: cardTranslate }] }]}>
            <Text style={styles.title}>{title}</Text>
            {description ? <Text style={styles.desc}>{description}</Text> : null}

            <View style={styles.row}>
              {cancelLabel ? (
                <View style={styles.slot}>
                  <Button
                    label={cancelLabel}
                    onPress={onCancel ?? (() => {})}
                    variant="secondary"
                    size="md"
                  />
                </View>
              ) : null}
              <View style={styles.slot}>
                <Button
                  label={confirmLabel}
                  onPress={onConfirm}
                  variant={destructive ? 'destructive' : 'primary'}
                  size="md"
                />
              </View>
            </View>
          </Animated.View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  safe: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  desc: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.55)',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  slot: { flex: 1 },
})
