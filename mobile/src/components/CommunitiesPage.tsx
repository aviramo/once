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
import { View, StyleSheet, Pressable, Share, I18nManager, Keyboard, FlatList, TextInput as RNTextInput, type NativeSyntheticEvent, type NativeScrollEvent, type StyleProp, type ViewStyle } from 'react-native'
import { Path, Circle, Line } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, TextInput } from './AppText'
import { SheetHeader, type OverlaySheetBody } from './OverlaySheet'
import { PullContext, PullScrollView, PullPane, usePullBehavior, type PullCtx } from './PullPane'
import { useSharedValue, useAnimatedReaction, runOnJS, type SharedValue } from 'react-native-reanimated'
import type { GestureType } from 'react-native-gesture-handler'
import { RisingCard } from './RisingCard'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { BottomSheet } from './BottomSheet'
import { Glyph, GroupsIcon, TrashIcon, UserIcon, UserMinusIcon, SignOutIcon, CheckIcon, CloseIcon, EyeOffIcon, EyeOpenIcon } from './icons'
import { tap, tapWarning } from '../lib/haptics'
import { t } from '../i18n'
import { useUserStore, type Profile } from '../stores/userStore'

type StoreProfile = ReturnType<typeof useUserStore.getState>['profile']
import { Avatar, SkeletonRows, MetaText, AVATAR } from './CommunityBits'
import { MatchCard } from './MatchCard'
import { rosters, joinRequests, friendsRoster, dropGroupCaches } from '../lib/rosterCache'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { shareFriendInvite } from '../lib/referral'
import { groupInviteUrl } from '../lib/links'
import { EditableText } from './EditableText'
import {
  ownedGroups, myGroups, myFriends, groupMembers, removeMember, deleteGroup,
  updateGroup, createGroup, searchGroups, redeemInvite, leaveGroup, setManager,
  friendRespond, unfriend, communitiesSummary, cancelJoinRequest,
  groupRequests, respondJoin, setGroupHidden,
  groupKind, groupKindFlags, GROUP_KINDS, DEFAULT_GROUP_KIND, type GroupKind,
  metaLine, memberLabel, friendLabel, requestLabel,
  type OwnedGroup, type GroupMember, type MyFriends, type PublicGroup, type MemberImage,
  type FriendItem, type CommunitiesSummary, type JoinedGroup, type PendingGroup,
  type JoinRequestItem, type CommunitiesTarget,
} from '../lib/communities'
import { XS, SM, MD, LG, XL, RADIUS, TEXT, WEIGHT, ICON, bottomGap } from '../tokens'
import { BG, SURFACE, INK, GREEN, GREEN_HALF, PRIMARY, BORDER_SOFT, GREEN_SOFT, WHITE, BLACK_MID } from '../colors'
import { FIELD_SKIN } from '../field'

const ChevGlyph = ({ color = GREEN_HALF }: { color?: string } = {}) => (
  // Disclosure chevron points in the reading-forward direction: right in LTR,
  // mirrored to left under RTL (same treatment as BackIcon in icons.tsx).
  // `color` is for the one row that sits on the full purple (the waiting queue).
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d={I18nManager.isRTL ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </Glyph>
)
const SearchGlyph = ({ color = GREEN }: { color?: string }) => (
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
    <Circle cx="11" cy="11" r="7" /><Line x1="16.5" y1="16.5" x2="21" y2="21" />
  </Glyph>
)
const PlusGlyph = ({ color = GREEN }: { color?: string }) => (
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
    <Line x1="12" y1="5" x2="12" y2="19" /><Line x1="5" y1="12" x2="19" y2="12" />
  </Glyph>
)
// Dedicated "share" mark (tray + upward arrow) for the share-invite buttons.
const ShareGlyph = ({ color = WHITE }: { color?: string }) => (
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3v12" /><Path d="M8 7l4-4 4 4" /><Path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Glyph>
)
// Settings gear (leads the manage-page summary row).
const GearGlyph = ({ color = GREEN }: { color?: string }) => (
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="3.2" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Glyph>
)

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
  const insets = useSafeAreaInsets()
  const profile = useUserStore(st => st.profile)
  // The air under a contained roster: one small step, or the safe area where
  // there is one (XL was too much — user directive 2026-07-27). Both roster
  // pages read this one value, so their lists end at exactly the same height.
  const rosterGap = bottomGap(insets.bottom, SM)

  const [stack, setStack] = useState<CView[]>(() => (
    target?.kind === 'friends' || target?.kind === 'friend' ? [{ k: 'hub' }, { k: 'friends' }] : [{ k: 'hub' }]
  ))
  const view = stack[stack.length - 1]
  const push = useCallback((v: CView) => setStack(sk => [...sk, v]), [])
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
  const pull = usePullBehavior({
    activation: 'sheet',
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
  const pullCtx = useMemo<PullCtx>(() => (
    isSheetLayer
      ? { panRef: sheetPanRef!, extraRefs: [], setScrollAtTop: onSheetScrollAtTop ?? (() => {}), pullEngaged: sheetPullEngaged! }
      : { panRef: pull.panRef, extraRefs: [], setScrollAtTop: pull.setScrollAtTop, pullEngaged: pull.pullEngaged }
  ), [isSheetLayer, sheetPanRef, onSheetScrollAtTop, sheetPullEngaged, pull.panRef, pull.setScrollAtTop, pull.pullEngaged])

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

  // A profile page is a full-bleed card: no title bar over it, just the close
  // X floating on the photo (user directive 2026-07-27).
  const floatingChrome = view.k === 'request' || view.k === 'person' || view.k === 'self'

  const header = (
    <SheetHeader
      title={floatingChrome ? undefined : titleFor(view)}
      // A group's name is shown WHOLE (user directive 2026-07-27): as many
      // lines as its 60 characters need, never an ellipsis. The header grows
      // downward and its first line stays put, so a long name costs nothing but
      // the room it takes. The fixed labels are short and stay on one line, so
      // a two-word one never splits across two.
      titleLines={view.k === 'owned' ? 0 : 1}
      topInset={insets.top}
      floating={floatingChrome}
      // Match the page background (BG), not the default light-beige SURFACE,
      // so the header blends into the Communities page instead of sitting on
      // a lighter band.
      barBg={BG}
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
    <PersonProfileView person={view.person} onDone={closePage} insets={insets} />
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
  ) : view.k === 'owned' || view.k === 'requests' ? (
    // The two roster pages do NOT ride a page scroll: their heads stay put and
    // only the list under them scrolls, inside a box that ends `rosterGap`
    // above the page's end (user directive 2026-07-27). So each gets the page
    // box itself — the same gutters the scroll's content container paints —
    // and owns the one scroll region in it.
    <View style={[s.scroll, s.content]}>
      {view.k === 'owned' ? (
        <OwnedGroupView
          group={view.group}
          onChanged={applyGroup}
          onOpenSettings={() => push({ k: 'settings', group: view.group })}
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
      {view.k === 'hub' && (
        <HubView
          push={push}
          initialJoined={joinedTarget}
          onInitialJoinedConsumed={onInitialJoinedConsumed}
        />
      )}
      {view.k === 'friends' && (
        <FriendsView
          profile={profile}
          onOpenFriend={f => push({ k: 'person', person: { kind: 'friend', friend: f } })}
        />
      )}
      {view.k === 'find' && <FindView />}
      {view.k === 'create' && <CreateView onCreated={g => setStack([{ k: 'hub' }, { k: 'owned', group: g }])} />}
      {view.k === 'settings' && <GroupSettingsView group={view.group} onChanged={applyGroup} onDeleted={() => removeGroupViews(view.group.id)} />}
    </PullScrollView>
  )

  const page = (
    <PullContext.Provider value={pullCtx}>
      <View style={s.root}>
        {floatingChrome ? <>{body}{header}</> : <>{header}{body}</>}
      </View>
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
function HubView({ push, initialJoined, onInitialJoinedConsumed }: {
  push: (v: CView) => void
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

  const [joinedSheet, setJoinedSheet] = useState<JoinedGroup | null>(initialJoined ?? null)
  // Open the deep-linked member group's sheet, and let the page forget the
  // target straight away so popping back to the hub later doesn't reopen it.
  useEffect(() => {
    if (!initialJoined) return
    setJoinedSheet(initialJoined)
    onInitialJoinedConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoined])
  const [pendingConfirm, setPendingConfirm] = useState<PendingGroup | null>(null)
  const [declinedConfirm, setDeclinedConfirm] = useState<PendingGroup | null>(null)
  const [pendingBusy, setPendingBusy] = useState(false)
  const doCancelJoin = async () => {
    if (!pendingConfirm) return
    setPendingBusy(true); tapWarning()
    try { await cancelJoinRequest(pendingConfirm.id); setPendingConfirm(null) } finally { setPendingBusy(false) }
  }
  // Same endpoint: on a declined row the server only marks the notice seen, so
  // clearing it is not a way around the wait before asking again.
  const doClearDeclined = async () => {
    if (!declinedConfirm) return
    setPendingBusy(true); tap()
    try { await cancelJoinRequest(declinedConfirm.id); setDeclinedConfirm(null) } finally { setPendingBusy(false) }
  }
  // "kind · N members" like the managed rows. Undefined for the degraded
  // fallback payload (old summary shape carried no type/count).
  const joinedMeta = (g: JoinedGroup) =>
    g.is_public === undefined
      ? undefined
      : metaLine(kindShort(groupKind(g)), memberLabel(g.members ?? 0))
  // My friends is not a group and has no kind: it is always the same thing, so
  // its meta is just the counts.
  const friendsMeta = data
    ? metaLine(friendLabel(data.friends), data.requests > 0 && requestLabel(data.requests))
    : t('communities.myFriendsSub')

  return (
    <View style={{ gap: MD }}>
      <View style={s.card}>
        <NavRow
          title={t('communities.myFriends')}
          meta={friendsMeta}
          first
          onPress={() => push({ k: 'friends' })}
        />
      </View>

      <Text style={s.section}>{t('communities.manageSection')}</Text>
      <View style={s.card}>
        {loading ? <SkeletonRows rows={2} lines={2} /> : data!.managed.length === 0 ? (
          <Empty text={t('communities.emptyManage')} />
        ) : data!.managed.map((g, i) => {
          // A group you deliberately stepped out of says so on its row, so the
          // state is readable without opening it.
          const meta = metaLine(
            kindShort(groupKind(g)),
            memberLabel(g.members),
            g.pending != null && g.pending > 0 && requestLabel(g.pending),
            g.hidden && t('communities.hiddenShort'),
          )
          return (
            <NavRow
              key={g.id}
              first={i === 0}
              title={g.name}
              meta={meta}
              onPress={() => push({ k: 'owned', group: g })}
            />
          )
        })}
      </View>
      <Button label={t('communities.create')} variant="primary" size="lg" iconStart={<PlusGlyph color={WHITE} />} onPress={() => push({ k: 'create' })} />

      <Text style={s.section}>{t('communities.inSection')}</Text>
      <View style={s.card}>
        {loading ? <SkeletonRows rows={3} lines={2} /> : (data!.joined.length === 0 && data!.pending.length === 0) ? (
          <Empty text={t('communities.emptyIn')} />
        ) : (
          <>
            {/* Pending join requests render first with a distinct "waiting for
                approval" meta. Tapping opens the shared cancel confirm — the
                same popup the FindView pending button opens. */}
            {data!.pending.map((g, i) => (
              <NavRow key={`p-${g.id}`} first={i === 0} title={g.name} meta={t('communities.pending')} onPress={() => setPendingConfirm(g)} />
            ))}
            {/* A request that was turned down. It used to vanish, which read as
                "still waiting" forever; it now says so, and tapping clears the
                notice (the answer itself stands). */}
            {data!.declined.map(g => (
              <NavRow key={`d-${g.id}`} title={g.name} meta={t('communities.declined')} onPress={() => setDeclinedConfirm(g)} />
            ))}
            {data!.joined.map((g, i) => (
              <NavRow key={g.id} first={data!.pending.length === 0 && data!.declined.length === 0 && i === 0} title={g.name} meta={joinedMeta(g)} onPress={() => setJoinedSheet(g)} />
            ))}
          </>
        )}
      </View>
      <Button label={t('communities.find')} variant="secondary" size="lg" iconStart={<SearchGlyph color={GREEN} />} onPress={() => push({ k: 'find' })} />

      <JoinedGroupSheet group={joinedSheet} onClose={() => setJoinedSheet(null)} />
      <ConfirmDialog
        visible={!!pendingConfirm}
        title={pendingConfirm ? t('communities.cancelJoinTitle').replace('{name}', pendingConfirm.name) : ''}
        description={t('communities.cancelJoinDesc')}
        confirmLabel={t('communities.cancelJoinConfirm')}
        busy={pendingBusy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={doCancelJoin}
        draggable
      />
      <ConfirmDialog
        visible={!!declinedConfirm}
        title={declinedConfirm ? t('communities.declinedTitle').replace('{name}', declinedConfirm.name) : ''}
        description={t('communities.declinedDesc')}
        confirmLabel={t('communities.declinedConfirm')}
        busy={pendingBusy}
        onCancel={() => setDeclinedConfirm(null)}
        onConfirm={doClearDeclined}
        draggable
      />
    </View>
  )
}

// Tapping a group you're a member of opens this popup: leave, and — for a
// public group — share its invite link (a public code is not a secret). The
// old drill-in screen is gone. Leaving refreshes via the store (the server
// trigger repaints relations.communities), so the hub row drops on its own.
export function JoinedGroupSheet({ group, onClose }: { group: JoinedGroup | null; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const share = () => {
    if (!group?.invite_code) return
    tap()
    Share.share({ message: t('communities.shareMessage').replace('{name}', group.name).replace('{link}', groupInviteUrl(group.invite_code)) })
  }
  const leave = async () => {
    if (!group) return
    setBusy(true); tapWarning()
    // The cached roster goes with the membership — it is other people's names
    // and photos, kept only for a group the user is actually in.
    try { await leaveGroup(group.id); dropGroupCaches(group.id); onClose() } finally { setBusy(false); setConfirm(false) }
  }

  return (
    <>
      <BottomSheet visible={!!group && !confirm} onDismiss={onClose}>
        <View style={s.sheetWrap}>
          {/* Whole name, wrapping as far as it needs (user directive
              2026-07-27) — a popup about one group never abbreviates which. */}
          <Text style={s.sheetTitle}>{group?.name}</Text>
          {group?.description ? <Text style={s.sheetDesc}>{group.description}</Text> : null}
          <Text style={s.sheetNote}>{t('communities.memberNote')}</Text>
          {group?.is_public && group?.invite_code ? (
            <Button label={t('communities.shareInvite')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={share} />
          ) : null}
          <Button label={t('communities.leave')} variant="secondary" size="lg" iconStart={<SignOutIcon color={INK} />} onPress={() => setConfirm(true)} />
        </View>
      </BottomSheet>
      <ConfirmDialog
        visible={confirm}
        title={group ? t('settings.groupsLeaveTitle').replace('{name}', group.name) : ''}
        description={t('settings.groupsLeaveDesc')}
        confirmLabel={t('settings.groupsLeaveConfirm')}
        confirmIconStart={<SignOutIcon color={WHITE} />}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={leave}
        draggable
      />
    </>
  )
}

// A single tappable card row: leading icon/avatar, title + optional meta, chevron.
function NavRow({ icon, title, meta, first, style, onPress }: { icon?: React.ReactNode; title: string; meta?: string; first?: boolean; style?: StyleProp<ViewStyle>; onPress: () => void }) {
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      onPress={() => { tap(); onPress() }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[s.row, first && s.rowFirst, style, pressed && { backgroundColor: GREEN_SOFT }]}
    >
      {icon ? <View style={s.rowIcon}>{icon}</View> : null}
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
        {/* The meta line wraps to a SECOND line rather than ellipsizing (user
            directive 2026-07-27): "open · 18 members · not accepting requests"
            says nothing once it is cut mid-word. Two lines is the ceiling, a
            row is still a row. MetaText is what drops the separator at the
            break; a plain label with no separator in it renders unchanged. */}
        {meta ? <MetaText text={meta} style={s.rowMeta} numberOfLines={2} /> : null}
      </View>
      <ChevGlyph />
    </Pressable>
  )
}

// ── Group kind ─────────────────────────────────────────────────────────────
// The three names live here once, so a kind reads identically in the chooser,
// in a row's meta line and in search. See groupKind() in lib/communities.
const kindTitle = (k: GroupKind) =>
  k === 'open' ? t('communities.kindOpen')
  : k === 'approved' ? t('communities.kindApproved')
  : t('communities.kindPrivate')
const kindSub = (k: GroupKind) =>
  k === 'open' ? t('communities.kindOpenSub')
  : k === 'approved' ? t('communities.kindApprovedSub')
  : t('communities.kindPrivateSub')
/** One word for a meta line, where the full name would repeat "group". */
const kindShort = (k: GroupKind) =>
  k === 'open' ? t('communities.kindOpenShort')
  : k === 'approved' ? t('communities.kindApprovedShort')
  : t('communities.kindPrivateShort')

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
function ContainedRoster<T>({ data, keyOf, row, empty, header, bottomInset, onTopMeasured }: {
  /** null = still loading; `empty` covers both that and a genuinely empty list. */
  data: T[] | null
  keyOf: (item: T) => string
  row: (item: T, index: number, last: boolean) => React.ReactElement
  empty?: React.ReactElement | null
  /** A row that rides at the TOP of the card and scrolls with it (the waiting
      queue's entry). Style it with `rosterRowStyle(0, false)` so it wears the
      card's rounded top and the rows below it stay flat. */
  header?: React.ReactElement | null
  bottomInset: number
  /** The box's top edge in WINDOW coordinates. Everything above it on these
   *  pages is fixed, so the page hands it to its dismiss pan as the bottom of
   *  the drag band (see PageLayer): the head is a handle, the list is a list. */
  onTopMeasured?: (y: number) => void
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
        ListHeaderComponent={header ?? null}
        ListEmptyComponent={empty ?? null}
        renderItem={({ item, index }) => row(item, index, index === count - 1)}
      />
    </View>
  )
}
/** The card look, carried by the rows themselves: only the ends are rounded. */
const rosterRowStyle = (index: number, last: boolean) => [
  s.rosterRow,
  index === 0 && s.rosterRowFirst,
  last && s.rosterRowLast,
]

// ── My friends ─────────────────────────────────────────────────────────────
function FriendsView({ profile, onOpenFriend }: { profile: StoreProfile; onOpenFriend: (f: FriendItem) => void }) {
  const [busy, setBusy] = useState<string | null>(null)

  // Same two-tier read as a group roster: last visit's list paints, the round
  // trip corrects it.
  const cached = friendsRoster.useValue()
  const [fetched, setFetched] = useState<MyFriends | null>(null)
  // Cache-first: this page stays mounted under a friend's profile, and removing
  // them there arrives as a cache write. See OwnedGroupView.
  const data = cached ?? fetched
  const load = useCallback(() => {
    myFriends()
      .then(fresh => { setFetched(fresh); friendsRoster.set(fresh) })
      .catch(() => { if (!friendsRoster.get()) setFetched({ friends: [], requests: [] }) })
  }, [])
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

  return (
    <View style={{ gap: MD }}>
      {/* Single entry: share the friend-invite link. Opening it with the app
          installed auto-links the pair as mutual friends (no request, no
          approval). People-search + friend requests were removed 2026-07-26. */}
      <Button label={t('communities.inviteFriend')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={() => { tap(); if (profile) shareFriendInvite(profile) }} />
      <Text style={s.sheetNote}>{t('communities.inviteReward')}</Text>

      {data?.requests.length ? (
        <>
          <Text style={s.section}>{t('communities.requestsSection')}</Text>
          <View style={s.card}>
            {data.requests.map((r, i) => (
              <View key={r.id} style={[s.memberRow, i === 0 && s.rowFirst]}>
                <Avatar userId={r.user_id} name={r.name} image={r.image} />
                <Text style={s.memberName} numberOfLines={1}>{r.name}</Text>
                <Pressable style={[s.pillBtn, { backgroundColor: PRIMARY}]} onPress={() => respond(r.id, true)} disabled={!!busy}>
                  <Text style={s.pillBtnInk}>{t('communities.accept')}</Text>
                </Pressable>
                <Pressable style={[s.pillBtn, { backgroundColor: GREEN_SOFT }]} onPress={() => respond(r.id, false)} disabled={!!busy}>
                  <Text style={[s.pillBtnInk, { color: GREEN }]}>{t('communities.decline')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={s.section}>{friendCount == null ? ' ' : t('communities.friendsCount').replace('{count}', String(friendCount))}</Text>
      <View style={s.card}>
        {/* Knowing the count up front also means a friendless account skips the
            placeholder entirely and goes straight to the empty line. */}
        {friends == null && friendCount !== 0 ? (
          <SkeletonRows rows={friendCount ?? undefined} />
        ) : friendCount === 0 ? (
          <Empty text={t('communities.noFriends')} />
        ) : friends!.map((f, i) => (
          // No button on the row (user directive 2026-07-27): tapping opens the
          // friend's profile, and removing them is decided there.
          <NavRow
            key={f.user_id}
            first={i === 0}
            icon={<Avatar userId={f.user_id} name={f.name} image={f.image} />}
            title={f.name ?? ''}
            onPress={() => onOpenFriend(f)}
          />
        ))}
      </View>
      {data && data.friends.length > 0 ? <Text style={s.note}>{t('communities.mutualNote')}</Text> : null}
    </View>
  )
}

// ── Create a group ─────────────────────────────────────────────────────────
function CreateView({ onCreated }: { onCreated: (g: OwnedGroup) => void }) {
  const kb = useKeyboardHeight()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // A new group is OPEN unless the creator says otherwise (user directive
  // 2026-07-27): the point of creating one is that people can find it.
  const [kind, setKind] = useState<GroupKind>(DEFAULT_GROUP_KIND)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (busy || name.trim().length === 0) return
    setBusy(true); tap()
    try {
      const flags = groupKindFlags(kind)
      const g = await createGroup(name.trim(), flags.is_public, {
        description: description.trim() || null,
        requires_approval: flags.requires_approval,
      })
      onCreated(g)
    } catch { setBusy(false) }
  }

  return (
    <View style={{ gap: MD, marginBottom: kb }}>
      <Text style={s.section}>{t('communities.name')}</Text>
      <View style={s.field}>
        <TextInput style={s.fieldInput} value={name} onChangeText={setName} placeholder={t('communities.namePlaceholder')} placeholderTextColor={BLACK_MID} autoFocus maxLength={60} />
      </View>
      <Text style={s.section}>{t('communities.description')}</Text>
      <View style={s.field}>
        <TextInput style={[s.fieldInput, s.descInput]} value={description} onChangeText={setDescription} placeholder={t('communities.descriptionPlaceholder')} placeholderTextColor={BLACK_MID} multiline maxLength={300} textAlignVertical="top" />
      </View>
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
function OwnedGroupView({ group, onChanged, onOpenSettings, onOpenRequests, onOpenMember, bottomInset, onRosterTop }: {
  group: OwnedGroup
  onChanged: (g: OwnedGroup) => void
  onOpenSettings: () => void
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

  const load = useCallback(() => {
    groupMembers(group.id)
      .then(applyMembers)
      // A failed refresh must not blank a roster we already have — only an
      // account with nothing cached falls through to the empty list.
      .catch(() => { if (!rosters.get(group.id)) setFetched([]) })
  }, [group.id, applyMembers])
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
    groupRequests(group.id)
      .then(applyRequests)
      .catch(() => { if (!joinRequests.get(group.id)) setFetchedRequests([]) })
  }, [group.id, applyRequests])
  useEffect(loadRequests, [loadRequests])

  // How many people are waiting is already on the group row (the denormalized
  // summary, kept live by the join-request trigger), so the section announces
  // itself from the first frame even on a group opened for the first time,
  // where there is nothing cached to paint.
  const requestCount = requests?.length ?? group.pending ?? 0

  const share = () => { tap(); Share.share({ message: t('communities.shareMessage').replace('{name}', group.name).replace('{link}', groupInviteUrl(group.invite_code)) }) }

  // "Stay out of the game here" — the row above the roster opens the popup that
  // explains it and carries the single action. The answer is awaited (the popup
  // stays put under its spinner) rather than applied optimistically: this one
  // changes who the user meets, so it closes on the server's word, not before.
  // `onChanged` keeps the group row (header, hub meta) in step.
  const [hiddenSheet, setHiddenSheet] = useState(false)
  const [hiddenBusy, setHiddenBusy] = useState(false)
  const hidden = !!group.hidden
  const toggleHidden = async () => {
    setHiddenBusy(true); hidden ? tap() : tapWarning()
    try { onChanged(await setGroupHidden(group.id, !hidden)); setHiddenSheet(false) } finally { setHiddenBusy(false) }
  }

  const roleTag = (m: GroupMember) => m.owner ? t('communities.owner') : m.manager ? t('communities.manager') : null

  return (
    <View style={s.ownedFill}>
      {/* Fixed head: share, settings and the member heading STAY PUT — only the
          roster below them scrolls (the waiting queue rides at its top). */}
      <View style={s.ownedHead}>
        <Button label={t('communities.shareInvite')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={share} />

        {/* Two WORDLESS buttons side by side (user directive 2026-07-27), where
            a two-row card used to be: the gear opens the group's config, the eye
            opens the play-here popup. Regular button height, split evenly, so
            they read as one strip under the share button. The waiting queue used
            to sit beside them as a second card; it now lives at the head of the
            roster instead — the people waiting to get in belong with the people
            already in, not in the settings stack. */}
        <View style={s.actionRow}>
          <View style={s.actionSlot}>
            <Button label="" variant="secondary" size="lg" iconStart={<GearGlyph />} onPress={onOpenSettings} />
          </View>
          {/* Manage without playing. With no label left to say it, the EYE alone
              carries the state: open = playing here, crossed out = hidden. The
              button keeps the same recessive skin either way (user directive
              2026-07-27: no purple fill to mark it on) — the glyph is the whole
              signal. The sentence that explains it lives in the popup it opens.
              It rides here rather than in Group settings because that page is
              the GROUP's config; this is the caller's own membership. */}
          <View style={s.actionSlot}>
            <Button
              label=""
              variant="secondary"
              size="lg"
              iconStart={hidden ? <EyeOffIcon color={GREEN} size={ICON.md} /> : <EyeOpenIcon color={GREEN} size={ICON.md} />}
              onPress={() => setHiddenSheet(true)}
            />
          </View>
        </View>
        {/* No description here (user directive 2026-07-27): it only ate the
            roster's height, and it is one tap away in Group settings, where it
            is also edited. */}

        {/* The count rides in on the group row itself, so the heading is painted
            from the first frame and only the roster below it waits. */}
        <Text style={s.section}>{memberLabel(members?.length ?? group.members)}</Text>
      </View>

      <ContainedRoster
        data={members}
        bottomInset={bottomInset}
        onTopMeasured={onRosterTop}
        keyOf={m => m.user_id}
        empty={<View style={s.card}><SkeletonRows rows={group.members} /></View>}
        // The waiting queue is the roster's FIRST row (user directive
        // 2026-07-27): built from the member row's own parts — the same
        // avatar-width leading lane, the same name type, the same padding — so
        // it lines up with the people below it, and wears the regular purple
        // (GREEN) plus the chevron that say it is an entry wanting an answer
        // rather than a person.
        header={requestCount > 0 ? (
          <Pressable
            // requestsRow last: rosterRowStyle paints the card's beige, and this
            // row is the pale purple one.
            style={[s.memberRow, s.rowFirst, ...rosterRowStyle(0, false), s.requestsRow]}
            onPress={() => { tap(); onOpenRequests() }}
          >
            <View style={s.requestsGlyph}><UserIcon color={GREEN} /></View>
            <Text style={[s.memberName, s.requestsInk]} numberOfLines={1}>{t('communities.requestsSectionJoin').replace('{count}', String(requestCount))}</Text>
            <ChevGlyph color={WHITE} />
          </Pressable>
        ) : null}
        row={(m, index, last) => {
          const tag = roleTag(m)
          // The header row, when there is one, owns the card's rounded top and
          // the first hairline-free edge, so the people below it stay flat.
          const first = index === 0 && requestCount === 0
          return (
            <Pressable
              style={[s.memberRow, first && s.rowFirst, ...rosterRowStyle(first ? 0 : index + 1, last)]}
              onPress={() => { tap(); onOpenMember(m) }}
            >
              <Avatar userId={m.user_id} name={m.name} image={m.image} />
              <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
              {tag ? <View style={s.tag}><Text style={s.tagInk}>{tag}</Text></View> : null}
            </Pressable>
          )
        }}
      />

      {/* The explanation, where there is room for it: same popup shape a member
          gets for a group they're in. One action, worded as what it will do. */}
      <BottomSheet visible={hiddenSheet} onDismiss={() => setHiddenSheet(false)}>
        <View style={s.sheetWrap}>
          <Text style={s.sheetTitle}>{t('communities.hiddenTitle')}</Text>
          <Text style={s.sheetDesc}>{t('communities.hiddenSub')}</Text>
          {/* The popup's one action is the regular purple button in BOTH
              directions (user directive 2026-07-27): coming back to play is as
              much the action of this sheet as leaving is, so it gets the same
              fill rather than a recessive grey. */}
          <Button
            label={hidden ? t('communities.hiddenOff') : t('communities.hiddenOn')}
            variant="primary"
            size="lg"
            iconStart={hidden ? <EyeOpenIcon color={WHITE} size={ICON.md} /> : <EyeOffIcon color={WHITE} size={ICON.md} />}
            loading={hiddenBusy}
            onPress={toggleHidden}
          />
        </View>
      </BottomSheet>
    </View>
  )
}

// ── Join requests (the waiting queue) ──────────────────────────────────────
// Its own sub-screen off the manage page: two long lists never share a screen,
// so a queue of forty is as usable as a queue of three. Reads and writes the
// SAME joinRequests / rosters caches the manage page uses, so it opens painted
// and the page behind it is already correct when it pops back.
function JoinRequestsView({ group, onOpen, bottomInset, onRosterTop }: { group: OwnedGroup; onOpen: (r: JoinRequestItem) => void; bottomInset: number; onRosterTop?: (y: number) => void }) {
  const cached = joinRequests.useValue(group.id)
  const [fetched, setFetched] = useState<JoinRequestItem[] | null>(null)
  // Cache-first: this page stays mounted under the requester's profile, and the
  // answer given there arrives as a cache write. See OwnedGroupView.
  const requests = cached ?? fetched

  const load = useCallback(() => {
    groupRequests(group.id)
      .then(list => { setFetched(list); joinRequests.set(group.id, list) })
      .catch(() => { if (!joinRequests.get(group.id)) setFetched([]) })
  }, [group.id])
  useEffect(load, [load])

  // Known before the list lands (the denormalized count on the group row), so
  // the heading and the placeholder are both truthful from the first frame.
  const count = requests?.length ?? group.pending ?? 0

  return (
    <View style={s.ownedFill}>
      <View style={s.ownedHead}>
        {/* The title bar already says "Join requests", so the heading under it
            says WHOSE queue this is: the group's name (user directive
            2026-07-27), not the same words a second time. */}
        <Text style={s.section} numberOfLines={1}>{group.name}</Text>
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
        keyOf={r => r.id}
        empty={requests == null
          ? <View style={s.card}><SkeletonRows rows={count} /></View>
          : <View style={s.card}><Empty text={t('communities.noRequests')} /></View>}
        row={(r, index, last) => (
          <NavRow
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

// ── A person's page ────────────────────────────────────────────────────────
// THE one profile surface of the communities sheet: the same card the app
// renders for a match, full-bleed under the floating back control, with the
// actions about that person pinned under it. A requester, a member and a friend
// are the same page with different buttons (user directive 2026-07-27) — no
// decision about a person is taken from a row or a popup any more.
// The profiles the server sends here carry NO distance: being in a group with
// someone, or waiting at their door, is not consent to reveal where you are.
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
  /** The action bar's buttons. */
  children: React.ReactNode
}) {
  return (
    <View style={s.profileFill}>
      {profile ? (
        // chromeInset lines the card's name/age chip up with the floating back
        // control, exactly as the own-profile preview does.
        <MatchCard match={profile} actions={[]} bottomInset={0} chromeInset={insets.top} />
      ) : (
        <View style={[s.content, s.profileBare]}>
          <View style={s.card}>
            <View style={[s.memberRow, s.rowFirst]}>
              <Avatar userId={userId} name={name} image={image} />
              <Text style={s.memberName} numberOfLines={1}>{name}</Text>
            </View>
          </View>
        </View>
      )}
      <View style={[s.profileBar, { paddingBottom: bottomGap(insets.bottom, MD) }]}>
        {!!caption && <Text style={s.profileBarCaption} numberOfLines={2}>{caption}</Text>}
        {children}
      </View>
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
        iconStart={<CheckIcon color={WHITE} size={ICON.md} />}
        loading={busy === 'accept'} disabled={!!busy}
        onPress={() => respond(true)}
      />
      <Button
        label={t('communities.declineJoin')} variant="secondary" size="lg"
        iconStart={<CloseIcon color={INK} size={ICON.md} />}
        loading={busy === 'decline'} disabled={!!busy}
        onPress={() => respond(false)}
      />
    </ProfilePage>
  )
}

// A member of a group you manage, or one of your friends. Everything that used
// to sit in the member-actions BottomSheet or on a friend row lives here.
function PersonProfileView({ person, onDone, insets }: {
  person: PersonTarget
  /** Pop back: the person is no longer in the list behind this page. */
  onDone: () => void
  insets: { top: number; bottom: number }
}) {
  const [busy, setBusy] = useState<'manager' | 'remove' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

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
            iconStart={<UserMinusIcon color={INK} size={ICON.md} />}
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
  // The owner is untouchable, and a manager may only act on a plain member.
  const canAct = !m.owner && (iAmOwner || !m.manager)
  const doSetManager = async () => {
    setBusy('manager'); tap()
    try { rosters.set(group.id, await setManager(group.id, m.user_id, !m.manager)) } finally { setBusy(null); onDone() }
  }
  const doRemove = async () => {
    setBusy('remove'); tapWarning()
    try { rosters.set(group.id, await removeMember(group.id, m.user_id)) } finally { setBusy(null); setConfirmRemove(false); onDone() }
  }

  return (
    <>
      <ProfilePage profile={m.profile} userId={m.user_id} name={m.name} image={m.image} insets={insets}>
        {iAmOwner && canAct ? (
          <Button
            label={m.manager ? t('communities.removeManager') : t('communities.makeManager')}
            variant="primary" size="lg"
            iconStart={<UserIcon color={WHITE} size={ICON.md} />}
            loading={busy === 'manager'} disabled={!!busy}
            onPress={doSetManager}
          />
        ) : null}
        {canAct ? (
          <Button
            label={t('communities.removeFromGroup')} variant="secondary" size="lg"
            iconStart={<UserMinusIcon color={INK} size={ICON.md} />}
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
    </>
  )
}

// ── Group settings (name / description / visibility / join policy / delete) ──
// Reached from the manage page's settings summary row. Owner + managers edit
// name/description/visibility/join-policy; only the owner can delete.
function GroupSettingsView({ group, onChanged, onDeleted }: { group: OwnedGroup; onChanged: (g: OwnedGroup) => void; onDeleted: () => void }) {
  const kb = useKeyboardHeight()
  const iAmOwner = !!group.is_owner
  const [kind, setKind] = useState<GroupKind>(groupKind(group))
  const [savingName, setSavingName] = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
  const saveName = async (next: string | null) => {
    if (!next) return  // min 1 keeps the field non-empty; guard anyway
    setSavingName(true)
    try { const g = await updateGroup(group.id, { name: next }); onChanged(g) } finally { setSavingName(false) }
  }
  const saveDescription = async (next: string | null) => {
    setSavingDesc(true)
    try { const g = await updateGroup(group.id, { description: next }); onChanged(g) } finally { setSavingDesc(false) }
  }
  const doDelete = async () => {
    setDeleting(true); tapWarning()
    try { await deleteGroup(group.id); dropGroupCaches(group.id); onDeleted() } finally { setDeleting(false); setConfirmDelete(false) }
  }

  return (
    <View style={{ gap: MD, marginBottom: kb }}>
      <Text style={s.section}>{t('communities.name')}</Text>
      <View style={s.descCard}>
        <EditableText
          value={group.name}
          saving={savingName}
          onCommit={saveName}
          min={1}
          max={60}
          singleLine
          placeholder={t('communities.namePlaceholder')}
          updateLabel={t('communities.descUpdate')}
          inputStyle={s.nameInput}
          footerStyle={s.descFooter}
          counterStyle={s.descCounter}
          counterWarnStyle={s.descCounterWarn}
        />
      </View>

      <Text style={s.section}>{t('communities.description')}</Text>
      <View style={s.descCard}>
        <EditableText
          value={group.description ?? ''}
          saving={savingDesc}
          onCommit={saveDescription}
          min={0}
          max={300}
          allowEmpty
          placeholder={t('communities.descriptionPlaceholder')}
          updateLabel={t('communities.descUpdate')}
          inputStyle={s.descEditorInput}
          footerStyle={s.descFooter}
          counterStyle={s.descCounter}
          counterWarnStyle={s.descCounterWarn}
        />
      </View>

      <Text style={s.section}>{t('communities.kindLabel')}</Text>
      <KindChooser value={kind} onChange={chooseKind} />

      {iAmOwner ? (
        <Button label={t('communities.deleteGroup')} variant="secondary" size="lg" iconStart={<TrashIcon color={INK} />} onPress={() => setConfirmDelete(true)} />
      ) : null}

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
function FindView() {
  const kb = useKeyboardHeight()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PublicGroup[] | null>(null)
  const [joined, setJoined] = useState<Record<string, boolean>>({})
  const [requested, setRequested] = useState<Record<string, boolean>>({})
  // Groups this account was already turned down by: the join control says so
  // rather than pretending the tap queued anything.
  const [declined, setDeclined] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<PublicGroup | null>(null)  // group-details popup
  const [cancelTarget, setCancelTarget] = useState<PublicGroup | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const seq = useRef(0)

  const doCancelJoin = async () => {
    if (!cancelTarget) return
    setCancelBusy(true); tapWarning()
    try {
      await cancelJoinRequest(cancelTarget.id)
      setRequested(m => ({ ...m, [cancelTarget.id]: false }))
      setCancelTarget(null)
    } finally { setCancelBusy(false) }
  }

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) { setResults(null); return }
    const mine = ++seq.current
    const h = setTimeout(() => {
      searchGroups(query).then(r => { if (mine === seq.current) setResults(r) }).catch(() => { if (mine === seq.current) setResults([]) })
    }, 300)
    return () => clearTimeout(h)
  }, [q])

  const joinPublic = (g: PublicGroup) => {
    tap()
    // Optimistically show the terminal state the server will land on: an
    // approval-gated group becomes a pending REQUEST, an open one joins.
    if (g.requires_approval) setRequested(m => ({ ...m, [g.id]: true }))
    else setJoined(m => ({ ...m, [g.id]: true }))
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
  // The join action, as the popup's primary button. Reflects the live
  // optimistic state (joined / requested) off the same maps the row does.
  // In the pending state it doubles as a cancel affordance: tapping opens
  // the same confirm the Hub's pending row opens.
  const joinControl = (g: PublicGroup) => {
    const isJoined = g.joined || joined[g.id]
    const isRequested = !isJoined && (g.requested || requested[g.id])
    if (isJoined) return <Button label={t('communities.joined')} variant="secondary" size="lg" disabled onPress={() => {}} />
    if (isRequested) return <Button label={t('communities.pending')} variant="secondary" size="lg" onPress={() => { tap(); setCancelTarget(g) }} />
    if (declined[g.id]) return <Button label={t('communities.declined')} variant="secondary" size="lg" disabled onPress={() => {}} />
    return <Button label={g.requires_approval ? t('communities.requestJoin') : t('communities.join')} variant="primary" size="lg" onPress={() => joinPublic(g)} />
  }

  return (
    <View style={{ gap: MD, marginBottom: kb }}>
      <View style={s.field}>
        <SearchGlyph color={GREEN_HALF} />
        <TextInput style={s.fieldInput} value={q} onChangeText={setQ} placeholder={t('communities.findSearch')} placeholderTextColor={BLACK_MID} autoFocus />
      </View>
      {q.trim().length >= 2 && (results == null ? (
        // Search results are three-line rows, so the placeholder is too.
        <View style={s.card}><SkeletonRows rows={3} lines={3} /></View>
      ) : results.length === 0 ? <Empty text={t('communities.noResults')} /> : (
        <View style={s.card}>
          {/* An informational row: owner avatar, full group name, who manages it,
              member count. Tapping opens the details popup (description + join);
              the row itself carries no action, so the name is never squeezed. */}
          {results.map((g, i) => (
            <Pressable
              key={g.id}
              onPress={() => { tap(); setPreview(g) }}
              style={({ pressed }) => [s.memberRow, i === 0 && s.rowFirst, pressed && { backgroundColor: GREEN_SOFT }]}
            >
              {g.owner_id ? (
                <Avatar userId={g.owner_id} name={g.owner_name ?? null} image={g.owner_image ?? null} />
              ) : (
                <View style={s.rowIcon}><GroupsIcon color={GREEN} /></View>
              )}
              <View style={s.rowText}>
                <Text style={s.rowTitle}>{g.name}</Text>
                {g.owner_name ? <Text style={s.rowMeta} numberOfLines={1}>{t('communities.managedBy').replace('{name}', g.owner_name)}</Text> : null}
                {/* Search only returns findable groups, so the kind here is
                    open or approved — which is exactly what a searcher wants to
                    know before tapping: instant, or a wait. */}
                <Text style={s.rowMeta} numberOfLines={1}>{metaLine(kindShort(groupKind({ is_public: true, requires_approval: g.requires_approval })), memberLabel(g.members))}</Text>
              </View>
              <ChevGlyph />
            </Pressable>
          ))}
        </View>
      ))}
      <Text style={s.note}>{t('communities.findNote')}</Text>

      {/* Group details popup: owner avatar, name, manager, members, the full
          description, and the join action. */}
      <BottomSheet visible={!!preview} onDismiss={() => setPreview(null)}>
        <View style={s.sheetWrap}>
          {preview?.owner_id ? (
            <View style={s.sheetAvatar}><Avatar userId={preview.owner_id} name={preview.owner_name ?? null} image={preview.owner_image ?? null} /></View>
          ) : null}
          <Text style={s.sheetTitle}>{preview?.name}</Text>
          {preview?.owner_name ? <Text style={s.sheetDesc}>{t('communities.managedBy').replace('{name}', preview.owner_name)}</Text> : null}
          <Text style={s.sheetDesc}>{preview ? metaLine(kindShort(groupKind({ is_public: true, requires_approval: preview.requires_approval })), memberLabel(preview.members)) : ''}</Text>
          {preview?.description ? <Text style={s.sheetDesc}>{preview.description}</Text> : null}
          {preview ? joinControl(preview) : null}
        </View>
      </BottomSheet>
      <ConfirmDialog
        visible={!!cancelTarget}
        title={cancelTarget ? t('communities.cancelJoinTitle').replace('{name}', cancelTarget.name) : ''}
        description={t('communities.cancelJoinDesc')}
        confirmLabel={t('communities.cancelJoinConfirm')}
        busy={cancelBusy}
        onCancel={() => setCancelTarget(null)}
        onConfirm={doCancelJoin}
        draggable
      />
    </View>
  )
}

// ── shared bits ────────────────────────────────────────────────────────────
const Empty = ({ text }: { text: string }) => <Text style={s.empty}>{text}</Text>

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: MD, paddingTop: SM, gap: SM },
  // A group page fills the sheet: a fixed head plus the roster's scroll region,
  // MD apart, the same gap the page's blocks had while it all scrolled.
  ownedFill: { flex: 1, gap: MD },
  ownedHead: { gap: MD },
  // The wordless pair under the share button: equal halves, the same MD gutter
  // the head's blocks keep between them.
  actionRow: { flexDirection: 'row', gap: MD },
  actionSlot: { flex: 1 },
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
  profileBarCaption: { fontSize: TEXT.md, fontWeight: WEIGHT.semibold, color: INK, textAlign: 'center' },
  // A stacked page: opaque, so the page it covers never shows through.
  layerCard: { flex: 1, backgroundColor: BG },
  rosterRow: { backgroundColor: SURFACE },
  rosterRowFirst: { borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS },
  rosterRowLast: { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS },
  card: { backgroundColor: SURFACE, borderRadius: RADIUS, overflow: 'hidden' },
  // The waiting-queue entry, the roster's first row: a member row filled with
  // the regular purple (user directive 2026-07-27) so it stands off the beige
  // rows under it. Its leading lane is an avatar-sized disc, so the names below
  // it start on exactly the same line — beige on the purple, the inverse of the
  // photo-less member's purple disc on beige.
  requestsRow: { backgroundColor: GREEN },
  requestsInk: { color: WHITE },
  requestsGlyph: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: MD, paddingHorizontal: MD, paddingVertical: MD, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER_SOFT },
  rowFirst: { borderTopWidth: 0 },
  rowIcon: { width: AVATAR, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: XS },
  rowTitle: { fontSize: TEXT.md, fontWeight: WEIGHT.extrabold, color: INK },
  rowMeta: { fontSize: TEXT.sm, color: GREEN_HALF },
  section: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: GREEN_HALF, marginTop: MD, marginStart: XS },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: MD, paddingHorizontal: MD, paddingVertical: SM, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER_SOFT },
  memberName: { flex: 1, minWidth: 0, fontSize: TEXT.md, fontWeight: WEIGHT.semibold, color: INK },
  tag: { paddingHorizontal: SM, paddingVertical: XS, borderRadius: RADIUS, backgroundColor: GREEN_SOFT },
  tagInk: { fontSize: TEXT.xs, fontWeight: WEIGHT.extrabold, color: GREEN },
  sheetWrap: { paddingHorizontal: MD, paddingBottom: MD, gap: SM },
  sheetAvatar: { alignItems: 'center', paddingBottom: XS },
  sheetTitle: { fontSize: TEXT.lg, fontWeight: WEIGHT.extrabold, color: INK, textAlign: 'center', paddingBottom: XS },
  sheetDesc: { fontSize: TEXT.sm, color: INK, textAlign: 'center', lineHeight: lhSm() },
  // Group-description editor card (hosts the shared EditableText). The input is
  // a plain readable block; the footer mirrors the bio editor's counter+Update.
  descCard: { backgroundColor: SURFACE, borderRadius: RADIUS, padding: MD, gap: SM },
  descEditorInput: { fontSize: TEXT.md, color: INK, padding: 0, minHeight: 54, lineHeight: lhSm(), includeFontPadding: false },
  nameInput: { fontSize: TEXT.md, color: INK, fontWeight: WEIGHT.extrabold, padding: 0, includeFontPadding: false },
  descFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: MD },
  descCounter: { fontSize: TEXT.sm, color: GREEN_HALF },
  descCounterWarn: { color: INK },
  descInput: { minHeight: 54, paddingTop: 0 },
  pillBtn: { paddingHorizontal: MD, paddingVertical: SM, borderRadius: RADIUS },
  pillBtnInk: { fontSize: TEXT.sm, fontWeight: WEIGHT.extrabold, color: WHITE },
  note: { fontSize: TEXT.sm, color: GREEN_HALF, lineHeight: lhSm(), marginStart: XS, marginTop: XS },
  sheetNote: { fontSize: TEXT.sm, color: GREEN_HALF, lineHeight: lhSm(), textAlign: 'center', marginTop: XS },
  empty: { fontSize: TEXT.sm, color: GREEN_HALF, textAlign: 'center', paddingVertical: LG },
  field: { ...FIELD_SKIN, flexDirection: 'row', alignItems: 'center', gap: SM, paddingHorizontal: MD, paddingVertical: MD },
  fieldInput: { flex: 1, fontSize: TEXT.md, color: INK, padding: 0 },
  codeInput: { textAlign: 'center', letterSpacing: LG, fontWeight: WEIGHT.extrabold },
  toggle: { flexDirection: 'row', backgroundColor: GREEN_SOFT, borderRadius: RADIUS, padding: XS, gap: XS },
  // The kind chooser is the same fabric as `toggle`, stacked: three stops, each
  // with the sentence that explains it, so the list reads top to bottom.
  kindList: { backgroundColor: GREEN_SOFT, borderRadius: RADIUS, padding: XS, gap: XS },
  kindItem: { paddingVertical: SM, paddingHorizontal: SM, borderRadius: RADIUS, gap: XS },
  toggleItem: { flex: 1, alignItems: 'center', paddingVertical: SM, borderRadius: RADIUS, gap: XS },
  toggleOn: { backgroundColor: SURFACE },
  toggleTitle: { fontSize: TEXT.md, fontWeight: WEIGHT.extrabold, color: GREEN_HALF },
  toggleSub: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: GREEN_HALF },
})

// Body line-height for the muted note (kept a small helper so the ratio lives
// in one place rather than as an inline literal at the style site).
function lhSm() { return Math.round(TEXT.sm * 1.5) }
