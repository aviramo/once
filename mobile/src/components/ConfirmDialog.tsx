import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { Text, TextInput } from './AppText'
import { Button } from './Button'
import { BottomSheet } from './BottomSheet'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { SM, MD, LG, RADII, RADIUS, TEXT as FSIZE, WEIGHT, STROKE, lh } from '../tokens'
import { GREEN, SURFACE, BLACK, WHITE, BLACK_STRONG, PRIMARY, BLACK_MID } from '../colors'

// Every decision popup in the app is this one component. The TITLE carries
// the action: there is no icon above it, and the buttons are plain labels in
// every scenario (destructive or not). The tinted icon badge that used to sit
// above the title was removed at the user's request (2026-07-21) — do not
// reintroduce it, here or in any other popup.
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
  confirmIconStart,
  confirmTone,
  onCancel,
  onConfirm,
  busy,
  skipToggle,
  noteInput,
  cancelFlex,
  confirmFlex,
  confirmDisabled,
  draggable,
}: {
  visible: boolean
  title: string
  // String, or rich content (e.g. a line with bold <Text> spans). Rendered
  // inside the shared centered `styles.desc` <Text>, so nested <Text> spans
  // inherit size/colour and only override what they set (weight/colour).
  description?: ReactNode
  cancelLabel?: string
  /** Omit (together with `cancelLabel`) for a button-less info popup. */
  confirmLabel?: string
  /** Opt-in icon/badge rendered INSIDE the confirm button before its label.
   * Deliberately breaks the "buttons carry no icon" convention for the one
   * case the user asked for it: the broadcast popup must show the credit
   * cost on its confirm button (see CLAUDE.md "Credits economy"). */
  confirmIconStart?: ReactNode
  /** Marks this popup's confirm as an INVITE action, which is the one case
   * that wears the orange instead of the default green. */
  confirmTone?: 'positive'
  onCancel?: () => void
  onConfirm?: () => void
  busy?: boolean
  skipToggle?: { label: string; checked: boolean; onToggle: () => void }
  /** Optional free-text field rendered between the description and the
   * buttons (same slot pattern as `skipToggle`). Used by the report flow so
   * the user can add a note. The value/handler are owned by the caller. */
  noteInput?: { value: string; onChangeText: (s: string) => void; placeholder: string; maxLength?: number }
  cancelFlex?: number
  confirmFlex?: number
  /** Disables the confirm button (faded look, no-op on press) on top of
   * `busy`. Used when the action is unavailable, e.g. the user can't afford
   * its credit cost — the popup stays open and informative (the cost badge
   * still shows) but the action can't be taken. */
  confirmDisabled?: boolean
  draggable?: boolean
}) {
  const [pressed, setPressed] = useState<'confirm' | 'cancel' | null>(null)
  useEffect(() => { if (!busy) setPressed(null) }, [busy])
  useEffect(() => { if (!visible) setPressed(null) }, [visible])

  // When this dialog hosts a text field (`noteInput`, e.g. the report flow),
  // lift the bottom-anchored sheet by exactly the keyboard height so the
  // field stays visible. Per-screen nudge — the global BottomSheet lift was
  // removed (see CLAUDE.md "Keyboard avoidance"); a single per-component
  // marginBottom does not over-shoot the way the old double-lift did.
  // The extra MD is breathing room: lifting by exactly the keyboard height
  // leaves the confirm button sitting flush on the top key row.
  const kbHeight = useKeyboardHeight()

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
      cardWrapStyle={noteInput && kbHeight > 0 ? { marginBottom: kbHeight + MD } : undefined}
      // When draggable, the PRIMARY drag-handle bar (with its own top/bottom
      // margins) already supplies the top breathing room — drop the card's
      // own paddingTop so the gap above the icon isn't doubled up.
      contentStyle={[styles.card, draggable && styles.cardDraggable]}
    >
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

      {noteInput && (
        <TextInput
          style={styles.noteInput}
          value={noteInput.value}
          onChangeText={noteInput.onChangeText}
          placeholder={noteInput.placeholder}
          placeholderTextColor={BLACK_MID}
          maxLength={noteInput.maxLength ?? 500}
          multiline
          textAlignVertical="top"
          editable={!busy}
        />
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
                iconStart={confirmIconStart}
                tone={confirmTone}
                onPress={() => { setPressed('confirm'); onConfirm?.() }}
                variant="primary"
                size="lg"
                disabled={busy || confirmDisabled}
                loading={busy && pressed === 'confirm'}
                // When `confirmDisabled` (e.g. the user can't afford the
                // action's credit cost) show the faded disabled look and let
                // the tap do nothing; otherwise keep the in-flight lockout
                // silent (no gray flicker) exactly as before.
                silentDisabled={!confirmDisabled && pressed !== 'confirm'}
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
    backgroundColor: SURFACE,
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
  noteInput: {
    marginTop: MD,
    minHeight: 96,
    backgroundColor: SURFACE,
    borderWidth: STROKE.thin,
    borderColor: GREEN,
    borderRadius: RADIUS,
    paddingHorizontal: MD,
    paddingVertical: SM,
    fontSize: FSIZE.md,
    lineHeight: lh(FSIZE.md),
    color: BLACK,
  },
  row: {
    flexDirection: 'row',
    gap: MD,
    marginTop: MD,
  },
  slot: { flex: 1 },
})
