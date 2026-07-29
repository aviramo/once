// ── CommunitiesPage ────────────────────────────────────────────────────────
//
// The body of the Communities OverlaySheet (opened from the menu's
// "Communities" row). It is ONE sheet with an internal view stack — a hub that
// drills into: my friends, link-a-friend, a group you manage, a group you're
// in, create, and find/join. Swiping the sheet down (PullPane) closes the
// whole surface; the header's start control is a close X on EVERY page, since
// every page leaves the same way, downward: at the hub it takes the sheet, and
// above it, it rides one page off the bottom and pops it.
//
// Server: everything speaks to the phase-1 endpoints via src/lib/communities.
// Communities reuse the existing groups machinery; "my friends" is the derived
// friend-links set. See CLAUDE.md + project memory.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Pressable, TouchableWithoutFeedback, Share, Keyboard, Linking, FlatList, TextInput as RNTextInput, type NativeSyntheticEvent, type NativeScrollEvent, type StyleProp, type TextStyle } from 'react-native'
import { Path, Circle, Line, Rect } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBottomInset } from '../hooks/useBottomInset'
import { Text, TextInput } from './AppText'
import { SheetHeader, type OverlaySheetBody } from './OverlaySheet'
import { PullContext, PullScrollView, PullPane, usePullBehavior, type PullCtx } from './PullPane'
import { useSharedValue, useAnimatedReaction, runOnJS, type SharedValue } from 'react-native-reanimated'
import type { GestureType } from 'react-native-gesture-handler'
import { RisingCard } from './RisingCard'
import { Button } from './Button'
import { RoundButton } from './RoundButton'
import { ConfirmDialog } from './ConfirmDialog'
import { BottomSheet, SheetScroll, SheetTitle } from './BottomSheet'
import { Glyph, GroupsIcon, TrashIcon, RankIcon, KeyIcon, UserMinusIcon, SignOutIcon, CheckIcon, DoubleCheckIcon, CloseIcon } from './icons'
import { ToggleRow } from './Switch'
import { tap, tapWarning } from '../lib/haptics'
import { t, genderize } from '../i18n'
import { useUserStore, type Profile } from '../stores/userStore'

type StoreProfile = ReturnType<typeof useUserStore.getState>['profile']
import { Avatar, SkeletonRows, SyncBar, AVATAR } from './CommunityBits'
import { Chip } from './Chip'
import { MetaLine } from './MetaLine'
import { Strip, STRIP_ROW } from './Strip'
import { MatchCard } from './MatchCard'
import type { MetaPart } from '../lib/meta'
import { rosters, joinRequests, friendsRoster, dropGroupCaches } from '../lib/rosterCache'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { shareFriendInvite } from '../lib/referral'
import { groupInviteUrl } from '../lib/links'
import { EditableText } from './EditableText'
import { GROUP_NAME_MAX, GROUP_DESCRIPTION_MAX, GROUP_LINK_MAX } from '../lib/groups'
import { serverErrorCode } from '../lib/api'
import {
  ownedGroups, myGroups, myFriends, groupMembers, removeMember, deleteGroup,
  updateGroup, createGroup, searchGroups, redeemInvite, leaveGroup, setManager, transferOwner,
  friendRespond, unfriend, communitiesSummary, cancelJoinRequest,
  groupRequests, respondJoin, approveAllJoins, setGroupHidden,
  groupKind, groupKindFlags, GROUP_KINDS, DEFAULT_GROUP_KIND, type GroupKind,
  groupFacts, friendLabel, requestLabel, groupBrief, type GroupBrief,
  type OwnedGroup, type GroupMember, type MyFriends, type PublicGroup, type MemberImage,
  type FriendItem, type CommunitiesSummary, type JoinedGroup, type PendingGroup,
  type JoinRequestItem, type CommunitiesTarget,
} from '../lib/communities'
import { XS, SM, MD, LG, XL, RADIUS, TEXT, WEIGHT, ICON, OVERLAY, ROUND_BUTTON_SIZE_SM, lh, bottomGap, LIST_PAGE_AHEAD_VIEWPORTS, SEARCH_DEBOUNCE_MS } from '../tokens'
import { PAGE, SURFACE, INK, INK_MUTED, INK_SUBTLE, INK_WASH, WHITE, INK_DIM, NEGATIVE } from '../colors'
import { FIELD_SKIN } from '../field'
import { fuzzyRank } from '../lib/fuzzy'

const SearchGlyph = ({ color = INK, size = ICON.md }: { color?: string; size?: number }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
    <Circle cx="11" cy="11" r="7" /><Line x1="16.5" y1="16.5" x2="21" y2="21" />
  </Glyph>
)
const PlusGlyph = ({ color = INK, size = ICON.md }: { color?: string; size?: number }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
    <Line x1="12" y1="5" x2="12" y2="19" /><Line x1="5" y1="12" x2="19" y2="12" />
  </Glyph>
)
// Dedicated "share" mark (tray + upward arrow) for the share-invite buttons.
const ShareGlyph = ({ color = WHITE }: { color?: string }) => (
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3v12" /><Path d="M8 7l4-4 4 4" /><Path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Glyph>
)
// Settings gear (rides the manage page's header, opposite the close X).
const GearGlyph = ({ color = INK, size = ICON.md }: { color?: string; size?: number }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="3.2" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Glyph>
)
// The group card, as a mark: the plaque the popup is, with the owner's face and
// the lines under it. Deliberately NOT an eye — the eye already says "am I
// playing in this group" one page back (OwnedGroupView), and one surface cannot
// spend the same glyph on two meanings.
const PreviewGlyph = ({ color = INK, size = ICON.md }: { color?: string; size?: number }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <Circle cx="12" cy="10" r="2.3" />
    <Line x1="8" y1="16" x2="16" y2="16" />
  </Glyph>
)

// A control on the title bar's trailing corner, opposite the close X. ONE
// definition for all three (the hub's find + create, the manage page's gear):
// backgroundless, sized to the same small chrome circle the X wears, so the
// corner reads as chrome beside the title rather than a strip of buttons.
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

/** How the host renders MY OWN profile inside the communities stack. The
 *  editable preview lives in the settings route, so it is handed in instead of
 *  a component importing a route module (home passes it; it already owns both).
 *  The shape is OverlaySheetBody's, so the preview wires up exactly as it does
 *  when the menu opens it. */
export type SelfProfileRenderer = (ctx: {
  onBack: () => void
  dismissGestureRef: React.MutableRefObject<GestureType | undefined>
  onScrollAtTop: (atTop: boolean) => void
  headerBottomShared: SharedValue<number>
  pullEngaged: SharedValue<boolean>
}) => React.ReactNode

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
  | { k: 'owned'; group: OwnedGroup }
  | { k: 'settings'; group: OwnedGroup }
  // The pending join requests are a queue, not page content: they get their own
  // sub-screen (user directive 2026-07-27) so the group page carries exactly ONE
  // long list. It reads the same joinRequests cache the group page filled for
  // its count, so it opens painted with no hand-off.
  | { k: 'requests'; group: OwnedGroup }
  // One requester's profile, opened from the queue. Approving is a decision
  // about a PERSON, so it is made on the same profile card the app shows for a
  // match, not from a row with two buttons on it (user directive 2026-07-27).
  | { k: 'request'; group: OwnedGroup; request: JoinRequestItem }
  // A person you are already connected to: a member of a group you manage, or
  // one of your friends. Same full profile card as a requester's, with the
  // actions that used to live in a popup moved onto it (user directive
  // 2026-07-27) — nothing about a person is decided from a row any more.
  | { k: 'person'; person: PersonTarget }
  // Yourself, found in a roster: your own profile page opens, not a member page
  // about you (user directive 2026-07-27). Same editable preview the menu
  // opens — there is only one "my profile" in the app.
  | { k: 'self' }

const titleFor = (v: CView): string => {
  switch (v.k) {
    case 'hub': return t('communities.title')
    case 'friends': return t('communities.myFriends')
    case 'find': return t('communities.findTitle')
    case 'create': return t('communities.newGroup')
    case 'owned': return v.group.name
    case 'settings': return t('communities.settings')
    case 'requests': return t('communities.requestsNav')
    case 'request': return v.request.name ?? t('communities.requestsNav')
    case 'person': return (v.person.kind === 'member' ? v.person.member.name : v.person.friend.name) ?? ''
    case 'self': return t('settings.profile')
  }
}

/** WHICH page this is — the kind plus whatever the kind is ABOUT. Two views
 *  with the same key are the same destination, however many times it was asked
 *  for. Used to make `push` idempotent (see there). */
const viewKey = (v: CView): string => {
  switch (v.k) {
    case 'owned': case 'settings': case 'requests': return `${v.k}:${v.group.id}`
    case 'request': return `request:${v.request.id}`
    case 'person': return `person:${v.person.kind === 'member' ? v.person.member.user_id : v.person.friend.user_id}`
    default: return v.k
  }
}

export function CommunitiesPage({
  onClose, onRegisterBack, target, onTargetConsumed, renderSelfProfile,
  dismissGestureRef, onScrollAtTop, headerBottomShared, pullEngaged,
}: OverlaySheetBody & {
  onClose: () => void
  onRegisterBack: (fn: () => boolean) => void
  /** Renders my own profile page when I tap myself in a roster. See the type. */
  renderSelfProfile?: SelfProfileRenderer
  /** Where a notification tap (or a redeemed invite link) wants to land. The
   *  whole page stack is seeded from it, so Back walks out through the pages
   *  that would have led there by hand. */
  target?: CommunitiesTarget | null
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
  // that person and there is nothing under it (see CommunitiesTarget).
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

  // A deep-linked group the caller is only a MEMBER of opens the hub's member
  // sheet rather than a stack view (that is the whole surface a member gets),
  // so the resolved group is handed down to the hub.
  const [joinedTarget, setJoinedTarget] = useState<JoinedGroup | null>(null)

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

        const owned = (await ownedGroups()).find(x => x.id === target.groupId)
        if (!owned) {
          // Not staff there: the member surface is the hub's sheet, which is all
          // a plain member gets. Prefer the denormalized summary (already on the
          // profile, no round trip); fall back to the endpoint on a miss, since
          // an approval push can land before the profile refresh does.
          const joined = communitiesSummary(useUserStore.getState().profile)?.joined.find(g => g.id === target.groupId)
            ?? (await myGroups()).find(g => g.id === target.groupId)
          if (joined && alive) setJoinedTarget(joined)
          return
        }
        if (target.kind === 'group') { set([{ k: 'hub' }, { k: 'owned', group: owned }]); return }
        if (target.kind === 'queue') { set([{ k: 'hub' }, { k: 'owned', group: owned }, { k: 'requests', group: owned }]); return }
        // A join request: straight onto that person's card, where the two
        // answers are (user directive 2026-07-27 — the iron rule).
        const req = (await groupRequests(owned.id)).find(r => r.user_id === target.userId)
        set(req
          ? [{ k: 'hub' }, { k: 'owned', group: owned }, { k: 'requests', group: owned }, { k: 'request', group: owned, request: req }]
          : [{ k: 'hub' }, { k: 'owned', group: owned }, { k: 'requests', group: owned }])
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
  // After deleting a group, drop its owned + settings views (back to the hub).
  const removeGroupViews = useCallback((id: string) => {
    setStack(sk => {
      const kept = sk.filter(x => !((x.k === 'owned' || x.k === 'settings') && x.group.id === id))
      return kept.length ? kept : [{ k: 'hub' }]
    })
  }, [])

  // Every page is its OWN surface, stacked (user directive 2026-07-27): a page
  // opened from a page LAYERS over it instead of replacing it, so swiping down
  // takes exactly one page off — the same thing Back does — instead of tearing
  // the whole Communities sheet away. Only the hub, the bottom layer, closes the
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
          // The hub rides the SHEET's pull (its swipe closes Communities); every
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
          joinedTarget={i === 0 ? joinedTarget : null}
          onInitialJoinedConsumed={() => setJoinedTarget(null)}
          renderSelfProfile={renderSelfProfile}
        />
      ))}
    </View>
  )
}

// ── One page in the stack ──────────────────────────────────────────────────
// A full-screen surface with its own header and its own swipe-down. The bottom
// layer (the hub) is handed the SHEET's pull, so swiping it closes Communities;
// every layer above owns a pull whose commit POPS one page, which is what makes
// a swipe do exactly what Back does (user directive 2026-07-27).
function PageLayer({
  view, isTop, sheetPanRef, sheetPullEngaged, onSheetScrollAtTop, onHeaderMeasured, onBack, registerClose,
  insets, rosterGap, profile, push, setStack, applyGroup, removeGroupViews,
  joinedTarget, onInitialJoinedConsumed, renderSelfProfile,
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
  joinedTarget?: JoinedGroup | null
  onInitialJoinedConsumed: () => void
  renderSelfProfile?: SelfProfileRenderer
}) {
  const isSheetLayer = !!sheetPanRef
  // A profile page is a full-bleed card: no title bar over it, just the close
  // X floating on the photo (user directive 2026-07-27). Declared up here
  // because it also decides which pull ARBITRATION the page gets — see below.
  const floatingChrome = view.k === 'request' || view.k === 'person' || view.k === 'self'
  // The band a drag can start in and still take the page, whatever the inner
  // scroll is doing. It may only ever cover chrome that DOES NOT SCROLL: the
  // inner scroll always outranks the page pull (the iron rule), so the band is
  // never allowed to sit over content a finger could have scrolled instead.
  // It is the solid title bar — plus, on the roster pages, the whole FIXED head
  // above the list, since none of it scrolls and the list itself eats nearly the
  // entire page once it is scrolled. A FLOATING header contributes NOTHING: it
  // hovers over the profile card's own scroll, so that strip belongs to the
  // card, which reports at-top and hands the pull over by itself. Two sources,
  // one value: whichever reaches lower wins, so neither can clobber the other.
  const headerBottom = useSharedValue(0)
  const barBottom = useRef(0)
  const rosterTop = useRef(0)
  const syncDragBand = useCallback(() => {
    headerBottom.value = Math.max(barBottom.current, rosterTop.current)
  }, [headerBottom])
  // A page LEAVES by sliding off the bottom, and only then stops existing. The
  // commit does not pop: it flags `closing`, and the reaction below pops when
  // the surface has actually reached the bottom edge. That is what makes the
  // close X feel like the manual pull carried on (user directive
  // 2026-07-27) and what keeps a swipe from tearing the page out from under the
  // finger halfway down.
  const closing = useSharedValue(false)
  // Called unconditionally (rules of hooks); the bottom layer leaves it disabled
  // and uses the sheet's pull instead.
  //
  // A LIST page takes the 'sheet' arbitration: a manualActivation pan that
  // hands the drag to the inner scroll first and picks it up mid-gesture where
  // the list runs out. A PROFILE page must NOT — its body is a full-bleed
  // MatchCard that owns its own PullContext, and over that card the sheet pan
  // consumes the raw touch stream and swallows taps on the floating close X.
  // That is exactly the bug the menu's own profile sheet was fixed for
  // (home.tsx: activation="scrollPan"), and these pages are the same surface,
  // so they get the same answer: 'scrollPan', whose gesture declares its
  // interest up front (activeOffsetY / failOffsetX) and leaves every tap alone.
  // It ignores `headerBottom`, which is right: a floating header is not a drag
  // band (see above), so the value stays 0 on these pages either way.
  const pull = usePullBehavior({
    activation: floatingChrome ? 'scrollPan' : 'sheet',
    enabled: isTop && !isSheetLayer,
    onCommit: useCallback(() => { closing.value = true }, [closing]),
    headerBottom,
  })
  const pullY = pull.pullY
  const screenSpan = pull.screenSpan
  useAnimatedReaction(
    () => pullY.value,
    y => {
      if (closing.value && y >= screenSpan) { closing.value = false; runOnJS(onBack)() }
    },
    [screenSpan, onBack],
  )
  // The close X rides the page off exactly as a finger would; the bottom
  // layer has no page under it, so its control closes the sheet outright.
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

  // Keyboard auto-scroll: when the keyboard opens, scroll the focused input up
  // so it clears the keyboard. Compares the keyboard's real top edge
  // (endCoordinates.screenY) with the input's measured window position, so it
  // works whether or not the overlay itself resizes under the keyboard.
  const scrollRef = useRef<any>(null)
  const scrollY = useRef(0)
  useEffect(() => {
    if (!isTop) return
    type FocusedNode = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null
    const State = (RNTextInput as unknown as { State?: { currentlyFocusedInput?: () => FocusedNode } }).State
    const sub = Keyboard.addListener('keyboardDidShow', e => {
      const kbTop = e.endCoordinates.screenY
      const node = State?.currentlyFocusedInput?.()
      if (!node || !scrollRef.current) return
      node.measureInWindow?.((_x, y, _w, h) => {
        const overlap = (y + h + LG) - kbTop
        if (overlap > 0) scrollRef.current?.scrollTo?.({ y: scrollY.current + overlap, animated: true })
      })
    })
    return () => sub.remove()
  }, [isTop])

  // The find page's query lives HERE, because its field lives in the header
  // (user directive 2026-07-28): the search box IS that page's heading, so it
  // takes the title's place on the bar and the body under it is nothing but the
  // list of answers. Held on the page rather than in the body so the two cannot
  // disagree about what is being searched for.
  const [findQuery, setFindQuery] = useState('')
  const searchField = view.k === 'find' ? (
    <View style={[s.field, s.fieldSlim]}>
      <SearchGlyph color={INK_MUTED} />
      <TextInput
        style={s.fieldInput}
        value={findQuery}
        onChangeText={setFindQuery}
        placeholder={t('communities.findSearch')}
        placeholderTextColor={INK_DIM}
        // The page's name, for a screen reader: the bar has no title to read out
        // because this field is standing in its place.
        accessibilityLabel={t('communities.findTitle')}
        // The third way out, and the only one that is a labelled control: the
        // IME's action key says SEARCH instead of a bare tick, and a single-line
        // field blurs on submit, so pressing it drops the keyboard onto the
        // results. Nothing is submitted — the list is already live per keystroke.
        returnKeyType="search"
        autoFocus
      />
    </View>
  ) : undefined

  const header = (
    <SheetHeader
      title={floatingChrome || searchField ? undefined : titleFor(view)}
      center={searchField}
      // A group's name is shown WHOLE (user directive 2026-07-27): as many
      // lines as its 60 characters need, never an ellipsis. The header grows
      // downward and its first line stays put, so a long name costs nothing but
      // the room it takes. The fixed labels are short and stay on one line, so
      // a two-word one never splits across two.
      titleLines={view.k === 'owned' ? 0 : 1}
      topInset={insets.top}
      floating={floatingChrome}
      // Match the page background (PAGE), not the default white SURFACE,
      // so the header blends into the Communities page instead of sitting on
      // a lighter band.
      barBg={PAGE}
      // The trailing corner carries what the page can DO, opposite the X.
      // The hub: find a group and create one (user directive 2026-07-28) — the
      // two buttons that used to sit under its list, now that the list is one
      // uninterrupted run of rows with nothing between them. The manage page:
      // that group's gear, beside its own name, since the settings of THIS
      // group belong with its title. All backgroundless, so the corner reads as
      // chrome next to the title rather than a strip of buttons.
      trailing={view.k === 'hub' ? (
        <View style={s.headerActions}>
          <HeaderButton label={t('communities.find')} onPress={() => push({ k: 'find' })}>
            <SearchGlyph size={ICON.round} />
          </HeaderButton>
          <HeaderButton label={t('communities.create')} onPress={() => push({ k: 'create' })}>
            <PlusGlyph size={ICON.round} />
          </HeaderButton>
        </View>
      ) : view.k === 'owned' ? (
        <HeaderButton label={t('communities.settings')} onPress={() => push({ k: 'settings', group: view.group })}>
          <GearGlyph size={ICON.round} />
        </HeaderButton>
      ) : view.k === 'settings' ? (
        // The settings page's one non-editing control: read the group back as
        // everyone else meets it. See GroupPreviewControl.
        <GroupPreviewControl group={view.group} />
      ) : undefined}
      // The queue page deliberately carries NOTHING here (user directive
      // 2026-07-28): its bulk answer moved down onto the group-name heading,
      // beside the list it empties, so this bar holds only the page's title on
      // the row's true centre. See JoinRequestsView.
      // Every Communities page leaves by sliding DOWN, the hub included, so
      // every page wears the X (user directive 2026-07-27). The arrow belongs
      // to a surface that leaves sideways, i.e. only the menu drawer.
      closeIcon="close"
      onClose={() => { tap(); closePage() }}
      // A floating header claims no drag band — see the note on `headerBottom`.
      onMeasured={h => { barBottom.current = floatingChrome ? 0 : h; syncDragBand(); onHeaderMeasured?.(h) }}
    />
  )

  // Everything that ends a page — the close X, the hardware back, an
  // action that finishes with it — leaves through the same slide.
  useEffect(() => { if (isTop) registerClose?.(closePage) }, [isTop, registerClose, closePage])

  const body = view.k === 'request' ? (
    <JoinRequestProfileView
      group={view.group}
      request={view.request}
      onDone={closePage}
      insets={insets}
    />
  ) : view.k === 'person' ? (
    <PersonProfileView person={view.person} onDone={closePage} onGroupChanged={applyGroup} insets={insets} />
  ) : view.k === 'self' ? (
    // My own profile, opened from a roster row that is me: the very same
    // editable preview the menu opens, not a member page about myself. The
    // preview lives in the settings route, so the host hands it in rather than
    // a component reaching up into a route module.
    renderSelfProfile?.({
      onBack: closePage,
      dismissGestureRef: pull.panRef,
      onScrollAtTop: pull.setScrollAtTop,
      headerBottomShared: headerBottom,
      pullEngaged: pull.pullEngaged,
    }) ?? null
  ) : view.k === 'hub' || view.k === 'owned' || view.k === 'requests' || view.k === 'find' || view.k === 'friends' ? (
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
          onOpenFriend={f => push({ k: 'person', person: { kind: 'friend', friend: f } })}
          bottomInset={rosterGap}
          onRosterTop={y => { rosterTop.current = y; syncDragBand() }}
        />
      ) : view.k === 'hub' ? (
        <HubView
          push={push}
          bottomInset={rosterGap}
          initialJoined={joinedTarget}
          onInitialJoinedConsumed={onInitialJoinedConsumed}
        />
      ) : view.k === 'owned' ? (
        <OwnedGroupView
          group={view.group}
          onChanged={applyGroup}
          onOpenRequests={() => push({ k: 'requests', group: view.group })}
          // Myself in the roster opens MY profile, never a member page about me.
          onOpenMember={m => push(m.user_id === profile?.user_id
            ? { k: 'self' }
            : { k: 'person', person: { kind: 'member', group: view.group, member: m } })}
          bottomInset={rosterGap}
          onRosterTop={y => { rosterTop.current = y; syncDragBand() }}
        />
      ) : (
        <JoinRequestsView
          group={view.group}
          onOpen={r => push({ k: 'request', group: view.group, request: r })}
          bottomInset={rosterGap}
          onRosterTop={y => { rosterTop.current = y; syncDragBand() }}
          isTop={isTop}
          // Same ride-off the close X uses, so the emptied queue leaves exactly
          // as the profile above it just did.
          onEmptied={closePage}
        />
      )}
    </View>
  ) : (
    <PullScrollView
      ref={scrollRef}
      style={s.scroll}
      contentContainerStyle={[s.content, { paddingBottom: bottomGap(insets.bottom, XL) }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
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
        <View style={s.root}>
          {floatingChrome ? <>{body}{header}</> : <>{header}{body}</>}
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

function HubView({ push, bottomInset, initialJoined, onInitialJoinedConsumed }: {
  push: (v: CView) => void
  /** Air under the contained list — see ContainedRoster / PageLayer. */
  bottomInset: number
  /** A deep-linked group the caller is a member of — its member sheet opens as
   *  soon as the hub is on screen (a group_approved push). */
  initialJoined?: JoinedGroup | null
  onInitialJoinedConsumed?: () => void
}) {
  // Instant: the summary rides in the user payload (relations.communities),
  // updated live over Realtime. Only when the server hasn't populated it yet
  // (old payload) do we fall back to the three endpoints.
  const profile = useUserStore(st => st.profile)
  const summary = communitiesSummary(profile)
  const [fallback, setFallback] = useState<CommunitiesSummary | null>(null)
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
  const [sheet, setSheet] = useState<{ group: JoinedGroup; status: GroupStatus } | null>(
    initialJoined ? { group: initialJoined, status: 'joined' } : null,
  )
  // Open the deep-linked member group's sheet, and let the page forget the
  // target straight away so popping back to the hub later doesn't reopen it.
  useEffect(() => {
    if (!initialJoined) return
    setSheet({ group: initialJoined, status: 'joined' })
    onInitialJoinedConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoined])
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
  const friendsMeta = data ? [friendLabel(data.friends)] : t('communities.myFriendsSub')
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
        const meta = groupFacts(g.members, null, g.hidden && t('communities.hiddenShort'))
        return (
          <Strip
            title={g.name}
            meta={meta}
            // Normally the one thing that separates these rows from the ones
            // under them, now that no heading does: the role you hold there. A
            // waiting queue OUTRANKS it (user directive 2026-07-28) — the chip
            // says how many are waiting, in full-strength purple, because the
            // row is a job to do and the role is only a standing fact.
            tag={waiting ? requestLabel(g.pending!) : (g.is_owner ? t('communities.owner') : t('communities.manager'))}
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
        return <Strip title={it.group.name} meta={joinedMeta(it.group) ?? t('communities.pending')} tag={t('communities.pendingTag')} style={style} onPress={() => setSheet({ group: it.group, status: 'pending' })} />
      case 'declined':
        // Same shape as the pending row above it: the group's own facts on the
        // meta line, the answer it got in the chip.
        return <Strip title={it.group.name} meta={joinedMeta(it.group) ?? t('communities.declined')} tag={t('communities.declinedTag')} style={style} onPress={() => setSheet({ group: it.group, status: 'declined' })} />
      case 'joined':
        return <Strip title={it.group.name} meta={joinedMeta(it.group)} style={style} onPress={() => setSheet({ group: it.group, status: 'joined' })} />
    }
  }

  return (
    <>
      <ContainedRoster
        data={items}
        bottomInset={bottomInset}
        keyOf={it => `${it.k}:${it.group.id}`}
        header={(
          <Strip
            title={t('communities.myFriends')}
            meta={friendsMeta}
            tag={friendsWaiting ? requestLabel(data!.requests) : null}
            tagStrong
            first
            // Never the last row of the card: an empty hub still puts the
            // "no groups yet" sentence under it, inside the card, as a row.
            style={rosterRowStyle(0, false)}
            onPress={() => push({ k: 'friends' })}
          />
        )}
        // Both the skeleton and the EMPTY sentence follow the friends row INSIDE
        // the card and close it off: the sentence is the list's own row (user
        // directive 2026-07-28), so it wears a strip's padding and centres in it.
        empty={(
          <>
            {items == null ? (
              <View style={[s.rosterRow, s.rosterRowLast]}>
                <SkeletonRows rows={3} lines={2} first={false} />
              </View>
            ) : null}
            {/* ONLY while there is nothing to list (user directive 2026-07-28):
                the two header controls, spelled out as buttons under the
                sentence that says the page is empty. A page with rows on it
                keeps them as chrome in the corner — a full list must not carry
                a block of CTAs under it. Same two destinations, so a tap here
                and a tap up there land on the same page. */}
            {items != null ? (
              <>
                <View style={[STRIP_ROW, s.rosterRow, s.rosterRowLast, s.emptyRow]}>
                  <Empty text={t('communities.emptyGroups')} style={s.emptyRowText} />
                </View>
                <View style={s.emptyActions}>
                  <Button
                    label={t('communities.findTitle')}
                    variant="primary"
                    size="lg"
                    iconStart={<SearchGlyph color={WHITE} />}
                    onPress={() => push({ k: 'find' })}
                  />
                  <Button
                    label={t('communities.create')}
                    variant="secondary"
                    size="lg"
                    iconStart={<PlusGlyph color={INK_SUBTLE} />}
                    onPress={() => push({ k: 'create' })}
                  />
                </View>
              </>
            ) : null}
          </>
        )}
        row={hubRow}
      />

      {/* One popup for all three kinds of row: it is told which the group is and
          offers leave / cancel the request / clear the notice accordingly. */}
      <GroupSheet group={sheet?.group ?? null} status={sheet?.status} onClose={() => setSheet(null)} />
    </>
  )
}

// ONE way out to a group's own page, from either place in the popup that offers
// it (user directive 2026-07-29): the "more details" line and the group's HEAD
// above the description are the same tap. The server is what guarantees the
// value is an http(s) URL, so opening it here needs no parsing of its own; a
// group with no link has no tap anywhere.
const openGroupLink = (url?: string | null) => {
  if (!url) return
  tap()
  Linking.openURL(url).catch(() => {})
}

// A group's optional "more details" link, as one tappable line under whatever
// the group says about itself. It shows the words, never the raw URL, and
// renders nothing for a group with no link.
const GroupLink = ({ url }: { url?: string | null }) =>
  url ? (
    <Text style={s.sheetLink} accessibilityRole="link" onPress={() => openGroupLink(url)}>
      {t('communities.moreDetails')}
    </Text>
  ) : null

// ── The group popup ────────────────────────────────────────────────────────
// THE popup a group opens into, from EVERY surface that lists one (user
// directive 2026-07-28): the hub's rows, a search result, and a match card's
// shared-groups list all open THIS. A group therefore reads identically
// wherever it was tapped — the owner's photo, the name, how big it is and
// "managed by <them>" under it, what it says about itself, its link — and the only thing
// that changes with where I stand is the ACTION at the bottom, which is always
// the one thing that standing lets me do:
//   joined    → share the invite link (public groups only, whose code is not a
//               secret) + LEAVE the group
//   pending   → take the join request back
//   declined  → clear the notice (the answer itself stands; the endpoint only
//               marks it seen, so this is not a way around the wait)
//   none      → join, or ask to be let in
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

  // The head's facts: how big the group is, then who runs it. An admin-owned
  // group has no owner and an old summary payload carries no count — the line
  // is simply whichever of them exist, and none at all renders nothing.
  const headFacts: MetaPart[] = groupFacts(group?.members, group?.owner?.name)

  const share = () => {
    if (!group?.invite_code) return
    tap()
    Share.share({ message: t('communities.shareMessage').replace('{name}', group.name).replace('{link}', groupInviteUrl(group.invite_code)) })
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

  return (
    <>
      <BottomSheet visible={!!group && !confirm} onDismiss={onClose} onClosed={onClosed}>
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
            {/* The HEAD is also the tap to the group's own page (user directive
                2026-07-29): the face, the fact line and the name are one
                object, so pressing any of them does what the "more details"
                line under the block does. THE DESCRIPTION IS NOT PART OF THAT
                TAP (user directive 2026-07-29) — it is a paragraph the reader
                scrolls and re-reads, and a tap that lands in it must not throw
                the app out to a browser. It therefore sits OUTSIDE the
                Pressable, as the block's second child, with the head's own SM
                rhythm between them. A group with no link keeps a plain, dead
                head. */}
            <View style={s.sheetHead}>
              <Pressable
                style={s.sheetHead}
                disabled={!group?.link}
                accessibilityRole={group?.link ? 'link' : undefined}
                onPress={() => openGroupLink(group?.link)}
              >
                {/* Who runs the group leads it: their photo, with "managed by
                    <them>" directly UNDER that photo (user directive 2026-07-28
                    — the line belongs to the face above it, not stranded under
                    the group's name). An admin-owned group has no owner and
                    simply shows neither. */}
                {group?.owner ? (
                  <View style={s.sheetAvatar}><Avatar userId={group.owner.user_id} name={group.owner.name} image={group.owner.image} /></View>
                ) : null}
                {/* Who runs it and how big it is state themselves on ONE line
                    under the face (user directive 2026-07-29): the app's one
                    fact line, exactly as the shared-groups popup, the hub strips
                    and the menu row state theirs, so a group's facts are
                    punctuated identically wherever they are listed. The count
                    used to sit alone under the NAME, which split two facts about
                    the same group across the title standing between them. One
                    rank under the description below it, because this is the
                    group's meta and the description is its own words. */}
                <MetaLine parts={headFacts} color={INK} align="center" />
                {/* Whole name, wrapping as far as it needs (user directive
                    2026-07-27) — a popup about one group never abbreviates which. */}
                <SheetTitle style={s.sheetTitle}>{group?.name}</SheetTitle>
              </Pressable>
              {group?.description ? <Text style={s.sheetDesc}>{group.description}</Text> : null}
            </View>
          </SheetScroll>
          <GroupLink url={group?.link} />
          {/* What this group is to me right now, in a sentence. A group I have
              not asked to join yet says nothing: the button below says it. */}
          {status !== 'none' ? (
            <Text style={s.sheetNote}>
              {t(status === 'joined' ? 'communities.memberNote'
                : pending ? 'communities.pendingNote'
                : 'communities.declinedDesc')}
            </Text>
          ) : null}
          {status === 'joined' ? (
            <>
              {/* Only a MEMBER hands the group's link on: an invite from someone
                  who has not been let in yet is not theirs to give. */}
              {group?.is_public && group?.invite_code ? (
                <Button label={t('communities.shareInvite')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={share} />
              ) : null}
              <Button
                label={t('communities.leave')}
                variant="secondary"
                size="lg"
                iconStart={<SignOutIcon color={INK} />}
                onPress={() => setConfirm(true)}
              />
            </>
          ) : pending ? (
            // No confirm on this one either (user directive 2026-07-29): taking
            // back a request that has not been answered yet destroys nothing,
            // and the request can be sent again at any time.
            // Full purple (user directive 2026-07-29): in this state it is the
            // popup's ONLY action, so it wears the ordinary purple fill every
            // lone CTA wears rather than the recessive tint.
            <Button
              label={t('communities.cancelJoin')}
              variant="primary"
              size="lg"
              loading={busy}
              // Cancelling a request is an X, plainly (user directive
              // 2026-07-28), at the size every other button glyph wears.
              iconStart={<CloseIcon color={WHITE} />}
              onPress={quit}
            />
          ) : status === 'declined' ? (
            // No confirm on this one: it dismisses a notice, it does not undo
            // anything, and the sentence above it has just said so.
            <Button
              label={t('communities.declinedConfirm')}
              variant="secondary"
              size="lg"
              loading={busy}
              iconStart={<CloseIcon color={INK} />}
              onPress={quit}
            />
          ) : onJoin ? (
            <Button
              label={t(group?.requires_approval ? 'communities.requestJoin' : 'communities.join')}
              variant="primary"
              size="lg"
              onPress={onJoin}
            />
          ) : null}
        </View>
      </BottomSheet>
      {/* Leaving is the only action here that asks twice: it drops a membership
          that getting back may not be mine to decide. */}
      <ConfirmDialog
        visible={confirm}
        title={group ? t('settings.groupsLeaveTitle').replace('{name}', group.name) : ''}
        description={t('settings.groupsLeaveDesc')}
        confirmLabel={t('settings.groupsLeaveConfirm')}
        confirmIconStart={<SignOutIcon color={WHITE} />}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={quit}
        draggable
      />
    </>
  )
}

// ── The strip ──────────────────────────────────────────────────────────────
// Every list on this surface — the hub's groups, a search result, a group's
// members, the waiting queue, my friends — is built from the app's ONE row,
// components/Strip.tsx, which the menu rows and the shared-groups popup are
// built from too. It moved out of this file on 2026-07-29 (user directive: one
// strip, used everywhere it repeats); its rules live with it.

// The link field's placeholder tells the READER to paste, so its verb is the
// user's own gender — one form resolved by genderize, not the "הדבק או הדביקי"
// double form. Lives here once because both the create form and the settings
// editor render the same field. English has a single form and passes through.
function useLinkPlaceholder() {
  const isMale = useUserStore(st => st.profile?.is_male)
  return genderize(t('communities.linkPlaceholder'), isMale)
}

// ── Group kind ─────────────────────────────────────────────────────────────
// The three names live here once, so a kind reads identically everywhere it is
// asked about. It is asked about in ONE place now — the chooser, where the
// group is being set up: a kind is a rule about getting IN, so it is off the
// strips entirely (user directive 2026-07-28), and what a tap will do is said
// by the join popup's own button. See groupKind() in lib/communities.
const kindTitle = (k: GroupKind) =>
  k === 'open' ? t('communities.kindOpen')
  : k === 'approved' ? t('communities.kindApproved')
  : t('communities.kindPrivate')
const kindSub = (k: GroupKind) =>
  k === 'open' ? t('communities.kindOpenSub')
  : k === 'approved' ? t('communities.kindApprovedSub')
  : t('communities.kindPrivateSub')
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
function FriendsView({ profile, onOpenFriend, bottomInset, onRosterTop }: {
  profile: StoreProfile
  onOpenFriend: (f: FriendItem) => void
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
  const friendCount = friends?.length ?? communitiesSummary(profile)?.friends ?? null

  const respond = async (id: string, accept: boolean) => {
    if (busy) return
    setBusy(id); tap()
    try { await friendRespond(id, accept) } finally { setBusy(null); load() }
  }

  const requests = data?.requests ?? []

  return (
    <View style={s.ownedFill}>
      <ContainedRoster
        data={friends}
        bottomInset={0}
        onTopMeasured={onRosterTop}
        syncing={syncing}
        keyOf={f => f.user_id}
        // Knowing the count up front means a friendless account skips the
        // placeholder entirely and goes straight to the empty line.
        empty={(
          <View style={[s.rosterRow, requests.length === 0 && s.rosterRowFirst, s.rosterRowLast]}>
            {friends == null && friendCount !== 0
              ? <SkeletonRows rows={friendCount ?? undefined} first={requests.length === 0} />
              : <Empty text={t('communities.noFriends')} />}
          </View>
        )}
        // Incoming friend requests, at the top of the same card the friends are
        // in — the group page's waiting queue in its friends form. These are the
        // one strips that answer IN PLACE instead of opening something: their
        // two pills ride the trailing lane.
        header={requests.length ? (
          <>
            {requests.map((r, i) => (
              <Strip
                key={r.id}
                first={i === 0}
                style={rosterRowStyle(i, false)}
                icon={<Avatar userId={r.user_id} name={r.name} image={r.image} />}
                title={r.name ?? ''}
                trailing={(
                  <>
                    <Pressable style={[s.pillBtn, { backgroundColor: INK }]} onPress={() => respond(r.id, true)} disabled={!!busy}>
                      <Text style={s.pillBtnInk}>{t('communities.accept')}</Text>
                    </Pressable>
                    <Pressable style={[s.pillBtn, { backgroundColor: INK_WASH }]} onPress={() => respond(r.id, false)} disabled={!!busy}>
                      <Text style={[s.pillBtnInk, { color: INK }]}>{t('communities.decline')}</Text>
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
          const first = index === 0 && requests.length === 0
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

      {/* The one way in, UNDER the list (user directive 2026-07-28), fixed: the
          page is who you already have, and inviting is what you do after reading
          it, the same order the group page puts its share link in. A roster of
          any length scrolls inside the box above and can never push this off the
          screen. What each friend is worth sits directly ABOVE the button, as
          the reason to press it. Opening the link with the app installed
          auto-links the pair as mutual friends (no request, no approval).
          People-search + friend requests were removed 2026-07-26. */}
      <View style={[s.friendsInvite, { marginBottom: bottomInset }]}>
        <Text style={s.sheetNote}>{t('communities.inviteReward')}</Text>
        <Button label={t('communities.inviteFriend')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={() => { tap(); if (profile) shareFriendInvite(profile) }} />
      </View>
    </View>
  )
}

// ── Create a group ─────────────────────────────────────────────────────────
function CreateView({ onCreated }: { onCreated: (g: OwnedGroup) => void }) {
  const kb = useKeyboardHeight()
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
    <View style={{ gap: MD, marginBottom: kb }}>
      <Text style={s.section}>{t('communities.name')}</Text>
      <View style={s.field}>
        <TextInput style={s.fieldInput} value={name} onChangeText={setName} placeholder={t('communities.namePlaceholder')} placeholderTextColor={INK_DIM} autoFocus maxLength={GROUP_NAME_MAX} />
      </View>
      <Text style={s.section}>{t('communities.description')}</Text>
      <View style={s.field}>
        <TextInput style={[s.fieldInput, s.descInput]} value={description} onChangeText={setDescription} placeholder={t('communities.descriptionPlaceholder')} placeholderTextColor={INK_DIM} multiline maxLength={GROUP_DESCRIPTION_MAX} textAlignVertical="top" />
      </View>
      {/* Optional, like the description: the name is the only thing creation
          insists on. Empty simply means a group with no link. */}
      <Text style={s.section}>{t('communities.link')}</Text>
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
      {linkError ? <Text style={s.fieldError}>{t('communities.linkInvalid')}</Text> : null}
      <Text style={s.section}>{t('communities.kindLabel')}</Text>
      <KindChooser value={kind} onChange={setKind} />
      <Button label={t('communities.createAction')} variant="primary" size="lg" iconStart={<GroupsIcon color={WHITE} />} loading={busy} disabled={name.trim().length === 0} onPress={create} />
    </View>
  )
}

// ── A group you manage ─────────────────────────────────────────────────────
// Slim landing page: share, a short settings SUMMARY that drills into the
// settings sub-screen, the pending join requests, and the member roster. All
// the editable config (name / description / public / approval / delete) lives
// in GroupSettingsView below.
function OwnedGroupView({ group, onChanged, onOpenRequests, onOpenMember, bottomInset, onRosterTop }: {
  group: OwnedGroup
  onChanged: (g: OwnedGroup) => void
  /** Drill into the waiting queue — its own sub-screen, so this page carries
   *  exactly one long list. */
  onOpenRequests: () => void
  /** Open a member's profile page. EVERY member opens, including the owner and
   *  yourself: a row is a person, not an action menu. What can be done about
   *  them is decided on their page. */
  onOpenMember: (m: GroupMember) => void
  /** Safe-area padding for the roster's scroll content — the page fills the
   *  sheet, so the bottom inset belongs to the ONE scrolling region. */
  bottomInset: number
  /** See ContainedRoster's `onTopMeasured`. */
  onRosterTop?: (y: number) => void
}) {
  const iAmOwner = !!group.is_owner
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<GroupMember | null>(null)  // member-actions sheet
  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null)

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
  // Pending join requests (only meaningful while approval is on, but harmless
  // to fetch either way — the server returns [] when there are none). Cached on
  // the same terms as the roster, so the waiting faces are there on the first
  // frame too, not just the heading and a placeholder.
  const cachedRequests = joinRequests.useValue(group.id)
  const [fetchedRequests, setFetchedRequests] = useState<JoinRequestItem[] | null>(null)
  const requests = cachedRequests ?? fetchedRequests
  const applyRequests = useCallback((list: JoinRequestItem[]) => {
    setFetchedRequests(list)
    joinRequests.set(group.id, list)
  }, [group.id])

  const loadRequests = useCallback(() => {
    track(groupRequests(group.id))
      .then(applyRequests)
      .catch(() => { if (!joinRequests.get(group.id)) setFetchedRequests([]) })
  }, [group.id, applyRequests, track])
  useEffect(loadRequests, [loadRequests])

  // How many people are waiting is already on the group row (the denormalized
  // summary, kept live by the join-request trigger), so the section announces
  // itself from the first frame even on a group opened for the first time,
  // where there is nothing cached to paint.
  const requestCount = requests?.length ?? group.pending ?? 0

  const share = () => { tap(); Share.share({ message: t('communities.shareMessage').replace('{name}', group.name).replace('{link}', groupInviteUrl(group.invite_code)) }) }

  const roleTag = (m: GroupMember) => m.owner ? t('communities.owner') : m.manager ? t('communities.manager') : null

  return (
    <View style={s.ownedFill}>
      {/* The page is the roster and nothing above it (user directive
          2026-07-28): the member-count heading and the play-here eye that used
          to sit on it are both gone — the eye is a CHECKBOX in Group settings
          now, under the group's kind, where the rest of the config lives, and
          the count was a line the roster already shows by being itself. So the
          list starts at the page's top edge and takes all of it. */}
      <ContainedRoster
        data={members}
        bottomInset={0}
        onTopMeasured={onRosterTop}
        syncing={syncing}
        keyOf={m => m.user_id}
        empty={<View style={s.card}><SkeletonRows rows={group.members} /></View>}
        // The waiting queue is the roster's FIRST row (user directive
        // 2026-07-27): the same Strip the people under it are, so it lines up
        // with them by construction. What says it is an entry wanting an answer
        // rather than a person is the purple DISC in the avatar's lane, not a
        // fill of its own. How many are waiting rides in the SAME chip the roles
        // wear (user directive 2026-07-28), so the label stays a plain name.
        header={requestCount > 0 ? (
          <Strip
            // No fill override: it is the card's own WHITE first row (user
            // directive 2026-07-28). A tint here read as the PAGE behind it and
            // detached the row from the card.
            first
            style={rosterRowStyle(0, false)}
            // A CHECK, not a person (user directive 2026-07-28): the disc is
            // the answer this row is waiting for, and a person glyph only
            // repeated the avatars under it.
            icon={<View style={s.requestsGlyph}><CheckIcon color={WHITE} /></View>}
            title={t('communities.requestsSectionJoin')}
            tag={requestCount}
            onPress={onOpenRequests}
          />
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

      {/* Handing the group's link on sits UNDER the roster (user directive
          2026-07-28), not above it: the page is the list of people, and the
          invite is what you do after reading it. It rides the page's bottom
          edge, `bottomInset` clear of it, which is the air the roster used to
          carry. */}
      <View style={{ marginBottom: bottomInset }}>
        <Button label={t('communities.shareInvite')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={share} />
      </View>
    </View>
  )
}

// ── Join requests (the waiting queue) ──────────────────────────────────────
// Its own sub-screen off the manage page: two long lists never share a screen,
// so a queue of forty is as usable as a queue of three. Reads and writes the
// SAME joinRequests / rosters caches the manage page uses, so it opens painted
// and the page behind it is already correct when it pops back.
function JoinRequestsView({ group, onOpen, bottomInset, onRosterTop, isTop, onEmptied }: {
  group: OwnedGroup
  onOpen: (r: JoinRequestItem) => void
  bottomInset: number
  onRosterTop?: (y: number) => void
  /** False while a requester's profile is stacked over this page. */
  isTop: boolean
  /** The last request was answered: nothing is left to queue up. */
  onEmptied: () => void
}) {
  const cached = joinRequests.useValue(group.id)
  const [fetched, setFetched] = useState<JoinRequestItem[] | null>(null)
  // Cache-first: this page stays mounted under the requester's profile, and the
  // answer given there arrives as a cache write. See OwnedGroupView.
  const requests = cached ?? fetched

  // A queue that has just been emptied is not a page (user directive
  // 2026-07-28): answering the last request takes this page off too, so the
  // manager lands back on the group instead of on an empty list.
  //
  // Two things make it honest. It fires only on the TRANSITION to empty — a
  // queue that was already empty when it opened (a stale notification tap) is
  // left alone, since nothing just happened — and only while this page is on
  // TOP: the answer is given on the profile stacked above it, and a page that
  // is not top cannot ride off (its pull is disabled). So the flag survives the
  // answer and is spent the moment the profile pops back onto an empty queue,
  // which is what makes the two pages leave one after the other.
  const hadAny = useRef(false)
  useEffect(() => {
    if (!requests) return
    if (requests.length > 0) { hadAny.current = true; return }
    if (!isTop || !hadAny.current) return
    hadAny.current = false
    onEmptied()
  }, [requests, isTop, onEmptied])

  const { syncing, track } = useSyncFlag(requests != null)
  const load = useCallback(() => {
    track(groupRequests(group.id))
      .then(list => { setFetched(list); joinRequests.set(group.id, list) })
      .catch(() => { if (!joinRequests.get(group.id)) setFetched([]) })
  }, [group.id, track])
  useEffect(load, [load])

  // Known before the list lands (the denormalized count on the group row), so
  // the heading and the placeholder are both truthful from the first frame.
  const count = requests?.length ?? group.pending ?? 0

  return (
    <View style={s.ownedFill}>
      <View style={s.ownedHead}>
        {/* The title bar already says "Join requests", so the heading under it
            says WHOSE queue this is: the group's name (user directive
            2026-07-27), not the same words a second time. Opposite it, on that
            same line, the queue's ONE bulk answer (user directive 2026-07-28):
            it came off the title bar so the bar carries nothing but the page's
            own name, centred on the screen, and the control now sits with the
            list it empties — the same heading-row treatment the play-here eye
            wears one page back. The row's top margin is the heading's own
            (sectionFlat drops it off the text), so the glyph centres against
            the words rather than against the gap above them. */}
        <View style={[s.sectionRow, s.sectionRowTop]}>
          <Text style={[s.section, s.sectionFlat, s.sectionFill]} numberOfLines={1}>{group.name}</Text>
          {/* Hides itself when the queue is empty. See ApproveAllControl. */}
          <ApproveAllControl group={group} onDone={onEmptied} />
        </View>
      </View>
      {/* The same contained roster the member list is, so the queue scrolls the
          same way and ends at the same height. Rows carry NO buttons: a name
          and a thumbnail are not enough to decide on, and two buttons per row
          squeeze the row to nothing. Tapping opens the requester's profile, and
          the answer is given there. */}
      <ContainedRoster
        data={requests}
        bottomInset={bottomInset}
        onTopMeasured={onRosterTop}
        syncing={syncing}
        keyOf={r => r.id}
        empty={requests == null
          ? <View style={s.card}><SkeletonRows rows={count} /></View>
          : <View style={s.card}><Empty text={t('communities.noRequests')} /></View>}
        row={(r, index, last) => (
          <Strip
            first={index === 0}
            style={rosterRowStyle(index, last)}
            icon={<Avatar userId={r.user_id} name={r.name} image={r.image} />}
            title={r.name ?? ''}
            onPress={() => onOpen(r)}
          />
        )}
      />
    </View>
  )
}

// The settings page's own header control, on the trailing corner opposite the
// close X: read the group back as everyone ELSE meets it. A manager edits it
// through fields and a chooser, which say nothing about what those add up to —
// and what they add up to is the group POPUP, the one surface a searcher, an
// invitee and a member all meet the group in. So the preview IS that popup
// (GroupSheet), with nothing added to it and no action under it: `none` with no
// `onJoin` renders the card and only the card, which is what a preview has to
// be. Who runs it comes off the cached roster — the member flagged owner — so
// the face at the top is the real one whether I own the group or only manage it
// (an unread roster simply shows none, exactly as an admin-owned group does).
function GroupPreviewControl({ group }: { group: OwnedGroup }) {
  const [open, setOpen] = useState(false)
  const members = rosters.useValue(group.id)
  const owner = members?.find(m => m.owner)
  // Every field the popup reads is already on the group row, which the settings
  // page keeps in step with each save (applyGroup), so the preview repaints with
  // the edit that was just made.
  const brief: GroupBrief = {
    ...group,
    owner: owner ? { user_id: owner.user_id, name: owner.name, image: owner.image } : null,
  }

  return (
    <>
      <HeaderButton label={t('communities.preview')} onPress={() => setOpen(true)}>
        <PreviewGlyph size={ICON.round} />
      </HeaderButton>
      <GroupSheet group={open ? brief : null} status="none" onClose={() => setOpen(false)} />
    </>
  )
}

// The queue page's own control, opposite the group-name heading over the list:
// a check that empties the whole queue at once (user directive 2026-07-28). A
// queue of forty is otherwise forty profiles to open, and a manager who trusts
// the list wants one answer, not forty. It asks first, in the app's ONE
// decision popup, with a single button — approving everyone is not a thing to
// do by accident. It rides the HEADING and not the title bar (user directive
// 2026-07-28) so the bar is left to hold the page's name alone, centred.
function ApproveAllControl({ group, onDone }: { group: OwnedGroup; onDone: () => void }) {
  // Same cache the queue page reads, so the control appears and disappears
  // with the list under it rather than with a stale count.
  const requests = joinRequests.useValue(group.id)
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const count = requests?.length ?? group.pending ?? 0

  // Nothing to approve: no dead chrome beside the heading.
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
      // Already emptied on another device: the queue refetches on the way
      // back, so there is nothing to say here.
    } finally {
      setBusy(false)
      // The popup goes first, then the page rides off under it — the queue it
      // was about no longer exists.
      setAsk(false)
      onDone()
    }
  }

  return (
    <>
      {/* Two ticks, not one: the double check is already read as "all of them"
          (user directive 2026-07-28), and a single one beside a list reads as
          approving whoever sits at the top of it. Sized to the GLYPH with no
          chrome circle, exactly as the play-here eye is one page back: a
          heading row carries chrome, not a button. */}
      <RoundButton
        size={ICON.xxl}
        bg="transparent"
        shadow={false}
        style={s.headingGlyph}
        onPress={() => { tap(); setAsk(true) }}
        accessibilityLabel={t('communities.approveAll')}
      >
        <DoubleCheckIcon size={ICON.xxl} />
      </RoundButton>
      <ConfirmDialog
        visible={ask}
        title={t('communities.approveAllTitle')}
        description={t('communities.approveAllDesc').replace('{name}', group.name)}
        // ONE button (no cancelLabel): the popup is dismissed by swiping it
        // down or tapping the backdrop, and the only thing to press approves.
        confirmLabel={t('communities.approveAll')}
        busy={busy}
        onCancel={() => { if (!busy) setAsk(false) }}
        onConfirm={approveAll}
        draggable
      />
    </>
  )
}

// ── A person's page ────────────────────────────────────────────────────────
// THE one profile surface of the communities sheet: the same card the app
// renders for a match, full-bleed under the floating back control, with the
// actions about that person pinned under it. A requester, a member and a friend
// are the same page with different buttons (user directive 2026-07-27) — no
// decision about a person is taken from a row or a popup any more.
// The profiles the server sends here carry NO distance: being in a group with
// someone, or waiting at their door, is not consent to reveal where you are.
// The card is asked to drop the whole proximity chip (hideProximity) for the
// same reason: neither where the person is nor when they were last around
// belongs on a profile opened from a roster (user directive 2026-07-29).
function ProfilePage({ profile, userId, name, image, insets, caption, children }: {
  profile?: Profile | null
  /** Fallbacks for a row cached by a build that predates the profile payload:
   *  the page still works, just without the card. */
  userId: string
  name: string | null
  image: MemberImage
  insets: { top: number; bottom: number }
  /** One line over the action bar, saying what the answer below is about. */
  caption?: string
  /** The action bar's buttons. May be entirely absent (a plain member looking
   *  at another plain member has nothing to decide about them). */
  children: React.ReactNode
}) {
  // A page with no decision on it has no bar: a member with no buttons used to
  // still reserve the bar's padding and leave a dead PAGE-tinted band under the
  // photo (user directive 2026-07-29). toArray drops the nulls the callers pass
  // for the actions the viewer's role does not grant, so this is "is there
  // anything to press", not "was a children slot written".
  const hasActions = React.Children.toArray(children).length > 0
  return (
    <View style={s.profileFill}>
      {profile ? (
        // chromeInset lines the card's name/age chip up with the floating back
        // control, exactly as the own-profile preview does. The card's own
        // on-photo chrome clears the navigation bar by itself (it reads
        // useBottomInset internally), so a barless page needs nothing here.
        <MatchCard match={profile} actions={[]} bottomInset={0} chromeInset={insets.top} hideProximity />
      ) : (
        <View style={[s.content, s.profileBare]}>
          <View style={s.card}>
            <Strip first icon={<Avatar userId={userId} name={name} image={image} />} title={name ?? ''} />
          </View>
        </View>
      )}
      {(hasActions || !!caption) && (
        <View style={[s.profileBar, { paddingBottom: bottomGap(insets.bottom, MD) }]}>
          {!!caption && <Text style={s.profileBarCaption} numberOfLines={2}>{caption}</Text>}
          {children}
        </View>
      )}
    </View>
  )
}

// One requester's profile: approve or decline, right under the face.
function JoinRequestProfileView({ group, request, onDone, insets }: {
  group: OwnedGroup
  request: JoinRequestItem
  /** Pop back to the queue — the answer is done. */
  onDone: () => void
  insets: { top: number; bottom: number }
}) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline'); accept ? tap() : tapWarning()
    try {
      const fresh = await respondJoin(request.id, accept)
      // Both caches are written here, so the queue and the roster behind this
      // screen are already correct by the time it pops.
      joinRequests.set(group.id, fresh.requests)
      if (accept) rosters.set(group.id, fresh.members)
    } catch {
      // Already answered on another device: the queue refetches on the way
      // back, so there is nothing to say here.
    } finally { setBusy(null); onDone() }
  }

  return (
    <ProfilePage
      profile={request.profile}
      userId={request.user_id}
      name={request.name}
      image={request.image}
      insets={insets}
      caption={t('communities.joinRequestFor').replace('{name}', group.name)}
    >
      <Button
        label={t('communities.approve')} variant="primary" size="lg"
        iconStart={<CheckIcon color={WHITE} />}
        loading={busy === 'accept'} disabled={!!busy}
        onPress={() => respond(true)}
      />
      <Button
        label={t('communities.declineJoin')} variant="secondary" size="lg"
        iconStart={<CloseIcon color={INK} />}
        loading={busy === 'decline'} disabled={!!busy}
        onPress={() => respond(false)}
      />
    </ProfilePage>
  )
}

// A member of a group you manage, or one of your friends. Everything that used
// to sit in the member-actions BottomSheet or on a friend row lives here.
function PersonProfileView({ person, onDone, onGroupChanged, insets }: {
  person: PersonTarget
  /** Pop back: the person is no longer in the list behind this page. */
  onDone: () => void
  /** My own standing in the group changed under an action taken here (handing
   *  it over), so the pages behind must be re-seeded with the fresh row. */
  onGroupChanged: (g: OwnedGroup) => void
  insets: { top: number; bottom: number }
}) {
  const [busy, setBusy] = useState<'manager' | 'remove' | 'transfer' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmTransfer, setConfirmTransfer] = useState(false)

  if (person.kind === 'friend') {
    const f = person.friend
    const doUnfriend = async () => {
      setBusy('remove'); tapWarning()
      try {
        await unfriend(f.user_id)
        friendsRoster.set({
          friends: (friendsRoster.get()?.friends ?? []).filter(x => x.user_id !== f.user_id),
          requests: friendsRoster.get()?.requests ?? [],
        })
      } finally { setBusy(null); setConfirmRemove(false); onDone() }
    }
    return (
      <>
        <ProfilePage profile={f.profile} userId={f.user_id} name={f.name} image={f.image} insets={insets}>
          <Button
            label={t('communities.unfriendConfirm')} variant="secondary" size="lg"
            iconStart={<UserMinusIcon color={INK} />}
            loading={busy === 'remove'}
            onPress={() => { tap(); setConfirmRemove(true) }}
          />
        </ProfilePage>
        <ConfirmDialog
          visible={confirmRemove}
          title={t('communities.unfriendTitle').replace('{name}', f.name ?? '')}
          description={t('communities.unfriendDesc')}
          confirmLabel={t('communities.unfriendConfirm')}
          confirmIconStart={<UserMinusIcon color={WHITE} />}
          busy={busy === 'remove'}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={doUnfriend}
          draggable
        />
      </>
    )
  }

  const { group, member: m } = person
  const iAmOwner = !!group.is_owner
  // Who the group is (promote/demote, hand it over) is the OWNER's alone (user
  // directive 2026-07-28). Removing someone is the one action a manager keeps,
  // and only on a PLAIN member: another manager is the owner's appointment, and
  // the owner is untouchable even to himself (removing him would leave the group
  // ownerless with no way back). The server draws the same two lines.
  const canOwnerAct = iAmOwner && !m.owner
  const canRemove = !m.owner && (iAmOwner || !m.manager)
  const doSetManager = async () => {
    setBusy('manager'); tap()
    try { rosters.set(group.id, await setManager(group.id, m.user_id, !m.manager)) } finally { setBusy(null); onDone() }
  }
  const doRemove = async () => {
    setBusy('remove'); tapWarning()
    try { rosters.set(group.id, await removeMember(group.id, m.user_id)) } finally { setBusy(null); setConfirmRemove(false); onDone() }
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
      onGroupChanged({ ...group, is_owner: false })
    } finally { setBusy(null); setConfirmTransfer(false); onDone() }
  }

  return (
    <>
      <ProfilePage profile={m.profile} userId={m.user_id} name={m.name} image={m.image} insets={insets}>
        {canOwnerAct ? (
          <Button
            label={m.manager ? t('communities.removeManager') : t('communities.makeManager')}
            variant="primary" size="lg"
            iconStart={<RankIcon color={WHITE} down={!!m.manager} />}
            loading={busy === 'manager'} disabled={!!busy}
            onPress={doSetManager}
          />
        ) : null}
        {canOwnerAct ? (
          <Button
            label={t('communities.transferOwner')} variant="secondary" size="lg"
            iconStart={<KeyIcon color={INK} />}
            loading={busy === 'transfer'} disabled={!!busy}
            onPress={() => { tap(); setConfirmTransfer(true) }}
          />
        ) : null}
        {canRemove ? (
          // NO filled background (user directive 2026-07-29, replaces the
          // 2026-07-28 "emphasized on a plain member" rule): taking someone out
          // is never the loud thing on the page, whether they are a manager or
          // a plain member. Quiet, like handing the group over.
          <Button
            label={t('communities.removeFromGroup')}
            variant="secondary" size="lg"
            iconStart={<UserMinusIcon color={INK} />}
            loading={busy === 'remove'} disabled={!!busy}
            onPress={() => { tap(); setConfirmRemove(true) }}
          />
        ) : null}
      </ProfilePage>
      <ConfirmDialog
        visible={confirmRemove}
        title={t('communities.removeMemberTitle').replace('{name}', m.name ?? '')}
        description={t('communities.removeMemberDesc')}
        confirmLabel={t('communities.remove')}
        confirmIconStart={<UserMinusIcon color={WHITE} />}
        busy={busy === 'remove'}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={doRemove}
        draggable
      />
      <ConfirmDialog
        visible={confirmTransfer}
        title={t('communities.transferOwnerTitle').replace('{name}', m.name ?? '')}
        description={t('communities.transferOwnerDesc').replace('{name}', m.name ?? '')}
        confirmLabel={t('communities.transferOwner')}
        confirmIconStart={<KeyIcon color={WHITE} />}
        busy={busy === 'transfer'}
        onCancel={() => setConfirmTransfer(false)}
        onConfirm={doTransfer}
        draggable
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
  const kb = useKeyboardHeight()
  const iAmOwner = !!group.is_owner
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
      // roster it grew by has to be re-read.
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
  // which is what puts communities.linkInvalid under the field with the text
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
      <View style={{ gap: MD, marginBottom: kb }}>
        <View style={s.card}>
          <ToggleRow
            label={t('communities.hiddenToggle')}
            sub={t('communities.hiddenSub')}
            value={hidden}
            onValueChange={toggleHidden}
            style={s.hiddenRow}
          />
        </View>
      </View>
    )
  }

  return (
    <View style={{ gap: MD, marginBottom: kb }}>
      <Text style={s.section}>{t('communities.name')}</Text>
      <View style={s.descCard}>
        <EditableText
          value={group.name}
          saving={savingName}
          onCommit={saveName}
          errorLabel={t('communities.saveFailed')}
          min={1}
          max={GROUP_NAME_MAX}
          singleLine
          placeholder={t('communities.namePlaceholder')}
          updateLabel={t('communities.descUpdate')}
          inputStyle={s.nameInput}
          footerStyle={s.descFooter}
          hintStyle={s.descHint}
        />
      </View>

      <Text style={s.section}>{t('communities.description')}</Text>
      <View style={s.descCard}>
        <EditableText
          value={group.description ?? ''}
          saving={savingDesc}
          onCommit={saveDescription}
          errorLabel={t('communities.saveFailed')}
          min={0}
          max={GROUP_DESCRIPTION_MAX}
          allowEmpty
          placeholder={t('communities.descriptionPlaceholder')}
          updateLabel={t('communities.descUpdate')}
          inputStyle={s.descEditorInput}
          footerStyle={s.descFooter}
          hintStyle={s.descHint}
        />
      </View>

      {/* Where the group lives outside the app (a site, a form, a WhatsApp
          invite). Sits under the description because it is the rest of that
          sentence, and above the kind, which is policy rather than blurb. */}
      <Text style={s.section}>{t('communities.link')}</Text>
      <View style={s.descCard}>
        <EditableText
          value={group.link ?? ''}
          saving={savingLink}
          onCommit={saveLink}
          errorLabel={t('communities.linkInvalid')}
          min={0}
          max={GROUP_LINK_MAX}
          allowEmpty
          singleLine
          keyboardType="url"
          autoCapitalize="none"
          placeholder={linkPlaceholder}
          updateLabel={t('communities.descUpdate')}
          inputStyle={s.linkInput}
          footerStyle={s.descFooter}
          hintStyle={s.descHint}
        />
      </View>

      <Text style={s.section}>{t('communities.kindLabel')}</Text>
      <KindChooser value={kind} onChange={chooseKind} />

      {/* Manage without playing, as one checkbox: the members do not meet you
          and you do not meet them, and you go on running the group exactly as
          before. The sentence that used to be a popup's body is the row's own
          sub-line now. */}
      <View style={s.card}>
        <ToggleRow
          label={t('communities.hiddenToggle')}
          sub={t('communities.hiddenSub')}
          value={hidden}
          onValueChange={toggleHidden}
          style={s.hiddenRow}
        />
      </View>

      {/* Owner-only page from here up, so the delete needs no gate of its own. */}
      <Button label={t('communities.deleteGroup')} variant="secondary" size="lg" iconStart={<TrashIcon color={INK} />} onPress={() => setConfirmDelete(true)} />

      <ConfirmDialog
        visible={confirmDelete}
        title={t('communities.deleteTitle').replace('{name}', group.name)}
        description={t('communities.deleteDesc')}
        confirmLabel={t('communities.deleteConfirm')}
        confirmIconStart={<TrashIcon color={WHITE} />}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        draggable
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
  const kb = useKeyboardHeight()
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
  // Asking to join is the end of the search (user directive 2026-07-28): the
  // popup goes, and the page goes with it. Set when the tap queued a REQUEST,
  // read once the popup has actually unmounted — the page must not start
  // sliding off under a Modal that is still on screen, since a Modal is its own
  // window and would not ride down with it.
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
    if (g.requires_approval) {
      setRequested(m => ({ ...m, [g.id]: true }))
      // Leave on the tap, not on the answer: the wait is the whole outcome, and
      // it is the hub that carries it (the pending row lands there off the same
      // refresh). The rare reconcile below can no longer repaint a row that is
      // gone, and it does not have to — a request that turns out to have been
      // DECLINED shows up on the hub as a declined row, from the same summary.
      doneAfterPreview.current = true
      setPreview(null)
    } else setJoined(m => ({ ...m, [g.id]: true }))
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
    return st === 'joined' ? t('communities.joined')
      : st === 'pending' ? t('communities.pendingTag')
      : st === 'declined' ? t('communities.declinedTag')
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
    <View style={[s.findFill, { paddingBottom: bottomInset, marginBottom: kb }]}>
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
              : <Empty text={t('communities.noResults')} />}
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
// The sentence that stands in for a list. Inside a card it wears its own air
// (`empty`); the hub hands it a `style` to flatten that, because there it is a
// description over the buttons and the block around it does the spacing.
const Empty = ({ text, style }: { text: string, style?: StyleProp<TextStyle> }) => <Text style={[s.empty, style]}>{text}</Text>

// A bare glyph in a section heading — the play-here eye — has to sit on the
// same vertical line as the page HEADER's controls above it (the gear), or the
// two read as two different edges. It cannot simply share their end gutter: its
// box is the glyph itself, not the chrome circle they wear, so aligning the
// boxes' end EDGES would leave their centres half that difference apart. Nudge
// it in by exactly that half, plus whatever the header's gutter differs from
// the page's, so the two stay locked together if either token moves.
const HEADING_GLYPH_INSET = OVERLAY.chromeInset - MD + (ROUND_BUTTON_SIZE_SM - ICON.xxl) / 2

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE },
  scroll: { flex: 1 },
  content: { paddingHorizontal: MD, paddingTop: SM, gap: SM },
  // A group page fills the sheet: a fixed head plus the roster's scroll region,
  // MD apart, the same gap the page's blocks had while it all scrolled.
  ownedFill: { flex: 1, gap: MD },
  ownedHead: { gap: MD },
  // The roster is a FlatList, so `card` can't wrap it — the rows carry the card
  // themselves and only the ends are rounded. The list BOX carries the same
  // radius so a row clipped at the bottom edge is clipped round, not square.
  rosterBox: { flex: 1, borderRadius: RADIUS, overflow: 'hidden' },
  rosterList: { flex: 1 },
  // A person's page: the card takes the screen, the actions sit under it in a
  // bar that never scrolls away.
  profileFill: { flex: 1 },
  profileBare: { flex: 1 },
  profileBar: { paddingHorizontal: MD, paddingTop: MD, gap: SM },
  profileBarCaption: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: INK, textAlign: 'center' },
  // A stacked page: opaque, so the page it covers never shows through.
  layerCard: { flex: 1, backgroundColor: PAGE },
  rosterRow: { backgroundColor: SURFACE },
  rosterRowFirst: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  rosterRowLast: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  card: { backgroundColor: SURFACE, borderRadius: RADIUS, overflow: 'hidden' },
  // The waiting-queue entry, the roster's FIRST row. It used to be a solid
  // purple slab, which repeated the "Share invite link" CTA right above it and
  // read as a second primary action (user directive 2026-07-28). It carries no
  // fill at all now: it is the card's white row, and the purple disc in the
  // avatar lane (the same one a photo-less member wears) is what marks it as an
  // entry rather than a person.
  requestsGlyph: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  // THE strip's geometry lives with the strip (components/Strip.tsx) — this
  // surface no longer owns a row style of its own. STRIP_ROW is imported for
  // the one thing here that stands IN a strip's place without being one: the
  // empty-state row.
  section: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: INK_MUTED, marginTop: MD, marginStart: XS },
  // A section heading with a control opposite it. The heading's own top margin
  // is DROPPED (sectionFlat), not moved onto the row: the head already spaces
  // its blocks by its `gap`, and keeping both stacked two MDs above the roster.
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionFlat: { marginTop: 0 },
  // The heading's own top margin, moved onto the ROW: for a head whose only
  // block is that row (the queue page), where no `gap` above it does the job.
  sectionRowTop: { marginTop: MD },
  // A heading that is a NAME, not a fixed label: it takes the row and shrinks
  // to an ellipsis instead of shoving the control off the end.
  sectionFill: { flex: 1, minWidth: 0 },
  // Shared by every bare glyph in a section heading — see HEADING_GLYPH_INSET.
  headingGlyph: { marginEnd: HEADING_GLYPH_INSET },
  // The header's trailing controls, side by side on the bar's end corner.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SM },
  // `flexShrink` is what lets the popup obey the sheet's height cap: the body
  // gives, and inside it only the description's SheetScroll declares a shrink of
  // its own, so that is where the whole overflow lands.
  sheetWrap: { paddingHorizontal: MD, gap: SM, flexShrink: 1 },
  // The introduction inside the SheetScroll: it keeps the same SM rhythm the
  // sheet body spaces its blocks by, so a head that scrolls looks exactly like
  // the head that does not (a short group's popup is unchanged).
  sheetHead: { gap: SM },
  sheetAvatar: { alignItems: 'center', paddingBottom: XS },
  // Spacing only — the type comes from SheetTitle (BottomSheet.tsx).
  // Spacing only — the type comes from SHEET_TITLE (BottomSheet.tsx). A regular
  // weight was tried here on 2026-07-29 and reverted: the name is the one thing
  // in the head that carries the popup, and without the weight it sank into the
  // meta line above it.
  sheetTitle: { paddingBottom: XS },
  sheetDesc: { fontSize: TEXT.md, color: INK, textAlign: 'center', lineHeight: lhSm() },
  // The head's meta line carries no style of its own: it is MetaLine, told to
  // centre and to take full INK like every other line in a popup (user
  // directive: popup text is never faded) — size alone is what makes it meta,
  // and the size is the fact line's own.
  // The "more details" line: underlined because it is the one word in a popup
  // that leaves the app (same treatment the sign-in screen gives
  // terms/privacy), and set at the TITLE's size (user directive 2026-07-28) —
  // it is the popup's one tap into the group's own page, so it may not read as
  // small print under the description it follows.
  sheetLink: { fontSize: TEXT.lg, color: INK, textAlign: 'center', lineHeight: lh(TEXT.lg), textDecorationLine: 'underline' },
  // Group-description editor card (hosts the shared EditableText). The input is
  // a plain readable block; the footer mirrors the bio editor's hint+Update.
  descCard: { backgroundColor: SURFACE, borderRadius: RADIUS, padding: MD, gap: SM },
  descEditorInput: { fontSize: TEXT.md, color: INK, padding: 0, minHeight: 54, lineHeight: lhSm(), includeFontPadding: false },
  nameInput: { fontSize: TEXT.md, color: INK, fontWeight: WEIGHT.medium, padding: 0, includeFontPadding: false },
  // The link field: one line, and start-aligned like every other field (the
  // base TextInput does that) — a latin URL still renders LTR inside it.
  linkInput: { fontSize: TEXT.md, color: INK, padding: 0, includeFontPadding: false },
  descFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: MD },
  descHint: { fontSize: TEXT.md, color: INK_MUTED },
  // Why a field was refused, under the field it belongs to. Full-strength ink
  // (NEGATIVE): it is the reason nothing was saved, not a hint.
  fieldError: { fontSize: TEXT.md, color: NEGATIVE },
  descInput: { minHeight: 54, paddingTop: 0 },
  pillBtn: { paddingHorizontal: MD, paddingVertical: SM, borderRadius: RADIUS },
  pillBtnInk: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: WHITE },
  // The footnote above a popup's button — what this group is to me right now,
  // what a friend is worth. It is a HINT, not a paragraph, so it takes the rank
  // below the body (`sm`, user directive 2026-07-29): at body size it read as a
  // second description competing with the group's own, and the button under it
  // is what the eye should land on.
  sheetNote: { fontSize: TEXT.sm, color: INK_MUTED, lineHeight: lh(TEXT.sm), textAlign: 'center', marginTop: XS },
  // The sentence that stands in for a list: it sits in the card the strips would
  // have filled, so it takes the STRIP's gutter (`row`'s paddingHorizontal) —
  // without it a long line wraps flush to the card's edges on a narrow screen or
  // at a large font size.
  empty: { fontSize: TEXT.md, color: INK_MUTED, textAlign: 'center', paddingVertical: LG, paddingHorizontal: MD },
  // The empty hub's two ways forward, under the card rather than in it: the card
  // is the list, and these are what to do when there is no list yet.
  emptyActions: { gap: SM, paddingTop: MD },
  // The "no groups yet" sentence AS A ROW of that list (user directive
  // 2026-07-28): it composes `row`, so it carries a group strip's padding and
  // its hairline off the row above, and centres in the width it is given.
  emptyRow: { justifyContent: 'center' },
  emptyRowText: { flex: 1, paddingVertical: 0, paddingHorizontal: 0 },
  // The friends page's invite block: the reward line and the button it explains,
  // held together under the roster so the two never drift apart.
  friendsInvite: { gap: SM },
  // The "hide me here" checkbox, in the settings card: one step taller than a
  // bare toggle row, because it carries the sentence that explains it.
  hiddenRow: { paddingVertical: MD },
  // The search page: the contained box takes the height, the note sits under it.
  findFill: { flex: 1, gap: SM },
  field: { ...FIELD_SKIN, flexDirection: 'row', alignItems: 'center', gap: SM, paddingHorizontal: MD, paddingVertical: MD },
  // The same field, on the header bar: padded to the height of the chrome circle
  // beside it (the close X) instead of a form row's, so the bar stays a bar.
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
  toggleTitle: { fontSize: TEXT.md, fontWeight: WEIGHT.medium, color: INK_MUTED },
  toggleSub: { fontSize: TEXT.sm, fontWeight: WEIGHT.medium, color: INK_MUTED },
})

// Body line-height for the muted note (kept a small helper so the ratio lives
// in one place rather than as an inline literal at the style site).
function lhSm() { return Math.round(TEXT.md * 1.5) }
