// ── EditableText ────────────────────────────────────────────────────────────
//
// One inline text editor shared by the profile bio (MatchCard's on-photo /
// fallback bubble) and the group description (CirclesPage). The field is a
// multiline TextInput styled by the caller to look byte-identical to the
// read-only text it replaces; tapping drops the caret natively.
//
// LEAVING THE FIELD SAVES IT, AND THERE IS NO UPDATE BUTTON (user directive
// 2026-08-03). A field that grew a footer with a button in it made the one
// thing the user had already done — type — need a second act to count, and the
// three ways out of a field that never pass through that button (BACK, the
// IME's hide key, a tap outside) all threw the edit away silently. The edit
// ends where the keyboard does, by every route identically, and what is in the
// field at that moment is what is saved. A value that cannot be saved (below
// min, over max, unchanged) reverts on the way out, exactly as before.
//
// There is NO character counter anywhere (user directive 2026-07-28): the cap
// is enforced silently by maxLength, never announced. What is left of the
// footer is the hint slot — the below-minimum requirement and a refusal — and
// it exists only when there is something in it to read.
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
import { View, StyleSheet, type StyleProp, type TextStyle, type TextInput as RNTextInput, type ViewStyle } from 'react-native'
import { Text, TextInput } from './AppText'
import { LineProbe } from './GlyphSlot'
import { FONT_SCALE } from '../fonts'
import { TEXT } from '../tokens'
import { normalizeBio } from '../lib/bio'
import { useKeyboardOpen } from '../hooks/useKeyboard'
import { INK_DIM, NEGATIVE } from '../colors'

export type EditableTextProps = {
  /** Last committed value (server truth, '' when unset). */
  value: string
  /** Server round-trip in flight — locks the field. */
  saving?: boolean
  /** Fired when the edit ENDS, with the normalized value, or null when
   *  allowEmpty and the field was cleared. Not fired at all when nothing
   *  changed or the draft is unsaveable. May return the save's promise: a
   *  REJECTION is what tells the field the server refused it. */
  onCommit: (next: string | null) => void | Promise<unknown>
  /** Shown under the field when the last commit was refused. The refused text
   *  stays in the field so it can be corrected rather than retyped. Omit and a
   *  refusal is silent (the text still stays). */
  errorLabel?: string
  /** Minimum trimmed length to allow a save (0 with allowEmpty = optional). */
  min: number
  max: number
  placeholder: string
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
  /** The edit STARTED. For a host that has to stand something down while a
   *  field is open (the card's reel suspends paging). NEVER a request to
   *  scroll: no text field in the app moves its page (user directive
   *  2026-08-03). */
  onEditStart?: () => void
  /** WHILE EDITING, the field is at most this many lines tall and scrolls
   *  inside itself. A field that grows without a ceiling carries its own last
   *  line down under the keyboard with every line typed, and on a surface whose
   *  scroll is a paged photo reel there is nothing left to scroll it back into
   *  view with. Omitted, the field grows with its text as before. The cap
   *  is a MEASURED line box (LineProbe), never `lh()` arithmetic: a declared
   *  line height and a painted one part company on a large-font device. */
  maxLines?: number
  placeholderTextColor?: string
  inputStyle?: StyleProp<TextStyle>
  footerStyle?: StyleProp<ViewStyle>
  hintStyle?: StyleProp<TextStyle>
}

export function EditableText({
  value, saving, onCommit, errorLabel, min, max, placeholder, minLabel,
  textAlign, allowEmpty = false, singleLine = false,
  keyboardType = 'default', autoCapitalize = 'sentences', onEditStart, maxLines,
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
  // NOT while a commit is in flight either: the commit is FIRED by the blur, so
  // the field is already unfocused a beat BEFORE the round trip lands — so this used to repaint the freshly-typed text with the
  // still-stale `value`, and the field sat empty until the server echoed back
  // (the "it vanished and then appeared" group link, 2026-07-29). Skipped while
  // `failed` for the same reason: the refused text stays put to be fixed.
  useEffect(() => {
    if (focused || saving || committing || failed) return
    committedRef.current = value
    setDraft(value)
  }, [value, focused, saving, committing, failed])

  const belowMin = draft.trim().length < min
  const showError = failed && !!errorLabel
  // Only what the reader can act on: the requirement he is short of, or the
  // refusal. Both are absent most of the time, and then there is no footer.
  const hint = showError ? errorLabel : belowMin && focused ? (minLabel ?? '') : ''

  // The save routine, fired when the edit ends.
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
    // the field is dirty again and the next departure retries — while LEAVING
    // the refused text on screen with errorLabel under it, to be corrected
    // rather than retyped. It must never revert in silence.
    // An accepted one lets the sync above run again, which is how the server's
    // own normalization (a bare host coming back with its https://) repaints.
    Promise.resolve(onCommit(allowEmpty && next.trim() === '' ? null : next))
      .then(
        () => setCommitting(false),
        () => { committedRef.current = prev; setFailed(true); setCommitting(false) },
      )
  }, [draft, onCommit, min, max, allowEmpty])

  // LEAVING THE FIELD IS THE SAVE. Whatever route ended the edit — a tap
  // outside, BACK, the IME's hide key, focus moving to the next field — the
  // draft is committed here and nowhere else. An unsaveable draft (unchanged,
  // below min, over max) is reverted by commit() itself, so leaving is always
  // safe. The refusal a commit may earn is NOT cleared here: it is raised after
  // this handler has run and must survive the blur that caused it.
  const handleBlur = useCallback(() => {
    setFocused(false)
    commit()
  }, [commit])

  // THE KEYBOARD GOING AWAY ENDS THE EDIT (user directive 2026-07-30) — by
  // whichever of the three routes took it away: BACK, the IME's own hide key,
  // or a tap outside the field. Only the last of those passes through JS
  // (`Keyboard.dismiss()`, which blurs); the other two are handled by the IME
  // and never reach the app at all, so they used to leave the field FOCUSED,
  // with its caret standing under a keyboard that was no longer there — the app
  // believing the edit was over (paging back on, taps live again) while the
  // platform believed it was still running. The field ends it itself, here, for
  // the bio and for all three group editors at once — and since leaving the
  // field is what SAVES it, this is also how those two routes commit.
  //
  // A field that never saw the keyboard is left alone: focus lands one beat
  // BEFORE the keyboard starts moving, and blurring in that window would undo
  // the tap that opened the editor.
  const inputRef = useRef<RNTextInput | null>(null)
  const hadKeyboardRef = useRef(false)
  const keyboardOpen = useKeyboardOpen()
  useEffect(() => {
    if (keyboardOpen) { hadKeyboardRef.current = true; return }
    const had = hadKeyboardRef.current
    hadKeyboardRef.current = false
    if (had && focused) inputRef.current?.blur()
  }, [keyboardOpen, focused])

  // The line-height cap. The probe carries the FIELD's own fontSize — the caller
  // styles this input to look byte-identical to the text it replaces, so the
  // size has to come off that style rather than from a default nobody passed.
  const [lineH, setLineH] = useState(0)
  const probeSize = StyleSheet.flatten(inputStyle)?.fontSize ?? TEXT.md
  const capped = maxLines != null && focused && lineH > 0
  const capStyle = capped ? { maxHeight: lineH * maxLines! } : null

  return (
    <>
      {/* Out of flow: a measuring stick, not content. */}
      {maxLines != null ? (
        <LineProbe size={probeSize} cap={FONT_SCALE} style={styles.probe} onHeight={setLineH} />
      ) : null}
      <TextInput
        ref={inputRef}
        style={[inputStyle, capStyle]}
        value={draft}
        onChangeText={v => {
          setFailed(false)
          setDraft((singleLine ? v.replace(/\n/g, '') : v).slice(0, max))
        }}
        maxLength={max}
        multiline={!singleLine}
        // The field grows with its text and never scrolls — EXCEPT once it has
        // hit its line cap, where scrolling inside itself is the only way the
        // rest of the text stays reachable.
        scrollEnabled={capped}
        textAlign={textAlign}
        textAlignVertical="top"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize !== 'none'}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        editable={!saving}
        onFocus={() => { setFocused(true); onEditStart?.() }}
        onBlur={handleBlur}
      />
      {/* The hint slot, and only when it has something to say: the refusal
          (which outlives the keyboard — it is what has to be corrected), else
          the below-minimum requirement. Never a count of what is left; the cap
          is silent. */}
      {hint ? (
        <View style={footerStyle}>
          <Text style={[hintStyle, showError && styles.error]}>{hint}</Text>
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  // A refusal reads at full strength — the hint beside it is deliberately
  // quieter (INK_MUTED), and this one is the reason the save did not happen.
  error: { color: NEGATIVE },
  // Zero-size and out of flow, so the probe adds nothing to the field's box.
  probe: { position: 'absolute', width: 0 },
})
