// Communities & Friends — typed client for the phase-1 endpoints (server
// shipped 2026-07-25). Every call funnels through `invoke`, which already
// applies the returned user row to the store and hands back the full payload;
// these helpers just pull the sidecar field the screen needs. The 6-digit
// invite code + the base `Group` type stay in groups.ts (shared with the
// onboarding step); this module is the richer communities surface.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { invoke } from './api'
import { supabase } from './supabase'
import { STORAGE } from '../keys'
import { t } from '../i18n'
import type { Group } from './groups'
import type { Profile } from '../stores/userStore'

// A member/person's main photo, as embedded by the server (data.images[0]).
// `normal` is the filename under the user's `normal/` folder — feed it to
// publicImageUrl(user_id, 'normal', normal) to render.
export type MemberImage = { hash?: string; normal?: string } | null

// `profile` is the full profile card payload, so tapping a person anywhere in
// the communities sheet opens the same card the app shows for a match (server
// 2026-07-27). Always without a distance. Optional: a row cached by an older
// build predates it.
export type GroupMember = { user_id: string; name: string | null; image: MemberImage; owner?: boolean; manager?: boolean; profile?: Profile | null }

// ── Meta lines ─────────────────────────────────────────────────────────────
// Every communities row states its facts on one line, separated by the same
// interpunct: the hub rows ("Approved · 17 members · 3 requests") and the
// settings menu row ("4 groups · 5 friends · 3 requests"). One separator, one
// composer — empty/undefined segments drop out so a caller never has to build
// the string conditionally.
// Two rules govern where a meta line is allowed to wrap (user directive
// 2026-07-27), and both are enforced with non-breaking spaces so any Text can
// render the string as-is:
//   1. A segment never breaks in half: "3 requests" keeps its number, instead
//      of stranding the "3" at the end of a line with the word on the next. So
//      the spaces INSIDE a segment are non-breaking.
//   2. The interpunct travels DOWN with the fact it introduces, never dangling
//      at the end of a line with nothing after it. So the dot is glued to the
//      segment that follows it, and the one plain space in the whole string,
//      the one BEFORE the dot, is the only place a wrap can land.
// A one-line meta reads exactly as it always did: an NBSP paints as a space.
const NBSP = '\u00A0'
// The separator's visible mark, on its own: MetaText counts these to work out
// which facts ended up on which line. Derived, so there is one interpunct.
export const META_DOT = '\u00B7'
export const META_SEP = ' ' + META_DOT + NBSP
export const metaLine = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).map(p => (p as string).replace(/ /g, NBSP)).join(META_SEP)

// The count wordings every meta line is built from — one definition each, so a
// number reads the same in the menu row, the hub row and the popup. Each takes
// the singular form at 1 (Hebrew has no "1 קבוצות").
const count = (key: 'communities.membersCount' | 'communities.groupsCount' | 'communities.friendsCount' | 'communities.requestsCount', n: number) =>
  t(key).replace('{count}', String(n))
export const memberLabel = (n: number) => (n === 1 ? t('communities.oneMember') : count('communities.membersCount', n))
export const groupLabel = (n: number) => (n === 1 ? t('communities.oneGroup') : count('communities.groupsCount', n))
export const friendLabel = (n: number) => (n === 1 ? t('communities.oneFriend') : count('communities.friendsCount', n))
export const requestLabel = (n: number) => (n === 1 ? t('communities.oneRequest') : count('communities.requestsCount', n))

// ── Group kinds ────────────────────────────────────────────────────────────
// ONE axis with three stops replaces the is_public × requires_approval pair in
// every screen (user directive 2026-07-27):
//   open     in search, joins instantly
//   approved in search, every join waits for a manager
//   private  not in search, link or invite only, every join waits
// The pair stays the storage — the published app reads it and the server
// enforces the same invariant (not public ⇒ approval) — so this is the single
// place that converts between the two representations. There is deliberately
// no fourth kind: a hidden group whose link admits strangers silently.
// The friend-links set ("my friends") is NOT a group row, so it is untouched:
// a friend invite still links both sides instantly.
export type GroupKind = 'open' | 'approved' | 'private'
export const GROUP_KINDS: GroupKind[] = ['open', 'approved', 'private']
/** What a brand-new group is unless the creator says otherwise. */
export const DEFAULT_GROUP_KIND: GroupKind = 'open'
export const groupKind = (g: { is_public?: boolean | null; requires_approval?: boolean | null }): GroupKind =>
  !g.is_public ? 'private' : g.requires_approval ? 'approved' : 'open'
export const groupKindFlags = (kind: GroupKind): { is_public: boolean; requires_approval: boolean } => ({
  is_public: kind !== 'private',
  requires_approval: kind !== 'open',
})
// `requires_approval` gates joins (a link/search join becomes a pending request
// an owner/manager must approve); `description` is the editable group blurb;
// `pending` is the count of pending join requests (shown as a badge to staff).
// `hidden` is MY OWN membership flag in this group, not a property of the
// group: while it is on, the group's members and I never meet each other in the
// game (the server drops the pair from both candidate pools and the group stops
// counting as a shared group between us). It is what lets someone run a
// community without playing inside it. Optional: a row cached by an older build
// predates it.
export type OwnedGroup = { id: string; name: string; invite_code: string; is_public: boolean; members: number; is_owner?: boolean; requires_approval?: boolean; description?: string | null; pending?: number; hidden?: boolean }
export type CreatedGroup = OwnedGroup & { owner: boolean }
// One pending join request on a group the caller owns/manages. `profile` is the
// requester's full profile card payload (server 2026-07-27): letting someone
// into a group is a decision about a person, so the queue opens the same card
// the app shows for a match. Deliberately carries NO distance. Optional because
// a row cached by an older build predates it.
export type JoinRequestItem = { id: string; user_id: string; name: string | null; image: MemberImage; created_at: string; profile?: Profile | null }
// invite_code is included for public groups (a public group is joinable by
// anyone, so its code is not a secret) — lets "Join" from search reuse redeem.
// `requires_approval` flips Join → Request; `requested` is my own pending state.
export type PublicGroup = { id: string; name: string; members: number; joined: boolean; invite_code?: string; owner_id?: string | null; owner_name?: string | null; owner_image?: MemberImage; description?: string | null; requires_approval?: boolean; requested?: boolean }
export type Person = { user_id: string; name: string | null; image: MemberImage; requested: boolean; friend: boolean }
// One row of the group chip's detail popup: a group the viewer and the profile
// subject both belong to. `owner` is null for admin-owned groups.
export type SharedGroupOwner = { user_id: string; name: string | null; image: MemberImage }
// is_public / invite_code (public only) / description let a tapped row open the
// same member sheet (JoinedGroupSheet) as the Communities hub.
export type SharedGroup = { id: string; name: string; members: number; owner: SharedGroupOwner | null; is_public?: boolean; invite_code?: string | null; description?: string | null }
export type FriendItem = { user_id: string; name: string | null; image: MemberImage; profile?: Profile | null }
export type FriendRequestItem = { id: string; user_id: string; name: string | null; image: MemberImage }
export type MyFriends = { friends: FriendItem[]; requests: FriendRequestItem[] }

// Lightweight summary the server denormalizes into users.relations.communities
// (maintained by triggers). Lets the hub + the settings row paint instantly
// from the store — no query. Heavier lists (rosters, people search, the full
// friends list) stay on-demand.
// A group the caller belongs to (not owned/managed). Carries enough to paint
// the hub row and drive the popup: type + member count, and the invite_code for
// PUBLIC groups only (a public code is not a secret, so a member can share the
// link); private groups get no code.
export type JoinedGroup = { id: string; name: string; is_public?: boolean; members?: number; invite_code?: string | null; description?: string | null }

// A group the caller has an outstanding join request on (requires_approval
// group they hit Join/Request on). Same shape as JoinedGroup so the hub row
// can render identically — only the meta line + tap action differ.
export type PendingGroup = JoinedGroup

export type CommunitiesSummary = {
  managed: OwnedGroup[]
  joined: JoinedGroup[]
  pending: PendingGroup[]
  /** Requests a manager turned down. A decline used to delete the row, which
   *  left the person waiting on an answer that had already been given (server
   *  2026-07-27); the row survives now, so the hub can say so. Dismissing it
   *  hides it without lifting the cooldown on asking again. */
  declined: PendingGroup[]
  friends: number
  requests: number
}

type WithCommunities = { relations?: unknown } | null | undefined

/** Read the denormalized summary off a user/profile. null when the server
 *  hasn't populated it yet (old payload) — callers fall back to the endpoints. */
export function communitiesSummary(profile: WithCommunities): CommunitiesSummary | null {
  const relations = profile?.relations as { communities?: unknown } | null | undefined
  const c = relations?.communities as Partial<CommunitiesSummary> | undefined
  if (!c || typeof c !== 'object') return null
  return {
    managed: Array.isArray(c.managed) ? c.managed : [],
    joined: Array.isArray(c.joined) ? c.joined : [],
    pending: Array.isArray(c.pending) ? c.pending : [],
    declined: Array.isArray(c.declined) ? c.declined : [],
    friends: typeof c.friends === 'number' ? c.friends : 0,
    requests: typeof c.requests === 'number' ? c.requests : 0,
  }
}

/** Everything waiting on MY answer: incoming friend requests plus the pending
 *  join requests on every group I manage. The menu row states this as a count
 *  so a decision someone else is waiting on is visible without opening the hub;
 *  inside the hub the same numbers are split back onto their own rows. */
export function pendingApprovals(c: CommunitiesSummary | null): number {
  if (!c) return 0
  return c.requests + c.managed.reduce((n, g) => n + (g.pending ?? 0), 0)
}

// ── Communities (reuse the existing groups/user_groups machinery server-side) ──

export const createGroup = (
  name: string, is_public: boolean,
  opts?: { description?: string | null; requires_approval?: boolean },
): Promise<CreatedGroup> =>
  invoke<{ group: CreatedGroup }>('app/create_group', { name, is_public, ...opts }).then(r => r.group)

export const ownedGroups = (): Promise<OwnedGroup[]> =>
  invoke<{ owned: OwnedGroup[] }>('app/owned_groups').then(r => r.owned ?? [])

export const groupMembers = (group_id: string): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/group_members', { group_id }).then(r => r.members ?? [])

export const removeMember = (group_id: string, user_id: string): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/remove_member', { group_id, user_id }).then(r => r.members ?? [])

// Promote / demote a manager (owner only). Returns the fresh roster.
export const setManager = (group_id: string, user_id: string, make: boolean): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/set_manager', { group_id, user_id, make }).then(r => r.members ?? [])

// name / is_public / requires_approval each omitted = unchanged. `description`
// is applied only when the key is present (pass null to clear) — the server
// keys off the key's presence, so undefined leaves it untouched.
export const updateGroup = (
  group_id: string,
  opts: { name?: string; is_public?: boolean; description?: string | null; requires_approval?: boolean },
): Promise<CreatedGroup> =>
  invoke<{ group: CreatedGroup }>('app/update_group', { group_id, ...opts }).then(r => r.group)

// Step out of the game inside ONE group I run (owner/manager only). Not a
// group setting: it flips MY membership, so nobody else in the group is
// affected and the group itself is unchanged. Returns the fresh group row.
export const setGroupHidden = (group_id: string, hidden: boolean): Promise<OwnedGroup> =>
  invoke<{ group: OwnedGroup }>('app/set_group_hidden', { group_id, hidden }).then(r => r.group)

// Pending join requests for a group the caller owns/manages.
export const groupRequests = (group_id: string): Promise<JoinRequestItem[]> =>
  invoke<{ requests: JoinRequestItem[] }>('app/group_requests', { group_id }).then(r => r.requests ?? [])

// Approve (join + notify the requester) or reject (silent) one pending request.
// Returns the fresh roster + remaining requests for the group.
export const respondJoin = (request_id: string, accept: boolean): Promise<{ members: GroupMember[]; requests: JoinRequestItem[] }> =>
  invoke<{ members?: GroupMember[]; requests?: JoinRequestItem[] }>('app/respond_join', { request_id, accept })
    .then(r => ({ members: r.members ?? [], requests: r.requests ?? [] }))

export const deleteGroup = (group_id: string): Promise<unknown> =>
  invoke('app/delete_group', { group_id })

export const searchGroups = (q: string): Promise<PublicGroup[]> =>
  invoke<{ results: PublicGroup[] }>('app/search_groups', { q }).then(r => r.results ?? [])

// Join by 6-digit code (existing endpoint; returns the fresh legacy group list).
// `join_status` distinguishes an instant join from a pending request on an
// approval-gated group ('pending'), an existing membership ('already'), and a
// request a manager already turned down ('declined', server 2026-07-27 — the
// link no longer silently re-queues someone who was refused).
export type JoinStatus = 'joined' | 'pending' | 'already' | 'declined'
export const redeemInvite = (code: string): Promise<{ groups?: Group[]; join_status?: JoinStatus }> =>
  invoke<{ groups?: Group[]; join_status?: JoinStatus }>('app/redeem_invite', { code })

// Every group the caller belongs to (owned + joined). "Groups you're in" =
// this minus the owned list. Reuses the existing legacy endpoint.
export const myGroups = (): Promise<Group[]> =>
  invoke<{ groups?: Group[] }>('app/my_groups').then(r => r.groups ?? [])

export const leaveGroup = (group_id: string): Promise<{ groups?: Group[] }> =>
  invoke<{ groups?: Group[] }>('app/leave_group', { group_id })

// Requester withdraws their own pending join request on a group they've asked
// to join. Idempotent — cancelling a request that no longer exists is a no-op
// success. The store refreshes off the returned user row (which carries the
// updated relations.communities.pending list), so hub + FindView repaint.
export const cancelJoinRequest = (group_id: string): Promise<{ groups?: Group[] }> =>
  invoke<{ groups?: Group[] }>('app/cancel_join', { group_id })

/** A deep link's path, without the fragment. Both invite parsers below read
 *  this, never the raw URL: the magic-link return (`once://login-callback#
 *  access_token=...`) carries opaque server-issued tokens in its fragment, and
 *  an invite pattern matching by chance inside one would both misfire the join
 *  AND, via +native-intent, swallow the URL that signs the user in. */
const linkPath = (url: string): string => url.split('#')[0]

// The token of a shared group invite link (once://g/<TOKEN>, or the https
// brand-site form it bounces from). Redeeming it is the deep-link invite
// machinery at the bottom of this file.
export function parseGroupInviteToken(url: string): string | null {
  const m = linkPath(url).match(/(?:^|\/)g\/(\d{6})(?:[/?]|$)/)
  return m ? m[1] : null
}

// ── Friends (isolated new tables; "my friends" is derived, not a group) ──

export const myFriends = (): Promise<MyFriends> =>
  invoke<MyFriends>('app/my_friends')

export const searchPeople = (q: string): Promise<Person[]> =>
  invoke<{ results: Person[] }>('app/search_people', { q }).then(r => r.results ?? [])

// Groups the caller and `user_id` both belong to, smallest-first (same order
// as the on-photo chip's named group). Backs the group chip's detail popup.
export const sharedGroups = (user_id: string): Promise<SharedGroup[]> =>
  invoke<{ groups: SharedGroup[] }>('app/shared_groups', { user_id }).then(r => r.groups ?? [])

// 'requested' | 'friends' (auto-linked when a reverse request already existed)
export const friendRequest = (user_id: string): Promise<string> =>
  invoke<{ status: string }>('app/friend_request', { user_id }).then(r => r.status)

export const friendRespond = (request_id: string, accept: boolean): Promise<{ status: string }> =>
  invoke<{ status: string }>('app/friend_respond', { request_id, accept })

export const unfriend = (user_id: string): Promise<unknown> =>
  invoke('app/unfriend', { user_id })

// Auto-link by invite code (the inviter's referral_code). Mutual, no approval.
// 'linked' (new friend) | 'already' (were already friends) | 'self'. Returns
// the caller's fresh friends roster so the screen can repaint.
export const linkFriendByCode = (code: string): Promise<MyFriends> =>
  invoke<MyFriends>('app/friend_link', { code })

// The code of a friend invite link (once://f/<CODE>, or the https brand-site
// form it bounces from). Same CODE as the referral link (the inviter's
// referral_code alphabet: [A-Za-z0-9]{4,16}), a different path. Redeeming it is
// the deep-link invite machinery below.
export function parseFriendInviteCode(url: string): string | null {
  const m = linkPath(url).match(/(?:^|\/)f\/([A-Za-z0-9]{4,16})(?:[/?]|$)/)
  return m ? m[1].toUpperCase() : null
}

// ── Deep-link invites (once://g/<TOKEN>, once://f/<CODE>) ───────────────────
//
// The root URL listener (app/_layout.tsx) hands EVERY inbound deep link here,
// the cold-start one and every in-session one, and this module is the ONLY place
// an invite link is redeemed. The router side is separate and does nothing but
// stay out of the way: app/+native-intent.tsx swallows these URLs so they never
// navigate, and app/+not-found.tsx catches them if that ever fails to load
// (before either existed the user landed on Expo's black "Unmatched Route" debug
// screen and the join was invisible).
//
// Redeeming needs a session, so a link opened before sign-in stays parked and is
// flushed by home, the first screen that only exists for a signed-in user.
//
// The outcome goes to whoever is watching — home opens the Communities sheet on
// it, so the tap visibly did something. An outcome nobody was there to see is
// HELD, not dropped: on a cold start the redeem finishes long before home
// mounts, and watching from a mount picks it up either way.

/** Which kind of invite was redeemed — all a screen needs to decide where to
 *  land the user. A group join is shown by the hub either way: it lists a
 *  freshly joined group and a still-pending request as their own rows. */
export type InviteOutcome = { kind: 'group' | 'friend' }

// ── Where a notification tap lands ─────────────────────────────────────────
// A push about a PERSON opens that person's page, with the buttons that page
// owns — a join request opens the requester's profile with approve/decline, a
// new friend opens their page in My Friends (user directive 2026-07-27). A push
// about a queue opens the queue. Home resolves the push code into one of these
// and hands it to the sheet, which seeds its whole page stack from it, so Back
// walks out through the pages that would have led there by hand.
export type CommunitiesTarget =
  /** group_approved: the group I was just let into. */
  | { kind: 'group'; groupId: string }
  /** group_join: the person waiting at this group's door. */
  | { kind: 'request'; groupId: string; userId: string }
  /** group_pending (the 48h nudge): the whole waiting queue. */
  | { kind: 'queue'; groupId: string }
  /** friend_link: the friend who just connected. */
  | { kind: 'friend'; userId: string }
  /** Any other friend-lifecycle push: the list itself. */
  | { kind: 'friends' }

type ParkedInvite = { kind: 'group' | 'friend'; code: string }
let pendingInvite: ParkedInvite | null = null
let heldOutcome: InviteOutcome | null = null
let inFlight: Promise<void> | null = null
const inviteWatchers = new Set<(o: InviteOutcome) => void>()

// A parked invite is written to disk as well as held in memory. The wait for a
// session can be long — a first-time visitor signs up and fills a whole
// onboarding before there is anyone to redeem for — and an app killed anywhere
// in there used to lose the link silently, leaving them in the app they just
// installed for a group, in no group (user directive 2026-07-27).
function parkInvite(invite: ParkedInvite | null): void {
  pendingInvite = invite
  if (invite) AsyncStorage.setItem(STORAGE.pendingInvite, JSON.stringify(invite)).catch(() => {})
  else AsyncStorage.removeItem(STORAGE.pendingInvite).catch(() => {})
}

/** Read a parked invite back after a restart. Called by the same flush that
 *  redeems it, so nothing else has to know the parking exists. */
async function loadParkedInvite(): Promise<ParkedInvite | null> {
  if (pendingInvite) return pendingInvite
  try {
    const raw = await AsyncStorage.getItem(STORAGE.pendingInvite)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    const inv = parsed as Partial<ParkedInvite>
    if ((inv?.kind === 'group' || inv?.kind === 'friend') && typeof inv.code === 'string' && inv.code) {
      pendingInvite = { kind: inv.kind, code: inv.code }
      return pendingInvite
    }
  } catch {}
  return null
}

/** Watch for redeemed invites. Fires straight away with an outcome that landed
 *  before this watcher existed. Returns the unsubscribe. */
export function watchInvites(cb: (o: InviteOutcome) => void): () => void {
  if (heldOutcome) { const o = heldOutcome; heldOutcome = null; cb(o) }
  inviteWatchers.add(cb)
  return () => { inviteWatchers.delete(cb) }
}

/** Park an inbound deep link's invite (when it carries one) and try to redeem
 *  it immediately. Safe to call with any URL. */
export function stashInviteUrl(url: string): void {
  const token = parseGroupInviteToken(url)
  const code = token ? null : parseFriendInviteCode(url)
  if (token) parkInvite({ kind: 'group', code: token })
  else if (code) parkInvite({ kind: 'friend', code })
  else return
  void flushPendingInvite()
}

/** Redeem a parked invite. Resolves once there is nothing in flight, so a second
 *  caller joins the round trip already running instead of starting another.
 *  No-op without a parked invite, and it stays parked when there is no session
 *  yet so the next flush retries. */
export function flushPendingInvite(): Promise<void> {
  if (!inFlight) inFlight = redeemPendingInvite().finally(() => { inFlight = null })
  return inFlight
}

function deliverOutcome(o: InviteOutcome): void {
  if (inviteWatchers.size === 0) { heldOutcome = o; return }
  inviteWatchers.forEach(w => w(o))
}

async function redeemPendingInvite(): Promise<void> {
  const invite = await loadParkedInvite()
  if (!invite) return
  try {
    // The session is checked BEFORE invoking: a call with no token 401s, and
    // invoke reads a 401 as a dead session and signs the user out.
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    if (invite.kind === 'group') await redeemInvite(invite.code)
    else await linkFriendByCode(invite.code)
    parkInvite(null)
    deliverOutcome({ kind: invite.kind })
  } catch {
    // Left parked: a transient failure retries on the next flush, and a code
    // that is simply invalid never redeems (no user-facing error — the link was
    // not one this account can use).
  }
}
