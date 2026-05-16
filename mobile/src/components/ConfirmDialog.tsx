import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { Text } from './AppText'
import { Button } from './Button'
import { BottomSheet } from './BottomSheet'
import { SM, MD, LG, RADII, TEXT as FSIZE, WEIGHT, STROKE, lh } from '../tokens'
import { BLACK, WHITE, BLACK_STRONG, PRIMARY, PRIMARY_BG, BLACK_MID } from '../colors'

// Every decision popup in the app is this one component. The action is
// always communicated by a single carefully-chosen icon in the tinted
// circle above the title — never by the buttons. The primary button is a
// plain PRIMARY label with no icon in every scenario (destructive or not);
// the icon at the top is what tells the user what they're about to do.
//
// Informational variant: omit both `confirmLabel` and `cancelLabel` and the
// button row is dropped entirely — the sheet becomes a notice the user
// dismisses by swiping down / tapping the backdrop (pass `draggable`).
export function ConfirmDialog({
  visible,
  title,
  description,
  cancelLabel,
  confirmLabel,
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
  /** Omit (together with `cancelLabel`) for a button-less info popup. */
  confirmLabel?: string
  /** Action icon rendered in a tinted circle above the title. Required:
   * every dialog communicates its action through this icon, since the
   * buttons are uniform PRIMARY/secondary labels with no icons. Pass it
   * sized to the convention: `<XIcon color={PRIMARY} size={32} />`. */
  icon: ReactNode
  onCancel?: () => void
  onConfirm?: () => void
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
    if (onCancel) onCancel()
    else onConfirm?.()
  }

  return (
    <BottomSheet
      visible={visible}
      onDismiss={dismiss}
      disableBackdropDismiss={busy}
      swipeToDismiss={!!draggable}
      dragHandle={!!draggable}
      // When draggable, the PRIMARY drag-handle bar (with its own top/bottom
      // margins) already supplies the top breathing room — drop the card's
      // own paddingTop so the gap above the icon isn't doubled up.
      contentStyle={[styles.card, draggable && styles.cardDraggable]}
    >
      <View style={styles.iconWrap}>
        <View style={styles.iconCircle}>{icon}</View>
      </View>
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

      {(confirmLabel || cancelLabel) ? (
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
          {confirmLabel ? (
            <View style={[styles.slot, confirmFlex != null && { flex: confirmFlex }]}>
              <Button
                label={confirmLabel}
                onPress={() => { setPressed('confirm'); onConfirm?.() }}
                variant="primary"
                size="lg"
                disabled={busy}
                loading={busy && pressed === 'confirm'}
                silentDisabled={pressed !== 'confirm'}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: LG,
    paddingTop: MD,
  },
  cardDraggable: {
    paddingTop: 0,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: MD,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: PRIMARY_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FSIZE.xl,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  desc: {
    marginTop: SM,
    fontSize: FSIZE.md,
    lineHeight: lh(FSIZE.md),
    color: BLACK_STRONG,
    textAlign: 'center',
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
    marginTop: MD,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: RADII.sm,
    borderWidth: STROKE.thin,
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
    fontSize: FSIZE.sm,
    lineHeight: 14,
    color: WHITE,
    fontWeight: WEIGHT.extrabold,
    includeFontPadding: false,
  },
  skipLabel: {
    fontSize: FSIZE.sm,
    color: BLACK_STRONG,
  },
  row: {
    flexDirection: 'row',
    gap: MD,
    marginTop: MD,
  },
  slot: { flex: 1 },
})
