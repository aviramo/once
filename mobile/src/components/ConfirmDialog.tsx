import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { Text } from './AppText'
import { Button } from './Button'
import { BottomSheet } from './BottomSheet'
import { SINGLE, DOUBLE, RADII, TEXT as FSIZE, WEIGHT } from '../tokens'
import { BLACK, WHITE, BLACK_STRONG, PRIMARY, PRIMARY_BG, BLACK_MID } from '../colors'

export function ConfirmDialog({
  visible,
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive,
  soft,
  premium,
  tone,
  icon,
  onCancel,
  onConfirm,
  busy,
  skipToggle,
  cancelFlex,
  confirmFlex,
  draggable,
}: {
  visible: boolean
  title: string
  description?: string
  cancelLabel?: string
  confirmLabel: string
  destructive?: boolean
  soft?: boolean
  premium?: boolean
  tone?: 'positive'
  /** Optional icon rendered in a tinted circle above the title. */
  icon?: ReactNode
  onCancel?: () => void
  onConfirm: () => void
  busy?: boolean
  skipToggle?: { label: string; checked: boolean; onToggle: () => void }
  cancelFlex?: number
  confirmFlex?: number
  draggable?: boolean
}) {
  const [pressed, setPressed] = useState<'confirm' | 'cancel' | null>(null)
  useEffect(() => { if (!busy) setPressed(null) }, [busy])
  useEffect(() => { if (!visible) setPressed(null) }, [visible])

  const dismiss = () => {
    if (busy) return
    onCancel?.()
  }

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onCancel ? dismiss : onConfirm}
      disableBackdropDismiss={busy}
      swipeToDismiss={!!draggable}
      dragHandle={!!draggable}
      contentStyle={styles.card}
    >
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
            variant={destructive ? 'destructive' : soft ? 'dark' : premium ? 'premium' : 'primary'}
            tone={!destructive && !soft && !premium ? tone : undefined}
            size="lg"
            disabled={busy}
            loading={busy && pressed === 'confirm'}
            silentDisabled={pressed !== 'confirm'}
          />
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 24,
    paddingTop: 12,
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
    fontSize: FSIZE.h2,
    fontWeight: WEIGHT.bold,
    color: BLACK,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  desc: {
    marginTop: 8,
    fontSize: FSIZE.body,
    lineHeight: 22,
    color: BLACK_STRONG,
    textAlign: 'center',
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SINGLE,
    marginTop: DOUBLE,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: RADII.sm,
    borderWidth: 1.5,
    borderColor: BLACK_MID,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  checkboxTick: {
    fontSize: FSIZE.small,
    lineHeight: 14,
    color: WHITE,
    fontWeight: WEIGHT.bold,
    includeFontPadding: false,
  },
  skipLabel: {
    fontSize: FSIZE.base,
    color: BLACK_STRONG,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  slot: { flex: 1 },
})
