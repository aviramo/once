// ── WarmCard ──────────────────────────────────────────────────────────────
//
// A PROFILE ARRIVES WHOLE. A card is a face, and a face that assembles itself
// while it rises — a blur, then a spinner, then a photograph landing a beat
// after the card has already stopped moving — is the app showing its work.
// So the photos are painted where nobody can see them, and only then is the
// card allowed on screen.
//
// It is TWO stages, and both of them are load-bearing:
//   1. `Image.prefetch` puts every photo on the disk. Nothing is mounted yet:
//      mounting first would put the network fetch inside the very render whose
//      paint is being waited on, and the card would report "ready" one photo at
//      a time over the whole download.
//   2. A hidden MatchCard — the SAME component, at the SAME size, so every
//      image decodes at the dimensions it will be drawn at — paints them out of
//      that cache and says when the last one has settled (`onReady`).
// Then `onPainted` fires, and the host reveals the real card: its images come
// straight out of the memory cache, so they are there on the first frame of the
// entrance (expo-image's `cachePolicy="memory-disk"`, and deliberately no
// `transition` — a fade would be one more thing arriving late).
//
// Two hosts: page1's next candidate, held back while the current one is still
// on screen, and the incoming INVITATION, which is simply withheld until it can
// rise complete (user directive 2026-08-02). Never two implementations of this
// — that is what this file is for.

import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { MatchCard } from './MatchCard'
import { matchImageUrls } from '../lib/profileImages'
import { WARM_CARD_MAX_MS } from '../tokens'
import { PAGE } from '../colors'
import type { LocationType, Profile } from '../stores/userStore'

export function WarmCard({
  match,
  cardHeight,
  viewerLocationType,
  onPainted,
}: {
  /** The candidate being warmed. Its `user_id` is the identity: a snapshot of
   *  the same person refreshing (a new `last_seen`) is not a new warm-up. */
  match: Profile
  /** The height the visible card will be laid out against, so the photos decode
   *  at the size they will be drawn at. */
  cardHeight: number
  viewerLocationType?: LocationType | null
  /** Fired with the warmed user's id once every photo has painted — or once the
   *  backstop has run out. Called at least once per candidate and possibly more
   *  than once (a photo that fails and retries settles late), so a host must be
   *  idempotent about it. */
  onPainted: (userId: string) => void
}) {
  // Held in a ref for the same reason every callback here is: the warm-up must
  // not restart because a host re-rendered.
  const onPaintedRef = useRef(onPainted)
  onPaintedRef.current = onPainted
  // The candidate whose photos are on the disk and may now be painted. Null for
  // the whole of stage 1 — see the note above for why nothing mounts before it.
  const [cached, setCached] = useState<Profile | null>(null)
  const userId = match.user_id
  useEffect(() => {
    let cancelled = false
    setCached(null)
    const done = () => { if (!cancelled) onPaintedRef.current(userId) }
    const urls = matchImageUrls(match)
    // Nothing to wait for. A profile with no photos is already whole.
    if (urls.length === 0) {
      done()
      return () => { cancelled = true }
    }
    const mount = () => { if (!cancelled) setCached(match) }
    // Either outcome mounts stage 2: a prefetch that FAILED is not a photo that
    // cannot load — the card's own images retry (LoadingImage) and settle even
    // when they give up, which is what keeps a broken photo from being a card
    // that never arrives.
    Image.prefetch(urls).then(mount, mount)
    // AND THE CARD IS NEVER WITHHELD FOR EVER. Waiting is only ever better than
    // showing a half-made card for as long as the photos are actually coming; a
    // fetch that hangs must not cost the user the profile itself — least of all
    // an INVITATION, which is a person waiting on an answer with a clock
    // running. Past this the card goes up as it is, and whatever is still in
    // flight lands on it there.
    const backstop = setTimeout(done, WARM_CARD_MAX_MS)
    return () => { cancelled = true; clearTimeout(backstop) }
    // `match` is read for its photos only, and those belong to the id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!cached) return null
  return (
    // Invisible, and untouchable: it is laid out at the visible card's own size
    // (that is the point) and would otherwise be a full card sitting over the
    // one the user is looking at.
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.card}>
        <MatchCard
          match={cached}
          viewerLocationType={viewerLocationType}
          bottomInset={0}
          bottomChrome
          cardHeight={cardHeight}
          onReady={() => onPaintedRef.current(userId)}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  card: {
    flex: 1,
    backgroundColor: PAGE,
    overflow: 'hidden',
  },
})
