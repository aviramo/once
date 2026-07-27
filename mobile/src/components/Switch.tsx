import { View, StyleSheet, I18nManager } from 'react-native'
import { SWITCH, SWITCH_TRAVEL, RADII } from '../tokens'
import { GREEN, BLACK_SOFT, SURFACE, SCRIM_BLACK } from '../colors'

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
    <View style={[s.track, { backgroundColor: value ? GREEN : BLACK_SOFT }]}>
      <View style={[s.knob, { transform: [{ translateX: knobX }] }]} />
    </View>
  )
}

const s = StyleSheet.create({
  track: {
    width: SWITCH.width, height: SWITCH.height, borderRadius: RADII.pill,
    padding: SWITCH.pad, justifyContent: 'center',
  },
  knob: {
    width: SWITCH.knob, height: SWITCH.knob, borderRadius: SWITCH.knob / 2,
    backgroundColor: SURFACE,
    shadowColor: SCRIM_BLACK, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2, elevation: 2,
  },
})
