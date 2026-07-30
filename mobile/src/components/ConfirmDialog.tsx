import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, TouchableOpacity } from 'react-native'
import { Text, TextInput } from './AppText'
import { Button } from './Button'
import { BottomSheet, SheetTitle, SheetDesc, SheetActions } from './BottomSheet'
import { SM, MD, RADII, TEXT, WEIGHT, STROKE, SHEET_GAP, lh } from '../tokens'
import { SURFACE, INK, WHITE, INK_SUBTLE, INK_DIM } from '../colors'
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
   * that wears the positive tone instead of the default one. */
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
      // No frame and no keyboard lift of its own. The gutter, the air above the
      // title and the air under the buttons are the sheet's, one set of values
      // for every popup in the app (BottomSheet.tsx), and the sheet stands itself
      // on top of the keyboard (CLAUDE.md "Keyboard"). This dialog therefore
      // passes no `contentStyle` at all — it used to declare LG sides and its own
      // paddingTop, which is why it sat at a different indent and a different
      // height from the sheets it stands beside.
    >
      <SheetTitle>{title}</SheetTitle>
      {description ? <SheetDesc>{description}</SheetDesc> : null}

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
          placeholderTextColor={INK_DIM}
          maxLength={noteInput.maxLength ?? 500}
          multiline
          textAlignVertical="top"
          editable={!busy}
        />
      )}

      {(confirmLabel || cancelLabel) ? (
        <SheetActions row>
          {cancelLabel ? (
            <View style={[styles.slot, cancelFlex != null && { flex: cancelFlex }]}>
              <Button
                label={cancelLabel}
                iconStart={<CloseIcon color={INK_SUBTLE} />}
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
        </SheetActions>
      ) : null}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  // A body block under the description — the popup's one between-blocks gap, not
  // a number this file gets to pick.
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
    marginTop: SHEET_GAP.block,
  },
  // The ONE outline in the app allowed to be darker than LINE, and it
  // is not emphasis: an unchecked box IS its rule — there is no fill, no label
  // inside it, nothing else to see — so at 20px the standard hairline leaves
  // the control invisible. Every other outlined thing has a shape or a label
  // carrying it and stays on LINE.
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: RADII.sm,
    borderWidth: STROKE.thin,
    borderColor: INK_DIM,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: INK,
    borderColor: INK,
  },
  checkboxTick: {
    // One glyph inside a fixed 20px box: the line box equals the glyph, so
    // lineHeight tracks the font size instead of the 1.4x body ratio.
    fontSize: TEXT.md,
    lineHeight: TEXT.md,
    color: WHITE,
    fontWeight: WEIGHT.medium,
    includeFontPadding: false,
  },
  skipLabel: {
    fontSize: TEXT.md,
    color: INK,
  },
  noteInput: {
    ...FIELD_SKIN,
    marginTop: SHEET_GAP.block,
    minHeight: 96,
    paddingHorizontal: MD,
    paddingVertical: SM,
    fontSize: TEXT.md,
    color: INK,
  },
  slot: { flex: 1 },
})
