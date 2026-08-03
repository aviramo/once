// ── CirclesPage ────────────────────────────────────────────────────────
//
// The body of the Circles OverlaySheet (opened from the menu's
// "Circles" row). It is ONE sheet with an internal view stack — a hub that
// drills into: my friends, link-a-friend, a group you manage, a group you're
// in, create, and find/join. Swiping down (PullPane) is the ONLY way out of
// every page, the hub included: at the hub it takes the sheet, and above it, it
// rides one page off the bottom and pops it. NO PAGE WEARS A CLOSE X (user
// directive 2026-07-31) — a stack whose every page leaves by the same gesture
// does not need a control saying so on each of them, and dropping it hands the
// row's start to the page's own NAME (see the header below).
//
// Server: everything speaks to the phase-1 endpoints via src/lib/circles.
// Circles reuse the existing groups machinery; "my friends" is the derived
// friend-links set. See CLAUDE.md + project memory.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Pressable, TouchableWithoutFeedback, Keyboard, Linking, FlatList, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import { Path, Circle, Line } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBottomInset } from '../hooks/useBottomInset'
import { Text, TextInput } from './AppText'
import { SheetHeader, type OverlaySheetBody } from './OverlaySheet'
import { PullContext, PullScrollView, PullPane, usePullBehavior, type PullCtx } from './PullPane'
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming, runOnJS, type SharedValue } from 'react-native-reanimated'
import type { GestureType } from 'react-native-gesture-handler'
import { RisingCard } from './RisingCard'
import { Button } from './Button'
import { RoundButton } from './RoundButton'
import { Spinner } from './Spinner'
import { ConfirmDialog } from './ConfirmDialog'
import { BottomSheet, SheetScroll, SheetActionPair, SHEET_DESC } from './BottomSheet'
import { Glyph, GroupsIcon, TrashIcon, RankIcon, KeyIcon, UserMinusIcon, SignOutIcon, CheckIcon, DoubleCheckIcon, CloseIcon, SearchIcon, CreditIcon, GlobeIcon } from './icons'
import { GlyphSlot } from './GlyphSlot'
import { ToggleRow } from './Switch'
import { tap, tapWarning } from '../lib/haptics'
import { t, genderize } from '../i18n'
import { useUserStore, type Profile } from '../stores/userStore'

type StoreProfile = ReturnType<typeof useUserStore.getState>['profile']
import { Avatar, AvatarDisc, GroupHead, SkeletonRows, SyncBar } from './CircleBits'
import { Chip } from './Chip'
import { Strip, STRIP_GUTTER } from './Strip'
import { MatchCard, ProfileActionBar, profileActionBarShows } from './MatchCard'
import { type StripOption } from './OptionStrip'
import { CirclesArt } from './CirclesArt'
import { ArrowDownArt } from './ArtKit'
// Cyclic with this module by design (SharedListPopup opens the group popup that
// lives here): both sides touch the other only at render time, and every export
// involved is a hoisted function declaration, so neither can see a half-built
// module. Keeping the popup out of here instead would fork the app's one
// "everything we share" surface into two.
import { SharedCirclesPopup, useSharedCircles } from './SharedListPopup'
import type { MetaPart } from '../lib/meta'
import { rosters, joinRequests, friendsRoster, dropGroupCaches } from '../lib/rosterCache'
import { shareFriendInvite } from '../lib/referral'
import { shareInvitation } from '../lib/share'
import { REFERRAL_REWARD } from '../lib/credits'
import { groupInviteUrl } from '../lib/links'
import { EditableText } from './EditableText'
import { GROUP_NAME_MAX, GROUP_DESCRIPTION_MAX, GROUP_LINK_MAX } from '../lib/groups'
import { serverErrorCode } from '../lib/api'
import {
  ownedGroups, myGroups, myFriends, groupMembers, removeMember, deleteGroup,
  updateGroup, createGroup, searchGroups, redeemInvite, leaveGroup, setManager, transferOwner,
  friendRespond, unfriend, circlesSummary, cancelJoinRequest,
  groupRequests, respondJoin, approveAllJoins, setGroupHidden,
  groupKind, groupKindFlags, GROUP_KINDS, DEFAULT_GROUP_KIND, type GroupKind,
  groupFacts, friendLabel, requestLabel, groupBrief, memberSince, waitingSince, type GroupBrief,
  type OwnedGroup, type GroupMember, type MyFriends, type PublicGroup, type MemberImage,
  type FriendItem, type CirclesSummary, type JoinedGroup, type PendingGroup,
  type JoinRequestItem, type CirclesTarget,
} from '../lib/circles'
import { XS, SM, MD, LG, XL, RADIUS, TEXT, WEIGHT, ICON, STROKE, ROUND_BUTTON_SIZE_SM, SHEET_GAP, lh, bottomGap, LIST_PAGE_AHEAD_VIEWPORTS, SEARCH_DEBOUNCE_MS, DISABLED_OPACITY } from '../tokens'
import { PAGE, SURFACE, INK, INK_MUTED, INK_SUBTLE, INK_WASH, WHITE, INK_DIM, NEGATIVE } from '../colors'
import { FIELD_SKIN } from '../field'
import { fuzzyRank } from '../lib/fuzzy'

const PlusGlyph = ({ color = INK, size = ICON.md }: { color?: string; size?: number }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
    <Line x1="12" y1="5" x2="12" y2="19" /><Line x1="5" y1="12" x2="19" y2="12" />
  </Glyph>
)
// Dedicated "share" mark (tray + upward arrow) for the share-invite buttons.
// IT TAKES A SIZE like every other glyph in the app: it used to pin its own
// ICON.md, so the `Button` that injects a size into its icon (the one place that
// decides how big a button's mark is) was silently ignored, and a stacked button
// standing beside a 24dp option carried an 18dp mark (user report 2026-07-31).
// The pen is the app's own too — it was drawn at a 1.9 of its own, a hair off the
// STROKE.base every other line-art mark at this size uses.
const ShareGlyph = ({ color = WHITE, size = ICON.md }: { color?: string; size?: number }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3v12" /><Path d="M8 7l4-4 4 4" /><Path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Glyph>
)
// Settings gear (rides the manage page's header, at the end of the row opposite
// the group's own name).
const GearGlyph = ({ color = INK, size = ICON.md }: { color?: string; size?: number }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="3.2" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Glyph>
)
// (A plaque glyph stood here for the settings bar's preview — a card with a face
// and two lines on it, "the popup as a mark". The preview moved to the roster's
// foot on 2026-08-02 and took the app's own circles mark with it: what it opens
// is the CIRCLE, so it wears the glyph a circle is drawn with everywhere else.)

// A control on the title bar's trailing corner, at the far end of the row from
// the page's name. ONE definition for all three (the hub's find + create, the
// manage page's gear): backgroundless, sized to the app's small chrome circle,
// so the corner reads as chrome beside the title rather than a strip of buttons.
function HeaderButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <RoundButton
      size={ROUND_BUTTON_SIZE_SM}
      bg="transparent"
      shadow={false}
      onPress={() => { tap(); onPress() }}
      accessibilityLabel={label}
    >
      {children}
    </RoundButton>
  )
}

// ── View stack ─────────────────────────────────────────────────────────────
/** Who the person page is showing, and therefore what can be done about them. */
type PersonTarget =
  | { kind: 'member'; group: OwnedGroup; member: GroupMember }
  | { kind: 'friend'; friend: FriendItem }

type CView =
  | { k: 'hub' }
  | { k: 'friends' }
  | { k: 'find' }
  | { k: 'create' }
  // A group I manage. `openRequests` seeds its waiting queue OPEN — the queue
  // is a drawer inside this page's own roster now (user directive 2026-07-31),
  // not a page of its own, so a notification that used to land ON the queue
  // lands on the group with the queue already unfolded.
  | { k: 'owned'; group: OwnedGroup; openRequests?: boolean }
  | { k: 'settings'; group: OwnedGroup }
  // One requester's profile, opened from the queue. Approving is a decision
  // about a PERSON, so it is made on the same profile card the app shows for a
  // match, not from a row with two buttons on it (user directive 2026-07-27).
  | { k: 'request'; group: OwnedGroup; request: JoinRequestItem }
  // A person you are already connected to: a member of a group you manage, or
  // one of your friends. Same full profile card as a requester's, with the
  // actions that used to live in a popup moved onto it (user directive
  // 2026-07-27) — nothing about a person is decided from a row any more.
  //
  // MYSELF IN A ROSTER IS A MEMBER LIKE ANY OTHER (user directive 2026-07-31,
  // replacing the separate `self` page of 2026-07-27 that opened the editable
  // preview here): a roster is a list of the people in a circle, and my own row
  // opens the page every other row opens — with nothing under it, exactly as the
  // owner's does (see MemberProfileView). Editing my profile is what the dock's
  // profile key is for, and a list of who is in a group is not the way to it.
  | { k: 'person'; person: PersonTarget }

const titleFor = (v: CView): string => {
  switch (v.k) {
    case 'hub': return t('circles.title')
    case 'friends': return t('circles.myFriends')
    case 'find': return t('circles.findTitle')
    case 'create': return t('circles.newGroup')
    case 'owned': return v.group.name
    case 'settings': return t('circles.settings')
    case 'request': return v.request.name ?? t('circles.requestsSectionJoin')
    case 'person': return (v.person.kind === 'member' ? v.person.member.name : v.person.friend.name) ?? ''
  }
}

/** WHICH page this is — the kind plus whatever the kind is ABOUT. Two views
 *  with the same key are the same destination, however many times it was asked
 *  for. Used to make `push` idempotent (see there). */
const viewKey = (v: CView): string => {
  switch (v.k) {
    case 'owned': case 'settings': return `${v.k}:${v.group.id}`
    case 'request': return `request:${v.request.id}`
    case 'person': return `person:${v.person.kind === 'member' ? v.person.member.user_id : v.person.friend.user_id}`
    default: return v.k
  }
}

/** The hub's group popup, opened for it from outside: which circle, and what I
 *  am to it. Nothing about WHERE the open came from — a push, or an invite link
 *  I just followed — travels with it: the popup is the same popup either way
 *  (user directive 2026-08-02), so there is nothing for it to read. */
type HubGroupTarget = { group: GroupBrief; status: GroupStatus }

export function CirclesPage({
  onClose, onRegisterBack, target, onTargetConsumed,
  dismissGestureRef, onScrollAtTop, headerBottomShared, pullEngaged,
}: OverlaySheetBody & {
  onClose: () => void
  onRegisterBack: (fn: () => boolean) => void
  /** Where a notification tap (or a redeemed invite link) wants to land. The
   *  whole page stack is seeded from it, so Back walks out through the pages
   *  that would have led there by hand. */
  target?: CirclesTarget | null
  onTargetConsumed?: () => void
}) {
  // One insets object for the whole hub (it is threaded down to every view as a
  // prop), with the bottom taken from useBottomInset so nothing anchored to the
  // page's end can slip under the system navigation bar.
  const { top: topInset } = useSafeAreaInsets()
  const bottomInset = useBottomInset()
  const insets = useMemo(() => ({ top: topInset, bottom: bottomInset }), [topInset, bottomInset])
  const profile = useUserStore(st => st.profile)
  // The air under a contained roster: one small step, or the safe area where
  // there is one (XL was too much — user directive 2026-07-27). Both roster
  // pages read this one value, so their lists end at exactly the same height.
  const rosterGap = bottomGap(insets.bottom, SM)

  // Seeded synchronously from the target so the sheet's very first frame is the
  // page that was asked for, not the hub with the real destination arriving a
  // beat later. `person` is the one target that is the WHOLE stack: it opens on
  // that person and there is nothing under it (see CirclesTarget).
  const [stack, setStack] = useState<CView[]>(() => (
    target?.kind === 'person' ? [{ k: 'person', person: { kind: 'friend', friend: target.friend } }]
      : target?.kind === 'friends' || target?.kind === 'friend' ? [{ k: 'hub' }, { k: 'friends' }]
      : [{ k: 'hub' }]
  ))
  const view = stack[stack.length - 1]
  // Opening a page is IDEMPOTENT: asking for the page that is already on top is
  // not a second page. A row stays tappable while the page it opened is still
  // sliding up over it (RisingCard's entrance), so two quick taps on one group
  // — or on one person in a roster — used to stack the very same page twice and
  // cost two Backs to get out of. The guard lives inside the state updater, not
  // in a timer or on the rows, so it also catches both taps landing in one
  // React batch: the second updater sees what the first one produced.
  const push = useCallback((v: CView) => setStack(sk => (
    viewKey(sk[sk.length - 1]) === viewKey(v) ? sk : [...sk, v]
  )), [])
  const pop = useCallback(() => setStack(sk => (sk.length > 1 ? sk.slice(0, -1) : sk)), [])

  // A deep-linked group the caller is only a MEMBER of opens the hub's group
  // popup rather than a stack view (that is the whole surface a member gets), so
  // the resolved group is handed down to the hub. A tapped invite link lands
  // here too, whatever the caller is to the circle (the `arrival` target) — and
  // on the same popup, with the same options on it.
  const [groupTarget, setGroupTarget] = useState<HubGroupTarget | null>(null)

  // Land where the notification pointed, with the whole path to it under the
  // page it lands on. Everything is resolved against the caller's OWN data
  // rather than trusted from the push, so a request another manager already
  // answered — or a group you have since left — degrades to the nearest page
  // that still exists instead of a dead end.
  useEffect(() => {
    if (!target) return
    let alive = true
    const set = (sk: CView[]) => { if (alive) setStack(sk) }
    ;(async () => {
      try {
        // One person, carried whole: nothing to resolve and nothing under it.
        // Re-set here as well as in the seed, for a sheet that was already open
        // on another page when the card handed this over.
        if (target.kind === 'person') {
          set([{ k: 'person', person: { kind: 'friend', friend: target.friend } }])
          return
        }
        if (target.kind === 'friend') {
          const f = (await myFriends()).friends.find(x => x.user_id === target.userId)
          set(f ? [{ k: 'hub' }, { k: 'friends' }, { k: 'person', person: { kind: 'friend', friend: f } }]
                : [{ k: 'hub' }, { k: 'friends' }])
          return
        }
        if (target.kind === 'friends') { set([{ k: 'hub' }, { k: 'friends' }]); return }
        // A link I just followed: the circle it named, carried whole, over the
        // hub — the same popup a row on that hub opens, with the same options on
        // it. Nothing to resolve: the redeem already answered both questions
        // this page would have gone looking for (which circle, and what I am to
        // it), and the summary that would answer them here has not landed yet.
        if (target.kind === 'arrival') {
          if (alive) setGroupTarget({ group: target.group, status: target.standing })
          return
        }

        const owned = (await ownedGroups()).find(x => x.id === target.groupId)
        if (!owned) {
          // Not staff there: the member surface is the hub's sheet, which is all
          // a plain member gets. Prefer the denormalized summary (already on the
          // profile, no round trip); fall back to the endpoint on a miss, since
          // an approval push can land before the profile refresh does.
          const joined = circlesSummary(useUserStore.getState().profile)?.joined.find(g => g.id === target.groupId)
            ?? (await myGroups()).find(g => g.id === target.groupId)
          if (joined && alive) setGroupTarget({ group: joined, status: 'joined' })
          return
        }
        if (target.kind === 'group') { set([{ k: 'hub' }, { k: 'owned', group: owned }]); return }
        // The queue is the group page's own drawer now, so a push about it lands
        // on that page with the drawer already open — the same place the manager
        // would have arrived at by tapping the row himself.
        if (target.kind === 'queue') { set([{ k: 'hub' }, { k: 'owned', group: owned, openRequests: true }]); return }
        // A join request: straight onto that person's card, where the two
        // answers are (user directive 2026-07-27 — the iron rule).
        const req = (await groupRequests(owned.id)).find(r => r.user_id === target.userId)
        const queue: CView[] = [{ k: 'hub' }, { k: 'owned', group: owned, openRequests: true }]
        set(req ? [...queue, { k: 'request', group: owned, request: req }] : queue)
      } catch {
        // Leave the hub as it is: a failed resolve must not strand the user on
        // a blank page.
      } finally {
        onTargetConsumed?.()
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  // Hardware-back: close the top PAGE first — through its own slide, the same
  // motion its back control and a swipe use — and only at the hub let the sheet
  // close (return false so home's BackHandler falls through to closing it).
  const topCloseRef = useRef<() => void>(() => {})
  const registerClose = useCallback((fn: () => void) => { topCloseRef.current = fn }, [])
  useEffect(() => {
    onRegisterBack(() => {
      if (stack.length > 1) { topCloseRef.current(); return true }
      return false
    })
  }, [stack.length, onRegisterBack])

  // Keep owned + settings stack entries for one group in sync after an edit, so
  // the header title and the manage-page summary reflect the change.
  const applyGroup = useCallback((g: OwnedGroup) => {
    setStack(sk => sk.map(x => (x.k === 'owned' || x.k === 'settings') && x.group.id === g.id ? { ...x, group: g } : x))
  }, [])
  // A GROUP I AM NO LONGER INSIDE TAKES EVERY PAGE ABOUT IT WITH IT — deleted,
  // handed away in an open group, or left from my own row in its roster. Not
  // just the two pages that manage it: a member's page and a requester's page
  // were opened OUT of that roster and are about people I have no standing to
  // decide anything about any more. Whatever is left of the stack is where the
  // user lands, which is the hub unless he drilled in from somewhere else.
  const removeGroupViews = useCallback((id: string) => {
    setStack(sk => {
      const kept = sk.filter(x => !(
        ((x.k === 'owned' || x.k === 'settings' || x.k === 'request') && x.group.id === id)
        || (x.k === 'person' && x.person.kind === 'member' && x.person.group.id === id)
      ))
      return kept.length ? kept : [{ k: 'hub' }]
    })
  }, [])

  // Every page is its OWN surface, stacked (user directive 2026-07-27): a page
  // opened from a page LAYERS over it instead of replacing it, so swiping down
  // takes exactly one page off — the same thing Back does — instead of tearing
  // the whole Circles sheet away. Only the hub, the bottom layer, closes the
  // sheet when it is swiped, and that is the sheet's own pull.
  const deep = stack.length > 1
  // The sheet's pan must go quiet while a page rides above it, or the two
  // arbitrate for the same drag. Two gates feed it and both are ours to set:
  // the at-top flag (body drags) and the header band (a drag started there
  // bypasses that flag). `layer0AtTop` remembers what the hub's own scroll last
  // reported, so popping back restores the truth rather than guessing.
  const layer0AtTop = useRef(true)
  const layer0HeaderBottom = useRef(0)
  const deepRef = useRef(deep)
  deepRef.current = deep
  const setLayer0AtTop = useCallback((v: boolean) => {
    layer0AtTop.current = v
    if (!deepRef.current) onScrollAtTop(v)
  }, [onScrollAtTop])
  useEffect(() => {
    onScrollAtTop(deep ? false : layer0AtTop.current)
    headerBottomShared.value = deep ? 0 : layer0HeaderBottom.current
  }, [deep, onScrollAtTop, headerBottomShared])

  return (
    <View style={s.root}>
      {stack.map((v, i) => (
        <PageLayer
          key={`${i}:${v.k}`}
          view={v}
          isTop={i === stack.length - 1}
          // The hub rides the SHEET's pull (its swipe closes Circles); every
          // page above it owns a pull of its own that pops one level.
          sheetPanRef={i === 0 ? dismissGestureRef : undefined}
          sheetPullEngaged={i === 0 ? pullEngaged : undefined}
          onSheetScrollAtTop={i === 0 ? setLayer0AtTop : undefined}
          onHeaderMeasured={i === 0 ? (h => { layer0HeaderBottom.current = h; if (!deepRef.current) headerBottomShared.value = h }) : undefined}
          onBack={i === 0 ? onClose : pop}
          registerClose={registerClose}
          insets={insets}
          rosterGap={rosterGap}
          profile={profile}
          push={push}
          setStack={setStack}
          applyGroup={applyGroup}
          removeGroupViews={removeGroupViews}
          groupTarget={i === 0 ? groupTarget : null}
          onGroupTargetConsumed={() => setGroupTarget(null)}
        />
      ))}
    </View>
  )
}

// ── One page in the stack ──────────────────────────────────────────────────
// A full-screen surface with its own header and its own swipe-down. The bottom
// layer (the hub) is handed the SHEET's pull, so swiping it closes Circles;
// every layer above owns a pull whose commit POPS one page, which is what makes
// a swipe do exactly what Back does (user directive 2026-07-27).
function PageLayer({
  view, isTop, sheetPanRef, sheetPullEngaged, onSheetScrollAtTop, onHeaderMeasured, onBack, registerClose,
  insets, rosterGap, profile, push, setStack, applyGroup, removeGroupViews,
  groupTarget, onGroupTargetConsumed,
}: {
  view: CView
  isTop: boolean
  /** Present only on the bottom layer: the sheet's own dismiss pan. */
  sheetPanRef?: React.MutableRefObject<GestureType | undefined>
  sheetPullEngaged?: SharedValue<boolean>
  onSheetScrollAtTop?: (atTop: boolean) => void
  onHeaderMeasured?: (bottom: number) => void
  onBack: () => void
  /** Hands the top layer's animated close up to the shell, so the hardware
   *  back button leaves by the same slide as the back control. */
  registerClose?: (fn: () => void) => void
  insets: { top: number; bottom: number }
  rosterGap: number
  profile: StoreProfile
  push: (v: CView) => void
  setStack: React.Dispatch<React.SetStateAction<CView[]>>
  applyGroup: (g: OwnedGroup) => void
  removeGroupViews: (id: string) => void
  groupTarget?: HubGroupTarget | null
  onGroupTargetConsumed: () => void
}) {
  const isSheetLayer = !!sheetPanRef
  // A profile page is a full-bleed card and NOTHING else: no title bar over it
  // (user directive 2026-07-27) and, since the X went, no chrome floating on the
  // photo either — the card is the whole page and a swipe is how it leaves.
  // Declared up here because it also decides which pull ARBITRATION the page
  // gets — see below.
  const fullBleed = view.k === 'request' || view.k === 'person'
  // The band a drag can start in and still take the page, whatever the inner
  // scroll is doing. It may only ever cover chrome that DOES NOT SCROLL: the
  // inner scroll always outranks the page pull (the iron rule), so the band is
  // never allowed to sit over content a finger could have scrolled instead.
  // It is the solid title bar — plus, on the roster pages, the whole FIXED head
  // above the list, since none of it scrolls and the list itself eats nearly the
  // entire page once it is scrolled. A full-bleed page contributes NOTHING: it
  // draws no bar at all, and the card under where one would be reports at-top
  // and hands the pull over by itself. Two sources, one value: whichever reaches
  // lower wins, so neither can clobber the other.
  const headerBottom = useSharedValue(0)
  const barBottom = useRef(0)
  const rosterTop = useRef(0)
  const syncDragBand = useCallback(() => {
    headerBottom.value = Math.max(barBottom.current, rosterTop.current)
  }, [headerBottom])
  // A page LEAVES by sliding off the bottom, and only then stops existing. The
  // commit does not pop: it flags `closing`, and the reaction below pops when
  // the surface has actually reached the bottom edge. That is what makes every
  // OTHER way out — hardware back, an action that finishes with the page — feel
  // like the manual pull carried on (user directive 2026-07-27) and what keeps a
  // swipe from tearing the page out from under the finger halfway down.
  const closing = useSharedValue(false)
  // Called unconditionally (rules of hooks); the bottom layer leaves it disabled
  // and uses the sheet's pull instead.
  //
  // A LIST page takes the 'sheet' arbitration: a manualActivation pan that
  // hands the drag to the inner scroll first and picks it up mid-gesture where
  // the list runs out. A PROFILE page must NOT — its body is a full-bleed
  // MatchCard that owns its own PullContext, and over that card the sheet pan
  // consumes the raw touch stream and swallows the taps on the card's own
  // controls. That is exactly the bug the menu's own profile sheet was fixed for
  // (home.tsx: activation="scrollPan"), and these pages are the same surface,
  // so they get the same answer: 'scrollPan', whose gesture declares its
  // interest up front (activeOffsetY / failOffsetX) and leaves every tap alone.
  // It ignores `headerBottom`, which is right: a page with no bar has no drag
  // band (see above), so the value stays 0 on these pages either way.
  const pull = usePullBehavior({
    activation: fullBleed ? 'scrollPan' : 'sheet',
    enabled: isTop && !isSheetLayer,
    onCommit: useCallback(() => { closing.value = true }, [closing]),
    headerBottom,
  })
  const pullY = pull.pullY
  const screenSpan = pull.screenSpan
  // THE PAGE IS GONE WHEN BOTH FACTS ARE TRUE, AND THE LAST OF THE TWO TO ARRIVE
  // IS WHAT FIRES IT. Both are read INSIDE the prepare, deliberately: the flag is
  // set from JS (`onCommit` is a runOnJS out of the gesture's onEnd) while the
  // ride-off runs on the UI thread, so on a busy JS thread the flag can land
  // AFTER pullY has already stopped at screenSpan. Watching pullY alone, that
  // ordering never fires again — nothing moves after the animation ends — and the
  // page stays mounted, parked off-screen and invisible, but still the TOP layer:
  // the page under it has `enabled: isTop` false, so its swipe is dead, its
  // `commit()` early-returns, and hardware back (which routes to the top layer's
  // closePage) hits a `slidOut` that is already true. The whole Circles stack
  // goes unresponsive with nothing on screen to say why. Reproduced on the
  // emulator, 2026-07-31, by popping a member's page and then trying to leave the
  // group page under it.
  useAnimatedReaction(
    () => closing.value && pullY.value >= screenSpan,
    (gone, was) => {
      if (gone && !was) { closing.value = false; runOnJS(onBack)() }
    },
    [screenSpan, onBack],
  )
  // How a page leaves when the finger is not the one taking it off: it rides
  // off exactly as a finger would. The bottom layer has no page under it, so it
  // closes the sheet outright instead.
  const commitPull = pull.commit
  const closePage = useCallback(() => {
    if (isSheetLayer) onBack()
    else commitPull()
  }, [isSheetLayer, onBack, commitPull])
  // Every member is stable (a ref, a callback, a shared value), so this value is
  // built once and never changes identity — a drag on this page re-renders
  // nothing below it. See PullCtx.pullEngaged.
  // `pullY` rides in it too: MatchCard's inner-scroll pin worklet reads it so
  // Reanimated keeps re-running that worklet for every frame of a pull (the
  // engaged flag alone flips once and would let the pin go stale). A profile
  // page's own behavior already builds exactly this object, so take THAT one
  // rather than a second copy of it.
  const pullCtx = useMemo<PullCtx>(() => (
    isSheetLayer
      ? { panRef: sheetPanRef!, extraRefs: [], setScrollAtTop: onSheetScrollAtTop ?? (() => {}), pullEngaged: sheetPullEngaged! }
      : pull.pullCtx
        ?? { panRef: pull.panRef, extraRefs: [], setScrollAtTop: pull.setScrollAtTop, pullEngaged: pull.pullEngaged, pullY: pull.pullY }
  ), [isSheetLayer, sheetPanRef, onSheetScrollAtTop, sheetPullEngaged, pull.pullCtx, pull.panRef, pull.setScrollAtTop, pull.pullEngaged, pull.pullY])

  // Scrolling the focused field clear of the keyboard used to live here, as this
  // page's own `keyboardDidShow` listener. It is `PullScrollView`'s job now, for
  // every scroll surface in the app at once (src/hooks/useKeyboard.ts).
  const scrollRef = useRef<any>(null)
  const scrollY = useRef(0)

  // A SEARCH FIELD IS THE PAGE'S HEADING for as long as it is open (user
  // directive 2026-07-28, for the find page; the group roster joined it
  // 2026-07-31). The box takes the title's place on the bar and the body under
  // it is nothing but what matches — so a page that is searching says what it is
  // searching FOR where it would otherwise say its own name. Both queries live
  // HERE rather than in the body, because the field does: a page and its list
  // can never disagree about what is being looked for.
  //
  // The two differ in one thing only. The find page IS the search — it opens
  // with the field up and leaves by leaving the page — while the roster's is a
  // MODE the manager turns on, so it needs a way back, which is the mark at the
  // far end of the bar (see `trailing`).
  // The mode is per PAGE LAYER, which is what this component is: a group's
  // roster and my friends each hold their own, so an open field can never be
  // carried from one page to another.
  const [findQuery, setFindQuery] = useState('')
  const [rosterSearch, setRosterSearch] = useState(false)
  const [rosterQuery, setRosterQuery] = useState('')
  const openRosterSearch = useCallback(() => { setRosterQuery(''); setRosterSearch(true) }, [])
  const closeRosterSearch = useCallback(() => { setRosterSearch(false); setRosterQuery('') }, [])
  const search = view.k === 'find'
    ? { value: findQuery, onChange: setFindQuery, placeholder: t('circles.findSearch'), label: t('circles.findTitle') }
    : rosterSearch
      ? { value: rosterQuery, onChange: setRosterQuery, placeholder: t('circles.searchPeople'), label: t('circles.searchPeople') }
      : null
  const searchField = search ? (
    <View style={[s.field, s.fieldSlim]}>
      <SearchIcon color={INK_MUTED} size={ICON.md} />
      <TextInput
        style={s.fieldInput}
        value={search.value}
        onChangeText={search.onChange}
        placeholder={search.placeholder}
        placeholderTextColor={INK_DIM}
        // The page's name, for a screen reader: the bar has no title to read out
        // because this field is standing in its place.
        accessibilityLabel={search.label}
        // The third way out, and the only one that is a labelled control: the
        // IME's action key says SEARCH instead of a bare tick, and a single-line
        // field blurs on submit, so pressing it drops the keyboard onto the
        // results. Nothing is submitted — the list is already live per keystroke.
        returnKeyType="search"
        autoFocus
      />
    </View>
  ) : undefined

  // A full-bleed page has nothing to put on a bar — no title, and since
  // 2026-07-31 no X either — so it draws no bar at all.
  const header = fullBleed ? null : (
    <SheetHeader
      title={searchField ? undefined : titleFor(view)}
      center={searchField}
      // THE PAGE SAYS ITS OWN NAME FIRST (user directive 2026-07-31): the title
      // leads the row from the edge reading begins at, exactly as the match
      // card's heading tile does, and what the page can DO follows at the far
      // end. It sat on the row's true centre for as long as the row had a
      // control on each side of it to be centred between; with the X gone there
      // is one control left, and a heading floating in the middle of a row that
      // begins with nothing read as a caption rather than as the page's name.
      align="start"
      // ...and it lines up with WHAT IS UNDER IT, not with the page's margin
      // (user directive 2026-07-31). On a LIST page that is a row's text, which
      // stands a card gutter inside the page gutter, so the title takes both.
      // Only this side — the marks at the far end are chrome in the margin and
      // stay where every other one is.
      //
      // A FORM page (create, settings) has no rows: what is under the title is a
      // section label over a white card, and both of those stand on the page's
      // own gutter, so the title takes nothing extra and the three read on one
      // line. It took the strip's gutter here too and came out half a gutter
      // inside its own page (settings, 2026-08-02).
      //
      // A search field takes none of it either: that is a BOX with its own two
      // edges, not a line of text, so it keeps the page's gutter on both sides.
      startInset={searchField || view.k === 'create' || view.k === 'settings' ? 0 : STRIP_GUTTER}
      // A group's name is shown WHOLE (user directive 2026-07-27): as many
      // lines as its 60 characters need, never an ellipsis. The header grows
      // downward and its first line stays put, so a long name costs nothing but
      // the room it takes. The fixed labels are short and stay on one line, so
      // a two-word one never splits across two.
      titleLines={view.k === 'owned' ? 0 : 1}
      topInset={insets.top}
      // Match the page background (PAGE), not the default white SURFACE,
      // so the header blends into the Circles page instead of sitting on
      // a lighter band.
      barBg={PAGE}
      // The trailing corner carries what the page can DO, at the far end of the
      // row from the name that says what the page IS.
      // The hub: find a group and create one (user directive 2026-07-28) — the
      // two buttons that used to sit under its list, now that the list is one
      // uninterrupted run of rows with nothing between them. The manage page:
      // that group's gear, beside its own name, since the settings of THIS
      // group belong with its title. All backgroundless, so the corner reads as
      // chrome next to the title rather than a strip of buttons.
      trailing={view.k === 'hub' ? (
        // Create leads, find follows (user directive 2026-07-31). The pair reads
        // outward from the page's own name, so the nearer mark is the one that
        // adds to what the page lists and the far one goes looking outside it.
        <View style={s.headerActions}>
          <HeaderButton label={t('circles.create')} onPress={() => push({ k: 'create' })}>
            <PlusGlyph size={ICON.round} />
          </HeaderButton>
          <HeaderButton label={t('circles.find')} onPress={() => push({ k: 'find' })}>
            <SearchIcon size={ICON.round} />
          </HeaderButton>
        </View>
      ) : rosterSearch ? (
        // Searching is a MODE on a roster, so the corner carries the one mark
        // that ends it while it is on: an X in the place the magnifier stood,
        // which is the mirror of the tap that opened it. It is stated ONCE, for
        // whichever roster is searching, so the two pages cannot end a search
        // differently. (Nothing to do with a sheet's dismiss — no Circles page
        // has one; this closes a search, and it is the only way out of the
        // field.)
        <HeaderButton label={t('circles.searchClose')} onPress={closeRosterSearch}>
          <CloseIcon size={ICON.round} />
        </HeaderButton>
      ) : view.k === 'friends' ? (
        // My friends is a roster like a group's, so it carries the same
        // magnifier at the same corner — the only mark this page has, since
        // there is nothing to manage about the circle you are IN.
        <HeaderButton label={t('circles.searchPeople')} onPress={openRosterSearch}>
          <SearchIcon size={ICON.round} />
        </HeaderButton>
      ) : view.k === 'owned' ? (
          // Settings leads, search follows (user directive 2026-07-31): reading
          // outward from the page's own name, the nearer mark is the one about
          // THIS group and the magnifier stands at the far corner — the same
          // place it stands on the hub, where find is the outermost mark. So the
          // glass is always the last thing on a bar, whichever page you are on.
          <View style={s.headerActions}>
            <HeaderButton label={t('circles.settings')} onPress={() => push({ k: 'settings', group: view.group })}>
              <GearGlyph size={ICON.round} />
            </HeaderButton>
            <HeaderButton label={t('circles.searchPeople')} onPress={openRosterSearch}>
              <SearchIcon size={ICON.round} />
            </HeaderButton>
          </View>
      ) : undefined}
      // The settings page's corner carries NOTHING (user directive 2026-08-02).
      // It held a preview — read the group back as everyone else meets it — and
      // that is not a setting: it is one of the two things to do with a circle
      // you run, so it stands at the foot of the ROSTER beside handing the link
      // on (see OwnedGroupView). A page of fields does not also carry a door out
      // to the finished object in its title bar.
      //
      // NO `onClose`, on any page (user directive 2026-07-31): every Circles
      // page leaves by sliding DOWN, the hub included, and a stack where the one
      // gesture is the one way out says so by working, not by wearing a button
      // that repeats it on every page. Hardware back is the same slide (below).
      onMeasured={h => { barBottom.current = h; syncDragBand(); onHeaderMeasured?.(h) }}
    />
  )

  // Everything that ends a page — a committed swipe, the hardware back, an
  // action that finishes with it — leaves through the same slide.
  //
  // EXCEPT THAT A SEARCH IS A STATE THE PAGE IS IN, AND BACK LEAVES THAT FIRST
  // (user directive 2026-08-02). The field standing in the page's own title is
  // the last thing the user opened, so it is the first thing back closes — the
  // same undo the X in the corner is — and only a page that is not searching
  // is closed by it. Registered HERE and not in the stack's BackHandler
  // because only the page knows what it has open; the swipe is untouched
  // (dragging the surface is putting the SURFACE away, not the mode in it).
  const backAction = useCallback(() => {
    if (rosterSearch) { closeRosterSearch(); return }
    closePage()
  }, [rosterSearch, closeRosterSearch, closePage])
  useEffect(() => { if (isTop) registerClose?.(backAction) }, [isTop, registerClose, backAction])

  // ONE way into a person's page from anywhere on this layer: the friends
  // roster's rows and the shared-circles popup on a profile card both land on
  // the same push, so a friend opened from a card is the same page (and the
  // same Back) as one opened from the list.
  const openFriend = useCallback(
    (f: FriendItem) => push({ k: 'person', person: { kind: 'friend', friend: f } }),
    [push],
  )

  const body = view.k === 'request' ? (
    <JoinRequestProfileView
      group={view.group}
      request={view.request}
      onDone={closePage}
      onOpenFriend={openFriend}
      isTop={isTop}
      insets={insets}
    />
  ) : view.k === 'person' ? (
    <PersonProfileView
      person={view.person}
      onDone={closePage}
      onGroupChanged={applyGroup}
      onGroupDropped={removeGroupViews}
      onOpenFriend={openFriend}
      isTop={isTop}
      insets={insets}
    />
  ) : view.k === 'hub' || view.k === 'owned' || view.k === 'find' || view.k === 'friends' ? (
    // The list pages do NOT ride a page scroll: whatever head they have stays
    // put and only the rows under it scroll, inside a box that ends `rosterGap`
    // above the page's end (user directive 2026-07-27; the hub joined them
    // 2026-07-28 — its list is a list like any other, and search followed the
    // same day once its field moved onto the header). So each gets the page box
    // itself — the same gutters the scroll's content container paints — and owns
    // the one scroll region in it.
    <View style={[s.scroll, s.content]}>
      {view.k === 'find' ? (
        <FindView query={findQuery} bottomInset={rosterGap} onDone={closePage} />
      ) : view.k === 'friends' ? (
        <FriendsView
          profile={profile}
          onOpenFriend={openFriend}
          // Same contract as the group roster's: null while the field is shut,
          // so the page can tell "searching for nothing yet" from "not
          // searching".
          search={rosterSearch ? rosterQuery : null}
          bottomInset={rosterGap}
          onRosterTop={y => { rosterTop.current = y; syncDragBand() }}
        />
      ) : view.k === 'hub' ? (
        <HubView
          push={push}
          bottomInset={rosterGap}
          initialGroup={groupTarget}
          onInitialGroupConsumed={onGroupTargetConsumed}
        />
      ) : (
        <OwnedGroupView
          group={view.group}
          initialRequestsOpen={!!view.openRequests}
          // null while the field is shut, so the page can tell "searching for
          // nothing yet" from "not searching" — see OwnedGroupView's `search`.
          search={rosterSearch ? rosterQuery : null}
          onOpenRequest={r => push({ k: 'request', group: view.group, request: r })}
          // EVERY row opens the same page, my own included (see CView): a roster
          // is the people in this circle, and I am one of them.
          onOpenMember={m => push({ k: 'person', person: { kind: 'member', group: view.group, member: m } })}
          onLeft={() => removeGroupViews(view.group.id)}
          bottomInset={rosterGap}
          onRosterTop={y => { rosterTop.current = y; syncDragBand() }}
        />
      )}
    </View>
  ) : (
    <PullScrollView
      ref={scrollRef}
      style={s.scroll}
      contentContainerStyle={[s.content, { paddingBottom: bottomGap(insets.bottom, XL) }]}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = e.nativeEvent.contentOffset.y }}
    >
      {view.k === 'create' && <CreateView onCreated={g => setStack([{ k: 'hub' }, { k: 'owned', group: g }])} />}
      {view.k === 'settings' && <GroupSettingsView group={view.group} onChanged={applyGroup} onDeleted={() => removeGroupViews(view.group.id)} />}
    </PullScrollView>
  )

  // The page's own background puts the keyboard away. The other half of
  // PullScrollView's dismiss-on-drag: a tap that lands on nothing is the second
  // thing a finger tries when a keyboard is in the way, and the search page's
  // field sits on the HEADER, so there is no form to tap beside. It is the
  // ROOT, deliberately — every one of these pages has a field somewhere, so the
  // answer is the same on all of them rather than re-fitted per page. Nothing
  // is stolen from anything: the responder is only offered to the background
  // once its children have declined it, and a drag that becomes a pull is
  // cancelled by the gesture handler before the press can fire.
  //
  // TouchableWithoutFeedback and NOT Pressable, deliberately: Pressable keeps a
  // `pressed` state, so every tap on the background would re-render this whole
  // page — its header, its list, every row — for a press that draws nothing.
  // TWF clones the handlers onto the root View it already has and holds no
  // state, so a dismissing tap costs one Keyboard call and no render.
  const page = (
    <PullContext.Provider value={pullCtx}>
      <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
        {/* `header` is null on a full-bleed page, so this is the body alone
            there and a bar above it everywhere else. It used to be a branch:
            a floating header had to be painted AFTER the body to sit over the
            photo. Nothing floats over anything now. */}
        <View style={s.root}>
          {header}
          {body}
        </View>
      </TouchableWithoutFeedback>
    </PullContext.Provider>
  )

  if (isSheetLayer) return page
  return (
    <PullPane
      gesture={pull.gesture}
      pullY={pull.pullY}
      style={StyleSheet.absoluteFill}
    >
      {/* Rises on push; NO exit animation — a page popped by a swipe has
          already ridden off under the finger, and animating an unmount that a
          gesture just held is the Fabric mount race RisingCard warns about. */}
      <RisingCard style={s.layerCard} animateExit={false}>{page}</RisingCard>
    </PullPane>
  )
}

// ── Hub ────────────────────────────────────────────────────────────────────
/** One row of the hub's single list: something the caller belongs to, whatever
 *  the relationship is. The kind decides the row's meta and what tapping it
 *  does — the rows themselves are all the same shape. */
type HubItem =
  | { k: 'managed'; group: OwnedGroup }
  | { k: 'pending'; group: PendingGroup }
  | { k: 'declined'; group: PendingGroup }
  | { k: 'joined'; group: JoinedGroup }

function HubView({ push, bottomInset, initialGroup, onInitialGroupConsumed }: {
  push: (v: CView) => void
  /** Air under the contained list — see ContainedRoster / PageLayer. */
  bottomInset: number
  /** A group the hub was opened ON: the one a group_approved push named, or the
   *  circle an invite link just led to. Its popup opens as soon as the hub is on
   *  screen, in the standing the caller resolved (see HubGroupTarget). */
  initialGroup?: HubGroupTarget | null
  onInitialGroupConsumed?: () => void
}) {
  // Instant: the summary rides in the user payload (relations.communities),
  // updated live over Realtime. Only when the server hasn't populated it yet
  // (old payload) do we fall back to the three endpoints.
  const profile = useUserStore(st => st.profile)
  const summary = circlesSummary(profile)
  const [fallback, setFallback] = useState<CirclesSummary | null>(null)
  useEffect(() => {
    if (summary) return
    let alive = true
    Promise.all([ownedGroups(), myGroups(), myFriends()])
      .then(([o, all, f]) => {
        if (!alive) return
        const ids = new Set(o.map(g => g.id))
        setFallback({ managed: o, joined: all.filter(g => !ids.has(g.id)), pending: [], declined: [], friends: f.friends.length, requests: f.requests.length })
      })
      .catch(() => { if (alive) setFallback({ managed: [], joined: [], pending: [], declined: [], friends: 0, requests: 0 }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!summary])

  const data = summary ?? fallback
  const loading = data == null

  // Start the disk read for every group listed here — members AND waiting join
  // requests — so tapping one finds both already in memory and the group screen
  // has nothing to wait for at all, not even the frame the read would cost.
  const managedIds = data?.managed.map(g => g.id).join(',') ?? ''
  useEffect(() => {
    if (!managedIds) return
    const ids = managedIds.split(',')
    rosters.prime(ids)
    joinRequests.prime(ids)
  }, [managedIds])

  // EVERY group row on this page opens the one group popup (user directive
  // 2026-07-28) — a membership, a request still waiting, and one that was turned
  // down are the same popup in three states, never three surfaces. So one piece
  // of state: which group, and what I am to it.
  const [sheet, setSheet] = useState<HubGroupTarget | null>(initialGroup ?? null)
  // Open the group the hub was pointed at, and let the page forget the target
  // straight away so popping back to the hub later doesn't reopen it.
  useEffect(() => {
    if (!initialGroup) return
    setSheet(initialGroup)
    onInitialGroupConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroup])
  // How big it is, like the managed rows. A group's KIND is off the strip (user
  // directive 2026-07-28): it is a rule about getting IN, and I am already in
  // (or waiting), so the row says nothing about it. Undefined for the degraded
  // fallback payload (old summary shape carried no count).
  const joinedMeta = (g: JoinedGroup) =>
    g.is_public === undefined
      ? undefined
      : groupFacts(g.members ?? 0)
  // My friends is not a group: its meta is the count. Friend requests waiting on
  // an answer are NOT part of that line — they ride the same strong chip a
  // group's queue does (user directive 2026-07-28), so every row on the page
  // says "someone is waiting on you" the one way.
  const friendsMeta = data ? [friendLabel(data.friends)] : genderize(t('circles.myFriendsSub'), profile?.is_male)
  const friendsWaiting = (data?.requests ?? 0) > 0

  // Everything the caller belongs to, in ONE list (user directive 2026-07-28).
  // There are no section headings left, because a single uninterrupted run of
  // rows needs none: my friends leads, the groups I RUN come next — each marked
  // by the role chip that says so, which is what the heading used to say — and
  // the ones I am only a member of follow. Creating and finding a group are the
  // two controls in the page's own header, so nothing sits between the rows or
  // under them.
  //
  // One flat array, because the list is ONE scroll region inside a contained box
  // (user directive 2026-07-28): the box sits in the page and the rows scroll in
  // it, exactly as the group roster and the waiting queue do. null while the
  // summary is still unknown, which is what puts the skeleton up.
  //
  // Order inside the run: anything WAITING on the user comes first (user
  // directive 2026-07-28). A group whose queue has people in it leads the
  // groups, right under my friends, because the row is a job to do and not just
  // a place I belong; the rest keep the order the summary gave them.
  const waitingFirst = (a: OwnedGroup, b: OwnedGroup) =>
    Number((b.pending ?? 0) > 0) - Number((a.pending ?? 0) > 0)
  const items: HubItem[] | null = loading ? null : [
    ...[...data!.managed].sort(waitingFirst).map((group): HubItem => ({ k: 'managed', group })),
    // A pending join request carries a "waiting for approval" meta; tapping
    // opens the group's own popup, the same one a membership opens, with the
    // control that takes the request back on it. A DECLINED one used to vanish,
    // which read as "still waiting" forever; it says so now, and tapping clears
    // the notice (the answer itself stands).
    ...data!.pending.map((group): HubItem => ({ k: 'pending', group })),
    ...data!.declined.map((group): HubItem => ({ k: 'declined', group })),
    ...data!.joined.map((group): HubItem => ({ k: 'joined', group })),
  ]

  // My friends is the card's FIRST row, always, so a group row is never first:
  // it keeps its top hairline, and only the last one rounds off.
  const hubRow = (it: HubItem, index: number, last: boolean) => {
    const style = rosterRowStyle(index + 1, last)
    switch (it.k) {
      case 'managed': {
        const g = it.group
        const waiting = g.pending != null && g.pending > 0
        // A group you deliberately stepped out of says so on its row, so the
        // state is readable without opening it. What is WAITING is off this line
        // when there is any: it rides the chip instead, and a row never says the
        // same thing twice.
        const meta = groupFacts(g.members, null, g.hidden && t('circles.hiddenShort'))
        return (
          <Strip
            title={g.name}
            meta={meta}
            // Normally the one thing that separates these rows from the ones
            // under them, now that no heading does: the role you hold there. A
            // waiting queue OUTRANKS it (user directive 2026-07-28) — the chip
            // says how many are waiting, in full-strength purple, because the
            // row is a job to do and the role is only a standing fact.
            tag={waiting ? requestLabel(g.pending!) : (g.is_owner ? t('circles.owner') : genderize(t('circles.manager'), profile?.is_male))}
            tagStrong={waiting}
            style={style}
            onPress={() => push({ k: 'owned', group: g })}
          />
        )
      }
      case 'pending':
        // Reads as a GROUP row like every other one — its size on the meta line
        // (user directive 2026-07-28) — with the waiting state carried by the
        // chip in the corner the role chip owns, not by replacing what the row
        // says about the group.
        // An old payload with no count falls back to the sentence.
        return <Strip title={it.group.name} meta={joinedMeta(it.group) ?? t('circles.pending')} tag={t('circles.pendingTag')} style={style} onPress={() => setSheet({ group: it.group, status: 'pending' })} />
      case 'declined':
        // Same shape as the pending row above it: the group's own facts on the
        // meta line, the answer it got in the chip.
        return <Strip title={it.group.name} meta={joinedMeta(it.group) ?? t('circles.declined')} tag={t('circles.declinedTag')} style={style} onPress={() => setSheet({ group: it.group, status: 'declined' })} />
      case 'joined':
        return <Strip title={it.group.name} meta={joinedMeta(it.group)} style={style} onPress={() => setSheet({ group: it.group, status: 'joined' })} />
    }
  }

  // The one row the hub always has, in BOTH shapes of this page: the first row
  // of the card over a run of groups, and the whole of the list when there are
  // no groups at all. `last` is the only difference between the two — a lone row
  // rounds off at both ends — so the row itself is stated once.
  const openFriends = () => push({ k: 'friends' })
  const friendsStrip = (last: boolean) => (
    <Strip
      title={t('circles.myFriends')}
      meta={friendsMeta}
      tag={friendsWaiting ? requestLabel(data!.requests) : null}
      tagStrong
      first
      style={rosterRowStyle(0, last)}
      onPress={openFriends}
      // THE LANE IS THE INVITATION ITSELF (user directive 2026-08-02, turning
      // the run of fading faces that stood here since 2026-07-31 — and with it
      // that day's "not a button, a picture"). Inviting somebody is the one
      // thing this page is FOR, and it was two taps away behind a row whose own
      // job is to open the list; a drawing saying "there are people you have not
      // asked yet" states the reason and then makes the reader go and find the
      // control. So the row answers in place, which is exactly what a strip's
      // `trailing` lane is: the button shares the invite link, the REST of the
      // row still opens the friends page, and the two never fight for the tap —
      // `Button` claims the responder on its own box, so the row's Pressable
      // never sees it.
      //
      // It is the friends page's own invite button (same share glyph, same
      // action), one size down and saying ONE WORD (`circles.invite`, user
      // directive 2026-08-02): the row it stands in has already said who this is
      // about, so the button only has to say what pressing it does — where the
      // page's own button, standing under a roster with nothing beside it, names
      // the whole thing. `alignSelf` is the one thing overridden — a button
      // stretches to its row by default, and this one hugs the line it rides.
      trailing={(
        <Button
          label={t('circles.invite')}
          variant="primary"
          size="md"
          iconStart={<ShareGlyph color={WHITE} />}
          style={s.friendsInviteBtn}
          onPress={() => { tap(); if (profile) shareFriendInvite(profile) }}
        />
      )}
    />
  )

  // NO GROUP OF ANY KIND is not an empty list, it is a different page (user
  // directive 2026-07-30). A card holding a sentence about what is missing, with
  // two CTAs under it, is a list of what this user does not have; what he needs
  // is the one picture of what this page is FOR and the two ways to start it. So
  // the roster is not rendered at all here: see HubStart.
  //
  // What he DOES have rides at the top of that page as a one-row list (user
  // directive 2026-07-30): friends but no groups is the ordinary way in — every
  // account starts there — so the page is the start page with the friends strip
  // above it, and changes in no other way. Nobody in that circle either (no
  // friends, nobody waiting) and there is no row to put up.
  const noGroups = data != null && items!.length === 0
  const anyFriends = (data?.friends ?? 0) > 0 || (data?.requests ?? 0) > 0

  return (
    <>
      {noGroups ? (
        <HubStart
          profile={profile}
          bottomInset={bottomInset}
          onFind={() => push({ k: 'find' })}
          lead={anyFriends ? friendsStrip(true) : null}
        />
      ) : (
      <ContainedRoster
        data={items}
        bottomInset={bottomInset}
        keyOf={it => `${it.k}:${it.group.id}`}
        header={friendsStrip(false)}
        // Only the SKELETON stands in for the rows now: a hub with no groups is
        // HubStart, so this list is never painted empty. It follows the friends
        // row INSIDE the card and closes it off.
        empty={items == null ? (
          <View style={[s.rosterRow, s.rosterRowLast]}>
            <SkeletonRows rows={3} lines={2} first={false} />
          </View>
        ) : null}
        row={hubRow}
      />
      )}

      {/* One popup for all three kinds of row: it is told which the group is and
          offers leave / cancel the request / clear the notice accordingly. A
          circle an invite link just landed me on opens this very popup, with
          those same options on it. */}
      <GroupSheet group={sheet?.group ?? null} status={sheet?.status} onClose={() => setSheet(null)} />
    </>
  )
}

// ── The page before there is anything on it ────────────────────────────────
// The Circles page with nobody in it. It says the same thing the drawing does
// (CirclesArt) and then hands over the two ways to start — a friend, or a
// group — as two buttons and NOTHING ELSE (user directive 2026-07-31): the
// sentence under the heading has just explained what both of them are for, so a
// third line, standing over the first button to say it again in fewer words, was
// the page saying the same thing twice. A label that needs a caption is a label
// problem.
//
// The picture LEADS (user directive 2026-07-30): it is what the page is, and a
// user who reads nothing else has still been told. Everything under it is a
// column: heading, the sentence that explains it, then the actions, the widest
// gap of the three sitting above them so the eye reads "what this is" and then
// "what I can do" — the app's own rhythm, the one every popup keeps.
//
// A user who has friends and no groups gets this same page with his friends row
// ABOVE it (`lead`, user directive 2026-07-30) and nothing else changed: the
// list he does have is one strip at the top, and the block under it keeps the
// whole remaining height and centres in it exactly as it does on a page with no
// row at all.
function HubStart({ profile, bottomInset, onFind, lead }: {
  profile: StoreProfile
  bottomInset: number
  onFind: () => void
  /** The my-friends strip, when there is anyone in that circle — see HubView. */
  lead?: React.ReactElement | null
}) {
  return (
    <PullScrollView
      style={s.scroll}
      contentContainerStyle={[s.startBody, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
    >
      {lead ? <View style={s.startLead}>{lead}</View> : null}
      <View style={s.startMain}>
        <View style={s.startArt}><CirclesArt /></View>
        <Text style={s.startTitle}>{t('circles.startTitle')}</Text>
        <Text style={s.startDesc}>{genderize(t('circles.startDesc'), profile?.is_male)}</Text>
        {/* THE RECOMMENDED WAY LEADS HERE, AND THIS PAGE IS THE ONE EXCEPTION TO
            "the purple ends the block" (user directive 2026-07-31, put back the
            same day it was turned): these are not a popup's two answers, they are
            two WAYS FORWARD out of an empty page, and the first one read must be
            the one we are recommending. */}
        <View style={s.startActions}>
          <Button
            label={t('circles.inviteFriend')}
            variant="primary"
            size="lg"
            iconStart={<ShareGlyph color={WHITE} />}
            onPress={() => { tap(); if (profile) shareFriendInvite(profile) }}
          />
          <Button
            label={t('circles.startFind')}
            variant="secondary"
            size="lg"
            iconStart={<SearchIcon color={INK_SUBTLE} />}
            onPress={onFind}
          />
        </View>
      </View>
    </PullScrollView>
  )
}

// (`StartAction` is gone with that line, 2026-07-31: with no caption to carry,
// it was a View wrapped around a <Button> and nothing else. The two ways forward
// are two ordinary buttons.)

// THE one way out to a group's own page, and there is exactly one place that
// offers it (user directive 2026-08-02): the "more details" option in the
// popup's foot. Nothing else in the app opens a circle's link. The server is what
// guarantees the value is an http(s) URL, so opening it here needs no parsing of
// its own; a group with no link has no tap anywhere.
const openGroupLink = (url?: string | null) => {
  if (!url) return
  tap()
  Linking.openURL(url).catch(() => {})
}

// ── The group popup ────────────────────────────────────────────────────────
// THE popup a group opens into, from EVERY surface that lists one (user
// directive 2026-07-28): the hub's rows, a search result, and a match card's
// shared-groups list all open THIS. A group therefore reads identically
// wherever it was tapped — the owner's photo, the name, how big it is and
// "managed by <them>" under it, what it says about itself, its link — and the only thing
// that changes with where I stand is the ACTION at the bottom, which is always
// the one thing that standing lets me do:
//   joined    → share the invite link (public groups only, whose code is not a
//               secret) + LEAVE the group — the OWNER excepted, who hands the
//               key over first and never sees it (`iOwnIt`)
//   pending   → take the join request back
//   declined  → clear the notice (the answer itself stands; the endpoint only
//               marks it seen, so this is not a way around the wait)
//   none      → join, or ask to be let in
// It is the SAME popup however it was raised (user directive 2026-08-02): a
// circle an invite link just landed me on offers exactly what the same circle
// offers when I pick it off the hub myself. Where it came from is not a state,
// and nothing here may branch on it.
// Nothing is ever a dead, disabled chip saying what I already am: the search
// popup used to end at a greyed-out "Member", which named my standing instead
// of offering what it allows. Every terminal action lands on the same summary
// refresh (the server trigger repaints relations.communities), so the row that
// opened the popup goes on its own.
export type GroupStatus = 'joined' | 'pending' | 'declined' | 'none'

export function GroupSheet({ group, status = 'joined', onClose, onClosed, onJoin, onDone }: {
  group: GroupBrief | null
  status?: GroupStatus
  onClose: () => void
  /** The popup has finished sliding away — for a caller that leaves with it. */
  onClosed?: () => void
  /** `none` only: joining is the CALLER's (search keeps its own optimistic map
   *  of what this session has asked for). Without it a non-member sees no
   *  action, which is right for a list that cannot offer one. */
  onJoin?: () => void
  /** A terminal action landed, so the caller's own copy of my standing is
   *  stale. The hub repaints off the store and ignores it. */
  onDone?: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = status === 'pending'

  // THE OWNER CANNOT WALK OUT OF HIS OWN CIRCLE — HE HANDS THE KEY OVER FIRST
  // (user directive 2026-08-02). `app_leave_group` deletes the membership row and
  // nothing more, so an owner leaving would strand the circle with an owner who
  // is not in it; transferring ownership, or deleting the group, are pages of
  // their own. It is the very rule the roster's own MemberProfileView keeps for
  // my card, stated here because the popup is the OTHER place leaving is offered
  // — and it belongs to the popup rather than to any one host, so no surface that
  // opens a circle I own can offer it (the roster's foot, the hub, an arrival, a
  // shared-circles row). A MANAGER is not an owner and leaves like anyone else.
  // Two ways to know it, and either is enough: the brief may SAY so (a managed
  // row carries `is_owner` and spreads it straight in), or the owner it draws is
  // me. The flag alone would leave every other host out; the id alone answers
  // "no" for the moment before a roster has arrived to say who the owner is, and
  // this is the one question that may not be wrong in that direction.
  const meId = useUserStore(st => st.profile?.user_id)
  const iOwnIt = !!group?.is_owner || (!!meId && group?.owner?.user_id === meId)

  const share = () => {
    if (!group?.invite_code) return
    tap()
    shareInvitation(t('circles.shareMessage').replace('{name}', group.name).replace('{link}', groupInviteUrl(group.invite_code)))
  }
  // The one terminal action this popup carries, whichever group it is about and
  // whatever I am to it: leaving, taking the request back, or clearing the
  // answer that turned it down.
  const quit = async () => {
    if (!group) return
    setBusy(true); tapWarning()
    try {
      // The cached roster goes with the membership — it is other people's names
      // and photos, kept only for a group the user is actually in. A request,
      // answered or not, never had one, and both go back through the same
      // endpoint.
      if (status === 'joined') { await leaveGroup(group.id); dropGroupCaches(group.id) }
      else await cancelJoinRequest(group.id)
      onDone?.()
      onClose()
    } finally { setBusy(false); setConfirm(false) }
  }

  // WHAT MY STANDING LETS ME DO, as marks rather than tiles (user directive
  // 2026-07-31): the app's one option strip — the very strip home's dock and the
  // bar under a profile card are — a glyph with one small word under it, the
  // app's hairline between, and no fill behind any of them. None of these is what
  // the popup is FOR, so none of them is painted as an invitation to press; the
  // one action that IS an invitation keeps its purple (see the actions block).
  //
  // WHERE THE GROUP SAYS MORE ABOUT ITSELF IS ONE OF THEM, AND IT IS THE ONLY
  // WAY TO IT (user directive 2026-08-02, evening — reversing that same day's
  // deletion of it). Leaving the door on the HEAD alone left the popup with no
  // MARK for it at all: a face and a name that happen to be pressable say
  // nothing about a link behind them, so a circle that had written down where to
  // read more looked like a circle that had not. It is an option of the foot
  // again — a globe over one word — and the head is a plain, dead block of
  // writing: NOTHING in the app opens a circle's link except this option, and it
  // is drawn only when the circle HAS one.
  const quietActions: StripOption[] = [
    ...(group?.link ? [{
      key: 'link',
      label: t('circles.moreDetails'),
      icon: <GlobeIcon color={INK} size={ICON.xxl} />,
      onPress: () => openGroupLink(group?.link),
    } as StripOption] : []),
    ...(status === 'joined' && !iOwnIt ? [{
      key: 'leave',
      label: t('circles.leave'),
      icon: <SignOutIcon color={INK} size={ICON.xxl} />,
      onPress: () => setConfirm(true),
    }]
    : pending ? [{
      // No confirm on this one (user directive 2026-07-29): taking back a request
      // that has not been answered yet destroys nothing, and it can be sent again
      // at any time. Taking a request back is an X, plainly (2026-07-28).
      key: 'cancel',
      label: t('circles.cancelJoin'),
      icon: <CloseIcon color={INK} size={ICON.xxl} />,
      busy, disabled: busy,
      onPress: quit,
    }]
    : status === 'declined' ? [{
      // No confirm here either: it dismisses a notice, it undoes nothing, and the
      // sentence above it has just said so.
      key: 'dismiss',
      label: t('circles.declinedConfirm'),
      icon: <CloseIcon color={INK} size={ICON.xxl} />,
      busy, disabled: busy,
      onPress: quit,
    }]
    : [] as StripOption[]),
  ]

  // THE ONE ACTION THAT INVITES A TAP KEEPS ITS PURPLE (user directive
  // 2026-07-31, the exception to the strip above): handing the group's link on is
  // how a circle GROWS, and joining is what a non-member opened this for. Both
  // are the popup ASKING for something, which is exactly what a filled tile is
  // for — everything else here is a thing I may do, not a thing I am offered.
  // Only a MEMBER hands the link on: an invite from someone who has not been let
  // in yet is not theirs to give.
  //
  // It is an ORDINARY button here (user directive 2026-08-02): the full width of
  // the popup, under the strip rather than beside it, with its mark beside its
  // label the way every other button in the app carries one. The mark-over-word
  // shape is for a purple standing IN a row of options, and this one no longer
  // does — see `stacked` in SheetActionPair.
  const invitation =
    status === 'joined' && group?.is_public && group?.invite_code ? (
      <Button label={t('circles.shareInvite')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={share} />
    ) : status === 'none' && onJoin ? (
      <Button
        label={t(group?.requires_approval ? 'circles.requestJoin' : 'circles.join')}
        variant="primary"
        size="lg"
        onPress={onJoin}
      />
    ) : null

  return (
      <BottomSheet visible={!!group} onDismiss={onClose} onClosed={onClosed}>
        <View style={s.sheetWrap}>
          {/* The group's whole introduction is ONE scrolling block (user
              directive 2026-07-28): the owner's face, "managed by <them>", the
              name, the size and what the group wrote about itself scroll
              TOGETHER. Scrolling only the description left the head pinned over
              a moving strip of text, which read as two unrelated panes; this is
              one piece of writing and it moves as one.
              The block takes whatever height is left under the sheet's cap, so
              it opens showing the head and the first lines, and the link, the
              standing note and the action below it are ALWAYS on screen. */}
          <SheetScroll>
            {/* THE HEAD IS NOT A DOOR (user directive 2026-08-02, evening): the
                whole introduction — the owner's face, the facts, the name and
                the paragraph under them — is writing to be read, and NOTHING in
                it opens the circle's link. The one way there is the foot's
                "more details" option, which is a mark that says so. The head
                used to be a Pressable around GroupHead (2026-07-29), which made
                a link the reader could only find by pressing a name.
                WHICH GROUP THIS IS, in the app's one block for saying so
                (GroupHead, CircleBits): a person's page inside a group wears
                the very same heading (user directive 2026-07-31), which is why
                it is a component and not three elements written out here. */}
            <View style={s.sheetHead}>
              {group ? <GroupHead group={group} /> : null}
              {group?.description ? <Text style={s.sheetDesc}>{group.description}</Text> : null}
            </View>
          </SheetScroll>
          {/* What this group is to me right now, in a sentence. A group I have
              not asked to join yet says nothing: the button below says it. It is
              the last of the popup's reading, standing directly over the foot —
              it finishes what the group just said about itself, and what comes
              after it is no longer writing at all but the marks the foot is made
              of ("more details" left this block on 2026-08-02). */}
          {status !== 'none' ? (
            <Text style={s.note}>
              {t(status === 'joined' ? 'circles.memberNote'
                : pending ? 'circles.pendingNote'
                : 'circles.declinedDesc')}
            </Text>
          ) : null}
        </View>
        {/* The popup's actions, in the app's one action block: what I may do
            beside what I am being offered (SheetActionPair, which owns the gap,
            the arrangement and the case where only one of the two exists). They
            used to be the last children of the body's SM-gap column, which put a
            group's buttons 8 under its note while every other popup's stood 40
            clear. THIS POPUP IS ALWAYS `stacked` (user directive 2026-08-02,
            evening): the options divide the row and the purple runs the full
            width UNDER them, whether there are two of them or one. So "more
            details" always stands ABOVE the share line and never beside it, and
            the invitation is always an ORDINARY button — its mark beside its
            label, at the label's own size — rather than the mark-over-a-small-
            word shape a purple takes when it stands IN a row of options. What a
            circle's foot looks like may not change with how many things I happen
            to be allowed to do. A group I am nothing to and cannot ask to join
            has neither side, and gets no block at all. */}
        <SheetActionPair options={quietActions} action={invitation} stacked />
      {/* Leaving is the only action here that asks twice: it drops a membership
          that getting back may not be mine to decide.
          It stands INSIDE this popup's own window, so the group stays lit under
          the question and a "no" leaves it exactly where it was (user directive
          2026-07-30, the same rule as the shared-circles list one level out).
          This sheet used to switch itself off for it (`!confirm`), which slid the
          group away and slid it back in for a question the user answered without
          ever leaving it. Nested is also the only way two popups may overlap at
          all: as siblings iOS refuses to present the second (see BottomSheet's
          `onClosed`). */}
      <ConfirmDialog
        visible={confirm}
        title={group ? t('settings.groupsLeaveTitle').replace('{name}', group.name) : ''}
        confirmLabel={t('settings.groupsLeaveConfirm')}
        confirmIconStart={<SignOutIcon color={WHITE} />}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={quit}
      />
    </BottomSheet>
  )
}

// ── The strip ──────────────────────────────────────────────────────────────
// Every list on this surface — the hub's groups, a search result, a group's
// members, the waiting queue, my friends — is built from the app's ONE row,
// components/Strip.tsx, which the menu rows and the shared-groups popup are
// built from too. It moved out of this file on 2026-07-29 (user directive: one
// strip, used everywhere it repeats); its rules live with it.

// MY OWN SEX, for every sentence on this page that speaks TO me or says what I
// am to a circle. One hook, so no surface here reads the store for it twice and
// none of them can forget: a Hebrew sentence addressed to the user is gendered,
// and the ones on this page (the friends row's caption, both empty pages, the
// hide-me switch, my role and membership chips) all carry a {m|f} marker that
// only genderize resolves. A person's OWN row is the other axis and is not this
// one — a member's role chip takes that member's sex, not mine.
function useMyGender() {
  return useUserStore(st => st.profile?.is_male)
}

// The link field's placeholder tells the READER to paste, so its verb is the
// user's own gender — one form resolved by genderize, not the "הדבק או הדביקי"
// double form. Lives here once because both the create form and the settings
// editor render the same field. English has a single form and passes through.
function useLinkPlaceholder() {
  return genderize(t('circles.linkPlaceholder'), useMyGender())
}

// ── Group kind ─────────────────────────────────────────────────────────────
// The three names live here once, so a kind reads identically everywhere it is
// asked about. It is asked about in ONE place now — the chooser, where the
// group is being set up: a kind is a rule about getting IN, so it is off the
// strips entirely (user directive 2026-07-28), and what a tap will do is said
// by the join popup's own button. See groupKind() in lib/circles.
const kindTitle = (k: GroupKind) =>
  k === 'open' ? t('circles.kindOpen')
  : k === 'approved' ? t('circles.kindApproved')
  : t('circles.kindPrivate')
const kindSub = (k: GroupKind) =>
  k === 'open' ? t('circles.kindOpenSub')
  : k === 'approved' ? t('circles.kindApprovedSub')
  : t('circles.kindPrivateSub')
// Pick one of the three. Vertical, because each stop carries the sentence that
// explains it — the old two side-by-side toggles (searchable? approval?) asked
// the user to combine two answers into a policy (user directive 2026-07-27).
function KindChooser({ value, onChange }: { value: GroupKind; onChange: (k: GroupKind) => void }) {
  return (
    <View style={s.kindList}>
      {GROUP_KINDS.map(k => (
        <Pressable key={k} style={[s.kindItem, value === k && s.toggleOn]} onPress={() => { tap(); onChange(k) }}>
          <Text style={[s.toggleTitle, value === k && { color: INK }]}>{kindTitle(k)}</Text>
          <Text style={s.toggleSub}>{kindSub(k)}</Text>
        </Pressable>
      ))}
    </View>
  )
}

// ── The contained roster ───────────────────────────────────────────────────
// THE list shape of the group pages: people rows in a box that ends
// `bottomInset` above the page's end, with everything above it fixed (user
// directive 2026-07-27). Both long lists — the member roster and the join
// queue — are this one component, so they scroll the same way and end at the
// same height. Virtualized, because a roster can run to hundreds of rows, and
// scrolling over PullScrollView so the sheet's swipe-to-close keeps
// arbitrating against it: the list goes first, and the page pull takes over
// only once the list has reached its top (see PullPane's `scrollSpent`).
// A FlatList has no wrapper to paint the card on, so the rows carry it: see
// `rosterRowStyle`.
function ContainedRoster<T>({ data, keyOf, row, empty, header, footer, bottomInset, onTopMeasured, onEndReached, syncing }: {
  /** null = still loading; `empty` covers both that and a genuinely empty list. */
  data: T[] | null
  keyOf: (item: T) => string
  row: (item: T, index: number, last: boolean) => React.ReactElement
  empty?: React.ReactElement | null
  /** A row that rides at the TOP of the card and scrolls with it (the waiting
      queue's entry). Style it with `rosterRowStyle(0, false)` so it wears the
      card's rounded top and the rows below it stay flat. */
  header?: React.ReactElement | null
  /** A row at the BOTTOM of the card: the next page arriving (search). Style it
      like the rows so it reads as part of the same run. */
  footer?: React.ReactElement | null
  bottomInset: number
  /** The box's top edge in WINDOW coordinates. Everything above it on these
   *  pages is fixed, so the page hands it to its dismiss pan as the bottom of
   *  the drag band (see PageLayer): the head is a handle, the list is a list. */
  onTopMeasured?: (y: number) => void
  /** Fetch the next page: the end of the rows is coming into view. A server-paged
   *  list (search) sets it; a list that arrives whole leaves it off. */
  onEndReached?: () => void
  /** True while the server's answer is still out on a list that is ALREADY
   *  painted from the last visit — the box wears the drifting hairline on its
   *  top edge (see SyncBar / useSyncFlag). */
  syncing?: boolean
}) {
  const count = data?.length ?? 0
  const boxRef = useRef<View>(null)
  return (
    // The box is a wrapper rather than the list's own style so its top edge can
    // be measured in window coordinates; the FlatList just fills it.
    <View
      ref={boxRef}
      style={[s.rosterBox, { marginBottom: bottomInset }]}
      onLayout={() => boxRef.current?.measureInWindow((_x, y) => onTopMeasured?.(y))}
    >
      <FlatList
        style={s.rosterList}
        data={data ?? []}
        keyExtractor={keyOf}
        renderScrollComponent={props => <PullScrollView {...props} />}
        showsVerticalScrollIndicator={false}
        // A row must answer the FIRST tap while a keyboard is up (search opens
        // with its field focused), not spend it on dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header ?? null}
        ListEmptyComponent={empty ?? null}
        ListFooterComponent={footer ?? null}
        onEndReached={onEndReached}
        onEndReachedThreshold={LIST_PAGE_AHEAD_VIEWPORTS}
        // A footer means the run of rows does NOT end at the last item, so the
        // card's rounded bottom belongs to the footer, not to that row.
        renderItem={({ item, index }) => row(item, index, index === count - 1 && !footer)}
      />
      {/* LAST, so it paints over the first row's top edge rather than under it.
          The box clips (rounded corners), so the hairline ends where the card
          does. */}
      {syncing === undefined ? null : <SyncBar visible={syncing} />}
    </View>
  )
}

// ── The "still thinking" flag ──────────────────────────────────────────────
// What a cache-first list wears its hairline off (SyncBar). Every list here
// paints from the last visit and lets the round trip correct it, so between the
// two there is a stretch where the screen is full and NOT final; this is the
// only thing that says so. Two rules live in the hook so no page can get them
// wrong: nothing painted yet = stay away (the skeleton already owns that wait),
// and a page with two loads in flight (the roster and its waiting queue) is
// done only when both are.
function useSyncFlag(painted: boolean) {
  const [inFlight, setInFlight] = useState(0)
  const track = useCallback(function track<T>(p: Promise<T>): Promise<T> {
    setInFlight(n => n + 1)
    return p.finally(() => setInFlight(n => n - 1))
  }, [])
  return { syncing: inFlight > 0 && painted, track }
}

/** The card look, carried by the rows themselves: only the ends are rounded. */
const rosterRowStyle = (index: number, last: boolean) => [
  s.rosterRow,
  index === 0 && s.rosterRowFirst,
  last && s.rosterRowLast,
]

// ── My friends ─────────────────────────────────────────────────────────────
// Built exactly like a group you manage (user directive 2026-07-28): the roster
// is a CONTAINED box that ends above the page's bottom, and what the page can DO
// sits under it, fixed, where a list of any length can never push it off the
// screen. Incoming friend requests ride at the TOP of that same box, the way a
// group's waiting queue does, rather than on a card of their own.
function FriendsView({ profile, onOpenFriend, search, bottomInset, onRosterTop }: {
  profile: StoreProfile
  onOpenFriend: (f: FriendItem) => void
  /** What is being looked for, or null when the page is not searching at all
   *  (the field is shut). Same contract, and the same matcher, as a group
   *  roster's — see OwnedGroupView. */
  search?: string | null
  /** Air under the contained roster — see ContainedRoster / PageLayer. */
  bottomInset: number
  /** See ContainedRoster's `onTopMeasured`. */
  onRosterTop?: (y: number) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  // Same two-tier read as a group roster: last visit's list paints, the round
  // trip corrects it.
  const cached = friendsRoster.useValue()
  const [fetched, setFetched] = useState<MyFriends | null>(null)
  // Cache-first: this page stays mounted under a friend's profile, and removing
  // them there arrives as a cache write. See OwnedGroupView.
  const data = cached ?? fetched
  const { syncing, track } = useSyncFlag(data != null)
  const load = useCallback(() => {
    track(myFriends())
      .then(fresh => { setFetched(fresh); friendsRoster.set(fresh) })
      .catch(() => { if (!friendsRoster.get()) setFetched({ friends: [], requests: [] }) })
  }, [track])
  useEffect(load, [load])

  // How many friends there are is already known before the roster arrives (the
  // denormalized summary on the user row), so the heading and the placeholder
  // are both truthful from the first frame. null only on an old payload.
  const friends = data?.friends ?? null
  const friendCount = friends?.length ?? circlesSummary(profile)?.friends ?? null

  const respond = async (id: string, accept: boolean) => {
    if (busy) return
    setBusy(id); tap()
    try { await friendRespond(id, accept) } finally { setBusy(null); load() }
  }

  const requests = data?.requests ?? []
  // Nobody here and nobody waiting: the card would say "you have no friends"
  // over an empty page, so the page says what friends are FOR instead and
  // points at the one thing to do about it. Known without the round trip
  // whenever the summary already says zero — see friendCount. It is asked of
  // the WHOLE circle and never of what a query left: a search that matches
  // nobody says so on the list (`noResults`), and answering it with the page
  // that explains what friends are for would be the app telling someone who
  // has friends that he has none.
  const noFriendsYet = search == null
    && requests.length === 0 && (friends ? friends.length === 0 : friendCount === 0)

  // The same question asked of both lists, through the app's one matcher — see
  // OwnedGroupView. With nothing typed each list is itself, in the roster's own
  // order, and the matcher is never called.
  const query = search ?? ''
  const shownFriends = useMemo(
    () => friends && fuzzyRank(friends, query, f => f.name ?? ''),
    [friends, query],
  )
  const shownRequests = useMemo(
    () => fuzzyRank(requests, query, r => r.name ?? ''),
    [requests, query],
  )

  return (
    <View style={s.ownedFill}>
      {noFriendsYet ? <FriendsStart /> : (
      <ContainedRoster
        data={shownFriends}
        // The air under the list is the INVITE block's while there is one; with
        // that block stood down for a search the list takes the gap itself, so
        // the card never runs flush into the keyboard. Same as OwnedGroupView.
        bottomInset={search == null ? 0 : bottomInset}
        onTopMeasured={onRosterTop}
        syncing={syncing}
        keyOf={f => f.user_id}
        // Knowing the count up front means a friendless account skips the
        // placeholder entirely and goes straight to the empty line. A search
        // that matches nobody is the one time this card is empty on purpose.
        empty={(
          <View style={[s.rosterRow, shownRequests.length === 0 && s.rosterRowFirst, s.rosterRowLast]}>
            {query
              ? <Empty text={t('circles.noResults')} />
              : friends == null && friendCount !== 0
                ? <SkeletonRows rows={friendCount ?? undefined} first={requests.length === 0} />
                : <Empty text={t('circles.noFriends')} why={t('circles.friendsWhy')} />}
          </View>
        )}
        // Incoming friend requests, at the top of the same card the friends are
        // in — the group page's waiting queue in its friends form. These are the
        // one strips that answer IN PLACE instead of opening something: their
        // two pills ride the trailing lane.
        header={shownRequests.length ? (
          <>
            {shownRequests.map((r, i) => (
              <Strip
                key={r.id}
                first={i === 0}
                style={rosterRowStyle(i, false)}
                icon={<Avatar userId={r.user_id} name={r.name} image={r.image} />}
                title={r.name ?? ''}
                trailing={(
                  <>
                    <Pressable style={[s.pillBtn, { backgroundColor: INK }]} onPress={() => respond(r.id, true)} disabled={!!busy}>
                      <Text style={s.pillBtnInk}>{t('circles.accept')}</Text>
                    </Pressable>
                    <Pressable style={[s.pillBtn, { backgroundColor: INK_WASH }]} onPress={() => respond(r.id, false)} disabled={!!busy}>
                      <Text style={[s.pillBtnInk, { color: INK }]}>{t('circles.decline')}</Text>
                    </Pressable>
                  </>
                )}
              />
            ))}
          </>
        ) : null}
        row={(f, index, last) => {
          // The request rows, when there are any, own the card's rounded top and
          // the first hairline-free edge, so the people below them stay flat.
          const first = index === 0 && shownRequests.length === 0
          return (
            // No button on the row (user directive 2026-07-27): tapping opens
            // the friend's profile, and removing them is decided there.
            <Strip
              first={first}
              style={rosterRowStyle(first ? 0 : index + 1, last)}
              icon={<Avatar userId={f.user_id} name={f.name} image={f.image} />}
              title={f.name ?? ''}
              onPress={() => onOpenFriend(f)}
            />
          )
        }}
      />
      )}

      {/* The one way in, UNDER the list (user directive 2026-07-28), fixed: the
          page is who you already have, and inviting is what you do after reading
          it, the same order the group page puts its share link in. A roster of
          any length scrolls inside the box above and can never push this off the
          screen. What each friend is worth sits directly ABOVE the button, as
          the reason to press it. Opening the link with the app installed
          auto-links the pair as mutual friends (no request, no approval).
          People-search + friend requests were removed 2026-07-26.

          NOT WHILE THE PAGE IS SEARCHING (the group roster's own rule,
          2026-07-31): looking for one person in this circle is not the same job
          as adding another to it, so the page gives the list that band and the
          keyboard does not have to be squeezed past it. */}
      {search == null ? (
        <View style={[s.friendsInvite, { marginBottom: bottomInset }]}>
          <Text style={s.note}>{t('circles.inviteReward')}</Text>
          <Button label={t('circles.inviteFriend')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={() => { tap(); if (profile) shareFriendInvite(profile) }} />
        </View>
      ) : null}
    </View>
  )
}

// ── What a friend is WORTH, as an object ───────────────────────────────────
// The currency's own gem with "+1" beside it, standing at the head of the
// arrow's trail (user directive 2026-07-31). The line above the button already
// SAYS it, and a sentence is something you read; this is something you are
// SHOWN — an invitation pays the inviter, and on the one page that asks for
// invitations that fact was a small faded footnote under the button.
//
// It rides the pointer because the pointer is already the sentence "from here
// to there": the reward stands where the trail begins and the head lands on the
// button, so the pair reads as one thing — press that, get this.
//
// A QUANTITY IS A BARE NUMBER (the dock's own counts, CLAUDE.md): no tile, no
// fill, no shadow, INK at full strength like the arrow head under it. And the
// number is the constant the server actually pays, never a typed "1". The gem
// stands beside it through the app's one GlyphSlot, told the label it centres
// on — "+1" is a Latin line whatever language the app is in.
function InviteRewardMark() {
  const label = `+${REFERRAL_REWARD}`
  return (
    <View style={s.reward}>
      <GlyphSlot size={TEXT.lg} label={label}>
        <CreditIcon color={INK} size={ICON.xxxl} />
      </GlyphSlot>
      <Text style={s.rewardCount}>{label}</Text>
    </View>
  )
}

// ── My friends, before there are any ───────────────────────────────────────
// The same page the empty hub is (HubStart), on the same drawing, under the
// same heading — because it is the same story, told one step in: there the two
// ways to start a circle, here the one this page owns. The invite block under
// it is the page's own and does not move (see FriendsView), so what stands
// between the sentence and that button is the whole remaining height — and the
// ARROW lives in it, pointing at the button (user directive 2026-07-30), with
// what that button is WORTH at the head of its trail (InviteRewardMark, user
// directive 2026-07-31). Nothing else: the button already says what it is.
function FriendsStart() {
  const isMale = useMyGender()
  return (
    <PullScrollView style={s.scroll} contentContainerStyle={s.startBody} showsVerticalScrollIndicator={false}>
      <View style={s.startArt}><CirclesArt /></View>
      <Text style={s.startTitle}>{t('circles.startTitle')}</Text>
      <Text style={s.startDesc}>{genderize(t('circles.friendsStartDesc'), isMale)}</Text>
      <View style={s.startPointer}>
        <InviteRewardMark />
        <ArrowDownArt />
      </View>
    </PullScrollView>
  )
}

// ── Create a group ─────────────────────────────────────────────────────────
function CreateView({ onCreated }: { onCreated: (g: OwnedGroup) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  // A new group is APPROVED unless the creator says otherwise (user directive
  // 2026-07-28): it is found in search like an open one, but the owner decides
  // who actually gets in.
  const [kind, setKind] = useState<GroupKind>(DEFAULT_GROUP_KIND)
  const [busy, setBusy] = useState(false)
  // The one refusal a filled-in form can earn: the server is what validates the
  // link's shape, so a bad one fails the whole creation. Saying so beats the
  // button quietly un-pressing itself (same fix as the settings editor).
  const [linkError, setLinkError] = useState(false)
  const linkPlaceholder = useLinkPlaceholder()

  const create = async () => {
    if (busy || name.trim().length === 0) return
    setBusy(true); tap()
    try {
      const flags = groupKindFlags(kind)
      const g = await createGroup(name.trim(), flags.is_public, {
        description: description.trim() || null,
        link: link.trim() || null,
        requires_approval: flags.requires_approval,
      })
      onCreated(g)
    } catch (e) {
      setBusy(false)
      setLinkError(serverErrorCode(e) === 'bad_link')
    }
  }

  return (
    <View style={{ gap: MD }}>
      <Text style={s.section}>{t('circles.name')}</Text>
      <View style={s.field}>
        <TextInput style={s.fieldInput} value={name} onChangeText={setName} placeholder={t('circles.namePlaceholder')} placeholderTextColor={INK_DIM} autoFocus maxLength={GROUP_NAME_MAX} />
      </View>
      <Text style={s.section}>{t('circles.description')}</Text>
      <View style={s.field}>
        <TextInput style={[s.fieldInput, s.descInput]} value={description} onChangeText={setDescription} placeholder={t('circles.descriptionPlaceholder')} placeholderTextColor={INK_DIM} multiline maxLength={GROUP_DESCRIPTION_MAX} textAlignVertical="top" />
      </View>
      {/* Optional, like the description: the name is the only thing creation
          insists on. Empty simply means a group with no link. */}
      <Text style={s.section}>{t('circles.link')}</Text>
      <View style={s.field}>
        <TextInput
          style={[s.fieldInput, s.linkInput]}
          value={link}
          onChangeText={v => { setLinkError(false); setLink(v) }}
          placeholder={linkPlaceholder}
          placeholderTextColor={INK_DIM}
          maxLength={GROUP_LINK_MAX}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {linkError ? <Text style={s.fieldError}>{t('circles.linkInvalid')}</Text> : null}
      <Text style={s.section}>{t('circles.kindLabel')}</Text>
      <KindChooser value={kind} onChange={setKind} />
      <Button label={t('circles.createAction')} variant="primary" size="lg" iconStart={<GroupsIcon color={WHITE} />} loading={busy} disabled={name.trim().length === 0} onPress={create} />
    </View>
  )
}

// ── The circle as it is RIGHT NOW ──────────────────────────────────────────
// THE ROSTER IS LIVE (user directive 2026-08-02). A page in this stack is
// handed its group as a SNAPSHOT taken when the row was tapped, which is right
// for what a page is ABOUT and wrong for what the circle currently IS: the
// member count on the head, the queue's size, and — through `roster_rev` — the
// fact that its people have changed at all.
//
// The live copy comes off the denormalized summary on the user row, which is
// the one thing Realtime already delivers to this device (lib/realtime.ts). The
// server fans a roster change out to EVERY member of the circle and bumps
// `roster_rev` with it (migration 20260802160000), so this returns a different
// object the moment somebody else joins, leaves, is removed, is appointed an
// approver, is unappointed, or is handed the circle.
//
// null on a summary the server has not populated yet (old payload) — every
// caller falls back to its snapshot, i.e. to exactly the behaviour before this.
function useLiveGroup(id: string): OwnedGroup | JoinedGroup | null {
  return useUserStore(st => {
    const s = circlesSummary(st.profile)
    if (!s) return null
    return s.managed.find(g => g.id === id) ?? s.joined.find(g => g.id === id) ?? null
  })
}

/** Re-run a page's own load when a live counter MOVES, and never on the first
 *  value it sees — the mount's load has already answered for that one. The
 *  counter is a number rather than the object carrying it, so a user row
 *  arriving with nothing new in it cannot make a page fetch. */
function useRefetchOn(value: number | undefined, load: () => void): void {
  const seen = useRef(value)
  useEffect(() => {
    if (value === undefined) return
    // The summary landed a beat after the page did: that is the value the mount
    // fetched against, not a change to it.
    if (seen.current === undefined) { seen.current = value; return }
    if (value === seen.current) return
    seen.current = value
    load()
  }, [value, load])
}

// ── A group you manage ─────────────────────────────────────────────────────
// Slim landing page: share, a short settings SUMMARY that drills into the
// settings sub-screen, the pending join requests, and the member roster. All
// the editable config (name / description / public / approval / delete) lives
// in GroupSettingsView below.
function OwnedGroupView({ group, initialRequestsOpen, search, onOpenRequest, onOpenMember, onLeft, bottomInset, onRosterTop }: {
  group: OwnedGroup
  /** The queue drawer starts UNFOLDED: a notification about the queue lands
   *  here, and it must land on the people it is about (see CView). */
  initialRequestsOpen?: boolean
  /** What is being looked for, or null when the page is not searching at all
   *  (the field lives on the header bar — see PageLayer). ONE string for BOTH
   *  lists (user directive 2026-07-31): a name is looked for among the people
   *  waiting AND the people already in, because the manager is looking for a
   *  PERSON and does not know which of the two he is in. The empty string is a
   *  real state — the field is open and nothing typed yet — and it is why this
   *  is not just a query. */
  search?: string | null
  /** Open one requester's profile page — where the DECLINE is given, in front
   *  of the face it is about. The YES is answered on the row itself. */
  onOpenRequest: (r: JoinRequestItem) => void
  /** Open a member's profile page. EVERY member opens, including the owner and
   *  yourself: a row is a person, not an action menu. What can be done about
   *  them is decided on their page. */
  onOpenMember: (m: GroupMember) => void
  /** I left the circle, from the preview popup at the page's foot: drop the
   *  whole group off the page stack, this roster with it. Only an APPROVER ever
   *  fires it — the owner is refused the option (see GroupSheet's `iOwnIt`). */
  onLeft: () => void
  /** Safe-area padding for the roster's scroll content — the page fills the
   *  sheet, so the bottom inset belongs to the ONE scrolling region. */
  bottomInset: number
  /** See ContainedRoster's `onTopMeasured`. */
  onRosterTop?: (y: number) => void
}) {
  // The roster paints from the last visit (rosterCache) and the round trip
  // corrects it, instead of gating it. Every response that carries a fresh
  // roster — the load, a removal, a promotion, an approved join — goes through
  // `applyMembers`, so the cache can never drift from what is on screen.
  const cachedMembers = rosters.useValue(group.id)
  const [fetched, setFetched] = useState<GroupMember[] | null>(null)
  // CACHE first, not the local copy. Pages are stacked, so this one stays
  // mounted under the member page opened from it — and a removal or a promotion
  // decided up there lands here as a cache write, which a local copy would
  // shadow. Every load writes the cache too, so cache-first is never staler.
  const members = cachedMembers ?? fetched
  const applyMembers = useCallback((list: GroupMember[]) => {
    setFetched(list)
    rosters.set(group.id, list)
  }, [group.id])

  // Both round trips on this page go through the one flag, so the hairline is up
  // while either is out and gone only when the page is whole.
  const { syncing, track } = useSyncFlag(members != null)

  // `track` wraps the REQUEST, not the chain that applies it: the flag has to
  // drop before the rows land, or the frame between the two paints the hairline
  // over a page that just became whole.
  const load = useCallback(() => {
    track(groupMembers(group.id))
      .then(applyMembers)
      // A failed refresh must not blank a roster we already have — only an
      // account with nothing cached falls through to the empty list.
      .catch(() => { if (!rosters.get(group.id)) setFetched([]) })
  }, [group.id, applyMembers, track])
  useEffect(load, [load])
  // ...and again whenever somebody else changes who stands in this circle,
  // while the page is open (user directive 2026-08-02). The signal is the
  // revision on the live summary — see useLiveGroup — and it covers a change of
  // ROLE too, which nothing else here can see: an appointment leaves the member
  // count and the owner exactly as they were. The page re-reads through its own
  // `load`, so the fresh list goes into the cache and reaches the member page
  // stacked above this one by the same route every other write here does.
  const live = useLiveGroup(group.id)
  // A circle I run is `managed` in the summary, which is the only shape that
  // states its queue; `joined` never reaches this page (it is not a roster I am
  // allowed to read at all — app_group_members answers `not_manager`).
  const livePending = live && 'pending' in live ? live.pending : undefined
  useRefetchOn(live?.roster_rev, load)
  // Pending join requests (only meaningful while approval is on, but harmless
  // to fetch either way — the server returns [] when there are none). Cached on
  // the same terms as the roster, so the waiting faces are there on the first
  // frame too, not just the heading and a placeholder.
  const cachedRequests = joinRequests.useValue(group.id)
  const [fetchedRequests, setFetchedRequests] = useState<JoinRequestItem[] | null>(null)
  const applyRequests = useCallback((list: JoinRequestItem[]) => {
    setFetchedRequests(list)
    joinRequests.set(group.id, list)
  }, [group.id])

  // ANSWERS DO NOT QUEUE UP BEHIND EACH OTHER (user directive 2026-07-31): every
  // tick is live at every moment, so a manager can go down the list at his own
  // speed instead of waiting out a round trip between one face and the next.
  //
  // What used to make that impossible is that every reply carries the WHOLE
  // fresh list: two answers in flight race, and the later reply — built from a
  // read taken BEFORE the earlier one landed — puts an answered row back on the
  // queue. Blocking the other rows was one way to prevent it, and this is the
  // other: what has been answered HERE is remembered, and no list from any
  // source can put those rows back. It is a filter on the READ, so it covers
  // every writer at once — a reply, a resync, the requester's own page, the bulk
  // answer — and not one of them has to know about it.
  const [answered, setAnswered] = useState<string[]>([])
  const requests = useMemo(() => {
    const list = cachedRequests ?? fetchedRequests
    return list && answered.length ? list.filter(r => !answered.includes(r.id)) : list
  }, [cachedRequests, fetchedRequests, answered])

  const loadRequests = useCallback(() => {
    track(groupRequests(group.id))
      .then(applyRequests)
      .catch(() => { if (!joinRequests.get(group.id)) setFetchedRequests([]) })
  }, [group.id, applyRequests, track])
  useEffect(loadRequests, [loadRequests])
  // The queue is live on the same terms, off the count the summary has always
  // carried: another manager answering someone, or a new person arriving at the
  // door, lands on this page without it being re-opened. `answered` still
  // filters the result, so a row this device has already decided cannot come
  // back on a list built before that answer landed.
  useRefetchOn(livePending, loadRequests)

  // WHAT THE PAGE IS SHOWING once a name is being looked for: the SAME question
  // asked of both lists, through the app's one matcher (fuzzyRank, which the
  // group search uses) — so a prefix, a word inside a name and a near miss all
  // find their person here exactly as they do there, and the answers come back
  // best-first. With nothing typed the lists are themselves, in the roster's own
  // order, and the matcher is never called.
  const query = search ?? ''
  const shownRequests = useMemo(
    () => requests && fuzzyRank(requests, query, r => r.name ?? ''),
    [requests, query],
  )
  const shownMembers = useMemo(
    () => members && fuzzyRank(members, query, m => m.name ?? ''),
    [members, query],
  )

  // How many people are waiting is already on the group row (the denormalized
  // summary, kept live by the join-request trigger), so the queue row announces
  // itself from the first frame even on a group opened for the first time,
  // where there is nothing cached to paint. Under a SEARCH it counts what the
  // drawer actually holds — the disc always states the number of rows under it,
  // and a queue standing empty under "9" would be the row lying about its own
  // contents.
  const requestCount = query
    ? shownRequests?.length ?? 0
    : requests?.length ?? livePending ?? group.pending ?? 0

  // Is the queue unfolded. A page-level state, so it survives a requester's
  // profile being stacked over this page and answered up there: the manager
  // comes back to the drawer he left open, one row shorter. A SEARCH opens it
  // by itself: a name that matches someone waiting must be on screen, not
  // folded away behind a number.
  const [queueOpen, setQueueOpen] = useState(!!initialRequestsOpen)
  const drawerOpen = queueOpen || !!query

  // The row's own YES, and as many of them at once as the manager taps. Only the
  // row that is working says so, where its own mark is; every other tick stays
  // full strength and live. See `answered` above for what makes that safe.
  const [answering, setAnswering] = useState<string[]>([])
  const inFlight = useRef(0)
  const approve = useCallback(async (id: string) => {
    tap()
    inFlight.current += 1
    setAnswering(a => [...a, id])
    try {
      const fresh = await respondJoin(id, true)
      // The row is answered for good: remembered first, so the very list this
      // reply carries is already read through that filter.
      setAnswered(a => (a.includes(id) ? a : [...a, id]))
      applyRequests(fresh.requests)
      // The roster is last-write-wins between racing answers, which can leave it
      // one person short: two replies read the members at nearly the same
      // moment, and neither read can see the other's join. The settle below is
      // what makes it right, so this only has to be quick.
      applyMembers(fresh.members)
    } catch {
      // The answer may have landed anyway (a lost reply, another manager, the
      // queue already drained): re-read rather than leave a row standing that
      // can only fail again. See resyncGroupQueue.
      await resyncGroupQueue(group.id)
    } finally {
      setAnswering(a => a.filter(x => x !== id))
      inFlight.current -= 1
      // The LAST answer of a burst re-reads the roster, once: whatever the
      // racing replies left it, this is the authoritative list. Only the last
      // one, so a run down the queue costs one extra read and not one per tap.
      if (inFlight.current === 0) load()
    }
  }, [group.id, applyRequests, applyMembers, load])

  const share = () => { tap(); shareInvitation(t('circles.shareMessage').replace('{name}', group.name).replace('{link}', groupInviteUrl(group.invite_code))) }

  // Reading the group back as everyone else meets it — the quiet half of the
  // page's foot. Every field the popup shows is already on this group row, which
  // the page keeps in step with each save (applyGroup), so the preview repaints
  // with the edit that was just made. Who RUNS it comes off the cached roster
  // this page is already holding — the member flagged owner — through the one
  // hook every group head reads, so the face at the top is the real one whether
  // I own the group or only manage it (an unread roster simply yields none,
  // exactly as an admin-owned group does).
  const [previewOpen, setPreviewOpen] = useState(false)
  const brief: GroupBrief = { ...group, owner: useGroupHead(group).owner }
  // THE MARK IS THE APP'S OWN CIRCLES GLYPH (user directive 2026-08-02), the one
  // the dock's Circles key wears and the one a shared circle is named with on a
  // profile card. What this opens is the CIRCLE — the object itself, as everyone
  // else meets it — so it wears the app's mark for a circle rather than a
  // preview-of-something mark, which says what the surface DOES and not what it
  // is about. (`PreviewGlyph`, the eye that stood here on the settings bar, has
  // no call site left and is deleted.)
  const preview: StripOption = {
    key: 'preview',
    label: t('circles.preview'),
    icon: <GroupsIcon color={INK} size={ICON.xxl} />,
    onPress: () => { tap(); setPreviewOpen(true) },
  }

  // The role is that MEMBER's, so it inflects with theirs — the other gender
  // axis from the hub row above, where the same chip is about me. A roster row
  // cached with no profile has no sex to read, and falls back to the masculine
  // form genderize defaults to.
  const roleTag = (m: GroupMember) => m.owner ? t('circles.owner') : m.manager ? genderize(t('circles.manager'), m.profile?.is_male) : null

  return (
    <View style={s.ownedFill}>
      {/* The page is the roster and nothing above it (user directive
          2026-07-28): the member-count heading and the play-here eye that used
          to sit on it are both gone — the eye is a CHECKBOX in Group settings
          now, under the group's kind, where the rest of the config lives, and
          the count was a line the roster already shows by being itself. So the
          list starts at the page's top edge and takes all of it. */}
      <ContainedRoster
        data={shownMembers}
        // The air under the list is the SHARE BUTTON's while there is one: the
        // roster ends where that block begins and the block holds the page's
        // bottom gap for both of them. With the button stood down for a search
        // there is nothing below to hold it, so the list takes the gap itself —
        // otherwise the card runs flush into whatever the page's bottom edge is
        // at that moment, which with a keyboard up is the keyboard (reported
        // 2026-07-31: the last row cut in half under it). The page SHRINKS by
        // itself; what a surface owes is only its own air off that new edge.
        bottomInset={search == null ? 0 : bottomInset}
        onTopMeasured={onRosterTop}
        syncing={syncing}
        keyOf={m => m.user_id}
        // Nothing here yet is a PLACEHOLDER (the roster is on its way and its
        // size is already known); nothing that MATCHES is an answer, and it says
        // so in words. A search that finds nobody in either list is the one time
        // this card is empty on purpose.
        empty={query
          ? <View style={s.card}><Empty text={t('circles.noResults')} /></View>
          : <View style={s.card}><SkeletonRows rows={group.members} /></View>}
        // The waiting queue is the roster's FIRST row (user directive
        // 2026-07-27): the same Strip the people under it are, so it lines up
        // with them by construction. What says it is an entry wanting an answer
        // rather than a person is the purple DISC in the avatar's lane, not a
        // fill of its own.
        //
        // AND IT IS A DRAWER, NOT A DOOR (user directive 2026-07-31): tapping it
        // unfolds the people waiting UNDER it, in place, and the members slide
        // down to make room; tapping it again folds them away. The queue was a
        // sub-screen of its own until then, on "two long lists never share a
        // screen" — but a queue is not a second list, it is the top of this one:
        // the manager is deciding who joins the very roster he is reading, and a
        // page in between made him leave it to do that.
        //
        // The row therefore states the two things a heading over a list states:
        // HOW MANY are waiting — a number in the disc (user directive
        // 2026-07-31), where the check used to be, since a count is what a
        // heading over a queue says and the check below it is what answers one —
        // and the one bulk answer, the DOUBLE tick, in the lane the rows under
        // it put their own single ticks in. That lane is what puts the two marks
        // on one line by construction: a mark for this person, a mark for all of
        // them, one rank apart in one column — and the bulk mark is only there
        // while the drawer it answers is (user directive 2026-07-31, see
        // ApproveAllControl).
        header={requestCount > 0 ? (
          <>
            <Strip
              // No fill override: it is the card's own WHITE first row (user
              // directive 2026-07-28). A tint here read as the PAGE behind it
              // and detached the row from the card.
              first
              style={rosterRowStyle(0, false)}
              icon={<AvatarDisc text={String(requestCount)} />}
              title={t('circles.requestsSectionJoin')}
              // The one row on this page that names a SECTION rather than a
              // person, so it is the one that carries the app's emphasis.
              titleStrong
              trailing={<ApproveAllControl group={group} open={drawerOpen} />}
              onPress={() => setQueueOpen(o => !o)}
            />
            <QueueDrawer open={drawerOpen}>
              {/* The row knows the count before the faces arrive (the
                  denormalized `pending` on the group row), so a drawer opened on
                  a group with nothing cached unfolds onto the right number of
                  placeholders rather than onto nothing. */}
              {shownRequests == null ? <SkeletonRows rows={requestCount} /> : shownRequests.map((r, i) => (
                <Strip
                  key={r.id}
                  // No hairline over the FIRST one: the drawer unfolds out from
                  // under the row above it, so a rule on that edge would ride
                  // out with it and read as a line peeling off that row. The
                  // seam at the drawer's other end is the opposite case and is
                  // left alone — the first member's own rule stands there
                  // whether the drawer is open or shut, so folding one away
                  // never makes a line appear or vanish.
                  first={i === 0}
                  icon={<Avatar userId={r.user_id} name={r.name} image={r.image} />}
                  title={r.name ?? ''}
                  onPress={() => onOpenRequest(r)}
                  // The lane after the name — the one a strip keeps for a row
                  // that answers in place. ONE tick for this person; the row
                  // above holds the two that mean everyone. Bare, like every
                  // other mark on these pages, and sized to the glyph rather
                  // than to a chrome circle: a row carries chrome, not a button.
                  trailing={(
                    <RoundButton
                      size={ICON.xxl}
                      bg="transparent"
                      shadow={false}
                      // NOTHING here is ever faded and nothing is ever shut:
                      // every other row stays live while this one is out (see
                      // `answered`), and the row that IS working says so with
                      // the spinner standing in its mark's place — `disabled`
                      // would grey that spinner to 0.4 and read as a door
                      // closed. The guard is on the press, so a second tap on
                      // the same row while its answer is in the air is simply
                      // not a second answer.
                      onPress={() => { if (!answering.includes(r.id)) approve(r.id) }}
                      accessibilityLabel={t('circles.approve')}
                    >
                      {answering.includes(r.id)
                        ? <Spinner color={INK} size={ICON.xxl} />
                        : <CheckIcon size={ICON.xxl} />}
                    </RoundButton>
                  )}
                />
              ))}
            </QueueDrawer>
          </>
        ) : null}
        row={(m, index, last) => {
          // The header row, when there is one, owns the card's rounded top and
          // the first hairline-free edge, so the people below it stay flat.
          const first = index === 0 && requestCount === 0
          return (
            <Strip
              first={first}
              style={rosterRowStyle(first ? 0 : index + 1, last)}
              icon={<Avatar userId={m.user_id} name={m.name} image={m.image} />}
              title={m.name ?? ''}
              tag={roleTag(m)}
              onPress={() => onOpenMember(m)}
            />
          )
        }}
      />

      {/* What you do WITH this circle sits UNDER the roster (user directive
          2026-07-28), not above it: the page is the list of people, and the rest
          is what you do after reading it. It rides the page's bottom edge,
          `bottomInset` clear of it, which is the air the roster used to carry.

          NOT WHILE THE PAGE IS SEARCHING (user directive 2026-07-31): a search
          is the manager looking for one person in this group, and neither
          handing the group on nor reading it back is what he is doing — so the
          page gives the list that band, and the keyboard standing where the
          block was does not have to be squeezed past it.

          TWO THINGS TO DO WITH A CIRCLE YOU RUN, IN THE APP'S ONE ACTION BLOCK
          (user directive 2026-08-02): what I MAY do — read the group back as
          everyone ELSE meets it — beside what the page is OFFERING, which is
          handing the link on. It is `SheetActionPair`, the same foot the group,
          account and leave/block popups wear, because it is the same object: a
          quiet mark passed on the way to the one purple invitation. The pair is
          one shape and only the fill tells the two apart — the strip's option is
          a mark over a word, and the button is handed `stack` by the row itself,
          so neither call site can state a shape of its own.
          `flush` because the gap above belongs to the PAGE here and not to a
          popup's rhythm: `ownedFill`'s own MD already stands between the roster
          and this block, exactly as it did when the button stood here alone. */}
      {search == null ? (
        <View style={{ marginBottom: bottomInset }}>
          <SheetActionPair
            flush
            options={[preview]}
            action={<Button label={t('circles.share')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={share} />}
          />
        </View>
      ) : null}
      {/* THE PREVIEW IS THE GROUP'S OWN POPUP (moved off the settings page's
          title bar, 2026-08-02): a manager edits his circle through fields and a
          chooser, which say nothing about what those add up to — and what they
          add up to is the popup a searcher, an invitee and a member all meet the
          group in.

          IT IS THAT POPUP ENTIRE, WITH MY OWN STANDING ON IT (user directive
          2026-08-02): `joined`, because I AM in this circle — the roster behind
          this popup lists me — so the things being in it lets me do stand on it
          exactly as they do when the same circle is picked off the hub by hand.
          An APPROVER may therefore leave from here, which is the whole point;
          the OWNER may not, and that guard belongs to the popup rather than to
          this call site (see `iOwnIt` in GroupSheet) — he hands the key over
          first. Opened with `none`, as the settings bar's preview was, the popup
          read me as a stranger to a circle I help run. */}
      <GroupSheet
        group={previewOpen ? brief : null}
        status="joined"
        onClose={() => setPreviewOpen(false)}
        // Leaving takes the WHOLE group off the page stack, this roster
        // included: it is a list of people I am not standing among any more. The
        // hub it lands on repaints off the store's own summary, exactly as the
        // member page's leave does (MemberProfileView.doLeave).
        onDone={onLeft}
      />
    </View>
  )
}

// Re-read a group's queue AND roster from the server, writing both caches.
//
// The one thing that corrects a stale request row. An answer that SUCCEEDS
// writes both caches from its own response, so nothing needs this — but an
// answer whose reply is lost leaves the row standing on a queue that is already
// mounted under the profile page, and a mounted page never refetches (the group
// page loads on mount only). The row then stays tappable and every further tap
// is refused with `no_request`, because the request WAS answered: reported
// 2026-07-30, where the server log shows the same request_id approved (200) and
// then refused (400) eleven seconds later, with no read in between. So a failed
// answer resyncs instead of assuming a refetch that cannot happen.
const resyncGroupQueue = (group_id: string): Promise<unknown> =>
  Promise.all([
    groupRequests(group_id).then(list => joinRequests.set(group_id, list)).catch(() => {}),
    groupMembers(group_id).then(list => rosters.set(group_id, list)).catch(() => {}),
  ])

// ── The waiting queue, unfolding inside the roster ─────────────────────────
// The drawer under the group page's queue row (user directive 2026-07-31): the
// people waiting slide out from under that row and the members slide down for
// them, and a second tap folds them back. It replaces the sub-screen the queue
// used to be — a page in between meant leaving the roster to decide who joins it.
//
// INSIDE THE WHITE CARD IT IS THE PAGE'S OWN GROUND (user directive 2026-07-31):
// a band of the page tint, opened in the middle of the card, which is what says
// these rows are a set held INSIDE the list rather than more of it. So the rows
// carry no fill of their own here (the card's white belongs to the roster) and
// the card's rounded ends stay where they are — the box clips this band square,
// mid-card, as it should.
//
// The height is MEASURED, never guessed: the rows are laid out at their natural
// height and the clipped box animates to that number. So a queue of two and a
// queue of forty open by the same rule at any font scale, and a row approved
// WHILE the drawer is open shrinks it by exactly its own height, in the same
// motion, instead of jumping.
//
// THE MEASURED CHILD IS OUT OF FLOW, and that is the whole mechanism, not a
// detail: a child laid out INSIDE the box is measured against the box's own
// height, which is the very number being animated — so while the drawer is shut
// its content reports ZERO, the effect below animates to zero, and the drawer
// can never open at all (the first cut of this did exactly that, on Fabric).
// Absolute takes the rows out of the parent's main axis entirely, so they are
// measured against their content and nothing else, and the box's height is free
// to be a pure animation value that clips them.
function QueueDrawer({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [height, setHeight] = useState(0)
  const shown = useSharedValue(0)
  // The framework's own default duration and easing — the app adds a MOTION
  // token only where a choreography demands a number of its own, and a drawer
  // does not.
  useEffect(() => { shown.value = withTiming(open ? height : 0) }, [open, height, shown])
  const box = useAnimatedStyle(() => ({ height: shown.value }))
  return (
    // Folded away it must be untouchable and unreadable, not merely invisible:
    // the rows stay MOUNTED (that is what keeps the measurement standing and
    // what lets the fold animate at all), so both have to be said out loud.
    <Animated.View
      style={[s.queueDrawer, box]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {/* The frame is the OUTER of these two: the measured box carries the white
          margin as padding (so the height being animated includes it) and the
          tile inside it is the page tint. */}
      <View style={s.queueRows} onLayout={e => setHeight(e.nativeEvent.layout.height)}>
        <View style={s.queueInner}>{children}</View>
      </View>
    </Animated.View>
  )
}

// The queue row's own control, in the very lane the rows under it answer from:
// a check that empties the whole queue at once (user directive 2026-07-28). A
// queue of forty is otherwise forty profiles to open, and a manager who trusts
// the list wants one answer, not forty. It asks first, in the app's ONE
// decision popup, with a single button — approving everyone is not a thing to
// do by accident. It stood on a heading over the queue's own page until
// 2026-07-31, when that page became a drawer inside the roster and the mark took
// the place the count chip had been holding on the row.
//
// IT IS ONLY THERE WHILE THE DRAWER IS (user directive 2026-07-31): it grows in
// as the queue unfolds and shrinks away as it folds. "All of them" means the
// people on screen, so the mark that says it belongs to the open drawer — over a
// shut row it answers for a list the manager cannot see, and it is the one
// control in the app that empties a queue in a single tap. So it arrives with
// the rows it is about and leaves with them.
//
// A ZOOM AND NOTHING ELSE, like the app's other mark that grows out of a tap
// (TapMenu): one property, and the zero end IS the hidden state, so there is no
// second thing to keep in step and nothing translucent to composite. The default
// duration and easing are the framework's — this rides the drawer's own fold,
// which states no number of its own either.
function ApproveAllControl({ group, open }: { group: OwnedGroup; open: boolean }) {
  // Same cache the row above reads, so the control appears and disappears with
  // the queue itself rather than with a stale count.
  const requests = joinRequests.useValue(group.id)
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const count = requests?.length ?? group.pending ?? 0
  const shown = useSharedValue(open ? 1 : 0)
  useEffect(() => { shown.value = withTiming(open ? 1 : 0) }, [open, shown])
  const zoom = useAnimatedStyle(() => ({ transform: [{ scale: shown.value }] }))

  // Nothing to approve: no dead chrome on the row.
  if (count < 1) return null

  const approveAll = async () => {
    setBusy(true)
    try {
      // ONE round trip for the whole queue (server drains it in one
      // transaction), so both caches are correct from a single answer.
      const fresh = await approveAllJoins(group.id)
      joinRequests.set(group.id, fresh.requests)
      rosters.set(group.id, fresh.members)
    } catch {
      // The queue may well be drained (this call, or another manager): re-read
      // it rather than pop onto rows that can only fail. See resyncGroupQueue.
      await resyncGroupQueue(group.id)
    } finally {
      setBusy(false)
      // The popup goes, and the row goes with the queue it was about: with
      // nothing left waiting there is no entry to stand on the roster.
      setAsk(false)
    }
  }

  return (
    <>
      {/* Two ticks, not one: the double check is already read as "all of them"
          (user directive 2026-07-28), and a single one on the queue's own row
          reads as approving whoever sits at the top of it. The single tick is
          spoken for anyway — it stands on each row in the drawer, answering that
          one person — so the pair is one mark at two ranks, in one column: this
          one, and all of them. Sized to the GLYPH with no chrome circle, like
          every other mark on these pages: a row carries chrome, not a button.

          The BOX stays whether the mark is in it or not: the lane is the drawer's
          own column, the ticks under it line up on it, and a row that reflowed
          its title on every toggle would be a second motion fighting the zoom.
          Zoomed away it is untouchable and unreadable, not merely unpainted —
          the same three statements the drawer makes about its folded rows. */}
      <Animated.View
        style={zoom}
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        <RoundButton
          size={ICON.xxl}
          bg="transparent"
          shadow={false}
          onPress={() => { tap(); setAsk(true) }}
          accessibilityLabel={t('circles.approveAll')}
        >
          <DoubleCheckIcon size={ICON.xxl} />
        </RoundButton>
      </Animated.View>
      <ConfirmDialog
        visible={ask}
        title={t('circles.approveAllTitle')}
        description={t('circles.approveAllDesc').replace('{name}', group.name)}
        // ONE button (no cancelLabel): the popup is dismissed by swiping it
        // down or tapping the backdrop, and the only thing to press approves.
        confirmLabel={t('circles.approveAll')}
        busy={busy}
        onCancel={() => { if (!busy) setAsk(false) }}
        onConfirm={approveAll}
      />
    </>
  )
}

// WHO RUNS A GROUP, off the roster this page came from. The server states the
// owner on a group BRIEF (the popup's payload) but not on the row a manage page
// carries, and the roster is already in memory here — the member flagged owner
// IS that person. An unread roster simply yields none, and `GroupHead` then
// draws the count and the name alone, exactly as an admin-owned group does.
// One hook, so every surface that shows a group's head reads the same source.
function useGroupHead(group: OwnedGroup) {
  const members = rosters.useValue(group.id)
  const owner = members?.find(m => m.owner)
  // The count is read LIVE (user directive 2026-08-02), not off the snapshot
  // this page was pushed with: a member joining or leaving while a person's
  // page is open changes how big the circle under their card is, and that fact
  // is delivered to this device the moment it changes (see useLiveGroup). The
  // snapshot is the fallback for a summary the server has not written yet.
  const count = useLiveGroup(group.id)?.members ?? group.members
  return useMemo(() => ({
    name: group.name,
    members: count,
    owner: owner ? { user_id: owner.user_id, name: owner.name, image: owner.image } : null,
  }), [group.name, count, owner])
}

// ── A person's page ────────────────────────────────────────────────────────
// THE one profile surface of the Circles sheet: the same card the app
// renders for a match, full-bleed under the floating back control, with the
// actions about that person pinned under it. A requester, a member and a friend
// are the same page with different buttons (user directive 2026-07-27) — no
// decision about a person is taken from a row or a popup any more.
// The profiles the server sends here carry NO distance: being in a group with
// someone, or waiting at their door, is not consent to reveal where you are.
// The card is asked to drop the whole proximity chip (hideProximity) for the
// same reason: neither where the person is nor when they were last around
// belongs on a profile opened from a roster (user directive 2026-07-29).
function ProfilePage({ profile, userId, name, image, insets, caption, onOpenFriend, isTop, actions, self }: {
  profile?: Profile | null
  /** Fallbacks for a row cached by a build that predates the profile payload:
   *  the page still works, just without the card. */
  userId: string
  name: string | null
  image: MemberImage
  insets: { top: number; bottom: number }
  /** WHICH CIRCLE this person is standing in — the group's name, or "my
   *  friends" — and on a requester's page, what the answer below is about. It is
   *  the POPUP's title (user directive 2026-07-30), which is why it is handed to
   *  ProfileActionBar rather than styled here: the block under the photo reads
   *  exactly like the head of a popup instead of a caption invented on this
   *  page. A GROUP hands over its whole head rather than its name (GroupHead) —
   *  see ProfileActionBar. */
  caption?: React.ReactNode
  /** A mutual friend picked out of the shared-circles popup: opens THAT
   *  person's page on top of this one, the same as tapping them in a roster. */
  onOpenFriend?: (friend: FriendItem) => void
  /** False while that friend's page is stacked over this one. Pages stay
   *  mounted under each other, so this is what tells the shared-circles popup it
   *  is COVERED rather than closed: it hides under the page it opened and comes
   *  back when it pops (user directive 2026-07-30). */
  isTop: boolean
  /** What can be done about this person, stated as data — the bar paints each one
   *  as a glyph with a word under it (see ProfileActionBar). May be empty (a plain
   *  member looking at another plain member decides nothing about them). */
  actions: StripOption[]
  /** This person IS me — my own row in a roster. A SELF CARD IS THE SAME CARD
   *  WHEREVER IT IS RENDERED (user directive 2026-07-31), so the card speaks in
   *  the first person here exactly as it does in the dock's preview ("I have
   *  kids", not "he has kids"): the page is a member page like any other, but
   *  the member is me and the card knows it. */
  self?: boolean
}) {
  // The card's shared-circles chip is live here exactly as it is on home (user
  // directive 2026-07-30): a profile is a profile, so the one chip that says how
  // the two of you are already connected opens the one popup that lists it all.
  // Same hook home uses, so neither surface can fetch or order it differently.
  // A tapped person is pushed as a page OVER this one and this page stays mounted
  // under it, so `!isTop` is exactly "the popup is covered": it hides for as long
  // as that page is up and is back the moment it pops, by its X, a swipe or Back.
  const circles = useSharedCircles(!isTop)
  return (
    <View style={s.profileFill}>
      {profile ? (
        // chromeInset lines the card's name/age chip up with the page's own
        // floating chrome. bottomChrome is the same question the bar below
        // answers for itself, asked once: with a bar the card stops above it and
        // its on-photo set ends at the card's own gutter; with none the card
        // fills the screen and clears the navigation bar itself.
        <MatchCard
          match={profile}
          actions={[]}
          bottomInset={0}
          bottomChrome={profileActionBarShows(caption, actions)}
          chromeInset={insets.top}
          hideProximity
          self={self}
          onCircleTap={n => circles.open(profile.user_id, profile.is_male, n)}
        />
      ) : (
        <View style={[s.content, s.profileBare]}>
          <View style={s.card}>
            <Strip first icon={<Avatar userId={userId} name={name} image={image} />} title={name ?? ''} />
          </View>
        </View>
      )}
      {/* THE bar under a profile card: the title, the strip of options and every
          gap around them live in it, and it renders nothing at all when there is
          neither — a member a plain member can decide nothing about gets a card
          that fills the screen. */}
      <ProfileActionBar caption={caption} actions={actions} />
      {/* Everything the two of you share, opened by the card's circle chip. A
          tapped person opens THAT PERSON'S PAGE on top of this one (user
          directive 2026-07-29) — the same push a roster row makes, so Back
          walks straight back to this list, and from it to the card that named
          them (user directive 2026-07-30): the page only covers the popup, so
          nothing here closes it. */}
      <SharedCirclesPopup
        {...circles.props}
        onSelectFriend={f => onOpenFriend?.(f)}
      />
    </View>
  )
}

// One requester's profile: approve or decline, right under the face.
function JoinRequestProfileView({ group, request, onDone, onOpenFriend, isTop, insets }: {
  group: OwnedGroup
  request: JoinRequestItem
  /** Pop back to the group, whose queue drawer this was opened from and is
   *  still standing open — one row shorter. The answer is done. */
  onDone: () => void
  /** A mutual friend picked out of the card's shared-circles popup. */
  onOpenFriend: (friend: FriendItem) => void
  /** False while a friend's page is stacked over this one — see ProfilePage. */
  isTop: boolean
  insets: { top: number; bottom: number }
}) {
  const groupHead = useGroupHead(group)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline'); accept ? tap() : tapWarning()
    try {
      const fresh = await respondJoin(request.id, accept)
      // Both caches are written here, so the drawer and the roster behind this
      // page are already correct by the time it pops.
      joinRequests.set(group.id, fresh.requests)
      if (accept) rosters.set(group.id, fresh.members)
    } catch {
      // The answer may have landed anyway (a lost reply, or another manager got
      // there first), so the queue is re-read before this page pops back onto
      // it — a row left standing here can only fail again. See resyncGroupQueue.
      await resyncGroupQueue(group.id)
    } finally { setBusy(null); onDone() }
  }

  return (
    <ProfilePage
      profile={request.profile}
      userId={request.user_id}
      name={request.name}
      image={request.image}
      insets={insets}
      caption={<GroupHead group={groupHead} note={waitingSince(request.created_at, request.name)} />}
      onOpenFriend={onOpenFriend}
      isTop={isTop}
      // The two answers, side by side, as marks: neither is recommended and the
      // page is not asking on its own behalf (user directive 2026-07-31, which is
      // what retired the solid purple "approve" that led this pair).
      actions={[
        {
          key: 'approve',
          label: t('circles.approve'),
          icon: <CheckIcon color={INK} size={ICON.xxl} />,
          busy: busy === 'accept', disabled: !!busy,
          onPress: () => respond(true),
        },
        {
          key: 'decline',
          label: t('circles.declineJoin'),
          icon: <CloseIcon color={INK} size={ICON.xxl} />,
          busy: busy === 'decline', disabled: !!busy,
          onPress: () => respond(false),
        },
      ]}
    />
  )
}

// A member of a group you manage, or one of your friends. Everything that used
// to sit in the member-actions BottomSheet or on a friend row lives here.
//
// TWO components under the one target, not one body with a branch through its
// middle: the member page reads the group's ROSTER and a friend's page has no
// roster to read (see MemberProfileView), so a single body would be declaring a
// hook that only one of its two shapes uses.
function PersonProfileView({ person, onDone, onGroupChanged, onGroupDropped, onOpenFriend, isTop, insets }: {
  person: PersonTarget
  /** Pop back: the person is no longer in the list behind this page. */
  onDone: () => void
  /** A mutual friend picked out of the card's shared-circles popup. */
  onOpenFriend: (friend: FriendItem) => void
  /** False while a friend's page is stacked over this one — see ProfilePage. */
  isTop: boolean
  /** My own standing in the group changed under an action taken here (handing
   *  it over), so the pages behind must be re-seeded with the fresh row. */
  onGroupChanged: (g: OwnedGroup) => void
  /** ...or I stopped running it altogether, and the pages behind are not mine
   *  to be on any more. */
  onGroupDropped: (id: string) => void
  insets: { top: number; bottom: number }
}) {
  return person.kind === 'friend' ? (
    <FriendProfileView friend={person.friend} onDone={onDone} onOpenFriend={onOpenFriend} isTop={isTop} insets={insets} />
  ) : (
    <MemberProfileView
      group={person.group}
      member={person.member}
      onDone={onDone}
      onGroupChanged={onGroupChanged}
      onGroupDropped={onGroupDropped}
      onOpenFriend={onOpenFriend}
      isTop={isTop}
      insets={insets}
    />
  )
}

// One of my friends. There is one thing to decide about them, and deciding it
// ENDS the page: they are not in the list behind it any more.
function FriendProfileView({ friend: f, onDone, onOpenFriend, isTop, insets }: {
  friend: FriendItem
  onDone: () => void
  onOpenFriend: (friend: FriendItem) => void
  isTop: boolean
  insets: { top: number; bottom: number }
}) {
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const doUnfriend = async () => {
    setBusy(true); tapWarning()
    try {
      await unfriend(f.user_id)
      friendsRoster.set({
        friends: (friendsRoster.get()?.friends ?? []).filter(x => x.user_id !== f.user_id),
        requests: friendsRoster.get()?.requests ?? [],
      })
    } finally { setBusy(false); setConfirmRemove(false); onDone() }
  }
  return (
    <>
      {/* The circle this person is standing in (user directive 2026-07-30):
          my friends IS a circle like a group, so a friend's page is titled
          with it exactly as a member's page is titled with the group's name. */}
      <ProfilePage
        profile={f.profile} userId={f.user_id} name={f.name} image={f.image} insets={insets}
        caption={t('circles.myFriends')}
        onOpenFriend={onOpenFriend}
        isTop={isTop}
        // The one thing there is to do about a friend, so it takes the strip's
        // whole width and has no rule to stand against.
        actions={[{
          key: 'unfriend',
          label: t('circles.unfriendConfirm'),
          icon: <UserMinusIcon color={INK} size={ICON.xxl} />,
          busy,
          onPress: () => { tap(); setConfirmRemove(true) },
        }]}
      />
      <ConfirmDialog
        visible={confirmRemove}
        title={t('circles.unfriendTitle').replace('{name}', f.name ?? '')}
        description={t('circles.unfriendDesc')}
        confirmLabel={t('circles.unfriendConfirm')}
        confirmIconStart={<UserMinusIcon color={WHITE} />}
        busy={busy}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={doUnfriend}
      />
    </>
  )
}

// Someone standing in a group I run.
//
// THE PAGE IS THE ROSTER'S ROW, NOT A COPY OF IT. The row that opened this page
// is a snapshot taken at the tap, and an appointment made HERE rewrites exactly
// that row — so the member is read back out of the roster cache on every render,
// the same cache every action on this page writes, and the pushed row is only
// what stands in until the cache has one (or after a removal, when it no longer
// does). Holding the snapshot is what made appointing an approver look like it
// had failed: the server took it, the strip went on saying "make approver", and
// the tap was made again (reported 2026-07-31 — both calls landed, the second a
// no-op on an appointment that was already there).
function MemberProfileView({ group, member, onDone, onGroupChanged, onGroupDropped, onOpenFriend, isTop, insets }: {
  group: OwnedGroup
  member: GroupMember
  /** Pop back: the person is no longer in the list behind this page. */
  onDone: () => void
  /** A mutual friend picked out of the card's shared-circles popup. */
  onOpenFriend: (friend: FriendItem) => void
  /** False while a friend's page is stacked over this one — see ProfilePage. */
  isTop: boolean
  /** My own standing in the group changed under an action taken here (handing
   *  it over), so the pages behind must be re-seeded with the fresh row. */
  onGroupChanged: (g: OwnedGroup) => void
  /** ...or I stopped running it altogether, and the pages behind are not mine
   *  to be on any more. */
  onGroupDropped: (id: string) => void
  insets: { top: number; bottom: number }
}) {
  const groupHead = useGroupHead(group)
  const [busy, setBusy] = useState<'manager' | 'remove' | 'transfer' | 'leave' | null>(null)
  const [confirmTransfer, setConfirmTransfer] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const roster = rosters.useValue(group.id)
  const m = roster?.find(x => x.user_id === member.user_id) ?? member
  const iAmOwner = !!group.is_owner
  // MY OWN ROW OPENS THIS PAGE LIKE EVERY OTHER ROW (see CView), and what stands
  // under it is the one thing this page can be about when the person on it is
  // me: LEAVING (user directive 2026-07-31). It is the app's existing leave —
  // the same word, the same mark and the same question the group popup asks
  // (GroupSheet) — because there is only one way out of a circle, however you
  // reached the door. Everything else here is a decision ABOUT somebody, and
  // there is nobody else on this page: `isMe` is what keeps "remove from the
  // group" off my own card, where it would be a second, worse-worded leave.
  //
  // The OWNER cannot leave: the server's app_leave_group deletes the membership
  // row and nothing else, so an owner walking out would strand the group with an
  // owner who is not in it. He hands it over first (the key, on a manager's
  // page) or deletes it (settings) — so his own row keeps offering nothing, as
  // it always has.
  const meId = useUserStore(st => st.profile?.user_id)
  const isMe = m.user_id === meId
  const canLeave = isMe && !m.owner
  // Who the group is (promote/demote, hand it over) is the OWNER's alone (user
  // directive 2026-07-28). Removing someone is the one action a manager keeps,
  // and it acts on a PLAIN member only — for EVERYONE, the owner included since
  // 2026-07-31 (see `canRemove`) — while the owner is untouchable even to
  // himself (removing him would leave the group ownerless with no way back).
  // The server draws the same lines.
  const canOwnerAct = iAmOwner && !m.owner
  // AN OPEN GROUP HAS NO APPROVERS (user directive 2026-07-30). The role is
  // one job — answering join requests — and an open group has none to answer,
  // so there is nothing to appoint anyone to: the button is not offered here,
  // and the server strips whatever approvers a group had the moment it turns
  // open (so no member of one can be wearing the tag either).
  const openGroup = groupKind(group) === 'open'
  const canPromote = canOwnerAct && !openGroup
  // ...and the group is handed only to someone who already RUNS it (user
  // directive 2026-07-30): ownership passes through management, so the owner
  // promotes first and hands over second, and the person receiving the group
  // has already been trusted with it once. A plain member's page therefore
  // offers "Make approver" and "Remove", never the key. The server draws the
  // same line (`not_manager`).
  //
  // EXCEPT in an open group (user directive 2026-07-30), where that route does
  // not exist: with no approver to promote anyone to, the key would be
  // unreachable, so it goes straight to any member.
  const canTransfer = canOwnerAct && (openGroup || !!m.manager)
  // AN APPROVER IS NOT THROWN OUT, HE IS UNAPPOINTED FIRST (user directive
  // 2026-07-31, dropping the owner's exemption from the 2026-07-28 rule).
  // Removal acts on a plain member, whoever is asking. The tag is a standing
  // the owner gave him, so taking him out of the group while he still wears it
  // is two decisions on one tap and only the second was asked for — cancel the
  // appointment and the ordinary "remove" is there on the very next render.
  //
  // It is also what holds this page to at most TWO actions: "unappoint · hand
  // over · remove" was the one case that put three under a card, and three
  // quiet buttons is a page asking the owner to choose rather than a page about
  // a person.
  const canRemove = !isMe && !m.owner && !m.manager
  // AN APPOINTMENT DOES NOT END THE PAGE (2026-07-31). Every other action here
  // takes the person out of the list behind this page — removed, or the group
  // handed away — and closing IS their result. This one leaves them exactly
  // where they were and changes only what they ARE, so the result is the strip
  // itself: "make approver · remove" becomes "unappoint · hand over" on the next
  // render, which is the app saying it took. Closing said nothing at all, and
  // what the user was left looking at was the roster he started from.
  const doSetManager = async () => {
    setBusy('manager'); tap()
    try { rosters.set(group.id, await setManager(group.id, m.user_id, !m.manager)) } finally { setBusy(null) }
  }
  const doRemove = async () => {
    setBusy('remove'); tapWarning()
    try { rosters.set(group.id, await removeMember(group.id, m.user_id)) } finally { setBusy(null); onDone() }
  }
  // The group changes hands: the caller drops from owner to manager, so every
  // owner-only affordance on the pages behind this one is now wrong and so is
  // every role tag on the roster. Both are REPAINTED rather than dropped (a
  // dropped cache is shadowed by the group page's own last copy, which is what
  // left the old owner crowned after the popup closed): the roster comes back
  // with the response, and the caller's new standing is derived HERE.
  //
  // NOT off the store's summary (2026-07-29): `invoke` strips `relations` from
  // every plain response before merging it (applyServerUser — game state is
  // Realtime-authoritative), so relations.communities still holds the PRE-
  // transfer row at the moment this resolves. Re-seeding the stack from it put
  // is_owner back to true, and the pages behind kept the owner's affordances —
  // the settings page handed a MANAGER the name / description / link / kind
  // fields, which the server would then refuse. What the handover did to the
  // caller needs no round trip anyway: he owned it, he gave it away, he is a
  // manager of it now. The Realtime echo of the same write follows and agrees.
  const doTransfer = async () => {
    setBusy('transfer'); tapWarning()
    try {
      rosters.set(group.id, await transferOwner(group.id, m.user_id))
      // An OPEN group leaves the outgoing owner nothing to stand on: there is
      // no approver role for him to drop into, so he is a plain member from
      // this moment and the manage + settings pages under this one are not his
      // any more. They are dropped rather than re-seeded (the roster behind
      // them would come back `not_manager` on its next read).
      if (openGroup) onGroupDropped(group.id)
      else onGroupChanged({ ...group, is_owner: false })
    } finally { setBusy(null); setConfirmTransfer(false); onDone() }
  }
  // I walk out of the circle. Byte for byte what the group popup's leave does
  // (GroupSheet.quit) — the endpoint, and the cached roster going with the
  // membership it belonged to — and then the whole group goes off the stack:
  // this page, and the roster it was opened from, are a list of people I am not
  // standing among any more. No `onDone` beside it, because `onGroupDropped`
  // takes THIS page too (see removeGroupViews), and the hub it lands on repaints
  // off the store's own summary, which the server has already rewritten.
  const doLeave = async () => {
    setBusy('leave'); tapWarning()
    try {
      await leaveGroup(group.id)
      dropGroupCaches(group.id)
      onGroupDropped(group.id)
    } finally { setBusy(null); setConfirmLeave(false) }
  }

  return (
    <>
      {/* The group is the circle this person is standing in, so the page is
          titled with its name — the person page carries no title bar of its own
          (fullBleed), and their name is on the card. */}
      <ProfilePage
        profile={m.profile} userId={m.user_id} name={m.name} image={m.image} insets={insets}
        caption={<GroupHead group={groupHead} note={memberSince(member.joined_at, m.name)} />}
        onOpenFriend={onOpenFriend}
        isTop={isTop}
        self={isMe}
        // Every option the same weight (user directive 2026-07-30, finishing what
        // 2026-07-29 started on "remove", and 2026-07-31 took the tiles off all of
        // them): none of these is the page's purpose — the page is the person —
        // so nothing here is emphasized over anything else. Taking someone out is
        // never the loud thing on the page, and neither is handing the group over.
        // Filtered by the viewer's role, so the strip carries what he may actually
        // do and nothing else: at most two, since an approver is unappointed
        // before he can be removed (see `canRemove`).
        actions={[
          ...(canPromote ? [{
            key: 'manager',
            // The appointment names THIS member's role, so it inflects with
            // theirs — the same subject the roster chip beside their name reads
            // (a row cached with no profile has no sex and falls back to the
            // masculine, exactly as that chip does). Undoing it names no role at
            // all ("ביטול המינוי") and needs none.
            label: m.manager ? t('circles.removeManager') : genderize(t('circles.makeManager'), m.profile?.is_male),
            icon: <RankIcon color={INK} down={!!m.manager} size={ICON.xxl} />,
            busy: busy === 'manager', disabled: !!busy,
            onPress: doSetManager,
          }] : []),
          ...(canTransfer ? [{
            key: 'transfer',
            label: t('circles.transferOwner'),
            icon: <KeyIcon color={INK} size={ICON.xxl} />,
            busy: busy === 'transfer', disabled: !!busy,
            onPress: () => { tap(); setConfirmTransfer(true) },
          }] : []),
          ...(canRemove ? [{
            // TAKING A MEMBER OUT ASKS NOTHING (user directive 2026-07-31): the
            // tap removes, there and then. The question it used to raise answered
            // itself — "they can join again with the invite link" — so it was a
            // popup standing between the user and a decision it had nothing to
            // add to. It is not the pair of "leave the group" or "hand it over",
            // which are asked twice because they are MINE to lose and may not be
            // mine to get back; this one is undone by the same link that got them
            // in. The strip's own spinner is the feedback, and the warning haptic
            // in `doRemove` is what says a removal happened.
            key: 'remove',
            label: t('circles.removeFromGroup'),
            icon: <UserMinusIcon color={INK} size={ICON.xxl} />,
            busy: busy === 'remove', disabled: !!busy,
            onPress: doRemove,
          }] : []),
          ...(canLeave ? [{
            // THE app's leave, on my own row: the same word, the same mark and
            // the same question the group popup asks, because there is one way
            // out of a circle however you reached the door. Asked twice, unlike
            // "remove" beside it: this is MINE to lose, and a closed group may
            // not be mine to get back.
            key: 'leave',
            label: t('circles.leave'),
            icon: <SignOutIcon color={INK} size={ICON.xxl} />,
            busy: busy === 'leave', disabled: !!busy,
            onPress: () => { tap(); setConfirmLeave(true) },
          }] : []),
        ]}
      />
      <ConfirmDialog
        visible={confirmTransfer}
        title={t('circles.transferOwnerTitle').replace('{name}', m.name ?? '')}
        description={t(openGroup ? 'circles.transferOwnerDescOpen' : 'circles.transferOwnerDesc').replace('{name}', m.name ?? '')}
        confirmLabel={t('circles.transferOwner')}
        confirmIconStart={<KeyIcon color={WHITE} />}
        busy={busy === 'transfer'}
        onCancel={() => setConfirmTransfer(false)}
        onConfirm={doTransfer}
      />
      {/* The same question the group popup asks, word for word — one leave, one
          confirmation of it. */}
      <ConfirmDialog
        visible={confirmLeave}
        title={t('settings.groupsLeaveTitle').replace('{name}', group.name)}
        confirmLabel={t('settings.groupsLeaveConfirm')}
        confirmIconStart={<SignOutIcon color={WHITE} />}
        busy={busy === 'leave'}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={doLeave}
      />
    </>
  )
}

// ── Group settings (name / description / visibility / join policy / delete) ──
// Reached from the manage page's settings summary row. OWNER ONLY, all of it
// (user directive 2026-07-28): a manager answers join requests, he does not
// reshape the group. What a manager gets on this page is the one row that is
// about HIM rather than about the group, "hide me from the members here", and
// nothing else. The server draws the same line (app_update_group and
// app_remove_member are owner-only; app_set_group_hidden is not).
function GroupSettingsView({ group, onChanged, onDeleted }: { group: OwnedGroup; onChanged: (g: OwnedGroup) => void; onDeleted: () => void }) {
  const iAmOwner = !!group.is_owner
  // The hide-me switch's sub-line speaks TO the user ("and you will not see
  // them"), so it takes his own sex on both pages it appears on.
  const isMale = useMyGender()
  const [kind, setKind] = useState<GroupKind>(groupKind(group))
  // "Hide me from the members here": the caller's OWN standing in the group,
  // not the group's config — but it is a switch about this group, so it lives
  // with the group's other switches (user directive 2026-07-28), directly under
  // the kind, as a checkbox rather than a popup of its own. Optimistic like the
  // kind above it, and reverted if the server refuses.
  const [hidden, setHidden] = useState(!!group.hidden)
  const [savingName, setSavingName] = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)
  const [savingLink, setSavingLink] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const linkPlaceholder = useLinkPlaceholder()

  // One call sets the whole policy: the kind IS the pair of flags, so there is
  // no window where the group is half-changed. The server enforces the same
  // invariant, so a hidden group can never come back without approval.
  const chooseKind = async (next: GroupKind) => {
    if (next === kind) return
    const prev = kind
    setKind(next)
    try {
      const g = await updateGroup(group.id, groupKindFlags(next))
      onChanged(g)
      // Going OPEN admits everyone who was queued (the server drains the queue
      // and pushes them), so the cached queue is empty from this moment and the
      // roster it grew by has to be re-read. The same flip STRIPS the group's
      // approvers (user directive 2026-07-30 — an open group has none), which
      // is the second reason the roster cannot be kept: every one of those rows
      // was wearing a tag it no longer has.
      if (next === 'open') { joinRequests.set(group.id, []); rosters.drop(group.id) }
    } catch { setKind(prev) }
  }
  const toggleHidden = async (next: boolean) => {
    setHidden(next)
    try { onChanged(await setGroupHidden(group.id, next)) } catch { setHidden(!next) }
  }
  const saveName = async (next: string | null) => {
    if (!next) return  // min 1 keeps the field non-empty; guard anyway
    setSavingName(true)
    try { const g = await updateGroup(group.id, { name: next }); onChanged(g) } finally { setSavingName(false) }
  }
  const saveDescription = async (next: string | null) => {
    setSavingDesc(true)
    try { const g = await updateGroup(group.id, { description: next }); onChanged(g) } finally { setSavingDesc(false) }
  }
  // The stored link is whatever the server made of what was pasted: a bare
  // "example.com/x" comes back with its https://, so the field repaints with
  // the real URL. One the server refuses (any other scheme, or not a host at
  // all) changes nothing — and the refusal is RETHROWN rather than swallowed,
  // which is what puts circles.linkInvalid under the field with the text
  // still in it. Swallowing it wiped the field and said nothing, which reads as
  // "the app will not save my link" (2026-07-29).
  const saveLink = async (next: string | null) => {
    setSavingLink(true)
    try { const g = await updateGroup(group.id, { link: next }); onChanged(g) }
    finally { setSavingLink(false) }
  }
  const doDelete = async () => {
    setDeleting(true); tapWarning()
    try { await deleteGroup(group.id); dropGroupCaches(group.id); onDeleted() } finally { setDeleting(false); setConfirmDelete(false) }
  }

  // A manager's whole settings page: the one switch that is his rather than the
  // group's. Everything below this belongs to the owner.
  if (!iAmOwner) {
    return (
      <View style={{ gap: MD }}>
        <View style={s.card}>
          <ToggleRow
            label={t('circles.hiddenToggle')}
            sub={genderize(t('circles.hiddenSub'), isMale)}
            value={hidden}
            onValueChange={toggleHidden}
            style={s.hiddenRow}
          />
        </View>
      </View>
    )
  }

  return (
    <View style={{ gap: MD }}>
      <Text style={s.section}>{t('circles.name')}</Text>
      <View style={s.descCard}>
        <EditableText
          value={group.name}
          saving={savingName}
          onCommit={saveName}
          errorLabel={t('circles.saveFailed')}
          min={1}
          max={GROUP_NAME_MAX}
          singleLine
          placeholder={t('circles.namePlaceholder')}
          updateLabel={t('circles.descUpdate')}
          inputStyle={s.nameInput}
          footerStyle={s.descFooter}
          hintStyle={s.descHint}
        />
      </View>

      <Text style={s.section}>{t('circles.description')}</Text>
      <View style={s.descCard}>
        <EditableText
          value={group.description ?? ''}
          saving={savingDesc}
          onCommit={saveDescription}
          errorLabel={t('circles.saveFailed')}
          min={0}
          max={GROUP_DESCRIPTION_MAX}
          allowEmpty
          placeholder={t('circles.descriptionPlaceholder')}
          updateLabel={t('circles.descUpdate')}
          inputStyle={s.descEditorInput}
          footerStyle={s.descFooter}
          hintStyle={s.descHint}
        />
      </View>

      {/* Where the group lives outside the app (a site, a form, a WhatsApp
          invite). Sits under the description because it is the rest of that
          sentence, and above the kind, which is policy rather than blurb. */}
      <Text style={s.section}>{t('circles.link')}</Text>
      {/* What was pasted is not what gets saved — the server completes a bare
          host and stores its own version — so the one way to know where the
          line under the description will actually take a reader is to press it.
          It is a bare MARK beside the field, not a line under it: opening the
          link is a thing to do WITH the field, so it stands in the field's own
          row rather than costing a row of its own. It opens the SAVED link
          (`group.link`), through the very helper the group popup's head uses,
          and it is there only once there is one. */}
      <View style={s.linkRow}>
      <View style={[s.descCard, s.linkCard]}>
        <EditableText
          value={group.link ?? ''}
          saving={savingLink}
          onCommit={saveLink}
          errorLabel={t('circles.linkInvalid')}
          min={0}
          max={GROUP_LINK_MAX}
          allowEmpty
          singleLine
          keyboardType="url"
          autoCapitalize="none"
          placeholder={linkPlaceholder}
          updateLabel={t('circles.descUpdate')}
          inputStyle={s.linkInput}
          footerStyle={s.descFooter}
          hintStyle={s.descHint}
        />
      </View>
        {/* A field with nothing in it has nothing to open, and the mark says so
            by fading rather than by going away: it is a door that will be there
            the moment a link is pasted, so it stays on the row in the app's one
            shut-door fade (DISABLED_OPACITY). */}
        <Pressable
          style={[s.linkTest, !group.link && s.linkTestOff]}
          disabled={!group.link}
          accessibilityRole="link"
          accessibilityLabel={t('circles.linkTest')}
          onPress={() => { tap(); openGroupLink(group.link) }}
        >
          <GlobeIcon size={ICON.xxl} />
        </Pressable>
      </View>

      <Text style={s.section}>{t('circles.kindLabel')}</Text>
      <KindChooser value={kind} onChange={chooseKind} />

      {/* Manage without playing, as one checkbox: the members do not meet you
          and you do not meet them, and you go on running the group exactly as
          before. The sentence that used to be a popup's body is the row's own
          sub-line now. */}
      <View style={s.card}>
        <ToggleRow
          label={t('circles.hiddenToggle')}
          sub={genderize(t('circles.hiddenSub'), isMale)}
          value={hidden}
          onValueChange={toggleHidden}
          style={s.hiddenRow}
        />
      </View>

      {/* Owner-only page from here up, so the delete needs no gate of its own. */}
      <Button label={t('circles.deleteGroup')} variant="secondary" size="lg" iconStart={<TrashIcon color={INK} />} onPress={() => setConfirmDelete(true)} />

      <ConfirmDialog
        visible={confirmDelete}
        title={t('circles.deleteTitle').replace('{name}', group.name)}
        description={t('circles.deleteDesc')}
        confirmLabel={t('circles.deleteConfirm')}
        confirmIconStart={<TrashIcon color={WHITE} />}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </View>
  )
}

// ── Find or join ───────────────────────────────────────────────────────────
// The window opens on the catalogue rather than on a blank: an empty query is a
// legal search meaning "browse", ordered by how many of each group's members
// are candidates for ME (the server runs its own others() pool, so the order can
// never drift from the game's definition of a match). Rows arrive a page at a
// time and the list asks for the next one as its end comes into view.
//
// The page is the search field and its answers, nothing else: the field is the
// page HEADER (user directive 2026-07-28 — it took the title's place, since a
// title saying "Join a group" over a box saying "Search a group" said the same
// thing twice), and the rows sit in a contained box below it, exactly like the
// roster and the waiting queue. So the query is owned by the page (PageLayer)
// and handed in here.
//
// Typing does two things at once. The list re-filters what it ALREADY holds in
// the same frame the key goes down (fuzzyRank, the client twin of the server's
// matcher), and a debounced request goes out for the authoritative answer over
// the whole catalogue, which replaces it. So there is never a blank beat while
// a request is in flight, and the eventual list is not limited to what happened
// to be downloaded.
function FindView({ query: q, bottomInset, onDone }: { query: string; bottomInset: number; onDone: () => void }) {
  // The status chip says what I am to the group I am looking at, so it is my
  // own sex that inflects it.
  const isMale = useMyGender()
  // `rows` are the server's answer for `rowsQ` — while the two queries differ
  // the user has typed ahead of the request, and `shown` below stands in.
  const [rows, setRows] = useState<PublicGroup[] | null>(null)
  const [rowsQ, setRowsQ] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [paging, setPaging] = useState(false)
  const pagingRef = useRef(false)
  // Every group seen this session, in the order first seen (so the server's
  // ranking survives as the tiebreak). This is what the instant filter reads,
  // which keeps backspacing from narrowing the list: deleting a character
  // widens the pool again instead of filtering the previous, tighter answer.
  const pool = useRef<Map<string, PublicGroup>>(new Map())
  const [joined, setJoined] = useState<Record<string, boolean>>({})
  const [requested, setRequested] = useState<Record<string, boolean>>({})
  // Groups this account was already turned down by: the join control says so
  // rather than pretending the tap queued anything.
  const [declined, setDeclined] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<PublicGroup | null>(null)  // group-details popup
  const seq = useRef(0)
  // Answering the popup is the end of the search (user directive 2026-07-28 for
  // a request, 2026-08-01 for a join): the popup goes, and the page goes with
  // it. Set when the tap JOINED or queued a request — never when the popup was
  // simply put away, which leaves the search exactly where it was — and read
  // once the popup has actually unmounted: the page must not start sliding off
  // under a Modal that is still on screen, since a Modal is its own window and
  // would not ride down with it.
  const doneAfterPreview = useRef(false)
  const onPreviewClosed = useCallback(() => {
    if (!doneAfterPreview.current) return
    doneAfterPreview.current = false
    onDone()
  }, [onDone])

  const remember = useCallback((list: PublicGroup[]) => {
    for (const g of list) if (!pool.current.has(g.id)) pool.current.set(g.id, g)
  }, [])

  // First page for the active query. Browsing (empty field) fires at once —
  // there is no keystroke to wait out — while a typed query waits out the
  // debounce, which the instant filter below covers.
  useEffect(() => {
    const query = q.trim()
    const mine = ++seq.current
    const run = () => searchGroups(query)
      .then(r => {
        if (mine !== seq.current) return
        remember(r.results); setRows(r.results); setRowsQ(query); setHasMore(r.has_more)
      })
      .catch(() => {
        if (mine !== seq.current) return
        setRows([]); setRowsQ(query); setHasMore(false)
      })
    if (!query) { run(); return }
    const h = setTimeout(run, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [q, remember])

  // The next page of whatever `rows` currently holds. Keyed to `seq` so a page
  // that lands after the query moved on is dropped rather than appended to a
  // list it does not belong to.
  const loadMore = useCallback(() => {
    // The in-flight flag is a ref, not the state: the list keeps announcing the
    // end for as long as it is in view, and a state write would not be visible
    // to the next few of those calls.
    if (pagingRef.current || !hasMore || !rows) return
    pagingRef.current = true
    setPaging(true)
    const mine = seq.current
    searchGroups(rowsQ, rows.length)
      .then(r => {
        if (mine !== seq.current) return
        remember(r.results); setRows(cur => [...(cur ?? []), ...r.results]); setHasMore(r.has_more)
      })
      .catch(() => { if (mine === seq.current) setHasMore(false) })
      .finally(() => { pagingRef.current = false; setPaging(false) })
  }, [hasMore, rows, rowsQ, remember])

  // What the list paints. Once the server has answered for this exact query its
  // answer is authoritative and complete; until then, the pool filtered locally.
  const shown = useMemo(() => {
    const query = q.trim()
    if (query === rowsQ) return rows
    return fuzzyRank([...pool.current.values()], query, g => g.name)
  }, [q, rows, rowsQ])

  const joinPublic = (g: PublicGroup) => {
    tap()
    // Optimistically show the terminal state the server will land on: an
    // approval-gated group becomes a pending REQUEST, an open one joins.
    if (g.requires_approval) setRequested(m => ({ ...m, [g.id]: true }))
    else setJoined(m => ({ ...m, [g.id]: true }))
    // THE POPUP GOES ON THE TAP, WHICHEVER OF THE TWO IT WAS, AND THE PAGE GOES
    // WITH IT (user directive 2026-08-01, carrying the request's own rule of
    // 2026-07-28 over to the join, which used to leave both standing). A join
    // and a request are one act — I found a circle and I am in it, or waiting to
    // be — so they may not end differently; and a popup left open after a join
    // turns into its own opposite the moment it repaints, the surface that
    // offered to let me in now offering to share it and to LEAVE, which reads as
    // the app answering the tap with the way to undo it.
    // Leaving on the tap rather than on the answer is deliberate: where I now
    // stand is the HUB's to say, and it says it off the same summary refresh —
    // a member row, a pending one, or a declined one for the rare case the
    // server turns the request down (which is why the reconcile below no longer
    // having a row to repaint costs nothing, and does not have to).
    doneAfterPreview.current = true
    setPreview(null)
    // A public group is joinable by anyone who found it in search; joining
    // reuses the redeem path under the hood (no manual code needed).
    if (!g.invite_code) return
    redeemInvite(g.invite_code)
      .then(r => {
        // Reconcile with the authoritative outcome (e.g. approval was just
        // toggled between search and tap).
        if (r.join_status === 'pending') { setRequested(m => ({ ...m, [g.id]: true })); setJoined(m => ({ ...m, [g.id]: false })) }
        else if (r.join_status === 'joined' || r.join_status === 'already') { setJoined(m => ({ ...m, [g.id]: true })); setRequested(m => ({ ...m, [g.id]: false })) }
        // A manager already turned this person down: the tap did NOT queue them
        // again, so the row must say so instead of showing a wait that is not
        // happening.
        else if (r.join_status === 'declined') {
          setRequested(m => ({ ...m, [g.id]: false })); setJoined(m => ({ ...m, [g.id]: false }))
          setDeclined(m => ({ ...m, [g.id]: true }))
        }
      })
      .catch(() => { setJoined(m => ({ ...m, [g.id]: false })); setRequested(m => ({ ...m, [g.id]: false })) })
  }
  // How big it is and who runs it, and nothing else: a group's KIND is off the
  // strip (user directive 2026-07-28) — what a tap will do is said by the
  // popup's own button, which is where the decision is made. How many members
  // are candidates for me still ORDERS the list, but is not information a
  // searcher needs on the row, so it is never said out loud either.
  const groupMeta = (g: PublicGroup) => groupFacts(g.members, g.owner_name)

  // Where I stand with this group RIGHT NOW: the server's answer, overridden by
  // whatever this session has since done about it (the optimistic maps — an
  // explicit local `false` wins, so a cancelled request stops reading as a
  // wait). ONE definition, read by both things that say it: the chip on the
  // row and the popup, which is the same popup the hub opens and takes this
  // exact status as its state.
  const myStatus = (g: PublicGroup): GroupStatus =>
    (joined[g.id] ?? g.joined) ? 'joined'
    : (requested[g.id] ?? g.requested) ? 'pending'
    : declined[g.id] ? 'declined'
    : 'none'
  // The same fact as a chip. Short words: it sits in a corner, not on a line.
  const statusTag = (g: PublicGroup) => {
    const st = myStatus(g)
    return st === 'joined' ? genderize(t('circles.joined'), isMale)
      : st === 'pending' ? t('circles.pendingTag')
      : st === 'declined' ? t('circles.declinedTag')
      : undefined
  }

  return (
    // The box is fixed and only the rows in it scroll; the note keeps its line
    // under it and the whole thing ends `bottomInset` above the page's end, the
    // same air every other contained list leaves. The box's own inset is 0
    // because it is NOT the last thing here — the fill below it is what holds
    // the gap. The keyboard is a second floor under the same box: the field it
    // belongs to is up on the header, so nothing has to be scrolled clear of
    // it, the list simply stops above it.
    <View style={[s.findFill, { paddingBottom: bottomInset }]}>
      <ContainedRoster
        data={shown}
        bottomInset={0}
        keyOf={g => g.id}
        onEndReached={loadMore}
        empty={(
          <View style={[s.rosterRow, s.rosterRowFirst, s.rosterRowLast]}>
            {/* Two bars and NO avatar disc (user directive 2026-07-28): a search
                strip is all text now, so its placeholder stands for the name and
                the lines about it, starting where the words will. */}
            {shown == null
              ? <SkeletonRows rows={3} lines={2} avatar={false} />
              : <Empty text={t('circles.noResults')} />}
          </View>
        )}
        // The next page, arriving. Sits inside the card so the rows and the
        // placeholder are one continuous surface.
        footer={paging ? <View style={[s.rosterRow, s.rosterRowLast]}><SkeletonRows rows={1} lines={2} first={false} avatar={false} /></View> : null}
        row={(g, i, last) => (
          // The SAME strip the hub is made of (user directive 2026-07-28), with
          // the facts a searcher wants: the whole group name, then how big it is
          // and who manages it on ONE fact line under it, in `groupFacts`' one
          // order — the same line, the same separator, the same component and
          // the same order as the popup this row opens
          // (2026-07-29; they used to be two stacked lines here, which was the
          // one place a group's facts were punctuated differently). NO owner
          // photo — a face in the leading lane read as the group's own picture —
          // so the row is all text, and the chip on that line says where I stand
          // with this group (member / waiting / turned down), which is the one
          // thing the search list could not say before. Tapping opens the popup.
          <Strip
            first={i === 0}
            style={rosterRowStyle(i, last)}
            title={g.name}
            meta={groupMeta(g)}
            tag={statusTag(g)}
            onPress={() => setPreview(g)}
          />
        )}
      />

      {/* The app's ONE group popup (user directive 2026-07-28) — the same
          surface the hub and a match card's shared-groups list open, told where
          I stand with this result. So a group I am already IN offers to LEAVE
          here exactly as it does on the hub, instead of the dead "Member" chip
          that used to close this popup off, and one I am waiting on offers to
          take the request back. */}
      <GroupSheet
        group={preview ? groupBrief(preview) : null}
        status={preview ? myStatus(preview) : 'none'}
        onClose={() => setPreview(null)}
        onClosed={onPreviewClosed}
        onJoin={() => { if (preview) joinPublic(preview) }}
        // The popup left / cancelled / cleared: this page keeps its own copy of
        // where I stand (the row's chip reads it), so it has to be told.
        onDone={() => {
          const id = preview?.id
          if (!id) return
          setJoined(m => ({ ...m, [id]: false }))
          setRequested(m => ({ ...m, [id]: false }))
          setDeclined(m => ({ ...m, [id]: false }))
        }}
      />
    </View>
  )
}

// ── shared bits ────────────────────────────────────────────────────────────
// The sentence that stands in for a list, and — where the list is empty because
// the user has not JOINED anything yet — the reason to (user directive
// 2026-07-30, `why`): a page that only names what is missing tells the user
// what he lacks and never what he gains. It is a HINT under the sentence, at
// the rank the other notes on this page take (`note`), never a second body line
// competing with the sentence it explains. It stands inside a card, so it wears
// its own air (`emptyBlock`).
const Empty = ({ text, why }: { text: string, why?: string }) => (
  <View style={s.emptyBlock}>
    <Text style={s.empty}>{text}</Text>
    {why ? <Text style={s.note}>{why}</Text> : null}
  </View>
)

// THE COLUMN OF MARKS DOWN THE END OF A LIST STANDS IN THE CARD'S OWN GUTTER
// (user directive 2026-07-31). The tick on each waiting person and the double
// tick that answers all of them are one column, and the line they share is the
// one the list already states: the strip's gutter — the same MD the face at the
// other end of the row keeps off the card's edge, so the box holds its contents
// equally on both sides. Nothing states that line any more and nothing may: both
// marks ride a row's own `trailing` lane now (the queue's row and the rows in
// its drawer), so they land on it by construction. An inset here — the old
// LIST_MARK_INSET, and HEADING_GLYPH_INSET before it, which lined this mark up
// with the page HEADER's floating chrome instead and pulled the whole column out
// toward the card's end edge — is a second statement of a geometry the row
// already owns.

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE },
  scroll: { flex: 1 },
  content: { paddingHorizontal: MD, paddingTop: SM, gap: SM },
  // A group page fills the sheet: a fixed head plus the roster's scroll region,
  // MD apart, the same gap the page's blocks had while it all scrolled.
  ownedFill: { flex: 1, gap: MD },
  // ── The empty page (HubStart) ────────────────────────────────────────────
  // Centred in the page when there is room and scrolling when there is not, so
  // a small screen at a large font scale loses nothing off the bottom.
  // Each block states the gap ABOVE it, never below: only the thing that comes
  // next knows which gap it is.
  startBody: { flexGrow: 1, justifyContent: 'center' },
  // Everything the page SAYS, as one block: it takes whatever height the friends
  // row above it leaves and centres in that, so a page with the row and a page
  // without it are the same page with one row added at the top.
  startMain: { flexGrow: 1, justifyContent: 'center' },
  // The one gap on this page stated BELOW its block rather than above the next
  // one: what comes next is centred in what is left, so a gap declared there
  // would move the picture off centre on a page that has no row at all. Same MD
  // the card and the block under it always stood at here.
  startLead: { marginBottom: MD },
  startArt: { alignItems: 'center' },
  // A heading at heading SIZE and ordinary WEIGHT (user directive 2026-07-30):
  // the picture over it is already the page's emphasis, so the line under it
  // only has to be read, not shouted.
  startTitle: { marginTop: LG, fontSize: TEXT.lg, color: INK, textAlign: 'center' },
  // The title and the sentence explaining it are ONE block, hence the small gap.
  startDesc: { marginTop: SM, fontSize: TEXT.md, color: INK_SUBTLE, textAlign: 'center' },
  // The widest gap on the page, on purpose: above it is what this is, below it
  // is what you can do.
  startActions: { marginTop: XL, gap: MD },
  // The arrow's room IS the gap left over between the sentence and the invite
  // block at the foot of the page: it takes the whole of it and centres in it,
  // so the pointer sits midway on every screen instead of at a fixed distance
  // from either end. The reward and the arrow are ONE mark and centre together,
  // held at the app's smallest gap so the trail reads as leaving the gem.
  startPointer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SM },
  // The gem and its "+1" — see InviteRewardMark. XS: a number this close to the
  // mark it counts is part of it, the same gap the credits badge holds them at.
  reward: { flexDirection: 'row', alignItems: 'center', gap: XS },
  rewardCount: { fontSize: TEXT.lg, fontWeight: WEIGHT.medium, color: INK },
  // The roster is a FlatList, so `card` can't wrap it — the rows carry the card
  // themselves and only the ends are rounded. The list BOX carries the same
  // radius so a row clipped at the bottom edge is clipped round, not square.
  rosterBox: { flex: 1, borderRadius: RADIUS, overflow: 'hidden' },
  rosterList: { flex: 1 },
  // A person's page: the card takes the room the bar under it leaves (that bar
  // is ProfileActionBar, in MatchCard.tsx, and it owns every gap in itself).
  profileFill: { flex: 1 },
  profileBare: { flex: 1 },
  // A stacked page: opaque, so the page it covers never shows through. It is
  // the PAGE tint and so is the page UNDER it, which is why the seam needs
  // marking at all — RisingCard's own RISE_SHADOW is what marks it, so nothing
  // about the lift is stated here.
  layerCard: { flex: 1, backgroundColor: PAGE },
  rosterRow: { backgroundColor: SURFACE },
  rosterRowFirst: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  rosterRowLast: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  card: { backgroundColor: SURFACE, borderRadius: RADIUS, overflow: 'hidden' },
  // The waiting queue's drawer, opened in the middle of the white card: the
  // PAGE's own tint, so the people inside it read as a set held INSIDE the
  // roster rather than as more of it (user directive 2026-07-31). It clips,
  // which is what the fold IS — the rows keep their full height inside a box
  // whose height is animated (see QueueDrawer).
  // The clipping box IS the card's own white (user directive 2026-07-31): what
  // opens inside the roster is a page-tinted TILE with the card showing all the
  // way around it, so the set reads as something held inside the list rather
  // than as a band cut across it.
  queueDrawer: { backgroundColor: SURFACE, overflow: 'hidden' },
  // The rows, OUT of the box's flow so their height is their own and never the
  // animated one (see QueueDrawer). Both physical edges are pinned, so it is the
  // box's full width in either reading direction; `top` anchors it, so a folding
  // box crops the rows from the BOTTOM, which is what unfolding downward looks
  // like. The white frame is this box's PADDING, so the height being measured is
  // the tile plus its margin and the frame can never be clipped away. THE SIDES
  // TAKE THE PAGE'S OWN GUTTER (user directive 2026-07-31): the roster stands MD
  // inside the page, so the queue's tile stands MD inside the roster and the
  // nesting is stated by the one indent the surface already uses. The top and
  // bottom keep the small step — they are the seam between the tile and the rows
  // it opened between, not an indent.
  queueRows: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: MD, paddingVertical: SM },
  // The tile itself: the page's tint, and the card's own corner so it reads as a
  // surface inside a surface.
  queueInner: { backgroundColor: PAGE, borderRadius: RADIUS, overflow: 'hidden' },
  // THE strip's geometry lives with the strip (components/Strip.tsx) — this
  // surface owns no row style of its own.
  // A label naming the card under it, so it stands on the CARD's own edge — the
  // page gutter, which is also where the page's title stands on a form page. It
  // carried a marginStart of XS, a nudge that lined up with nothing and made a
  // third left edge on a page that should have one (2026-08-02).
  section: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: INK_MUTED, marginTop: MD },
  // The header's trailing controls, side by side on the bar's end corner.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SM },
  // `flexShrink` is what lets the popup obey the sheet's height cap: the body
  // gives, and inside it only the description's SheetScroll declares a shrink of
  // its own, so that is where the whole overflow lands.
  // No gutter of its own: that is the popup's, for every popup in the app
  // (BottomSheet.tsx). The blocks inside it are one piece of writing about the
  // group, so they stand at the popup's title-to-description gap.
  sheetWrap: { gap: SHEET_GAP.desc, flexShrink: 1 },
  // The introduction inside the SheetScroll: it keeps the same SM rhythm the
  // sheet body spaces its blocks by, so a head that scrolls looks exactly like
  // the head that does not (a short group's popup is unchanged).
  sheetHead: { gap: SHEET_GAP.desc },
  // (The face, the fact line and the name inside it are `GroupHead` in
  // CircleBits — the one block that says WHICH group this is, shared with a
  // person's page inside that group. Nothing about their look lives here any
  // more, including the avatar's own air.)
  //
  // What the group wrote about itself IS the popup's description (SHEET_DESC in
  // BottomSheet.tsx) — same size, same full-strength ink, same centring as the
  // sentence under any other popup's title. It used to run at a line height of
  // its own (1.5× against the app's 1.4×). The gap above it is the head's `gap`,
  // so it adds none: two would stack.
  sheetDesc: { ...SHEET_DESC, marginTop: 0 },
  // (The "more details" line is gone, 2026-08-02: it was an underlined line of
  // text at the popup's title size, standing alone between the note and the
  // actions. It is an option in the foot's strip now — see `details` in
  // GroupSheet — so the popup ends on one band of marks rather than on a line of
  // writing that was really a control.)
  // Group-description editor card (hosts the shared EditableText). The input is
  // a plain readable block; the footer mirrors the bio editor's hint+Update.
  descCard: { backgroundColor: SURFACE, borderRadius: RADIUS, padding: MD, gap: SM },
  // No line height of its own: the font's leading, like every other block of text
  // in the app. It used to run at 1.5x (a local `lhSm()` helper) to give the
  // editor a little more air than a paragraph, which a declared dp line box
  // cannot do safely — see FONT_LINE_RATIO in ../fonts.
  descEditorInput: { fontSize: TEXT.md, color: INK, padding: 0, minHeight: 54, includeFontPadding: false },
  nameInput: { fontSize: TEXT.md, color: INK, fontWeight: WEIGHT.medium, padding: 0, includeFontPadding: false },
  // The link field: one line, and start-aligned like every other field (the
  // base TextInput does that) — a latin URL still renders LTR inside it.
  linkInput: { fontSize: TEXT.md, color: INK, padding: 0, includeFontPadding: false },
  // The link field and the mark that opens it are one row: the field takes the
  // width and the glyph stands at its END, centred on the card's own height.
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: MD },
  linkCard: { flex: 1 },
  linkTest: { paddingVertical: SM },
  linkTestOff: { opacity: DISABLED_OPACITY },
  descFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: MD },
  descHint: { fontSize: TEXT.md, color: INK_MUTED },
  // Why a field was refused, under the field it belongs to. Full-strength ink
  // (NEGATIVE): it is the reason nothing was saved, not a hint.
  fieldError: { fontSize: TEXT.md, color: NEGATIVE },
  descInput: { minHeight: 54, paddingTop: 0 },
  pillBtn: { paddingHorizontal: MD, paddingVertical: SM, borderRadius: RADIUS },
  pillBtnInk: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: WHITE },
  // THE footnote of this page, wherever one stands: above a popup's button (what
  // this group is to me right now, what a friend is worth) and under an empty
  // list's sentence (what belonging is worth). It is a HINT, not a paragraph, so
  // it takes the rank below the body (`sm`, user directive 2026-07-29): at body
  // size it read as a second description competing with the one thing it is
  // explaining, and what follows it is what the eye should land on.
  note: { fontSize: TEXT.sm, color: INK_MUTED, textAlign: 'center', marginTop: XS },
  // The sentence that stands in for a list: it sits in the card the strips would
  // have filled, so its block takes the STRIP's gutter (`row`'s
  // paddingHorizontal) — without it a long line wraps flush to the card's edges
  // on a narrow screen or at a large font size. The air is the BLOCK's, so the
  // "why belong" note under the sentence sits inside it rather than under it.
  emptyBlock: { paddingVertical: LG, paddingHorizontal: MD },
  empty: { fontSize: TEXT.md, color: INK_MUTED, textAlign: 'center' },
  // The friends page's invite block: the reward line and the button it explains,
  // held together under the roster so the two never drift apart.
  friendsInvite: { gap: SM },
  // The same button, standing in the hub row's trailing lane: it hugs the line
  // it rides instead of stretching to the row's height (Button's own default),
  // and it gives before the name does if a large font scale runs the row out of
  // width — a name that wraps still reads, a label that has nowhere to go does
  // not (its own `adjustsFontSizeToFit` takes the last of it).
  friendsInviteBtn: { alignSelf: 'center', flexShrink: 1 },
  // The "hide me here" checkbox, in the settings card: one step taller than a
  // bare toggle row, because it carries the sentence that explains it.
  hiddenRow: { paddingVertical: MD },
  // The search page: the contained box takes the height, the note sits under it.
  findFill: { flex: 1, gap: SM },
  field: { ...FIELD_SKIN, flexDirection: 'row', alignItems: 'center', gap: SM, paddingHorizontal: MD, paddingVertical: MD },
  // The same field, on the header bar: padded to the height of the chrome circle
  // a header carries (the hub's find and create) instead of a form row's, so the
  // bar stays a bar.
  fieldSlim: { paddingVertical: SM },
  fieldInput: { flex: 1, fontSize: TEXT.md, color: INK, padding: 0 },
  codeInput: { textAlign: 'center', letterSpacing: LG, fontWeight: WEIGHT.medium },
  toggle: { flexDirection: 'row', backgroundColor: INK_WASH, borderRadius: RADIUS, padding: XS, gap: XS },
  // The kind chooser is the same fabric as `toggle`, stacked: three stops, each
  // with the sentence that explains it, so the list reads top to bottom.
  // No fill of its own (user directive 2026-07-29): the wash behind the three
  // stops read as a slab that took over the page. The chosen stop is a white
  // tile lifted off the page tint and the other two simply sit on it.
  kindList: { borderRadius: RADIUS, padding: XS, gap: XS },
  kindItem: { paddingVertical: SM, paddingHorizontal: SM, borderRadius: RADIUS, gap: XS },
  toggleItem: { flex: 1, alignItems: 'center', paddingVertical: SM, borderRadius: RADIUS, gap: XS },
  toggleOn: { backgroundColor: SURFACE },
  // Plain weight, both lines (user directive 2026-07-30): the three stops are a
  // list of options, not headings, and what tells the chosen one apart is its
  // white tile and its full-strength INK. SIZE and COLOR carry the hierarchy
  // here as everywhere else (see WEIGHT in tokens) — the medium face on all six
  // lines made the whole block read as emphasised against the labels above it.
  toggleTitle: { fontSize: TEXT.md, color: INK_MUTED },
  toggleSub: { fontSize: TEXT.sm, color: INK_MUTED },
})

// Body line-height for the muted note (kept a small helper so the ratio lives
// in one place rather than as an inline literal at the style site).
