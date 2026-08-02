// Circles & Friends — typed client for the phase-1 endpoints (server
// shipped 2026-07-25). Every call funnels through `invoke`, which already
// applies the returned user row to the store and hands back the full payload;
// these helpers just pull the sidecar field the screen needs. The 6-digit
// invite code + the base `Group` type stay in groups.ts (shared with the
// onboarding step); this module is the richer circles surface.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { invoke } from './api'
import { supabase } from './supabase'
import { STORAGE } from '../keys'
import { LIST_PAGE_SIZE } from '../tokens'
import { getLocales } from 'expo-localization'
import { t, pinDirection } from '../i18n'
import type { MetaPart } from './meta'
import type { Group } from './groups'
import { useUserStore, type Profile } from '../stores/userStore'

// A member/person's main photo, as embedded by the server (data.images[0]).
// `normal` is the filename under the user's `normal/` folder — feed it to
// publicImageUrl(user_id, 'normal', normal) to render.
export type MemberImage = { hash?: string; normal?: string } | null

// `profile` is the full profile card payload, so tapping a person anywhere in
// the Circles sheet opens the same card the app shows for a match (server
// 2026-07-27). Always without a distance. Optional: a row cached by an older
// build predates it.
// `joined_at` is when this person came into the group (user_groups.created_at,
// the very column the roster is ordered by). Optional: a row cached by a build
// that predates the field simply has none, and the line that states it is then
// not drawn.
export type GroupMember = { user_id: string; name: string | null; image: MemberImage; joined_at?: string | null; owner?: boolean; manager?: boolean; profile?: Profile | null }

// ── Meta lines ─────────────────────────────────────────────────────────────
// Every row states its facts on one line, separated by the same interpunct: the
// hub rows ("17 members · 3 requests") and the settings menu row
// ("4 groups · 5 friends"). Nothing here JOINS that line — a screen hands its
// facts to components/MetaLine.tsx (usually through the app's one row,
// components/Strip.tsx) and that is the only place the separator is put in.
// This module supplies the WORDINGS below, and — for a group, whose facts are
// listed on four different surfaces — their one ORDER (`groupFacts`).

// The count wordings every meta line is built from — one definition each, so a
// number reads the same in the hub row and in the popup. Each takes the singular
// form at 1 (Hebrew has no "1 מעגלים").
const count = (key: 'circles.membersCount' | 'circles.friendsCount' | 'circles.requestsCount', n: number) =>
  t(key).replace('{count}', String(n))
// ── When this person turned up in this circle ──────────────────────────────
// The line under a group's name on a person's page (user directive 2026-07-31):
// when they JOINED, or — for someone still at the door — when they ASKED. Both
// are one date, stated as a date and not as "3 days ago": a relative phrase is
// right for a presence chip, where recency IS the fact, and wrong for a
// standing membership, where it turns into "412 days ago" the moment a group
// has any history.
//
// The date is written in the OS's own locale rather than the UI language, the
// same choice the family calendar makes (SettingsSurfaces' dayMonthFormatter):
// a Hebrew UI on a US phone still reads month/day, because that is the order
// the reader is used to everywhere else on the device.
//
// Both sentences are GENDERLESS on purpose ("in the group since", not "joined"
// / "הצטרף"), so neither needs the subject's gender to be known — a row cached
// by an older build carries no profile at all.
const joinDateFormatter = new Intl.DateTimeFormat(
  getLocales()[0]?.languageTag ?? 'en-US',
  { year: 'numeric', month: 'numeric', day: 'numeric' },
)

// THE LINE SAYS WHO IT IS ABOUT (user directive 2026-07-31): "Ofir in the group
// since 30.7.2026", not a bare "in the group since". It stands under a block
// that is entirely about the GROUP — the owner's face, the group's facts, its
// name — so a sentence with no subject was read as one more fact about the
// circle. A row cached with no name still reads: the placeholder empties and the
// old subjectless sentence is what is left.
const onDate = (
  key: 'circles.inGroupSince' | 'circles.waitingSince',
  iso: string | null | undefined,
  name: string | null | undefined,
): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // ...and the sentence reads in the UI's direction whatever script the name is
  // in: a Latin name at the head of a Hebrew line turned the whole line around
  // and left the date sitting between the name and its own words (user report
  // 2026-07-31). See pinDirection.
  return pinDirection(
    t(key)
      .replace('{name}', name?.trim() ?? '')
      .replace('{date}', joinDateFormatter.format(d))
      .trim(),
  )
}

/** "Ofir in the group since 20.6.2026" — a member's own line. */
export const memberSince = (iso: string | null | undefined, name?: string | null) =>
  onDate('circles.inGroupSince', iso, name)
/** "Ofir waiting since 20.6.2026" — the same line for someone still at the door. */
export const waitingSince = (iso: string | null | undefined, name?: string | null) =>
  onDate('circles.waitingSince', iso, name)

export const memberLabel = (n: number) => (n === 1 ? t('circles.oneMember') : count('circles.membersCount', n))
export const friendLabel = (n: number) => (n === 1 ? t('circles.oneFriend') : count('circles.friendsCount', n))
export const requestLabel = (n: number) => (n === 1 ? t('circles.oneRequest') : count('circles.requestsCount', n))

// A GROUP's facts, in the app's ONE order (user directive 2026-07-29): HOW BIG
// IT IS always leads, and every other fact about the group follows it. The size
// is the fact a reader is scanning the list for, and it is the only one every
// group has, so it must not sit behind a name whose length moves it around from
// row to row. Every surface that states a group's facts — the hub rows, a search
// result, the group popup's head, a match card's shared-circles list — composes
// them HERE, so no two lists can order them differently.
// `members` null/undefined = a payload too old to carry a count: the fact drops
// out and the line is whatever is left.
export const groupFacts = (
  members: number | null | undefined,
  ownerName?: string | null,
  ...rest: MetaPart[]
): MetaPart[] => [
  members != null ? memberLabel(members) : null,
  ownerName ? t('circles.managedBy').replace('{name}', ownerName) : null,
  ...rest,
]

// The on-photo chip's label when the circle it names is the friends one:
// "חבר של אסף" / "חברה של אסף". The gender is the CARD SUBJECT's, not the named
// friend's — the sentence is about the person whose card this is ("she is a
// friend of Asaf"), so it inflects with `match.is_male`.
export const friendOfLabel = (name: string, subjectIsMale?: boolean | null) =>
  t(subjectIsMale === false ? 'circles.friendOfF' : 'circles.friendOfM')
    .replace('{name}', name)

// ── One circle chip: how the two of us are already connected ───────────────
// MY FRIENDS IS A GROUP LIKE ANY OTHER (user directive 2026-07-29). A card used
// to carry two chips — a shared GROUP and a mutual FRIEND — each with its own
// "+N" and its own popup. They answer the same question, so there is one chip,
// and the friends set is ranked among the groups exactly as a group is:
//
//   THE SMALLEST CIRCLE WINS. The friends circle's size is how many friends I
//   have: "if I have only 2 friends and Asaf is one of them, and the other
//   groups have more than 2 members, name Asaf; otherwise the group with the
//   fewest members" (user directive 2026-07-29). The smaller the circle, the
//   more naming it says about the two of us.
//
// This is the ONE place that rule lives — the chip picks its name with it and
// the popup orders its rows with it, so a row can never contradict the chip that
// opened it. The server only states the sizes: `group_members` on the smallest
// shared group (make_profile), `members` on every row of app_shared_groups, and
// my own friend count off my summary.
const friendsCircleFirst = (myFriends: number, groupMembers: number) => myFriends < groupMembers

/** What the card's circle chip says: the named circle, plus how many OTHER
 *  circles we share, and `count` — how many rows the popup behind it will have
 *  (the named one plus the extras). The chip is the only thing that knows that
 *  number before the lists are fetched, which is what lets a card sharing ONE
 *  circle open that circle's own surface instead of a list of one (user
 *  directive 2026-08-02; see SharedCirclesPopup). Null when we share none.
 *
 *  THE "+N" COUNTS WHAT THE POPUP LISTS (user directive 2026-07-30): a shared
 *  group is one, and so is EVERY mutual friend — the popup gives each of them a
 *  row of its own, so a chip that folded them into a single circle said "+2"
 *  over a list of five rows. (It did, for one day: the 2026-07-29 rule was "a
 *  circle counts once however many people are in it". Do not restore it without
 *  also collapsing the popup's friend rows into one.)
 *
 *  Which circle is NAMED is a separate question and is unchanged — the smallest
 *  one wins, with the friends circle ranked at MY friend count. */
export function sharedCircle(
  m: Pick<Profile, 'group_name' | 'group_extra' | 'group_members' | 'friend_name' | 'friend_extra' | 'is_male'>,
  myFriends: number,
): { label: string; count: number; extra?: number } | null {
  const groups = m.group_name ? 1 + (m.group_extra ?? 0) : 0
  const friends = m.friend_name ? 1 + (m.friend_extra ?? 0) : 0
  const total = groups + friends
  if (!total) return null
  // A snapshot written before the server carried `group_members` cannot be
  // ranked, so the group it already names keeps the chip.
  const nameFriend = friends > 0
    && (groups === 0 || (m.group_members != null && friendsCircleFirst(myFriends, m.group_members)))
  return {
    label: nameFriend ? friendOfLabel(m.friend_name!, m.is_male) : m.group_name!,
    count: total,
    extra: total - 1 || undefined,
  }
}

/** One row of the chip's popup: a person we are both friends with, or a group we
 *  are both in. */
export type SharedCircleItem =
  | { kind: 'friend'; friend: FriendItem }
  | { kind: 'group'; group: SharedGroup }

/** Everything we share, in the order the chip ranks it: the groups smallest
 *  first (the server's own order), with MY FRIENDS slotted in at its size — so
 *  row 1 is always the circle the chip named. */
export function orderSharedCircles(
  groups: SharedGroup[],
  friends: FriendItem[],
  myFriends: number,
): SharedCircleItem[] {
  const at = groups.findIndex(g => friendsCircleFirst(myFriends, g.members))
  const cut = at < 0 ? groups.length : at
  return [
    ...groups.slice(0, cut).map(group => ({ kind: 'group' as const, group })),
    ...friends.map(friend => ({ kind: 'friend' as const, friend })),
    ...groups.slice(cut).map(group => ({ kind: 'group' as const, group })),
  ]
}

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
export const DEFAULT_GROUP_KIND: GroupKind = 'approved'
export const groupKind = (g: { is_public?: boolean | null; requires_approval?: boolean | null }): GroupKind =>
  !g.is_public ? 'private' : g.requires_approval ? 'approved' : 'open'
export const groupKindFlags = (kind: GroupKind): { is_public: boolean; requires_approval: boolean } => ({
  is_public: kind !== 'private',
  requires_approval: kind !== 'open',
})
// `link` is the group's optional "more details" URL: owners/managers set it
// under the description, every member sees it as a tappable line in the group
// popup. The server is the only place it is normalized and validated (a bare
// host gets https://, anything that isn't http/https is refused), so a client
// may hand what it receives straight to Linking.openURL. Optional/null: most
// groups have none, and a row cached by an older build predates the field.
// `requires_approval` gates joins (a link/search join becomes a pending request
// an owner/manager must approve); `description` is the editable group blurb;
// `pending` is the count of pending join requests (shown as a badge to staff).
// `hidden` is MY OWN membership flag in this group, not a property of the
// group: while it is on, the group's members and I never meet each other in the
// game (the server drops the pair from both candidate pools and the group stops
// counting as a shared group between us). It is what lets someone run a
// circle without playing inside it. Optional: a row cached by an older build
// predates it.
export type OwnedGroup = { id: string; name: string; invite_code: string; is_public: boolean; members: number; is_owner?: boolean; requires_approval?: boolean; description?: string | null; link?: string | null; pending?: number; hidden?: boolean; roster_rev?: number }
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
export type PublicGroup = { id: string; name: string; members: number; joined: boolean; invite_code?: string; owner_id?: string | null; owner_name?: string | null; owner_image?: MemberImage; description?: string | null; link?: string | null; requires_approval?: boolean; requested?: boolean; relevant?: number }
export type Person = { user_id: string; name: string | null; image: MemberImage; requested: boolean; friend: boolean }
// One row of the group chip's detail popup: a group the viewer and the profile
// subject both belong to. `owner` is null for admin-owned groups.
export type SharedGroupOwner = { user_id: string; name: string | null; image: MemberImage }
// is_public / invite_code (public only) / description let a tapped row open the
// same group popup (GroupSheet) as the Circles hub.
export type SharedGroup = { id: string; name: string; members: number; owner: SharedGroupOwner | null; is_public?: boolean; invite_code?: string | null; description?: string | null; link?: string | null }
export type FriendItem = { user_id: string; name: string | null; image: MemberImage; profile?: Profile | null }
export type FriendRequestItem = { id: string; user_id: string; name: string | null; image: MemberImage }
export type MyFriends = { friends: FriendItem[]; requests: FriendRequestItem[] }

// Lightweight summary the server denormalizes into users.relations.communities
// (maintained by triggers). Lets the hub + the settings row paint instantly
// from the store — no query. Heavier lists (rosters, people search, the full
// friends list) stay on-demand.
// A group the caller belongs to (not owned/managed). Carries enough to paint
// the hub row and drive the popup: type + member count, the invite_code for
// PUBLIC groups only (a public code is not a secret, so a member can share the
// link; private groups get no code), and WHO RUNS IT — the same
// SharedGroupOwner object shared_groups embeds, so GroupSheet reads one
// field whichever surface opened it. null for an admin-owned group; undefined
// on a summary written before the server carried it (server 2026-07-28).
export type JoinedGroup = { id: string; name: string; is_public?: boolean; members?: number; invite_code?: string | null; description?: string | null; link?: string | null; owner?: SharedGroupOwner | null; roster_rev?: number }

// ── The one group the popup is about ───────────────────────────────────────
// THE shape GroupSheet reads, whichever list opened it (user directive
// 2026-07-28: one group popup everywhere). JoinedGroup / PendingGroup /
// SharedGroup already ARE this shape, so a hub row and a shared-groups row hand
// their item straight over; a search result carries its owner flattened onto
// three columns, which `groupBrief` folds back into the one `owner` field.
export type GroupBrief = {
  id: string
  name: string
  members?: number
  owner?: SharedGroupOwner | null
  description?: string | null
  link?: string | null
  is_public?: boolean
  invite_code?: string | null
  /** Decides the wording of the join action for a group I am not in yet. */
  requires_approval?: boolean
  /** I OWN THIS CIRCLE — so the popup refuses me the one thing an owner may not
   *  do, leave it (he hands the key over first; see GroupSheet's `iOwnIt`). Same
   *  field name `OwnedGroup` already carries, so a managed row spreads straight
   *  into a brief and states it for free. The other hosts leave it undefined and
   *  the popup falls back to matching the owner it draws against my own id —
   *  which is the same answer wherever the owner is known, and this flag is what
   *  covers the moment before a roster has arrived to say who that is. */
  is_owner?: boolean
  /** THE ROSTER'S OWN REVISION (server 2026-08-02). One counter on the circle,
   *  bumped by every change to who stands in it and what they are to it: a
   *  join, a leave, a removal, an appointment, an unappointment, a handover.
   *  It rides in the summary, which rides on the user row Realtime already
   *  delivers, so a device standing on a roster is told to re-read it the
   *  moment somebody else changes it.
   *
   *  It exists because the other facts here cannot say it: a member COUNT is
   *  unchanged by a role change, and the `owner` is unchanged by everything
   *  except a handover. Undefined on a summary written before the server
   *  carried it — and then a roster behaves as it always did, correcting
   *  itself on the next open. */
  roster_rev?: number
}

export const groupBrief = (g: PublicGroup): GroupBrief => ({
  id: g.id,
  name: g.name,
  members: g.members,
  owner: g.owner_id ? { user_id: g.owner_id, name: g.owner_name ?? null, image: g.owner_image ?? null } : null,
  description: g.description,
  link: g.link,
  // Everything search can return is searchable by definition, so its invite
  // link is not a secret and a member of it may hand it on.
  is_public: true,
  invite_code: g.invite_code,
  requires_approval: g.requires_approval,
})

// A group the caller has an outstanding join request on (requires_approval
// group they hit Join/Request on). Same shape as JoinedGroup so the hub row
// can render identically — only the meta line + tap action differ.
export type PendingGroup = JoinedGroup

export type CirclesSummary = {
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

type WithCircles = { relations?: unknown } | null | undefined

/** Read the denormalized summary off a user/profile. null when the server
 *  hasn't populated it yet (old payload) — callers fall back to the endpoints.
 *
 *  `communities` IS THE WIRE KEY AND IT DOES NOT MOVE (2026-08-02). The app's
 *  own word for this became `circles` everywhere a developer reads it — the
 *  module, the page, the types, the i18n keys — and this one string stayed,
 *  for the same reason `group` still names a מעגל in the schema: it is the
 *  name of a field the PUBLISHED build reads out of `users.relations`, written
 *  by the DB's own trigger, and renaming it would empty the hub, the dock's
 *  counts and its dots on every device until it updated. Nobody sees it.
 *  Renaming it would be an Expand → Migrate → Contract staged over weeks in
 *  exchange for nothing. */
export function circlesSummary(profile: WithCircles): CirclesSummary | null {
  const relations = profile?.relations as { communities?: unknown } | null | undefined
  const c = relations?.communities as Partial<CirclesSummary> | undefined
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
export function pendingApprovals(c: CirclesSummary | null): number {
  if (!c) return 0
  return c.requests + c.managed.reduce((n, g) => n + (g.pending ?? 0), 0)
}

/** How many friends I have — the SIZE of "my friends" as a circle, which is
 *  what ranks it against the shared groups (see sharedCircle). Read straight
 *  off the denormalized summary, so a card can size the circle without a query;
 *  a number, so the selector only re-renders the card when it changes. */
export const useMyFriendCount = (): number =>
  useUserStore(s => circlesSummary(s.profile)?.friends ?? 0)

// ── Circles (reuse the existing groups/user_groups machinery server-side) ──

// Only the name is required; description and link are both optional, and the
// link is normalized/validated by the same server rule the settings editor uses.
export const createGroup = (
  name: string, is_public: boolean,
  opts?: { description?: string | null; link?: string | null; requires_approval?: boolean },
): Promise<CreatedGroup> =>
  invoke<{ group: CreatedGroup }>('app/create_group', { name, is_public, ...opts }).then(r => r.group)

export const ownedGroups = (): Promise<OwnedGroup[]> =>
  invoke<{ owned: OwnedGroup[] }>('app/owned_groups').then(r => r.owned ?? [])

export const groupMembers = (group_id: string): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/group_members', { group_id }).then(r => r.members ?? [])

export const removeMember = (group_id: string, user_id: string): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/remove_member', { group_id, user_id }).then(r => r.members ?? [])

// Appoint / unappoint an APPROVER (owner only) — the role that answers join
// requests, called `manager` on the wire and in the DB. Returns the fresh
// roster. Refused with `open_group` on an OPEN group (user directive
// 2026-07-30): there is nothing to approve there, so there is no role to give.
export const setManager = (group_id: string, user_id: string, make: boolean): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/set_manager', { group_id, user_id, make }).then(r => r.members ?? [])

// Hand the group to one of its members (owner only). The caller drops to
// MANAGER, so the group stays in `managed` with is_owner off — the fresh user
// row rides in the response (the store merges it) and, like every other roster
// action, so does the roster the handover just rewrote.
export const transferOwner = (group_id: string, user_id: string): Promise<GroupMember[]> =>
  invoke<{ members: GroupMember[] }>('app/transfer_owner', { group_id, user_id }).then(r => r.members ?? [])

// name / is_public / requires_approval each omitted = unchanged. `description`
// and `link` are applied only when the key is present (pass null to clear) —
// the server keys off the key's presence, so undefined leaves them untouched.
export const updateGroup = (
  group_id: string,
  opts: { name?: string; is_public?: boolean; description?: string | null; link?: string | null; requires_approval?: boolean },
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

// Empty the queue: every pending request on the group is approved in ONE
// server transaction (and one push each), instead of a round trip per person.
// Same payload as respondJoin, so both caches are written from one answer.
export const approveAllJoins = (group_id: string): Promise<{ members: GroupMember[]; requests: JoinRequestItem[] }> =>
  invoke<{ members?: GroupMember[]; requests?: JoinRequestItem[] }>('app/approve_all_joins', { group_id })
    .then(r => ({ members: r.members ?? [], requests: r.requests ?? [] }))

export const deleteGroup = (group_id: string): Promise<unknown> =>
  invoke('app/delete_group', { group_id })

// One page of the findable catalogue. An EMPTY `q` is not a no-op: it means
// browse, so the window opens on the whole catalogue instead of a blank. Either
// way the server orders by how many members are candidates for the caller
// (`relevant` on each row), matches names approximately rather than by
// containment, and reports whether another page exists.
export type GroupPage = { results: PublicGroup[]; has_more: boolean }
export const searchGroups = (q: string, offset = 0, limit = LIST_PAGE_SIZE): Promise<GroupPage> =>
  invoke<{ results?: PublicGroup[]; has_more?: boolean }>('app/search_groups', { q, offset, limit })
    .then(r => ({ results: r.results ?? [], has_more: r.has_more === true }))

// Join by 6-digit code (existing endpoint; returns the fresh legacy group list).
// `join_status` distinguishes an instant join from a pending request on an
// approval-gated group ('pending'), an existing membership ('already'), and a
// request a manager already turned down ('declined', server 2026-07-27 — the
// link no longer silently re-queues someone who was refused).
export type JoinStatus = 'joined' | 'pending' | 'already' | 'declined'
/** Where a redeemed invite leaves me, as the group popup states a standing.
 *  'already' is a membership I had before the tap, which is the same standing
 *  as one it just created — the popup says what I AM, not what changed. */
export type GroupStanding = 'joined' | 'pending' | 'declined'
export const groupStanding = (s: JoinStatus): GroupStanding => (s === 'already' ? 'joined' : s)
// `group` (server 2026-08-02) is the circle the code named, described the way
// the popup reads one — so a tapped invite link can open that circle's popup on
// the first frame instead of waiting for the summary. Optional: an older server
// answers without it, and then the link just lands on the hub as it always did.
export const redeemInvite = (code: string): Promise<{ groups?: Group[]; join_status?: JoinStatus; group?: GroupBrief }> =>
  invoke<{ groups?: Group[]; join_status?: JoinStatus; group?: GroupBrief }>('app/redeem_invite', { code })

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

// People the caller and `user_id` are BOTH friends with, by name (same order
// as the on-photo chip's named friend). Backs the friend chip's detail popup.
export const sharedFriends = (user_id: string): Promise<FriendItem[]> =>
  invoke<{ friends: FriendItem[] }>('app/shared_friends', { user_id }).then(r => r.friends ?? [])

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
// The outcome goes to whoever is watching — home opens the Circles sheet on
// it, and for a GROUP link that circle's own popup over the hub, so the tap
// lands on the thing it was a link to. An outcome nobody was there to see is
// HELD, not dropped: on a cold start the redeem finishes long before home
// mounts, and watching from a mount picks it up either way.

/** Which kind of invite was redeemed — all a screen needs to decide where to
 *  land the user.
 *
 *  A GROUP LINK CARRIES THE CIRCLE IT LED TO (user directive 2026-08-02): the
 *  hub opens that circle's own popup over itself, so following a link to one
 *  circle lands ON it instead of on the list of everything I am in. The group is
 *  carried WHOLE — the redeem returns it (see redeemInvite) — because the
 *  denormalized summary the hub paints from arrives over Realtime a beat later,
 *  and a popup cannot open on a group that is not there yet. Both fields are
 *  optional so an outcome from a server that predates them still lands the user
 *  on the hub. */
export type InviteOutcome =
  | { kind: 'group'; group?: GroupBrief; standing?: GroupStanding }
  | { kind: 'friend' }

// ── Where a notification tap lands ─────────────────────────────────────────
// A push about a PERSON opens that person's page, with the buttons that page
// owns — a join request opens the requester's profile with approve/decline, a
// new friend opens their page in My Friends (user directive 2026-07-27). A push
// about a queue opens the queue. Home resolves the push code into one of these
// and hands it to the sheet, which seeds its whole page stack from it, so Back
// walks out through the pages that would have led there by hand.
//
// The one target with NO path under it is `person`: it does not come from a
// notification at all but from a tap on a name in a card's shared-circles
// popup, and the page that led there is the popup, not a Circles page.
export type CirclesTarget =
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
  /** A GROUP LINK JUST REDEEMED (user directive 2026-08-02): the hub, with that
   *  circle's own popup over it. It is not the `group` target above — that one
   *  is a push about a group I am already in and lands on the page my standing
   *  gives me (a manager's group page, a member's popup); this is the answer to
   *  a link I tapped, so it is always the popup, whatever I am to the circle and
   *  whether I am IN it or waiting at its door.
   *
   *  The group is carried whole, like `person` and for the same reason: the
   *  redeem returns it, so the popup paints with no lookup and no wait for the
   *  summary. `standing` is what the redeem said I am now.
   *
   *  It is the popup ITSELF, unchanged (user directive 2026-08-02): the same
   *  head, the same note and the same options a row on the hub opens it with —
   *  leaving, taking the request back, sharing the link. Where the open came
   *  from decides WHICH surface, never what is on it. */
  | { kind: 'arrival'; group: GroupBrief; standing: GroupStanding }
  /** ONE person and nothing else (user directive 2026-07-29): their page opens
   *  as the whole sheet, with no My-Friends roster under it to walk back
   *  through — the tap came from a card, not from the friends list. The person
   *  is carried whole rather than by id: the shared-circles row already holds
   *  the full item (`app_shared_friends` embeds each friend's profile), so the
   *  page paints on the first frame with no lookup. */
  | { kind: 'person'; friend: FriendItem }

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
    if (invite.kind === 'group') {
      // The circle and the standing ride back with the redeem, so the outcome
      // says which popup to open as well as which surface to land on.
      const r = await redeemInvite(invite.code)
      parkInvite(null)
      deliverOutcome({ kind: 'group', group: r.group, standing: r.join_status && groupStanding(r.join_status) })
      return
    }
    await linkFriendByCode(invite.code)
    parkInvite(null)
    deliverOutcome({ kind: 'friend' })
  } catch {
    // Left parked: a transient failure retries on the next flush, and a code
    // that is simply invalid never redeems (no user-facing error — the link was
    // not one this account can use).
  }
}
