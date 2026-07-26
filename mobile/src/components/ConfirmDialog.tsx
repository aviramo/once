import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { Text, TextInput } from './AppText'
import { Button } from './Button'
import { BottomSheet } from './BottomSheet'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { SM, MD, LG, RADII, TEXT as FSIZE, WEIGHT, STROKE, lh } from '../tokens'
import { SURFACE, BLACK, WHITE, BLACK_STRONG, PRIMARY, BLACK_MID } from '../colors'
import { FIELD_SKIN } from '../field'
import { CloseIcon, CheckIcon } from './icons'

// Every decision popup in the app is this one component. The TITLE carries
// the action: there is no icon above it. The two buttons each carry a leading
// mark (cancel = ✕, confirm = ✓ by default, or a caller badge via
// `confirmIconStart`) so the label holds still when a tap swaps the icon for
// the spinner. The tinted icon badge that used to sit above the title was
// removed at the user's request (2026-07-21) — do not reintroduce it, here or
// in any other popup.
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
  /** Overrides the default confirm mark (✓) with a specific icon/badge before
   * the label — e.g. the broadcast popup showing the credit cost on its
   * confirm button (see CLAUDE.md "Credits economy"). Omit to get the default
   * check. */
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
                iconStart={<CloseIcon color={BLACK_STRONG} />}
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
                // Default confirm mark (✓) so the button carries an icon and
                // the label never shifts when it swaps for the spinner. A
                // caller that needs a specific badge (e.g. the credit cost)
                // overrides it via `confirmIconStart`.
                iconStart={confirmIconStart ?? <CheckIcon color={WHITE} />}
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
    // Regular purple, full strength: popup body text is the regular INK
    // purple, never a faded step (user directive 2026-07-26). The muted
    // BLACK_STRONG read as a washed-out grey on the beige sheet.
    marginTop: SM,
    fontSize: FSIZE.md,
    lineHeight: lh(FSIZE.md),
    color: BLACK,
    textAlign: 'center',
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
    marginTop: MD,
  },
  // The ONE outline in the app allowed to be darker than BORDER_SOFT, and it
  // is not emphasis: an unchecked box IS its rule — there is no fill, no label
  // inside it, nothing else to see — so at 20px the standard hairline leaves
  // the control invisible. Every other outlined thing has a shape or a label
  // carrying it and stays on BORDER_SOFT.
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
    color: BLACK,
  },
  noteInput: {
    ...FIELD_SKIN,
    marginTop: MD,
    minHeight: 96,
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
