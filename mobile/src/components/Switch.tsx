import React from 'react'
import { View, StyleSheet, I18nManager, Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { tap } from '../lib/haptics'
import { SWITCH, SWITCH_TRAVEL, RADII, SM, MD, TEXT, lh } from '../tokens'
import { INK, INK_MUTED, SURFACE_SUNK, SURFACE, SHADOW_BLACK } from '../colors'

// The ONE on/off switch: a track with a knob that slides to the far end when
// on. Purely presentational — it renders state and nothing else, so the row
// that owns it stays the tap target (a switch beside a label must toggle when
// the LABEL is tapped too). Every toggle in the app is this component; do not
// hand-roll a second track+knob.
//
// OFF always rests at the knob's natural layout position (translateX 0): the
// start edge, which is the left in LTR and the right in RTL — layout flips
// under RTL, transforms do not. ON slides toward the opposite end, so the
// switch mirrors correctly in Hebrew (the knob travels left when it turns on).
export function Switch({ value }: { value: boolean }) {
  const knobX = value ? (I18nManager.isRTL ? -SWITCH_TRAVEL : SWITCH_TRAVEL) : 0
  return (
    <View style={[s.track, { backgroundColor: value ? INK : SURFACE_SUNK }]}>
      <View style={[s.knob, { transform: [{ translateX: knobX }] }]} />
    </View>
  )
}

// THE labelled toggle: a label with the switch opposite it on the SAME line,
// and the sentence that explains the setting running the full width beneath
// them (user directive 2026-07-29 — the switch used to sit opposite the whole
// text block, squeezing a long sub into a narrow column beside it). The whole
// thing is the tap target. Every on/off setting in the app is this row — the
// family flags in the menu, a group's "hide me here" — so a toggle is a toggle
// wherever it appears and a variant is a style prop, never a second row.
export function ToggleRow({ label, sub, value, onValueChange, style }: {
  label: string
  /** What the setting does, under the label. Omitted where the label says it. */
  sub?: string
  value: boolean
  onValueChange: (v: boolean) => void
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      style={[s.row, style]}
      onPress={() => { tap(); onValueChange(!value) }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={s.head}>
        <Text style={s.rowLabel}>{label}</Text>
        <Switch value={value} />
      </View>
      {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: { gap: SM, paddingVertical: SM, paddingHorizontal: MD },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: MD,
  },
  rowLabel: { flex: 1, minWidth: 0, fontSize: TEXT.md, color: INK },
  rowSub: { fontSize: TEXT.sm, color: INK_MUTED },
  track: {
    width: SWITCH.width, height: SWITCH.height, borderRadius: RADII.pill,
    padding: SWITCH.pad, justifyContent: 'center',
  },
  knob: {
    width: SWITCH.knob, height: SWITCH.knob, borderRadius: SWITCH.knob / 2,
    backgroundColor: SURFACE,
    shadowColor: SHADOW_BLACK, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2, elevation: 2,
  },
})
