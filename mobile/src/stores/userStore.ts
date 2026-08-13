import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { createPersistedMap } from '../lib/persistedCache'
import { STORAGE } from '../keys'
import { MIN_PHOTOS } from '../lib/photos'
import type { FamilyData } from '../lib/family'

export interface Image {
  normal?: string
  hash: string
}

export interface Profile {
  created_at?: string | null
  user_id: string
  title: string
  name: string
  images: Image[]
  bio?: string | null
  family?: FamilyData | null
  /** How tall this person said he is, in CENTIMETRES — always, whatever units
   * the phone that entered it uses. What the reader SEES is his own device's
   * (see lib/height.ts → formatHeight), exactly as the distance chip works.
   * Absent = not stated, which the card reads as "no height half to the row". */
  height?: number | null
  /** Whether this person smokes. Three states: true, false, and ABSENT — a
   * question nobody answered is not a "no". */
  smokes?: boolean | null
  is_male?: boolean | null
  last_seen?: string | null
  push_enabled?: boolean | null
  distance?: number | null
  /** True when this side picked a manual address instead of GPS. When true,
   * the distance chip swaps the pin icon for a home icon — the distance was
   * computed against a fixed address, not the user's live location. Server
   * embeds this in make_profile when data.location_custom is true; absent
   * key means GPS mode. Kept for backward compat with the typed model below. */
  location_custom?: boolean | null
  /** Typed location anchor for this side: 'device' (live GPS), 'home', or
   * 'work'. Drives the distance chip icon (pin/home/work). Absent on
   * snapshots from a pre-typed build — use resolveLocationType(). */
  location_type?: LocationType | null
  // ── The circles we share (see lib/circles.ts → sharedCircle) ─────────
  // The card carries ONE chip for all of these: the smallest circle we share,
  // where "my friends" is a circle like any group. The server states the sizes,
  // the client applies the rule. Slim viewer-list entries strip all of them.
  /** Name of the SMALLEST group the viewer and this profile's subject both
   * belong to, NULL when none. */
  group_name?: string | null
  /** How many people are in that group — what ranks it against my friends
   * circle. Absent on a snapshot written before the server carried it. */
  group_members?: number | null
  /** Count of ADDITIONAL shared groups beyond the one named in `group_name`
   * (so 2 shared groups → 1); absent/NULL when the pair shares 0 or 1 groups. */
  group_extra?: number | null
  /** Name of a person the viewer and this profile's subject are BOTH friends
   * with, NULL when none. */
  friend_name?: string | null
  /** Count of ADDITIONAL mutual friends beyond the one named in `friend_name`
   * (so 3 mutual friends → 2); absent/NULL at 0 or 1. Exactly what
   * `group_extra` says about the groups: every mutual friend is a circle of its
   * own in the chip's "+N", because the popup gives each one its own row (user
   * directive 2026-07-30). Absent on a snapshot written before the server
   * carried it. */
  friend_extra?: number | null
}

export type LocationType = 'device' | 'home' | 'work'

/** Effective location anchor for a profile snapshot or the own-user profile.
 * Prefers the typed `location_type`; falls back to the legacy boolean
 * (`location_custom` true ⇒ home) for rows last written by a build that
 * predates the typed model. */
export function resolveLocationType(
  p: { location_type?: LocationType | null; location_custom?: boolean | null } | null | undefined,
): LocationType {
  const ty = p?.location_type
  if (ty === 'device' || ty === 'home' || ty === 'work') return ty
  return p?.location_custom ? 'home' : 'device'
}

// Server-side v3 page shapes. page2 is always an object (never an array).
type ServerWatchState = 'free' | 'watching' | 'waiting' | 'chat' | 'locked'
type ServerInviteState = 'free' | 'pending' | 'chat' | 'locked'

interface Watch {
  state: ServerWatchState
  profile?: Profile
  message?: string
  invited_at?: string
  expires_at?: string
  extended?: boolean
  /** Legacy synth: applyServerUser mirrors `message` (translated via MESSAGE_TO_LEGACY_EVENT) here so existing UI i18n lookups keep working. */
  event?: string
}

interface Invite {
  state: ServerInviteState
  profile?: Profile
  profiles?: Profile[]
  message?: string
  invited_at?: string
  expires_at?: string
  extended?: boolean
}

interface Pages {
  /** THE WIRE KEY STAYS `page1`. The published build reads it out of the user
   *  row and the DB's own triggers write it, so renaming it is an
   *  Expand → Migrate → Contract staged over weeks in exchange for a name
   *  nobody outside this file sees. It is translated to the app's own word
   *  ONCE, in writeCompat below, and everything above that line says `watch`. */
  page1: Watch
  /** THE WIRE KEY STAYS `page2`, for the reason `page1` above does. Translated
   *  to the app's own word once, in writeCompat. */
  page2: Invite
}

// Legacy synthesized invite-card shape for the page2 incoming invitation UI.
// Predates v3; the store derives it from the new page2 object so existing UI
// branches continue to work without per-component rewrites.
export type InviteCard = Profile & {
  state: 'pending' | 'missed' | 'fail'
  invited_at?: string
  expires_at?: string
  extended?: boolean
  message?: string
}

/**
 * Pages as the client sees them after applyServerUser runs. Carries
 * synthetic `match`, `watchers`, and a legacy-shaped `page2` (Profile[] |
 * InviteCard) for back-compat with UI code that predates v3.
 */
interface PagesCompat {
  /** The board of the person I am WATCHING — `page1` on the wire. */
  watch?: Watch
  /** The invitation standing on me — `page2` on the wire. */
  invite: Profile[] | InviteCard
  match?: Profile | null
  watchers?: Profile[]
  /** Raw v3 page2.state, preserved so UI can branch on `locked` separately
   * from the synthesized legacy shape (which folds locked-no-profile into
   * the empty watchers array). */
  inviteState?: ServerInviteState
  /** Raw v3 page2.message, when present. */
  inviteMessage?: string
  /** ISO timestamp of last `app_add` press; gates the page2 "Show me to people" cooldown. */
  last_add_at?: string
  /** Server-computed geo-availability gate (relations.availability), written
   * by app_availability/area_state. Absent = available (no enabled areas, or
   * not yet evaluated). Passed straight through: applyServerUser spreads the
   * raw server `relations`, so this unknown-to-the-shim key survives. */
  availability?: {
    state: 'available' | 'unavailable' | 'not_yet'
    starts_at?: string
    /** Why the server gated this user (set only when state ≠ available):
     * 'group' = not in any enabled group (→ request-to-join CTA),
     * 'push' = no notifications. Absent on pre-reason server builds. */
    reason?: 'group' | 'push'
    /** True once the user pressed "request to join" (relations.join_request
     * set). Swaps the join CTA for a "waiting for approval" state. */
    join_requested?: boolean
  }
  /** ISO timestamp the user pressed "request to join" (relations.join_request.at). */
  join_request?: { at?: string }
  /** Credits wallet (relations.credits). Like `availability` / `last_add_at`
   * it rides through untouched by the shim's raw-relations spread. */
  credits?: import('../lib/credits').CreditsWallet | null
  /** Referral tallies (relations.referral). `joined` counts friends who
   * installed AND completed a profile, i.e. referrals that actually paid out;
   * the server maintains it in _referral_settle so the credits sheet needs no
   * extra round trip and the number ticks up live over Realtime. */
  referral?: { joined?: number } | null
}

interface UserProfile {
  user_id: string
  name: string | null
  birth_date: string | null
  is_male: boolean | null
  is_for_male: boolean
  is_for_female: boolean
  age_from: number
  age_to: number
  range: number | null
  images: Image[]
  bio: string | null
  family: FamilyData | null
  /** Promoted from data.height / data.smokes — the two facts the card's height
   * row states. Same three-state shape they have on a Profile snapshot: null is
   * "not stated", and for smoking that is a different answer from `false`. */
  height: number | null
  smokes: boolean | null
  /** First day of the displayed week (0 = Sunday, 1 = Monday). Used by the
   * family/kids schedule UI to know which day to show in the leftmost column. */
  weekStart: number | null
  /** True when the user picked a manual address instead of the device's GPS.
   * Promoted from data.location_custom. While true the home shell suppresses
   * the location permission overlay and skips periodic /app/location pushes. */
  location_custom: boolean | null
  /** Human-readable label of the manually-picked address (e.g. "תל אביב").
   * Promoted from data.location_label. Null when device mode is active. */
  location_label: string | null
  /** Typed location anchor: 'device' (live GPS), 'home', or 'work'. Promoted
   * from data.location_type. Use resolveLocationType() to read with the
   * legacy location_custom fallback for pre-typed rows. */
  location_type: LocationType | null
  data?: { push_token?: { type: string; token: string } | null; role?: string | null; [key: string]: unknown } | null
  /** The user's own referral code, server-generated on insert. Packed into
   * the personal invite link (lib/links.ts referralUrl) and read back from
   * the Play install referrer on the invitee's first launch. Never entered by
   * hand. Null only on a row the server hasn't seeded yet. */
  referral_code?: string | null
  relations?: PagesCompat | null
  /** Synthesized legacy page1 state: 'watching' | 'waiting' | 'chat' | 'missed' | 'fail' | null. Derived from server's v3 page1.state + message via deriveCompat. */
  state: string | null
}

interface UserStore {
  profile: UserProfile | null
  loading: boolean
  /** True once the profile is known — the first fetch() completed (success or
   *  failure), OR hydrate() painted the last snapshot from disk. Boot routing
   *  (index.tsx) waits on this, so the disk hit is what lets a relaunch skip
   *  the `users` round trip before showing /home. */
  fetched: boolean
  /** True once an AUTHORITATIVE server answer has been applied — i.e. fetch()
   *  actually landed a row. Distinct from `fetched`, which hydrate() also sets
   *  from the disk snapshot: boot routing runs off the cached profile, so home
   *  can mount on a STALE state and see the first fetch reconcile it a moment
   *  later. Consumers that react to state CHANGES (home's chat-transition
   *  effect) use the false→true flip to tell that reconciliation apart from a
   *  live in-session transition. */
  serverSynced: boolean
  fetch: (userId: string) => Promise<void>
  /** Paint the last known profile from disk. Fills an EMPTY store only —
   *  a landed server answer always wins. */
  hydrate: (userId: string) => Promise<void>
  update: (patch: Partial<UserProfile>) => void
  applyServerUser: (data: Record<string, unknown> | null | undefined, source?: 'fetch' | 'invoke' | 'invoke:self' | 'realtime') => void
  clear: () => void
}

const CLIENT_AUTHORED: ReadonlyArray<keyof UserProfile> = [
  'images', 'bio', 'family', 'height', 'smokes',
  'is_for_male', 'is_for_female',
  'age_from', 'age_to', 'range',
  'weekStart',
  'location_custom', 'location_type', 'location_label',
]

let lastAppliedLastSeen = 0

// Last RAW server `relations` (v3 Pages, before deriveCompat overwrites page2
// with the legacy shape) delivered by Realtime/fetch. The trusted find/ignore
// path merges only the response's page1 over this so page2 (incoming invites /
// watcher list — only ever changed by OTHER users' RPCs, which don't bump our
// last_seen and so can't be ordered) stays Realtime-authoritative.
let lastRawRelations: Pages | null = null

// ── The echo of a board the user has already left ──────────────────────────
// A self-transition (find / ignore / pause / resume) is applied from its own
// response the instant it lands, but the DB write it made is ALSO broadcast
// over Realtime — and so was the write before it. Neither carries anything
// that can order them: `last_seen` is a presence column and none of these RPCs
// touches it, so the ordering guard above sees two events with the same stamp
// and takes whichever arrives last. When the earlier echo lands last the client
// is handed back the board it just left: pressing PAUSE mid-search stopped the
// search, the play button came back, and then the candidate's card jumped up
// for a second as the find's own echo arrived behind the pause's (reported
// 2026-08-03).
//
// So a self-transition records the page1 it REPLACED, and for a short window an
// incoming page1 identical to that one is ignored — it can only be the echo of
// the state we deliberately left. Everything else in the event (page2, the
// circles summary) is applied as usual: only the stale board is held back.
const P1_ECHO_WINDOW_MS = 6000
let stalePage1: { sig: string; until: number } | null = null
const page1Sig = (p1: unknown) => JSON.stringify(p1 ?? null)

const pending = new Map<keyof UserProfile, unknown>()

// ── Boot-paint cache for the user's own row ────────────────────────────────
// The profile decides EVERYTHING the first frame shows — /home vs /onboarding,
// and whether the chat sheet is in the tree at all. Holding it in memory only
// meant a relaunch sat on the hand-off cover for a full `users` round
// trip before anything, including the chat's own on-disk transcript, could even
// start loading. So the last snapshot is mirrored to disk and repainted on
// boot; the fetch that follows overwrites it (stale-while-revalidate).
//
// What is stored is the POST-compat UserProfile (state / match / watchers
// already derived), so hydrate is a straight assignment with nothing to re-run.
const isUserProfile = (v: unknown): v is UserProfile =>
  !!v && typeof v === 'object' && typeof (v as UserProfile).user_id === 'string'

const profileCache = createPersistedMap<UserProfile>(STORAGE.profilePrefix, isUserProfile)

const cacheProfile = (p: UserProfile | null | undefined) => {
  if (isUserProfile(p)) profileCache.set(p.user_id, p)
}

/** `last_seen` rides through applyServerUser's raw spread but isn't on the
 *  typed shape — read it defensively. */
const lastSeenOf = (p: UserProfile | null | undefined): number => {
  const v = (p as { last_seen?: string | null } | null | undefined)?.last_seen
  return v ? Date.parse(v) : 0
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The same value however its keys are spelled out. What needs it is the
 *  pending-retire check below: the client's own fields live in the `data`
 *  JSONB, and Postgres hands a jsonb object's keys back in ITS canonical order
 *  (shortest first), which is not the order the client wrote them in. So the
 *  `{normal, hash}` an added photo is stored as never matched the
 *  `{hash, normal}` that came back, the optimistic entry was never retired, and
 *  the client's own array went on outranking every server payload for the rest
 *  of the session — a photo edited on another device could not land. Only ever
 *  used on one field's value (an images array, a family object, a primitive),
 *  never on the whole profile: `sameForRender` compares the same OBJECT the
 *  store built a moment ago, where the ordering cannot differ. */
const stableKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stableKeys)
  if (!v || typeof v !== 'object') return v
  const o = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort()) out[k] = stableKeys(o[k])
  return out
}
const sameValue = (a: unknown, b: unknown) => equal(stableKeys(a), stableKeys(b))

// Fields that ride on the row but that NOTHING renders, so a row differing only
// in these is not a change as far as React is concerned. `last_seen` is the
// whole list: the edge function stamps it on EVERY request (app/index.ts), so a
// pure READ — a group's roster, the friends list, a search page — comes back as
// a "changed" row that differs from the one on screen in that one field. Only
// the ordering guard reads it, off the module counter above, which is updated
// before this comparison is ever reached.
const VOLATILE_FIELDS = ['last_seen'] as const
const withoutVolatile = (p: Record<string, unknown>) => {
  const copy = { ...p }
  for (const k of VOLATILE_FIELDS) delete copy[k]
  return copy
}
/** Would anything on screen differ? See VOLATILE_FIELDS. */
const sameForRender = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  equal(withoutVolatile(a), withoutVolatile(b))

// Messages whose page1 lock represents a failed action the user themselves
// initiated (so the UI shows it as 'fail' rather than 'missed').
const FAIL_MESSAGES = new Set(['invite', 'approve', 'extend'])

/**
 * Translates the server's v3 relations (page1.state + message, page2 with
 * state + profile/profiles/message) into the legacy shape the UI consumes:
 * - synthesized top-level `state` ('watching'|'waiting'|'chat'|'missed'|'fail'|null)
 * - synthesized `match` (chat partner profile)
 * - synthesized `watchers` (Profile[])
 * - legacy `page2` shape (array of Profile when free, InviteCard object when pending/locked)
 */
function deriveCompat(relations: Pages | null | undefined) {
  const page1 = relations?.page1
  const page2 = relations?.page2

  let state: string | null = null
  if (page1?.state === 'free') state = null
  else if (page1?.state === 'locked') {
    // locked without message = post-clear_watch (or brand-new user); UI treats as
    // null/HIDDEN so the search button shows. With a message, distinguish
    // user-initiated failures (fail) from things that happened to them (missed).
    if (!page1.message) state = null
    else state = FAIL_MESSAGES.has(page1.message) ? 'fail' : 'missed'
  } else if (page1?.state) state = page1.state

  const watchers: Profile[] = page2?.state === 'free' && Array.isArray(page2.profiles)
    ? (page2.profiles as Profile[])
    : []

  // Match represents the other person whose card the home pane is showing.
  // After clear_watch, page1 stays {state: 'locked'} with profile still attached
  // server-side, but synthesized state goes to null — the card should slide
  // out. Gating match on state prevents the locked-no-message profile from
  // keeping the card mounted.
  const match: Profile | null = state && page1?.profile ? (page1.profile as Profile) : null

  let legacyInvite: Profile[] | InviteCard
  if (page2?.state === 'pending' && page2.profile) {
    legacyInvite = {
      ...(page2.profile as Profile),
      state: 'pending',
      ...(page2.invited_at ? { invited_at: page2.invited_at } : {}),
      ...(page2.expires_at ? { expires_at: page2.expires_at } : {}),
      ...(page2.extended !== undefined ? { extended: page2.extended } : {}),
    } as InviteCard
  } else if (page2?.state === 'locked' && page2.profile && page2.message) {
    // Dead-invite card surfaces only while the message is present. Once the
    // user acknowledges via clear_invite the message is gone and locked+profile is
    // treated as plain "needs show_me" (legacyInvite = [] empty watchers).
    const synthState: 'missed' | 'fail' =
      FAIL_MESSAGES.has(page2.message) ? 'fail' : 'missed'
    legacyInvite = {
      ...(page2.profile as Profile),
      state: synthState,
      message: page2.message,
    } as InviteCard
  } else {
    legacyInvite = watchers
  }

  return {
    state, watchers, match, legacyInvite,
    inviteState: (page2?.state ?? 'free') as ServerInviteState,
    inviteMessage: page2?.message,
  }
}

// Translate raw v3 `relations` into the legacy compat shape the UI reads and
// write the result onto the in-flight payload `d` (sets d.state + d.relations
// = raw relations spread + synthesized watchers/match/page2/page2State).
// Single source of truth for both the Realtime/fetch path and the trusted
// find/ignore page1 merge.
/** The ONE thing an invoke response is trusted for inside `relations`: the
 *  circles summary (`communities`, the wire key — see circlesSummary).
 *
 *  Every other key in there is a game board, which only Realtime and an
 *  explicit fetch may write: page1/page2 are rewritten by the OTHER user's
 *  RPCs, which do not bump my `last_seen`, so the ordering guard cannot tell a
 *  stale HTTP response from a fresh one and the response is thrown away.
 *  `communities` is not that. It is a projection of MY OWN rows, recomputed by
 *  the DB's own trigger inside the transaction the request just ran, and the
 *  row on the response is read back AFTER it (user.persist's RETURNING) — so
 *  it is never older than what is on screen, and it is the only copy the actor
 *  gets: approving a join request drops my own `pending` count, and stripping
 *  it left the hub's "2 requests" standing on a queue of one until a Realtime
 *  echo happened to land (reported 2026-08-02). A summary that a concurrent
 *  manager has moved on from is corrected by that echo exactly as before. */
const withCircles = <T extends object>(rel: T, resp: { communities?: unknown } | undefined | null): T =>
  resp && resp.communities !== undefined ? { ...rel, communities: resp.communities } : rel

function writeCompat(d: Record<string, unknown>, relations: Pages | null | undefined) {
  const compat = deriveCompat(relations)
  d.state = compat.state
  const relationsWithCompat: Record<string, unknown> = { ...(relations ?? {}) }
  // The one place the wire's board names become the app's. Everything the UI
  // reads from here on says `watch`; nothing above this line does.
  relationsWithCompat.watch = relations?.page1
  relationsWithCompat.watchers = compat.watchers
  relationsWithCompat.match = compat.match
  relationsWithCompat.invite = compat.legacyInvite
  relationsWithCompat.inviteState = compat.inviteState
  if (compat.inviteMessage !== undefined) {
    relationsWithCompat.inviteMessage = compat.inviteMessage
  } else {
    delete relationsWithCompat.inviteMessage
  }
  d.relations = relationsWithCompat
}

/** True when the user has hidden themselves from discovery: page2 is locked
 *  and no invite card is occupying it (a pending / dead invite also parks
 *  page2 at a non-free state, but that is an interaction, not a hide).
 *
 *  Read by home.tsx (the hidden placeholder) AND by the settings visibility
 *  row, which is the only way back to visible now that page2 has no UI of its
 *  own. Two consumers, one definition — do not re-derive it inline. */
/** An ACCOUNT is needed when the profile row is absent (brand-new user) or has
 *  no name/birth_date yet. Account creation (onboarding steps 1-3: gender +
 *  name + birthdate → app/account) writes the row and derives the matching
 *  fields (preferred gender, age span, range), which is everything others()
 *  needs to place the user in pools. This — NOT a built profile — is the only
 *  hard gate before /home: a user with an account but no photos browses
 *  freely (they simply cannot be seen or invite until they build one; see
 *  selectProfileBuilt).
 *
 *  Read by the _layout routing guard AND by index.tsx, the boot route. Two
 *  consumers, one definition — do not re-derive it inline. index.tsx used to
 *  send every authenticated user straight to /home and leave the correction to
 *  the guard; the guard is deliberately not subscribed to `segments`, so when
 *  the profile fetch resolved before the boot navigation the guard's last
 *  evaluation happened at `segments.length === 0` and bailed, and nothing ever
 *  re-fired it. An account-less user was then parked on /home forever. */
export function selectNeedsAccount(profile: UserProfile | null | undefined): boolean {
  return !profile || !profile.name || !profile.birth_date
}

/** A profile is BUILT once it carries MIN_PHOTOS photos — and that is the
 *  WHOLE definition (user directive 2026-07-31). The bio is optional: it used
 *  to be the marker (a non-empty bio, saved last), which made the one field
 *  nobody has to fill in the thing that decided whether the account worked at
 *  all — and it disagreed with itself the moment the preview's inline editor
 *  let a built profile clear its bio back to null.
 *
 *  This is the single marker for "full member": while false the dock's profile
 *  key wears its dot and routes to /onboarding, the Circles key is faded, the
 *  visibility row reads 'unbuilt', and the invite prompt opens the
 *  build-profile popup instead of sending. Matches the server's profileComplete
 *  gate (app/index.ts) and others()'s pool filter one-for-one — all three state
 *  MIN_PHOTOS, and none of them may state it alone. */
export function selectProfileBuilt(profile: UserProfile | null | undefined): boolean {
  return (profile?.images?.length ?? 0) >= MIN_PHOTOS
}

export function selectIsHidden(profile: UserProfile | null | undefined): boolean {
  const invite = profile?.relations?.invite
  const hasInviteCard = !!invite && !Array.isArray(invite)
  return profile?.relations?.inviteState === 'locked' && !hasInviteCard
}

/** WHY nobody can see this user right now, or null when they can.
 *
 *  Two different facts put a user out of the pool and the app must not present
 *  one as the other:
 *   • 'unbuilt' — the profile was never built. others() drops a row with fewer
 *     than MIN_PHOTOS photos from every candidate pool and the server refuses
 *     to seed such a user a viewer (profileComplete, app/index.ts), so they
 *     are just as unseen as a
 *     user who hid on purpose. Saying "I am visible" to them is a lie, and it
 *     is the one that costs the most: they wait for a viewer that can never
 *     arrive. It leads, because it also decides whether the control may be
 *     touched at all.
 *   • 'hidden' — they turned themselves off (page2 locked), which is theirs to
 *     undo at any time.
 *
 *  One definition, because the row that states it and the tap that answers it
 *  must never disagree about which of the two is true. */
export function selectInvisibleReason(profile: UserProfile | null | undefined): 'unbuilt' | 'hidden' | null {
  if (!selectProfileBuilt(profile)) return 'unbuilt'
  return selectIsHidden(profile) ? 'hidden' : null
}

/** Who has my card in front of them right now: how many, and which of them the
 *  app may say by name. One definition for both surfaces that state it (the
 *  dock's preferences key and the sentence on the row that key opens), because
 *  those two may never disagree about the same fact.
 *
 *  I NAME THE PEOPLE WHOSE SCREEN MY CARD IS ON, AND COUNT EVERYONE ELSE (user
 *  directive 2026-08-02). Three states put my card on somebody's screen, and in
 *  every one of them the app has already shown me theirs:
 *    • page1 `waiting` — I invited her, so my card is her pending page2.
 *    • page1 `chat` — we matched, so my card is her page1.
 *    • page2 `pending` — she invited me, so her page1 is parked on my card,
 *      waiting for my answer.
 *  A watcher who is merely BROWSING me stays anonymous, and that is not a
 *  softer rule but the same one: watching her does not put my card in front of
 *  her, so there is nothing of hers to name. Naming here therefore reveals
 *  nothing about anyone's behaviour — only where my own card has got to, which
 *  is a fact about what I or she already did. (Page1 `watching` is the state
 *  this is easiest to get wrong in: I can see her, she cannot see me.)
 *
 *  The anonymous count reads the synthesized `watchers` array, which
 *  deriveCompat only populates while page2 is `free` — in any other page2 state
 *  there is no viewer list, so 0 is honest rather than stale. That is also why
 *  a pending invitation can never carry extras: the server replaced the array
 *  with the invitation itself, app_invite kicked everyone else off my card
 *  (_kick_page1_at → 'kick-invitee') and no new watcher can be seeded behind
 *  her (others() only picks a page2 that is `free`), so the true count there is
 *  exactly one and she is it. The row used to say "nobody is watching me" with
 *  her card, her name and her photograph on the same screen.
 *
 *  A name that also appears in the array is counted once (mutual watching,
 *  which app_invite deliberately leaves standing in my own page2, and the stale
 *  entry the mutual-match branch leaves behind). */
export type Watching = {
  /** How many people have my card in front of them: named + anonymous. */
  count: number
  /** The ones the app may name, in reading order: whoever is waiting on my
   *  answer first, then whoever I am waiting on or talking to. */
  names: string[]
  /** How many of `count` are anonymous — always 0 once `names` holds two, see
   *  above. */
  others: number
  /** How many would actually be REMOVED if I hid right now, which is a
   *  different question and has a different answer: app_hide_me walks the page2
   *  array and nothing else, so a named person is in this number only when she
   *  is also watching me of her own accord, and a chat partner never is. The
   *  hide confirm states this one — "your N watchers will be removed and
   *  notified" is a promise about who gets the push. */
  kickedOnHide: number
}
export function selectWatching(profile: UserProfile | null | undefined): Watching {
  const relations = profile?.relations
  const names: string[] = []
  const named: string[] = []
  const invite = relations?.invite
  if (relations?.inviteState === 'pending' && invite && !Array.isArray(invite)) {
    const inviter = invite as InviteCard
    if (inviter.name) { names.push(inviter.name); named.push(inviter.user_id) }
  }
  const watch = relations?.watch
  if ((watch?.state === 'waiting' || watch?.state === 'chat') && watch.profile?.name) {
    names.push(watch.profile.name); named.push(watch.profile.user_id)
  }
  const watchers = relations?.watchers ?? []
  const others = watchers.filter(w => !named.includes(w.user_id)).length
  return { count: names.length + others, names, others, kickedOnHide: watchers.length }
}

/** Retry budget for the boot profile read. Only transient failures are
 *  retried (auth failures sign out immediately, "no row" is a valid answer).
 *  Backoff is linear: attempt n waits n * PROFILE_FETCH_RETRY_MS. */
const PROFILE_FETCH_RETRIES = 2
const PROFILE_FETCH_RETRY_MS = 400

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  loading: false,
  fetched: false,
  serverSynced: false,

  fetch: async (userId: string) => {
    set({ loading: true })
    try {
      for (let attempt = 0; ; attempt++) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('user_id', userId)
          .single()

        // A FAILED READ IS NOT AN EMPTY PROFILE. `.single()` reports "no row"
        // as PGRST116 — that one genuinely means "brand-new user, send them to
        // onboarding". Any OTHER error says nothing about whether a row
        // exists, so it must not fall through to `profile: null`.
        if (error && error.code !== 'PGRST116') {
          // A dead session (revoked/expired refresh token, deleted auth user)
          // is the case that bit us: the read 401s, `profile` reads as null,
          // and the user looks exactly like a fresh signup while every
          // subsequent /app call also 401s. Drop the session so routing lands
          // on /login instead of looping through an onboarding that can't
          // save. scope 'local' — the session is already invalid server-side,
          // and a global sign-out would revoke this user's OTHER devices.
          const status = (error as { status?: number }).status
          if (status === 401 || status === 403 || error.code === 'PGRST301') {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
            set({ profile: null, fetched: true })
            return
          }
          // Transient (network / server). Retry briefly, then give up and let
          // routing proceed — `fetched` must always end up true or the boot
          // route in index.tsx waits on it forever and renders nothing.
          if (attempt < PROFILE_FETCH_RETRIES) {
            await new Promise(r => setTimeout(r, PROFILE_FETCH_RETRY_MS * (attempt + 1)))
            continue
          }
          set({ fetched: true })
          return
        }

        if (data) get().applyServerUser(data as Record<string, unknown>, 'fetch')
        else set({ profile: null })
        // Same tick as applyServerUser's `set`, so React batches them into ONE
        // render: a consumer sees the reconciled state and the serverSynced
        // flip together and can tell "the server just answered for the first
        // time" from "the state changed while I was watching".
        set({ fetched: true, serverSynced: true })
        return
      }
    } finally {
      set({ loading: false })
    }
  },

  hydrate: async (userId: string) => {
    if (!userId || get().profile || get().fetched) return
    const cached = await profileCache.load(userId)
    // The network answer can land while the disk read is in flight, and it is
    // authoritative — re-check after the await, never overwrite it.
    if (!cached || cached.user_id !== userId || get().profile || get().fetched) return
    // Realtime events older than the snapshot we just painted are stale by the
    // same rule that governs a fetched profile.
    const ts = lastSeenOf(cached)
    if (ts > lastAppliedLastSeen) lastAppliedLastSeen = ts
    set({ profile: cached, fetched: true })
  },

  update: (patch) => {
    const prev = get().profile
    if (!prev) return
    for (const k of Object.keys(patch) as (keyof UserProfile)[]) {
      if (CLIENT_AUTHORED.includes(k)) pending.set(k, patch[k])
    }
    set({ profile: { ...prev, ...patch } })
  },

  applyServerUser: (data, source = 'invoke') => {
    if (!data || typeof data !== 'object') return
    const d = data as Record<string, unknown>
    const lastSeen = d.last_seen as string | undefined
    const ts = lastSeen ? Date.parse(lastSeen) : 0
    // fetch is a direct SELECT — authoritative by definition. Other-user RPCs
    // write A.relations without bumping A.last_seen, so the stored ts can sit
    // ahead of DB.last_seen and would otherwise reject the fresh row.
    if (source !== 'fetch' && ts && ts < lastAppliedLastSeen) return
    if (ts > lastAppliedLastSeen) lastAppliedLastSeen = ts
    // Promote flat profile fields + weekStart from data JSONB so they
    // sit at the top level of UserProfile (and CLIENT_AUTHORED protection
    // applies). name lives top-level on the server already.
    if (d.data && typeof d.data === 'object') {
      const dd = d.data as Record<string, unknown>
      if ('weekStart' in dd) (d as Record<string, unknown>).weekStart = dd.weekStart
      if ('location_custom' in dd) (d as Record<string, unknown>).location_custom = dd.location_custom
      if ('location_type' in dd) (d as Record<string, unknown>).location_type = dd.location_type
      if ('location_label' in dd) (d as Record<string, unknown>).location_label = dd.location_label
      ;(d as Record<string, unknown>).images = Array.isArray(dd.images) ? dd.images as Image[] : []
      ;(d as Record<string, unknown>).bio = typeof dd.bio === 'string' ? dd.bio : null
      ;(d as Record<string, unknown>).family = dd.family && typeof dd.family === 'object' && !Array.isArray(dd.family)
        ? (dd.family as FamilyData)
        : null
      // Height (centimetres) and smoking. Both are THREE-state: a number/boolean
      // when answered, null when not — so an absent key promotes to null rather
      // than being left off the object, which is what lets a cleared answer read
      // as cleared instead of as "unchanged".
      ;(d as Record<string, unknown>).height = typeof dd.height === 'number' ? dd.height : null
      ;(d as Record<string, unknown>).smokes = typeof dd.smokes === 'boolean' ? dd.smokes : null
    }
    const prev = get().profile
    if (source === 'invoke:self' && prev && d.relations) {
      // Trusted page1 from the actor's OWN self-transition (find / ignore /
      // pause / resume). The response is the authoritative result of the
      // action and already carries the resulting page1 — advance from it
      // immediately instead of waiting for Realtime to redeliver the same
      // state (a lost/late Realtime event would otherwise strand the client
      // on stale page1). We trust ONLY page1: page2 (incoming invites /
      // watcher list) is only ever changed by OTHER users' RPCs, which don't
      // bump our last_seen so the ordering guard can't protect it — so keep
      // page2 Realtime-owned by merging the response's page1 over the last
      // raw relations Realtime/fetch delivered.
      // Cold start (no raw yet): trust the full response relations.
      const respRel = d.relations as Pages & { communities?: unknown }
      const base = lastRawRelations ?? respRel
      const rebuilt = withCircles({ ...base, page1: respRel.page1 } as Pages, respRel)
      // Latch the board this transition replaced, so its own Realtime echo
      // (which may well arrive AFTER this one's) cannot put it back.
      const leftSig = page1Sig(base.page1)
      stalePage1 = leftSig === page1Sig(respRel.page1)
        ? null
        : { sig: leftSig, until: Date.now() + P1_ECHO_WINDOW_MS }
      lastRawRelations = rebuilt
      writeCompat(d, rebuilt)
    } else if ((source === 'invoke' || source === 'invoke:self') && prev) {
      // Plain invoke (or a find/ignore response with no relations / before any
      // prev existed). Invoke (HTTP) responses can race with Realtime events
      // and arrive stale — Realtime and explicit fetch are the authoritative
      // source for game state — so strip relations/state.
      //
      // EXCEPT the circles summary: see withCircles. The game boards are the
      // race this strip exists for; `communities` is a server-computed
      // projection the response carries fresh out of the row it just wrote.
      const respRel = d.relations as (Pages & { communities?: unknown }) | undefined
      delete (d as Record<string, unknown>).relations
      delete (d as Record<string, unknown>).state
      const summary = respRel && (respRel as { communities?: unknown }).communities
      if (summary !== undefined && prev.relations) {
        if (lastRawRelations) lastRawRelations = withCircles(lastRawRelations, respRel)
        d.relations = { ...(prev.relations as object), communities: summary }
      }
    } else if (!('relations' in d)) {
      // Realtime payload from a partial UPDATE (REPLICA IDENTITY default sends
      // only changed columns + primary key). When `relations` isn't in the
      // payload, the row's relations didn't actually change — preserve the
      // previous state instead of overwriting with an empty derived shape.
      // Same logic applies to `state` (top-level derived field). lastRawRelations
      // is intentionally NOT touched here (relations didn't change).
      delete (d as Record<string, unknown>).state
    } else {
      // Realtime/fetch with relations present — authoritative. Stash the raw
      // relations for the find/ignore page1 merge, then translate v3 relations
      // into the legacy shape the UI reads (state / match / watchers / page2).
      let relations = d.relations as Pages | null | undefined
      // …unless its page1 is the board a self-transition just left (see
      // stalePage1). Only page1 is held back; the rest of the event is fresh.
      // `fetch` is a direct SELECT of the row as it stands and is never an echo,
      // so it both applies and RELEASES the latch.
      if (source === 'fetch') {
        stalePage1 = null
      } else if (stalePage1) {
        if (Date.now() > stalePage1.until) stalePage1 = null
        else if (page1Sig(relations?.page1) === stalePage1.sig) {
          relations = { ...(relations ?? {}), page1: lastRawRelations?.page1 } as Pages
        } else {
          // A board that is NOT the one we left: the echoes have caught up, so
          // the latch is spent. It could only ever have matched that one exact
          // board anyway — a next candidate carries a different profile and a
          // different expiry, so it was never at risk of being held back — but
          // an armed latch outliving its reason is not a thing to leave lying
          // around on the one path every card arrives by.
          stalePage1 = null
        }
      }
      lastRawRelations = relations ?? null
      writeCompat(d, relations)
    }
    if (!prev) {
      const first = d as unknown as UserProfile
      cacheProfile(first)
      set({ profile: first })
      return
    }
    const merged: Record<string, unknown> = { ...prev, ...d }
    // An optimistic value stands until the server says it back. The comparison
    // is key-order-blind (see sameValue) because what comes back has been
    // through jsonb and no longer spells its objects the way the client did.
    for (const k of CLIENT_AUTHORED) {
      if (!pending.has(k)) continue
      const pendingVal = pending.get(k)
      if (sameValue(d[k as string], pendingVal)) {
        pending.delete(k)
      } else {
        merged[k as string] = pendingVal
      }
    }
    const next = merged as unknown as UserProfile
    // Nothing on screen changed → keep the SAME object. The store hands every
    // consumer identity, so publishing a fresh profile here re-renders the
    // whole app — home and its match card, the menu, the Circles stack —
    // and rewrites the profile to disk. The Circles pages fire several
    // reads per page and each one is answered THREE times over (the HTTP
    // response, the Realtime echo of the last_seen write, and the snapshot
    // refresh that follows it) for a row that did not actually change. That
    // burst of full-tree renders is what left a tap on those pages sitting
    // unhandled until the answers landed.
    if (sameForRender(next as unknown as Record<string, unknown>, prev as unknown as Record<string, unknown>)) return
    cacheProfile(next)
    set({ profile: next })
  },

  clear: () => {
    pending.clear()
    lastAppliedLastSeen = 0
    lastRawRelations = null
    stalePage1 = null
    void profileCache.clearAll()
    set({ profile: null, fetched: false, serverSynced: false })
  },
}))
