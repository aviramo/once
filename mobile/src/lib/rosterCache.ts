import { createPersistedMap, createPersistedValue, isArrayOf } from './persistedCache'
import { STORAGE } from '../keys'
import type { GroupMember, JoinRequestItem, MyFriends } from './communities'

// Last known member lists, so opening a group you have opened before paints
// its roster immediately and the server's answer only corrects it. The counts
// on the screen come from the denormalized summary on the user row
// (relations.communities); this is the tier below that — the actual people.
//
// Ordinary staleness is invisible: a roster that changed since the last visit
// is corrected within the same round trip that used to be a blank wait. So
// nothing here expires on a timer — an entry lives until it is overwritten,
// dropped (the group was left or deleted), or wiped at sign-out.

export const rosters = createPersistedMap<GroupMember[]>(
  STORAGE.rosterPrefix,
  isArrayOf,
)

// The pending join requests on a group the caller runs. Cached on the same
// terms as the roster, with one extra hazard the roster doesn't have: a
// request answered on another device is gone server-side but still painted
// here, so responding to it fails. The screen handles that by reloading both
// lists on a failed response — the stale row corrects itself on the tap.
export const joinRequests = createPersistedMap<JoinRequestItem[]>(
  STORAGE.joinRequestsPrefix,
  isArrayOf,
)

const isMyFriends = (v: unknown): v is MyFriends =>
  !!v && typeof v === 'object'
  && Array.isArray((v as MyFriends).friends)
  && Array.isArray((v as MyFriends).requests)

export const friendsRoster = createPersistedValue<MyFriends>(
  STORAGE.friends,
  isMyFriends,
)

/** Sign-out: all three caches hold other people's names and photos. */
export async function clearRosterCaches(): Promise<void> {
  await Promise.all([rosters.clearAll(), joinRequests.clearAll(), friendsRoster.clear()])
}

/** Leaving or deleting a group takes its cached people with it. */
export function dropGroupCaches(groupId: string): void {
  rosters.drop(groupId)
  joinRequests.drop(groupId)
}
