# Making profile photos private

Plan of record for closing the last finding of the 2026-08-03 security review: the
`users` storage bucket is public, so a photo URL that has been seen once stays
readable forever — after a block, after the photo is deleted, after the viewer is
gone from your life. (A deleted ACCOUNT is already handled: its photos move to the
private `users-archive` the moment the account goes.)

Not a source of truth. The code is. This is here so the decision and its reasoning
survive the session it was made in.

## What the risk actually is, measured

Both of these were verified against production before planning:

- **Photo paths are unguessable.** `users/<user uuid>/normal/<photo uuid>.webp` —
  two independent random v4 UUIDs. There is nothing to enumerate.
- **The bucket cannot be listed anonymously** (400). The `users_select_public`
  RLS policy scopes listing to the caller's own folder.

So this is NOT "every photo is on the open internet". It is: **a URL that leaked
legitimately never expires.** Whoever you matched with can keep the link, and it
outlives the block, the unmatch and the delete. That is a real promise-breaking
gap and a small one, which is why the recommendation on 2026-08-03 was to leave it
and revisit when the product makes an explicit visibility promise.

## The finding that shapes the whole design

**Supabase signed URLs are not deterministic.** The token is a JWT carrying `iat`,
so signing the same object twice two seconds apart yields two different URLs
(measured). There is no "round the expiry to a stable window" trick available.

That matters because of an iron rule in this codebase: a card's photo URLs must be
**byte-identical** between the look-ahead prefetch and the render, or expo-image's
disk-cache key differs and the warm-up buys nothing — see `profileImages.ts`, whose
whole comment is about this, and `WarmCard`, which exists to paint a card out of
sight before it rises. Naively signing on every render defeats the warm-up and
re-downloads every photo constantly.

**And the server cannot sign at build time either.** The boards are projected in
SQL (`_watch_project`) and pushed over Realtime, not through the edge function.
Postgres cannot mint a storage token without reimplementing the signing key, which
is not a thing to build.

Therefore: **the client signs, and persists what it signed.**

## Target design

1. **The bucket goes private.** `users.public = false`.
2. **A storage RLS policy answers "may this viewer see this owner's photos"**, via
   one SECURITY DEFINER predicate `can_view_photos(viewer uuid, owner uuid)`.
3. **The client signs in batches** (`createSignedUrls`) with a long expiry and
   **persists the map `filename -> signed URL` on disk**, so the same string is
   reused across sessions until it nears expiry. That restores the byte-identical
   guarantee by construction: prefetch and render both read the one cached string.
4. **One module owns it**, replacing the eight call sites that build a URL by hand
   today. `publicImageUrl` / `matchImageUrls` / the three inline template literals
   all collapse into it.

### The hard part is the predicate, not the plumbing

`can_view_photos` has to say yes to every case the app legitimately draws a face
in, and each is a different source of truth:

| Case | Truth lives in |
|---|---|
| The candidate on my page1 / the inviter on my page2 | `watch` rows |
| My chat partner | `watch` / `relations.page1` |
| The next candidates warmed by the look-ahead | `app_find`'s `lookahead`, which is NOT a stored relation |
| A member of a circle I am in | `user_groups` |
| Someone who asked to join a circle I manage | `group_join_requests` |
| A mutual friend, a friend request | `friend_links`, `friend_requests` |
| My own photos, in the editor and the preview | self |

The **look-ahead is the awkward one**: those are people I have no relation to yet
— that is the point of warming them — so the predicate cannot see them. Two ways
out, to be decided when we get there: have `app_find` return the look-ahead already
signed (the edge function CAN sign, it holds the service role), or drop the
look-ahead warm for privacy and accept a colder first frame. **The first is
preferred** and is a small change, since the look-ahead already travels through the
edge function's response.

## Staging (Expand → Migrate → Contract)

The bucket flip is the breaking step and it comes LAST. Until it happens, both the
published build (public URLs) and the new build (signed URLs) work, because a
public bucket serves both.

- **Phase 1 — Expand (server, ships immediately, breaks nothing).**
  `can_view_photos` + the storage SELECT policy, both live while the bucket is
  still public and therefore inert. `app_find` starts returning signed look-ahead
  URLs alongside the filenames. Verifiable in isolation: sign as user A for user
  B's photo and assert allowed/denied across every row of the table above.

- **Phase 2 — Migrate (mobile, one build).** The signing module, the disk-persisted
  URL cache, and the eight call sites converted. The web admin console's two sites
  convert too — it runs as service role, so it signs without a predicate.
  Ships in an ordinary release; nothing user-visible changes.

- **Phase 3 — Contract (one line, weeks later).** `users.public = false`, once the
  live version floor is past the Phase 2 build. This is the only irreversible
  moment and the only one that can break a phone: **any device still on an older
  build loses every photo in the app instantly.** Gate it on the Play Console
  version distribution, not on a date. A `BACKWARD_COMPAT.md` entry tracks it.

Photos already uploaded need no migration: the objects and their paths are
unchanged, only the way they are read.

## Cost and residual risk

- Roughly a session for Phase 1, a session for Phase 2, minutes for Phase 3, plus
  weeks of waiting between 2 and 3.
- **A signed URL still leaks for as long as its expiry.** With a 7-day token, a
  copied link outlives a block by up to a week. Shorter expiry means more
  re-downloads; this is the one real dial and it should be set deliberately.
- Bandwidth rises: every rotation re-downloads photos that the disk cache would
  have served. The persisted URL map is what keeps this to once per expiry period
  rather than once per session.

## Status

Not started. Recommendation as of 2026-08-03 is to leave the bucket public until
the product makes an explicit "only my matches see my photos" promise; this
document exists so that the work can start from a decision rather than from a
blank page.
