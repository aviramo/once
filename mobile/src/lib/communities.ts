// Communities & Friends — typed client for the phase-1 endpoints (server
// shipped 2026-07-25). Every call funnels through `invoke`, which already
// applies the returned user row to the store and hands back the full payload;
// these helpers just pull the sidecar field the screen needs. The 6-digit
// invite code + the base `Group` type stay in groups.ts (shared with the
// onboarding step); this module is the richer communities surface.
import { invoke } from './api'
import { supabase } from './supabase'
import type { Group } from './groups'

// A member/person's main photo, as embedded by the server (data.images[0]).
// `normal` is the filename under the user's `normal/` folder — feed it to
// publicImageUrl(user_id, 'normal', normal) to render.
export type MemberImage = { hash?: string; normal?: string } | null

export type GroupMember = { user_id: string; name: string | null; image: MemberImage; owner?: boolean; manager?: boolean }
// `requires_approval` gates joins (a link/search join becomes a pending request
// an owner/manager must approve); `description` is the editable group blurb;
// `pending` is the count of pending join requests (shown as a badge to staff).
export type OwnedGroup = { id: string; name: string; invite_code: string; is_public: boolean; members: number; is_owner?: boolean; requires_approval?: boolean; description?: string | null; pending?: number }
export type CreatedGroup = OwnedGroup & { owner: boolean }
// One pending join request on a group the caller owns/manages.
export type JoinRequestItem = { id: string; user_id: string; name: string | null; image: MemberImage; created_at: string }
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
export type FriendItem = { user_id: string; name: string | null; image: MemberImage }
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
    friends: typeof c.friends === 'number' ? c.friends : 0,
    requests: typeof c.requests === 'number' ? c.requests : 0,
  }
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
// approval-gated group ('pending') and an existing membership ('already').
export type JoinStatus = 'joined' | 'pending' | 'already'
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

let pendingInvite: { kind: 'group' | 'friend'; code: string } | null = null
let heldOutcome: InviteOutcome | null = null
let inFlight: Promise<void> | null = null
const inviteWatchers = new Set<(o: InviteOutcome) => void>()

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
  if (token) pendingInvite = { kind: 'group', code: token }
  else if (code) pendingInvite = { kind: 'friend', code }
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
  const invite = pendingInvite
  if (!invite) return
  try {
    // The session is checked BEFORE invoking: a call with no token 401s, and
    // invoke reads a 401 as a dead session and signs the user out.
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    if (invite.kind === 'group') await redeemInvite(invite.code)
    else await linkFriendByCode(invite.code)
    pendingInvite = null
    deliverOutcome({ kind: invite.kind })
  } catch {
    // Left parked: a transient failure retries on the next flush, and a code
    // that is simply invalid never redeems (no user-facing error — the link was
    // not one this account can use).
  }
}
