import { View, StyleSheet } from 'react-native'
import { CreditIcon } from './icons'
import { XS, RADII, ICON, CARD_SHADOW } from '../tokens'

// ── "THIS SPENDS A CREDIT" ─────────────────────────────────────────────────
// The mark that rides INSIDE an action, in place of its icon: the credits glyph,
// and nothing else.
//
// IT CARRIES NO NUMBER (user directive 2026-08-01). Every action in the app that
// spends anything spends exactly ONE — inviting, accepting, broadcasting — so
// the digit was the same character on every button in the app, and a quantity
// that never varies is not a quantity, it is decoration. (`CREDIT_COST` still
// states the amounts, because the SERVER charges them and the wallet has to
// agree; what is gone is painting them here.) The one action with a cost of 0 —
// cancelling, which forfeits the credit already held rather than charging a new
// one — simply renders no badge at all, which is what its call site decides.
//
// The capsule INVERTS its host, so the mark reads as its own object on a filled
// button: the caller passes both colours.
export function CreditCost({
  color,
  bg,
  lifted = false,
}: {
  /** Glyph colour. Match the host's label colour. */
  color: string
  /** Capsule fill — a faint tint of `color`, so the badge reads as a chip on the
   *  button. */
  bg: string
  /** IT IS FLOATING, so it casts what everything floating in this app casts
   *  (user directive 2026-08-01): `CARD_SHADOW`, the same lift the round button
   *  it rides and every on-photo chip carry, so the two discs read as one fabric
   *  off the image. Only for the badge that stands ON a photo — the one INSIDE a
   *  filled button is not lifted off anything and stays flat. */
  lifted?: boolean
}) {
  return (
    <View style={[styles.pill, lifted && styles.lift, { backgroundColor: bg }]}>
      <CreditIcon color={color} size={ICON.sm} />
    </View>
  )
}

const styles = StyleSheet.create({
  // A CIRCLE, not a capsule: what stands in it is one glyph and nothing else
  // since the number went (user directive 2026-08-01), and equal air on both
  // axes is what makes a lone mark read as centred in its own ground. The wide
  // box left over from the glyph+number days put the gem visibly off-centre on
  // the invitation's accept button.
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: XS,
    borderRadius: RADII.pill,
  },
  // The app's ONE lift for a tile lying on something (`CARD_SHADOW`), never
  // re-typed — see `lifted`.
  lift: { boxShadow: CARD_SHADOW },
})
