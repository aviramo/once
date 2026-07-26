// ── EditableText ────────────────────────────────────────────────────────────
//
// One inline text editor shared by the profile bio (MatchCard's on-photo /
// fallback bubble) and the group description (CommunitiesPage). The field is a
// multiline TextInput styled by the caller to look byte-identical to the
// read-only text it replaces; tapping drops the caret natively. While focused,
// a footer bar carries a char counter and an explicit Update button — the ONLY
// save path. Leaving the field without pressing Update (blur / keyboard
// dismissed / focus lost) discards the edit and reverts to the last committed
// value. Nothing is saved on blur.
//
// Behavior lives here once; each surface passes its own min/max/labels/styles.
// The bio wrapper (BioField in MatchCard) keeps the card pixel-identical; the
// group description passes allowEmpty so a cleared field commits null.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Keyboard, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Text, TextInput } from './AppText'
import { Button } from './Button'
import { normalizeBio } from '../lib/bio'
import { BLACK_MID } from '../colors'

export type EditableTextProps = {
  /** Last committed value (server truth, '' when unset). */
  value: string
  /** Server round-trip in flight — locks the field. */
  saving?: boolean
  /** Fired only by the Update button with the normalized value, or null when
   *  allowEmpty and the field was cleared. Never on blur. */
  onCommit: (next: string | null) => void
  /** Minimum trimmed length to allow a save (0 with allowEmpty = optional). */
  min: number
  max: number
  placeholder: string
  updateLabel: string
  /** Shown in the counter slot while below min (ignored when min is 0). */
  minLabel?: string
  /** Physical alignment. Omit to follow the writing direction (RTL-aware) — the
   *  bio passes explicit left/center; the group description omits it. */
  textAlign?: 'left' | 'center'
  /** Remaining-chars threshold under which the counter takes the warn style. */
  warnAt?: number
  /** When true, an empty field is a valid save that commits null (clear). */
  allowEmpty?: boolean
  /** Single-line field (no newlines) — e.g. a group name. */
  singleLine?: boolean
  /** Ask the parent to scroll this field above the keyboard (bio uses it). */
  onFocusRequested?: () => void
  placeholderTextColor?: string
  inputStyle?: StyleProp<TextStyle>
  footerStyle?: StyleProp<ViewStyle>
  counterStyle?: StyleProp<TextStyle>
  counterWarnStyle?: StyleProp<TextStyle>
}

export function EditableText({
  value, saving, onCommit, min, max, placeholder, updateLabel, minLabel,
  textAlign, warnAt = 20, allowEmpty = false, singleLine = false, onFocusRequested,
  placeholderTextColor = BLACK_MID,
  inputStyle, footerStyle, counterStyle, counterWarnStyle,
}: EditableTextProps) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  // Last value we consider authoritative locally — server truth until the user
  // commits a change. Kept in a ref so blur logic reads the latest.
  const committedRef = useRef(value)

  // External value changes (Realtime refresh) sync into the draft only while
  // not editing, so a server echo can't yank text out from under the caret.
  useEffect(() => {
    if (!focused) {
      committedRef.current = value
      setDraft(value)
    }
  }, [value, focused])

  const trimmedLen = draft.trim().length
  const belowMin = trimmedLen < min
  const remaining = max - draft.length
  const dirty = normalizeBio(draft) !== normalizeBio(committedRef.current)
  const canSave = !belowMin && dirty && !saving

  // The save routine, fired only by the Update button (never on blur).
  const commit = useCallback(() => {
    const next = normalizeBio(draft)
    const prev = normalizeBio(committedRef.current)
    if (next === prev) { setDraft(committedRef.current); return }
    // Below the minimum → discard, restore previous (min 0 with allowEmpty lets
    // a fully-cleared field through as a null commit).
    if (next.trim().length < min) { setDraft(committedRef.current); return }
    committedRef.current = next
    setDraft(next)
    onCommit(allowEmpty && next.trim() === '' ? null : next)
  }, [draft, onCommit, min, allowEmpty])

  // Leaving without pressing Update discards the edit.
  const handleBlur = useCallback(() => {
    setFocused(false)
    setDraft(committedRef.current)
  }, [])

  // The only save path: commit, then drop the keyboard. commit() sets
  // committedRef to the new value, so the blur that follows reverts to it
  // (a no-op) rather than throwing the fresh save away.
  const handleUpdate = useCallback(() => { commit(); Keyboard.dismiss() }, [commit])

  const warn = !belowMin && remaining < warnAt

  return (
    <>
      <TextInput
        style={inputStyle}
        value={draft}
        onChangeText={v => setDraft((singleLine ? v.replace(/\n/g, '') : v).slice(0, max))}
        maxLength={max}
        multiline={!singleLine}
        scrollEnabled={false}
        textAlign={textAlign}
        textAlignVertical="top"
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        editable={!saving}
        onFocus={() => { setFocused(true); onFocusRequested?.() }}
        onBlur={handleBlur}
      />
      {focused ? (
        <View style={footerStyle}>
          <Text style={[counterStyle, warn && counterWarnStyle]}>
            {belowMin ? (minLabel ?? '') : remaining}
          </Text>
          <Button label={updateLabel} onPress={handleUpdate} size="md" disabled={!canSave} />
        </View>
      ) : null}
    </>
  )
}
