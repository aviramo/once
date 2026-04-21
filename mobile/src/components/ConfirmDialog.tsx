import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, View, TouchableOpacity } from 'react-native'
import { Text } from './AppText'
import { Button } from './Button'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated'
import { SINGLE, DOUBLE } from '../fonts'
import { TEXT, WHITE, BLACK } from '../colors'

export function ConfirmDialog({
  visible,
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive,
  soft,
  tone,
  onCancel,
  onConfirm,
  busy,
  skipToggle,
  cancelFlex,
  confirmFlex,
}: {
  visible: boolean
  title: string
  description?: string
  cancelLabel?: string
  confirmLabel: string
  destructive?: boolean
  soft?: boolean
  tone?: 'positive'
  onCancel?: () => void
  onConfirm: () => void
  busy?: boolean
  /** Optional "don't show again" toggle rendered below the description. */
  skipToggle?: { label: string; checked: boolean; onToggle: () => void }
  /** Flex ratio for the cancel button slot (default 1). */
  cancelFlex?: number
  /** Flex ratio for the confirm button slot (default 1). */
  confirmFlex?: number
}) {
  const translateY = useSharedValue(400)
  const [modalVisible, setModalVisible] = useState(false)
  const cardHeight = useRef(400)

  const [pressed, setPressed] = useState<'confirm' | 'cancel' | null>(null)
  useEffect(() => {
    if (!busy) setPressed(null)
  }, [busy])
  useEffect(() => {
    if (!visible) setPressed(null)
  }, [visible])

  useEffect(() => {
    if (visible) {
      translateY.value = cardHeight.current
      setModalVisible(true)
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, {
          duration: 350,
          easing: Easing.out(Easing.cubic),
        })
      })
    } else {
      translateY.value = withTiming(cardHeight.current, {
        duration: 250,
        easing: Easing.in(Easing.cubic),
      }, () => {
        runOnJS(setModalVisible)(false)
      })
    }
  }, [visible])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onCancel ?? onConfirm}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : (onCancel ?? onConfirm)}
        />
        <Animated.View
          style={[styles.cardWrap, animStyle]}
          onLayout={e => { cardHeight.current = e.nativeEvent.layout.height }}
        >
          <View style={styles.shadowGradient} pointerEvents="none">
            {[0.01,0.02,0.025,0.03,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.08,0.09,0.10,0.11,0.12,0.13,0.14,0.15].map((o, i) => (
              <View key={i} style={[styles.shadowLayer, { opacity: o }]} />
            ))}
          </View>
          <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.desc}>{description}</Text> : null}

          {skipToggle && (
            <TouchableOpacity
              style={styles.skipRow}
              onPress={skipToggle.onToggle}
              activeOpacity={0.7}
              disabled={busy}
            >
              <View style={[styles.checkbox, skipToggle.checked && styles.checkboxChecked]}>
                {skipToggle.checked && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <Text style={styles.skipLabel}>{skipToggle.label}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.row}>
            {cancelLabel ? (
              <View style={[styles.slot, cancelFlex != null && { flex: cancelFlex }]}>
                <Button
                  label={cancelLabel}
                  onPress={() => { setPressed('cancel'); onCancel?.() }}
                  variant="secondary"
                  size="lg"
                  disabled={busy}
                  silentDisabled={pressed !== 'cancel'}
                />
              </View>
            ) : null}
            <View style={[styles.slot, confirmFlex != null && { flex: confirmFlex }]}>
              <Button
                label={confirmLabel}
                onPress={() => { setPressed('confirm'); onConfirm() }}
                variant={destructive ? 'destructive' : soft ? 'soft' : 'primary'}
                tone={!destructive && !soft ? tone : undefined}
                size="lg"
                disabled={busy}
                silentDisabled={pressed !== 'confirm'}
              />
            </View>
          </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardWrap: {
  },
  shadowGradient: {
    height: 60,
    marginBottom: -1,
  },
  shadowLayer: {
    flex: 1,
    backgroundColor: BLACK,
  },
  card: {
    backgroundColor: WHITE,
    padding: DOUBLE,
    paddingBottom: SINGLE,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  desc: {
    marginTop: DOUBLE,
    paddingHorizontal: SINGLE,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: DOUBLE,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.25)',
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#6d28d9',
    borderColor: '#6d28d9',
  },
  checkboxTick: {
    fontSize: 13,
    lineHeight: 14,
    color: WHITE,
    fontWeight: '700',
    includeFontPadding: false,
  },
  skipLabel: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.55)',
  },
  row: {
    flexDirection: 'row',
    gap: SINGLE,
    marginTop: DOUBLE + SINGLE,
    paddingBottom: DOUBLE,
  },
  slot: { flex: 1 },
})
