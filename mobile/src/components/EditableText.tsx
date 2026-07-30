// ── EditableText ────────────────────────────────────────────────────────────
//
// One inline text editor shared by the profile bio (MatchCard's on-photo /
// fallback bubble) and the group description (CommunitiesPage). The field is a
// multiline TextInput styled by the caller to look byte-identical to the
// read-only text it replaces; tapping drops the caret natively. While focused,
// a footer bar carries an explicit Update button — the ONLY save path — plus the
// below-minimum hint when there is one. There is NO character counter anywhere
// (user directive 2026-07-28): the cap is enforced silently by maxLength, never
// announced. Leaving the field without pressing Update (blur / keyboard
// dismissed / focus lost) discards the edit and reverts to the last committed
// value. Nothing is saved on blur.
//
// A commit the SERVER refuses (onCommit's promise rejects) leaves the refused
// text in the field with `errorLabel` under it, so it can be corrected instead
// of retyped from memory — a silent revert reads as "the app won't save this"
// with no way to find out why (the group link, 2026-07-29).
//
// Behavior lives here once; each surface passes its own min/max/labels/styles.
// The bio wrapper (BioField in MatchCard) keeps the card pixel-identical; the
// group description passes allowEmpty so a cleared field commits null.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Keyboard, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Text, TextInput } from './AppText'
import { Button } from './Button'
import { normalizeBio } from '../lib/bio'
import { useFocusedFieldFooter } from '../hooks/useKeyboard'
import { INK_DIM, NEGATIVE } from '../colors'

// The footer's measured height, remembered across instances and focuses. The
// keyboard's reveal needs it at the instant the field takes focus, and on the
// very first focus of a session the footer has not been laid out yet — every
// focus after that starts from the real number instead of guessing.
let lastFooterHeight = 0

export type EditableTextProps = {
  /** Last committed value (server truth, '' when unset). */
  value: string
  /** Server round-trip in flight — locks the field. */
  saving?: boolean
  /** Fired only by the Update button with the normalized value, or null when
   *  allowEmpty and the field was cleared. Never on blur. May return the save's
   *  promise: a REJECTION is what tells the field the server refused it. */
  onCommit: (next: string | null) => void | Promise<unknown>
  /** Shown under the field when the last commit was refused. The refused text
   *  stays in the field so it can be corrected rather than retyped. Omit and a
   *  refusal is silent (the text still stays). */
  errorLabel?: string
  /** Minimum trimmed length to allow a save (0 with allowEmpty = optional). */
  min: number
  max: number
  placeholder: string
  updateLabel: string
  /** Shown in the footer's hint slot while below min (ignored when min is 0). */
  minLabel?: string
  /** Physical alignment. Omit to follow the writing direction (RTL-aware) — the
   *  bio passes explicit left/center; the group description omits it. */
  textAlign?: 'left' | 'center'
  /** When true, an empty field is a valid save that commits null (clear). */
  allowEmpty?: boolean
  /** Single-line field (no newlines) — e.g. a group name. */
  singleLine?: boolean
  /** Keyboard shape for a field that isn't prose (the group link asks for the
   *  URL keyboard and no auto-capitalization). Both default to plain text. */
  keyboardType?: 'default' | 'url'
  autoCapitalize?: 'none' | 'sentences'
  /** Ask the parent to scroll this field above the keyboard (bio uses it). */
  onFocusRequested?: () => void
  placeholderTextColor?: string
  inputStyle?: StyleProp<TextStyle>
  footerStyle?: StyleProp<ViewStyle>
  hintStyle?: StyleProp<TextStyle>
}

export function EditableText({
  value, saving, onCommit, errorLabel, min, max, placeholder, updateLabel, minLabel,
  textAlign, allowEmpty = false, singleLine = false,
  keyboardType = 'default', autoCapitalize = 'sentences', onFocusRequested,
  placeholderTextColor = INK_DIM,
  inputStyle, footerStyle, hintStyle,
}: EditableTextProps) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  // The last commit was REFUSED by the server. Holds the field's text in place
  // (the refused text is what has to be corrected) and shows errorLabel.
  const [failed, setFailed] = useState(false)
  // This field's OWN "a commit is in flight" flag, deliberately not the caller's
  // `saving` prop: the caller flips its flag off in a `finally`, one microtask
  // BEFORE the rejection reaches us, so a render can land in between with the
  // save neither running nor failed. Ours is cleared in the same handler that
  // records the outcome, so the two are always one render.
  const [committing, setCommitting] = useState(false)
  // Last value we consider authoritative locally — server truth until the user
  // commits a change. Kept in a ref so blur logic reads the latest.
  const committedRef = useRef(value)

  // External value changes (Realtime refresh) sync into the draft only while
  // not editing, so a server echo can't yank text out from under the caret.
  //
  // NOT while a commit is in flight either: pressing Update dismisses the
  // keyboard, and the blur that follows unfocuses the field a beat BEFORE the
  // round trip lands — so this used to repaint the freshly-typed text with the
  // still-stale `value`, and the field sat empty until the server echoed back
  // (the "it vanished and then appeared" group link, 2026-07-29). Skipped while
  // `failed` for the same reason: the refused text stays put to be fixed.
  useEffect(() => {
    if (focused || saving || committing || failed) return
    committedRef.current = value
    setDraft(value)
  }, [value, focused, saving, committing, failed])

  const normalizedDraft = normalizeBio(draft)
  const trimmedLen = draft.trim().length
  const belowMin = trimmedLen < min
  // Cap the SAVE too, not only typing: an existing server value that is over
  // max (out-of-band write, older policy) must not be re-committed as-is.
  // normalizeBio only shrinks, so it is the true post-save length.
  const overMax = normalizedDraft.length > max
  const dirty = normalizedDraft !== normalizeBio(committedRef.current)
  const canSave = !belowMin && !overMax && dirty && !saving && !committing
  const showError = failed && !!errorLabel

  // The save routine, fired only by the Update button (never on blur).
  const commit = useCallback(() => {
    const next = normalizeBio(draft)
    const prev = normalizeBio(committedRef.current)
    if (next === prev) { setDraft(committedRef.current); return }
    // Below the minimum → discard, restore previous (min 0 with allowEmpty lets
    // a fully-cleared field through as a null commit).
    if (next.trim().length < min) { setDraft(committedRef.current); return }
    if (next.length > max) { setDraft(committedRef.current); return }
    committedRef.current = next
    setDraft(next)
    setFailed(false)
    setCommitting(true)
    // The commit is usually a server round trip, and the server is the only
    // one that knows whether the value is acceptable (a group link's shape
    // lives in the RPC). A refusal restores the previous committed value — so
    // the field is dirty again and Update re-arms — while LEAVING the refused
    // text on screen with errorLabel under it. It must never revert in silence.
    // An accepted one lets the sync above run again, which is how the server's
    // own normalization (a bare host coming back with its https://) repaints.
    Promise.resolve(onCommit(allowEmpty && next.trim() === '' ? null : next))
      .then(
        () => setCommitting(false),
        () => { committedRef.current = prev; setFailed(true); setCommitting(false) },
      )
  }, [draft, onCommit, min, max, allowEmpty])

  // Leaving without pressing Update discards the edit — and with it the refusal
  // it may have earned. (The blur that Update itself causes runs BEFORE the
  // round trip answers, so it never clears a message it is about to show.)
  const handleBlur = useCallback(() => {
    setFocused(false)
    setFailed(false)
    setDraft(committedRef.current)
  }, [])

  // The only save path: commit, then drop the keyboard. commit() sets
  // committedRef to the new value, so the blur that follows reverts to it
  // (a no-op) rather than throwing the fresh save away.
  const handleUpdate = useCallback(() => { commit(); Keyboard.dismiss() }, [commit])

  // Taking focus grows a footer UNDER the input, and the Update button in it is
  // the only save path — so it is part of what the keyboard must not cover. The
  // platform only reports the input's own frame, so the field declares the rest
  // itself (src/hooks/useKeyboard.ts).
  const [footerHeight, setFooterHeight] = useState(lastFooterHeight)
  useFocusedFieldFooter(footerHeight, focused)

  return (
    <>
      <TextInput
        style={inputStyle}
        value={draft}
        onChangeText={v => {
          setFailed(false)
          setDraft((singleLine ? v.replace(/\n/g, '') : v).slice(0, max))
        }}
        maxLength={max}
        multiline={!singleLine}
        scrollEnabled={false}
        textAlign={textAlign}
        textAlignVertical="top"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize !== 'none'}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        editable={!saving}
        onFocus={() => { setFocused(true); onFocusRequested?.() }}
        onBlur={handleBlur}
      />
      {focused || showError ? (
        <View
          style={footerStyle}
          onLayout={e => {
            const h = e.nativeEvent.layout.height
            if (h > 0 && h !== lastFooterHeight) { lastFooterHeight = h; setFooterHeight(h) }
          }}
        >
          {/* Hint slot: the refusal, else the below-minimum requirement. Never
              a count of what is left — the cap is silent. */}
          <Text style={[hintStyle, showError && styles.error]}>
            {showError ? errorLabel : belowMin ? (minLabel ?? '') : ''}
          </Text>
          {/* The refusal outlives the keyboard, so the footer can be on screen
              with nothing to press until the field is focused again. */}
          {focused ? <Button label={updateLabel} onPress={handleUpdate} size="md" disabled={!canSave} /> : null}
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  // A refusal reads at full strength — the hint beside it is deliberately
  // quieter (INK_MUTED), and this one is the reason the save did not happen.
  error: { color: NEGATIVE },
})
