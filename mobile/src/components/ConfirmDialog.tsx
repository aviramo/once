import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View, TouchableOpacity } from 'react-native'
import { Text } from './AppText'
import { Button } from './Button'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from 'react-native-reanimated'
import { SINGLE, DOUBLE } from '../fonts'
import { TEXT_PRIMARY, WHITE, BLACK, GRAY_100, GRAY_400, PRIMARY_BG } from '../colors'

export function ConfirmDialog({
  visible,
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive,
  soft,
  tone,
  icon,
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
  /** Optional icon rendered in a tinted circle above the title. */
  icon?: ReactNode
  onCancel?: () => void
  onConfirm: () => void
  busy?: boolean
  skipToggle?: { label: string; checked: boolean; onToggle: () => void }
  cancelFlex?: number
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
          <View style={styles.dragHandle} />
          {icon ? (
            <View style={styles.iconWrap}>
              <View style={styles.iconCircle}>{icon}</View>
            </View>
          ) : null}
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
                  loading={busy && pressed === 'cancel'}
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
                loading={busy && pressed === 'confirm'}
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
    padding: 24,
    paddingTop: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: GRAY_100,
    marginBottom: 16,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  desc: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: GRAY_400,
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
    backgroundColor: '#1AC944',
    borderColor: '#1AC944',
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
    gap: 12,
    marginTop: 20,
  },
  slot: { flex: 1 },
})
