// Communities & Friends — typed client for the phase-1 endpoints (server
// shipped 2026-07-25). Every call funnels through `invoke`, which already
// applies the returned user row to the store and hands back the full payload;
// these helpers just pull the sidecar field the screen needs. The 6-digit
// invite code + the base `Group` type stay in groups.ts (shared with the
// onboarding step); this module is the richer communities surface.
import { invoke } from './api'
import type { Group } from './groups'

// A member/person's main photo, as embedded by the server (data.images[0]).
// `normal` is the filename under the user's `normal/` folder — feed it to
// publicImageUrl(user_id, 'normal', normal) to render.
export type MemberImage = { hash?: string; normal?: string } | null

export type GroupMember = { user_id: string; name: string | null; image: MemberImage; owner?: boolean; manager?: boolean }
export type OwnedGroup = { id: string; name: string; invite_code: string; is_public: boolean; members: number; is_owner?: boolean }
export type CreatedGroup = OwnedGroup & { owner: boolean }
// invite_code is included for public groups (a public group is joinable by
// anyone, so its code is not a secret) — lets "Join" from search reuse redeem.
export type PublicGroup = { id: string; name: string; members: number; joined: boolean; invite_code?: string; owner_name?: string | null }
export type Person = { user_id: string; name: string | null; image: MemberImage; requested: boolean; friend: boolean }
export type FriendItem = { user_id: string; name: string | null; image: MemberImage }
export type FriendRequestItem = { id: string; user_id: string; name: string | null; image: MemberImage }
export type MyFriends = { friends: FriendItem[]; requests: FriendRequestItem[] }

// Lightweight summary the server denormalizes into users.relations.communities
// (maintained by triggers). Lets the hub + the settings row paint instantly
// from the store — no query. Heavier lists (rosters, people search, the full
// friends list) stay on-demand.
export type CommunitiesSummary = {
  managed: OwnedGroup[]
  joined: { id: string; name: string }[]
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
    friends: typeof c.friends === 'number' ? c.friends : 0,
    requests: typeof c.requests === 'number' ? c.requests : 0,
  }
}

// ── Communities (reuse the existing groups/user_groups machinery server-side) ──

export const createGroup = (name: string, is_public: boolean): Promise<CreatedGroup> =>
  invoke<{ group: CreatedGroup }>('app/create_group', { name, is_public }).then(r => r.group)

export const ownedGroups = (): Promise<OwnedGroup[]> =>
  invoke<{ owned: OwnedGroup[] }>('app/owned_groups').then(r => r.owned ?? [])

export const groupMembers = (group_id: string): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/group_members', { group_id }).then(r => r.members ?? [])

export const removeMember = (group_id: string, user_id: string): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/remove_member', { group_id, user_id }).then(r => r.members ?? [])

// Promote / demote a manager (owner only). Returns the fresh roster.
export const setManager = (group_id: string, user_id: string, make: boolean): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/set_manager', { group_id, user_id, make }).then(r => r.members ?? [])

export const updateGroup = (
  group_id: string,
  opts: { name?: string; is_public?: boolean },
): Promise<CreatedGroup> =>
  invoke<{ group: CreatedGroup }>('app/update_group', { group_id, ...opts }).then(r => r.group)

export const deleteGroup = (group_id: string): Promise<unknown> =>
  invoke('app/delete_group', { group_id })

export const searchGroups = (q: string): Promise<PublicGroup[]> =>
  invoke<{ results: PublicGroup[] }>('app/search_groups', { q }).then(r => r.results ?? [])

// Join by 6-digit code (existing endpoint; returns the fresh legacy group list).
export const redeemInvite = (code: string): Promise<{ groups?: Group[] }> =>
  invoke<{ groups?: Group[] }>('app/redeem_invite', { code })

// Every group the caller belongs to (owned + joined). "Groups you're in" =
// this minus the owned list. Reuses the existing legacy endpoint.
export const myGroups = (): Promise<Group[]> =>
  invoke<{ groups?: Group[] }>('app/my_groups').then(r => r.groups ?? [])

export const leaveGroup = (group_id: string): Promise<{ groups?: Group[] }> =>
  invoke<{ groups?: Group[] }>('app/leave_group', { group_id })

// Deep-link join. A shared group invite link (once://g/<token> or the https
// brand-site form) opens the app here; we pull the token out and redeem it.
// No-op if the URL isn't a group invite. Redeem needs a session, so a failure
// (e.g. opened before sign-in) is swallowed — tapping the link again once
// signed in joins.
export function parseGroupInviteToken(url: string): string | null {
  const m = url.match(/(?:^|\/)g\/(\d{6})(?:[/?#]|$)/)
  return m ? m[1] : null
}
export async function consumeGroupInviteUrl(url: string): Promise<void> {
  const token = parseGroupInviteToken(url)
  if (!token) return
  try { await redeemInvite(token) } catch { /* not signed in yet / bad token */ }
}

// ── Friends (isolated new tables; "my friends" is derived, not a group) ──

export const myFriends = (): Promise<MyFriends> =>
  invoke<MyFriends>('app/my_friends')

export const searchPeople = (q: string): Promise<Person[]> =>
  invoke<{ results: Person[] }>('app/search_people', { q }).then(r => r.results ?? [])

// 'requested' | 'friends' (auto-linked when a reverse request already existed)
export const friendRequest = (user_id: string): Promise<string> =>
  invoke<{ status: string }>('app/friend_request', { user_id }).then(r => r.status)

export const friendRespond = (request_id: string, accept: boolean): Promise<{ status: string }> =>
  invoke<{ status: string }>('app/friend_respond', { request_id, accept })

export const unfriend = (user_id: string): Promise<unknown> =>
  invoke('app/unfriend', { user_id })
