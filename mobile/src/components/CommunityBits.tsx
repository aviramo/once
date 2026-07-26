// Shared community primitives — the member/owner Avatar and the member-count
// label — used by the Communities sheet AND the group chip's shared-groups
// popup. Extracted here so both surfaces render the exact same avatar and count
// wording (DRY: one definition, two call sites).
import { Image, View } from 'react-native'
import { Path } from 'react-native-svg'
import { Text } from './AppText'
import { Glyph } from './icons'
import { publicImageUrl } from '../lib/api'
import type { MemberImage } from '../lib/communities'
import { WEIGHT } from '../tokens'
import { GREEN, WHITE } from '../colors'
import { t } from '../i18n'

export const AVATAR = 40

// A member's / person's / owner's main photo, or their initial on a brand
// ground. The literal '★' name renders the friends star instead of a letter.
export function Avatar({ userId, name, image, size = AVATAR }: { userId: string; name: string | null; image: MemberImage; size?: number }) {
  const uri = image?.normal ? publicImageUrl(userId, 'normal', image.normal) : null
  const label = (name ?? '').trim()
  const initial = label.charAt(0) || '?'
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
      {label === '★' ? (
        <StarGlyph size={size * 0.5} color={WHITE} />
      ) : (
        <Text style={{ color: WHITE, fontWeight: WEIGHT.extrabold, fontSize: size * 0.4 }}>{initial}</Text>
      )}
    </View>
  )
}

export const StarGlyph = ({ size, color }: { size: number; color: string }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
    <Path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95z" />
  </Glyph>
)

// "N members" / "1 member", the shared count wording.
export const memberLabel = (n: number) =>
  n === 1 ? t('communities.oneMember') : t('communities.membersCount').replace('{count}', String(n))
