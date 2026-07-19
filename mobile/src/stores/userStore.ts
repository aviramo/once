import { create } from 'zustand'
import { supabase } from '../lib/supabase'
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
  /** Name of a group the viewer and this profile's subject both belong to,
   * NULL when none. Server embeds it in make_profile when the snapshot is
   * written into a single-counterpart slot (page1.profile / page2.profile)
   * and the pair shares any group. Drives the on-photo group chip. Slim
   * viewer-list entries strip this. */
  group_name?: string | null
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
type ServerPage1State = 'free' | 'watching' | 'waiting' | 'chat' | 'locked'
type ServerPage2State = 'free' | 'pending' | 'chat' | 'locked'

interface Page1 {
  state: ServerPage1State
  profile?: Profile
  message?: string
  invited_at?: string
  expires_at?: string
  extended?: boolean
  /** Legacy synth: applyServerUser mirrors `message` (translated via MESSAGE_TO_LEGACY_EVENT) here so existing UI i18n lookups keep working. */
  event?: string
}

interface Page2 {
  state: ServerPage2State
  profile?: Profile
  profiles?: Profile[]
  message?: string
  invited_at?: string
  expires_at?: string
  extended?: boolean
}

interface Pages {
  page1: Page1
  page2: Page2
}

// Legacy synthesized invite-card shape for the page2 incoming invitation UI.
// Predates v3; the store derives it from the new page2 object so existing UI
// branches continue to work without per-component rewrites.
export type Page2Invite = Profile & {
  state: 'pending' | 'missed' | 'fail'
  invited_at?: string
  expires_at?: string
  extended?: boolean
  message?: string
}

/**
 * Pages as the client sees them after applyServerUser runs. Carries
 * synthetic `match`, `watchers`, and a legacy-shaped `page2` (Profile[] |
 * Page2Invite) for back-compat with UI code that predates v3.
 */
interface PagesCompat {
  page1?: Page1
  page2: Profile[] | Page2Invite
  match?: Profile | null
  watchers?: Profile[]
  /** Raw v3 page2.state, preserved so UI can branch on `locked` separately
   * from the synthesized legacy shape (which folds locked-no-profile into
   * the empty watchers array). */
  page2State?: ServerPage2State
  /** Raw v3 page2.message, when present. */
  page2Message?: string
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
  relations?: PagesCompat | null
  /** Synthesized legacy page1 state: 'watching' | 'waiting' | 'chat' | 'missed' | 'fail' | null. Derived from server's v3 page1.state + message via deriveCompat. */
  state: string | null
}

interface UserStore {
  profile: UserProfile | null
  loading: boolean
  /** True once the first fetch() for the current user has completed (success or failure). */
  fetched: boolean
  fetch: (userId: string) => Promise<void>
  update: (patch: Partial<UserProfile>) => void
  applyServerUser: (data: Record<string, unknown> | null | undefined, source?: 'fetch' | 'invoke' | 'invoke:self' | 'realtime') => void
  clear: () => void
}

const CLIENT_AUTHORED: ReadonlyArray<keyof UserProfile> = [
  'images', 'bio', 'family',
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

const pending = new Map<keyof UserProfile, unknown>()

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Messages whose page1 lock represents a failed action the user themselves
// initiated (so the UI shows it as 'fail' rather than 'missed').
const FAIL_MESSAGES = new Set(['invite', 'approve', 'extend'])

/**
 * Translates the server's v3 relations (page1.state + message, page2 with
 * state + profile/profiles/message) into the legacy shape the UI consumes:
 * - synthesized top-level `state` ('watching'|'waiting'|'chat'|'missed'|'fail'|null)
 * - synthesized `match` (chat partner profile)
 * - synthesized `watchers` (Profile[])
 * - legacy `page2` shape (array of Profile when free, Page2Invite object when pending/locked)
 */
function deriveCompat(relations: Pages | null | undefined) {
  const page1 = relations?.page1
  const page2 = relations?.page2

  let state: string | null = null
  if (page1?.state === 'free') state = null
  else if (page1?.state === 'locked') {
    // locked without message = post-clear1 (or brand-new user); UI treats as
    // null/HIDDEN so the green search button shows. With a message, distinguish
    // user-initiated failures (fail) from things that happened to them (missed).
    if (!page1.message) state = null
    else state = FAIL_MESSAGES.has(page1.message) ? 'fail' : 'missed'
  } else if (page1?.state) state = page1.state

  const watchers: Profile[] = page2?.state === 'free' && Array.isArray(page2.profiles)
    ? (page2.profiles as Profile[])
    : []

  // Match represents the other person whose card the home pane is showing.
  // After clear1, page1 stays {state: 'locked'} with profile still attached
  // server-side, but synthesized state goes to null — the card should slide
  // out. Gating match on state prevents the locked-no-message profile from
  // keeping the card mounted.
  const match: Profile | null = state && page1?.profile ? (page1.profile as Profile) : null

  let legacyPage2: Profile[] | Page2Invite
  if (page2?.state === 'pending' && page2.profile) {
    legacyPage2 = {
      ...(page2.profile as Profile),
      state: 'pending',
      ...(page2.invited_at ? { invited_at: page2.invited_at } : {}),
      ...(page2.expires_at ? { expires_at: page2.expires_at } : {}),
      ...(page2.extended !== undefined ? { extended: page2.extended } : {}),
    } as Page2Invite
  } else if (page2?.state === 'locked' && page2.profile && page2.message) {
    // Dead-invite card surfaces only while the message is present. Once the
    // user acknowledges via clear2 the message is gone and locked+profile is
    // treated as plain "needs free2" (legacyPage2 = [] empty watchers).
    const synthState: 'missed' | 'fail' =
      FAIL_MESSAGES.has(page2.message) ? 'fail' : 'missed'
    legacyPage2 = {
      ...(page2.profile as Profile),
      state: synthState,
      message: page2.message,
    } as Page2Invite
  } else {
    legacyPage2 = watchers
  }

  return {
    state, watchers, match, legacyPage2,
    page2State: (page2?.state ?? 'free') as ServerPage2State,
    page2Message: page2?.message,
  }
}

// Translate raw v3 `relations` into the legacy compat shape the UI reads and
// write the result onto the in-flight payload `d` (sets d.state + d.relations
// = raw relations spread + synthesized watchers/match/page2/page2State).
// Single source of truth for both the Realtime/fetch path and the trusted
// find/ignore page1 merge.
function writeCompat(d: Record<string, unknown>, relations: Pages | null | undefined) {
  const compat = deriveCompat(relations)
  d.state = compat.state
  const relationsWithCompat: Record<string, unknown> = { ...(relations ?? {}) }
  relationsWithCompat.watchers = compat.watchers
  relationsWithCompat.match = compat.match
  relationsWithCompat.page2 = compat.legacyPage2
  relationsWithCompat.page2State = compat.page2State
  if (compat.page2Message !== undefined) {
    relationsWithCompat.page2Message = compat.page2Message
  } else {
    delete relationsWithCompat.page2Message
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
export function selectIsHidden(profile: UserProfile | null | undefined): boolean {
  const page2 = profile?.relations?.page2
  const hasInviteCard = !!page2 && !Array.isArray(page2)
  return profile?.relations?.page2State === 'locked' && !hasInviteCard
}

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  loading: false,
  fetched: false,

  fetch: async (userId: string) => {
    set({ loading: true })
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (data) get().applyServerUser(data as Record<string, unknown>, 'fetch')
      else set({ profile: null })
    } finally {
      set({ loading: false, fetched: true })
    }
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
      const respRel = d.relations as Pages
      const base = lastRawRelations ?? respRel
      const rebuilt = { ...base, page1: respRel.page1 } as Pages
      lastRawRelations = rebuilt
      writeCompat(d, rebuilt)
    } else if ((source === 'invoke' || source === 'invoke:self') && prev) {
      // Plain invoke (or a find/ignore response with no relations / before any
      // prev existed). Invoke (HTTP) responses can race with Realtime events
      // and arrive stale — Realtime and explicit fetch are the authoritative
      // source for game state — so strip relations/state.
      delete (d as Record<string, unknown>).relations
      delete (d as Record<string, unknown>).state
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
      const relations = d.relations as Pages | null | undefined
      lastRawRelations = relations ?? null
      writeCompat(d, relations)
    }
    if (!prev) { set({ profile: d as unknown as UserProfile }); return }
    const merged: Record<string, unknown> = { ...prev, ...d }
    for (const k of CLIENT_AUTHORED) {
      if (!pending.has(k)) continue
      const pendingVal = pending.get(k)
      if (equal(d[k as string], pendingVal)) {
        pending.delete(k)
      } else {
        merged[k as string] = pendingVal
      }
    }
    set({ profile: merged as unknown as UserProfile })
  },

  clear: () => { pending.clear(); lastAppliedLastSeen = 0; lastRawRelations = null; set({ profile: null, fetched: false }) },
}))
