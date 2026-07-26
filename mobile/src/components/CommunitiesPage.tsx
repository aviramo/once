// ── CommunitiesPage ────────────────────────────────────────────────────────
//
// The body of the Communities OverlaySheet (opened from the menu's
// "Communities" row). It is ONE sheet with an internal view stack — a hub that
// drills into: my friends, link-a-friend, a group you manage, a group you're
// in, create, and find/join. Swiping the sheet down (PullPane) closes the
// whole surface; the header's start control is a back arrow that pops the
// internal stack while there's somewhere to go, and the close X at the hub.
//
// Server: everything speaks to the phase-1 endpoints via src/lib/communities.
// Communities reuse the existing groups machinery; "my friends" is the derived
// friend-links set. See CLAUDE.md + project memory.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Pressable, ActivityIndicator, Share, I18nManager, Keyboard, TextInput as RNTextInput, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import { Path, Circle, Line } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, TextInput } from './AppText'
import { SheetHeader, type OverlaySheetBody } from './OverlaySheet'
import { PullContext, PullScrollView, type PullCtx } from './PullPane'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { BottomSheet } from './BottomSheet'
import { Glyph, GroupsIcon, TrashIcon, UserIcon, UserMinusIcon, SignOutIcon } from './icons'
import { tap, tapWarning } from '../lib/haptics'
import { t } from '../i18n'
import { useUserStore } from '../stores/userStore'

type StoreProfile = ReturnType<typeof useUserStore.getState>['profile']
import { Avatar, memberLabel, AVATAR } from './CommunityBits'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { shareFriendInvite } from '../lib/referral'
import { groupInviteUrl } from '../lib/links'
import { EditableText } from './EditableText'
import {
  ownedGroups, myGroups, myFriends, groupMembers, removeMember, deleteGroup,
  updateGroup, createGroup, searchGroups, redeemInvite, leaveGroup, setManager,
  friendRespond, unfriend, communitiesSummary, cancelJoinRequest,
  groupRequests, respondJoin,
  type OwnedGroup, type GroupMember, type MyFriends, type PublicGroup,
  type FriendItem, type CommunitiesSummary, type JoinedGroup, type PendingGroup,
  type JoinRequestItem,
} from '../lib/communities'
import { XS, SM, MD, LG, XL, RADIUS, TEXT, WEIGHT, ICON } from '../tokens'
import { BG, SURFACE, INK, GREEN, GREEN_HALF, PRIMARY, BORDER_SOFT, GREEN_SOFT, WHITE, BLACK_MID } from '../colors'
import { FIELD_SKIN } from '../field'

const ChevGlyph = () => (
  // Disclosure chevron points in the reading-forward direction: right in LTR,
  // mirrored to left under RTL (same treatment as BackIcon in icons.tsx).
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={GREEN_HALF} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
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

// ── View stack ─────────────────────────────────────────────────────────────
type CView =
  | { k: 'hub' }
  | { k: 'friends' }
  | { k: 'find' }
  | { k: 'create' }
  | { k: 'owned'; group: OwnedGroup }
  | { k: 'settings'; group: OwnedGroup }

const titleFor = (v: CView): string => {
  switch (v.k) {
    case 'hub': return t('communities.title')
    case 'friends': return t('communities.myFriends')
    case 'find': return t('communities.findTitle')
    case 'create': return t('communities.newGroup')
    case 'owned': return v.group.name
    case 'settings': return t('communities.settings')
  }
}

export function CommunitiesPage({
  onClose, onRegisterBack, initialGroupId, onTargetConsumed,
  dismissGestureRef, onScrollAtTop, headerBottomShared, pulling,
}: OverlaySheetBody & {
  onClose: () => void
  onRegisterBack: (fn: () => boolean) => void
  /** A group a notification tap wants to open directly (deep-link). */
  initialGroupId?: string | null
  onTargetConsumed?: () => void
}) {
  const insets = useSafeAreaInsets()
  const profile = useUserStore(st => st.profile)

  const [stack, setStack] = useState<CView[]>([{ k: 'hub' }])
  const view = stack[stack.length - 1]
  const push = useCallback((v: CView) => setStack(sk => [...sk, v]), [])
  const pop = useCallback(() => setStack(sk => (sk.length > 1 ? sk.slice(0, -1) : sk)), [])

  // Deep-link: open straight to a managed group's page (from a group_join push).
  // Fetch the owned/managed groups, drill into the match, then clear the target.
  useEffect(() => {
    if (!initialGroupId) return
    let alive = true
    ownedGroups()
      .then(list => {
        const g = list.find(x => x.id === initialGroupId)
        if (alive && g) setStack([{ k: 'hub' }, { k: 'owned', group: g }])
      })
      .finally(() => onTargetConsumed?.())
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroupId])

  // Hardware-back: pop the internal stack first; only at the hub let the sheet
  // close (return false so home's BackHandler falls through to closing it).
  useEffect(() => {
    onRegisterBack(() => {
      if (stack.length > 1) { pop(); return true }
      return false
    })
  }, [stack.length, pop, onRegisterBack])

  const pullCtx = useMemo<PullCtx>(() => ({
    panRef: dismissGestureRef, extraRefs: [], setScrollAtTop: onScrollAtTop, pulling,
  }), [dismissGestureRef, onScrollAtTop, pulling])

  // Keyboard auto-scroll: when the keyboard opens, scroll the focused input up
  // so it clears the keyboard. Compares the keyboard's real top edge
  // (endCoordinates.screenY) with the input's measured window position, so it
  // works whether or not the overlay itself resizes under the keyboard.
  const scrollRef = useRef<any>(null)
  const scrollY = useRef(0)
  useEffect(() => {
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
  }, [])

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

  const goBack = () => { tap(); if (stack.length > 1) pop(); else onClose() }

  return (
    <PullContext.Provider value={pullCtx}>
      <View style={s.root}>
        <SheetHeader
          title={titleFor(view)}
          // 2 lines only for a group name (may be long); the fixed labels are
          // short and must stay on ONE line — with 2 lines a flexShrink title
          // collapses to its longest word and a multi-word label like "Join a
          // group" breaks apart ("Join a" / "group").
          titleLines={view.k === 'owned' ? 2 : 1}
          topInset={insets.top}
          // Match the page background (BG), not the default light-beige SURFACE,
          // so the header blends into the Communities page instead of sitting on
          // a lighter band.
          barBg={BG}
          closeIcon={stack.length > 1 ? 'back' : 'close'}
          onClose={goBack}
          onMeasured={h => { headerBottomShared.value = h }}
        />
        <PullScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + XL }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = e.nativeEvent.contentOffset.y }}
        >
          {view.k === 'hub' && <HubView push={push} />}
          {view.k === 'friends' && <FriendsView profile={profile} />}
          {view.k === 'find' && <FindView />}
          {view.k === 'create' && <CreateView onCreated={g => setStack([{ k: 'hub' }, { k: 'owned', group: g }])} />}
          {view.k === 'owned' && <OwnedGroupView group={view.group} onChanged={applyGroup} onOpenSettings={() => push({ k: 'settings', group: view.group })} />}
          {view.k === 'settings' && <GroupSettingsView group={view.group} onChanged={applyGroup} onDeleted={() => removeGroupViews(view.group.id)} />}
        </PullScrollView>
      </View>
    </PullContext.Provider>
  )
}

// ── Hub ────────────────────────────────────────────────────────────────────
function HubView({ push }: { push: (v: CView) => void }) {
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
        setFallback({ managed: o, joined: all.filter(g => !ids.has(g.id)), pending: [], friends: f.friends.length, requests: f.requests.length })
      })
      .catch(() => { if (alive) setFallback({ managed: [], joined: [], pending: [], friends: 0, requests: 0 }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!summary])

  const data = summary ?? fallback
  const loading = data == null
  const [joinedSheet, setJoinedSheet] = useState<JoinedGroup | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingGroup | null>(null)
  const [pendingBusy, setPendingBusy] = useState(false)
  const doCancelJoin = async () => {
    if (!pendingConfirm) return
    setPendingBusy(true); tapWarning()
    try { await cancelJoinRequest(pendingConfirm.id); setPendingConfirm(null) } finally { setPendingBusy(false) }
  }
  // "public/private · N members" like the managed rows. Undefined for the
  // degraded fallback payload (old summary shape carried no type/count).
  const joinedMeta = (g: JoinedGroup) =>
    g.is_public === undefined
      ? undefined
      : `${g.is_public ? t('communities.public') : t('communities.private')} · ${memberLabel(g.members ?? 0)}`
  const friendsMeta = data
    ? (data.requests > 0
        ? `${t('communities.private')} · ${t('communities.friendsCount').replace('{count}', String(data.friends))} · ${t('communities.requestsChip').replace('{count}', String(data.requests))}`
        : `${t('communities.private')} · ${t('communities.friendsCount').replace('{count}', String(data.friends))}`)
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
        {loading ? <Loading /> : data!.managed.length === 0 ? (
          <Empty text={t('communities.emptyManage')} />
        ) : data!.managed.map((g, i) => {
          const base = `${g.is_public ? t('communities.public') : t('communities.private')} · ${memberLabel(g.members)}`
          const meta = g.pending && g.pending > 0
            ? `${base} · ${t('communities.pendingBadge').replace('{count}', String(g.pending))}`
            : base
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
        {loading ? <Loading /> : (data!.joined.length === 0 && data!.pending.length === 0) ? (
          <Empty text={t('communities.emptyIn')} />
        ) : (
          <>
            {/* Pending join requests render first with a distinct "waiting for
                approval" meta. Tapping opens the shared cancel confirm — the
                same popup the FindView pending button opens. */}
            {data!.pending.map((g, i) => (
              <NavRow key={`p-${g.id}`} first={i === 0} title={g.name} meta={t('communities.pending')} onPress={() => setPendingConfirm(g)} />
            ))}
            {data!.joined.map((g, i) => (
              <NavRow key={g.id} first={data!.pending.length === 0 && i === 0} title={g.name} meta={joinedMeta(g)} onPress={() => setJoinedSheet(g)} />
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
    try { await leaveGroup(group.id); onClose() } finally { setBusy(false); setConfirm(false) }
  }

  return (
    <>
      <BottomSheet visible={!!group && !confirm} onDismiss={onClose}>
        <View style={s.sheetWrap}>
          <Text style={s.sheetTitle} numberOfLines={1}>{group?.name}</Text>
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
function NavRow({ icon, title, meta, first, onPress }: { icon?: React.ReactNode; title: string; meta?: string; first?: boolean; onPress: () => void }) {
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      onPress={() => { tap(); onPress() }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[s.row, first && s.rowFirst, pressed && { backgroundColor: GREEN_SOFT }]}
    >
      {icon ? <View style={s.rowIcon}>{icon}</View> : null}
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
        {meta ? <Text style={s.rowMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      <ChevGlyph />
    </Pressable>
  )
}

// ── My friends ─────────────────────────────────────────────────────────────
function FriendsView({ profile }: { profile: StoreProfile }) {
  const [data, setData] = useState<MyFriends | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmUnfriend, setConfirmUnfriend] = useState<FriendItem | null>(null)

  const load = useCallback(() => { myFriends().then(setData).catch(() => setData({ friends: [], requests: [] })) }, [])
  useEffect(load, [load])

  const respond = async (id: string, accept: boolean) => {
    if (busy) return
    setBusy(id); tap()
    try { await friendRespond(id, accept) } finally { setBusy(null); load() }
  }
  const doUnfriend = async (f: FriendItem) => {
    setBusy(f.user_id); tapWarning()
    try { await unfriend(f.user_id) } finally { setBusy(null); setConfirmUnfriend(null); load() }
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

      <Text style={s.section}>{data ? t('communities.friendsCount').replace('{count}', String(data.friends.length)) : ' '}</Text>
      <View style={s.card}>
        {data == null ? <Loading /> : data.friends.length === 0 ? (
          <Empty text={t('communities.noFriends')} />
        ) : data.friends.map((f, i) => (
          <View key={f.user_id} style={[s.memberRow, i === 0 && s.rowFirst]}>
            <Avatar userId={f.user_id} name={f.name} image={f.image} />
            <Text style={s.memberName} numberOfLines={1}>{f.name}</Text>
            <Pressable style={[s.pillBtn, { backgroundColor: GREEN_SOFT }]} onPress={() => setConfirmUnfriend(f)} disabled={!!busy}>
              <Text style={[s.pillBtnInk, { color: GREEN }]}>{t('communities.remove')}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {data && data.friends.length > 0 ? <Text style={s.note}>{t('communities.mutualNote')}</Text> : null}

      <ConfirmDialog
        visible={!!confirmUnfriend}
        title={confirmUnfriend ? t('communities.unfriendTitle').replace('{name}', confirmUnfriend.name ?? '') : ''}
        description={t('communities.unfriendDesc')}
        confirmLabel={t('communities.unfriendConfirm')}
        confirmIconStart={<UserMinusIcon color={WHITE} />}
        busy={!!busy}
        onCancel={() => setConfirmUnfriend(null)}
        onConfirm={() => confirmUnfriend && doUnfriend(confirmUnfriend)}
        draggable
      />
    </View>
  )
}

// ── Create a group ─────────────────────────────────────────────────────────
function CreateView({ onCreated }: { onCreated: (g: OwnedGroup) => void }) {
  const kb = useKeyboardHeight()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (busy || name.trim().length === 0) return
    setBusy(true); tap()
    try {
      const g = await createGroup(name.trim(), isPublic, {
        description: description.trim() || null,
        requires_approval: requiresApproval,
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
      <Text style={s.section}>{t('communities.whoCanFind')}</Text>
      <View style={s.toggle}>
        <Pressable style={[s.toggleItem, !isPublic && s.toggleOn]} onPress={() => { tap(); setIsPublic(false) }}>
          <Text style={[s.toggleTitle, !isPublic && { color: INK }]}>{t('communities.private')}</Text>
          <Text style={s.toggleSub}>{t('communities.privateSub')}</Text>
        </Pressable>
        <Pressable style={[s.toggleItem, isPublic && s.toggleOn]} onPress={() => { tap(); setIsPublic(true) }}>
          <Text style={[s.toggleTitle, isPublic && { color: INK }]}>{t('communities.public')}</Text>
          <Text style={s.toggleSub}>{t('communities.publicSub')}</Text>
        </Pressable>
      </View>
      <Text style={s.note}>{t('communities.privacyNote')}</Text>
      <Text style={s.section}>{t('communities.joining')}</Text>
      <View style={s.toggle}>
        <Pressable style={[s.toggleItem, !requiresApproval && s.toggleOn]} onPress={() => { tap(); setRequiresApproval(false) }}>
          <Text style={[s.toggleTitle, !requiresApproval && { color: INK }]}>{t('communities.approvalOff')}</Text>
          <Text style={s.toggleSub}>{t('communities.approvalOffSub')}</Text>
        </Pressable>
        <Pressable style={[s.toggleItem, requiresApproval && s.toggleOn]} onPress={() => { tap(); setRequiresApproval(true) }}>
          <Text style={[s.toggleTitle, requiresApproval && { color: INK }]}>{t('communities.approvalOn')}</Text>
          <Text style={s.toggleSub}>{t('communities.approvalOnSub')}</Text>
        </Pressable>
      </View>
      <Button label={t('communities.createAction')} variant="primary" size="lg" iconStart={<GroupsIcon color={WHITE} />} loading={busy} disabled={name.trim().length === 0} onPress={create} />
    </View>
  )
}

// ── A group you manage ─────────────────────────────────────────────────────
// Slim landing page: share, a short settings SUMMARY that drills into the
// settings sub-screen, the pending join requests, and the member roster. All
// the editable config (name / description / public / approval / delete) lives
// in GroupSettingsView below.
function OwnedGroupView({ group, onChanged, onOpenSettings }: { group: OwnedGroup; onChanged: (g: OwnedGroup) => void; onOpenSettings: () => void }) {
  const iAmOwner = !!group.is_owner
  const [members, setMembers] = useState<GroupMember[] | null>(null)
  const [requests, setRequests] = useState<JoinRequestItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<GroupMember | null>(null)  // member-actions sheet
  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null)

  const load = useCallback(() => { groupMembers(group.id).then(setMembers).catch(() => setMembers([])) }, [group.id])
  useEffect(load, [load])
  // Pending join requests (only meaningful while approval is on, but harmless
  // to fetch either way — the server returns [] when there are none).
  const loadRequests = useCallback(() => { groupRequests(group.id).then(setRequests).catch(() => setRequests([])) }, [group.id])
  useEffect(loadRequests, [loadRequests])

  // I can open the actions sheet on a member if I'm the owner (anyone but
  // myself-as-owner), or a manager acting on a non-manager.
  const canAct = (m: GroupMember) => !m.owner && (iAmOwner || !m.manager)
  const canRemove = (m: GroupMember) => !m.owner && (iAmOwner || !m.manager)

  const share = () => { tap(); Share.share({ message: t('communities.shareMessage').replace('{name}', group.name).replace('{link}', groupInviteUrl(group.invite_code)) }) }
  const respond = async (r: JoinRequestItem, accept: boolean) => {
    setBusy(r.id); accept ? tap() : tapWarning()
    try {
      const fresh = await respondJoin(r.id, accept)
      setRequests(fresh.requests)
      if (accept) setMembers(fresh.members)
    } finally { setBusy(null) }
  }
  const doSetManager = async (m: GroupMember, make: boolean) => {
    setBusy(m.user_id); tap()
    try { const fresh = await setManager(group.id, m.user_id, make); setMembers(fresh) } finally { setBusy(null); setSelected(null) }
  }
  const doRemove = async (m: GroupMember) => {
    setBusy(m.user_id); tapWarning()
    try { const fresh = await removeMember(group.id, m.user_id); setMembers(fresh) } finally { setBusy(null); setConfirmRemove(null) }
  }

  const roleTag = (m: GroupMember) => m.owner ? t('communities.owner') : m.manager ? t('communities.manager') : null

  return (
    <View style={{ gap: MD }}>
      <Button label={t('communities.shareInvite')} variant="primary" size="lg" iconStart={<ShareGlyph color={WHITE} />} onPress={share} />

      {/* Entry to the settings sub-screen. */}
      <View style={s.card}>
        <NavRow first icon={<GearGlyph />} title={t('communities.settings')} onPress={onOpenSettings} />
      </View>
      {group.description ? <Text style={s.summaryDesc} numberOfLines={3}>{group.description}</Text> : null}

      {/* Pending join requests (approval-gated groups). */}
      {requests && requests.length > 0 ? (
        <>
          <Text style={s.section}>{t('communities.requestsSectionJoin').replace('{count}', String(requests.length))}</Text>
          <View style={s.card}>
            {requests.map((r, i) => (
              <View key={r.id} style={[s.memberRow, i === 0 && s.rowFirst]}>
                <Avatar userId={r.user_id} name={r.name} image={r.image} />
                <Text style={s.memberName} numberOfLines={1}>{r.name}</Text>
                <Pressable style={[s.pillBtn, { backgroundColor: PRIMARY }]} onPress={() => respond(r, true)} disabled={!!busy}>
                  <Text style={s.pillBtnInk}>{t('communities.approve')}</Text>
                </Pressable>
                <Pressable style={[s.pillBtn, { backgroundColor: GREEN_SOFT }]} onPress={() => respond(r, false)} disabled={!!busy}>
                  <Text style={[s.pillBtnInk, { color: GREEN }]}>{t('communities.declineJoin')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={s.section}>{members ? memberLabel(members.length) : ' '}</Text>
      <View style={s.card}>
        {members == null ? <Loading /> : members.map((m, i) => {
          const tag = roleTag(m)
          const actionable = canAct(m)
          return (
            <Pressable
              key={m.user_id}
              style={[s.memberRow, i === 0 && s.rowFirst]}
              disabled={!actionable}
              onPress={actionable ? () => { tap(); setSelected(m) } : undefined}
            >
              <Avatar userId={m.user_id} name={m.name} image={m.image} />
              <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
              {tag ? <View style={s.tag}><Text style={s.tagInk}>{tag}</Text></View> : null}
            </Pressable>
          )
        })}
      </View>

      {/* Member actions: promote/demote (owner only) + remove. */}
      <BottomSheet visible={!!selected} onDismiss={() => setSelected(null)}>
        <View style={s.sheetWrap}>
          <Text style={s.sheetTitle} numberOfLines={1}>{selected?.name}</Text>
          {iAmOwner && selected && !selected.owner ? (
            <Button
              label={selected.manager ? t('communities.removeManager') : t('communities.makeManager')}
              variant="primary" size="lg"
              iconStart={<UserIcon color={WHITE} />}
              loading={busy === selected.user_id}
              onPress={() => selected && doSetManager(selected, !selected.manager)}
            />
          ) : null}
          {selected && canRemove(selected) ? (
            <Button
              label={t('communities.removeFromGroup')}
              variant="secondary" size="lg"
              onPress={() => { const m = selected; setSelected(null); setConfirmRemove(m) }}
            />
          ) : null}
        </View>
      </BottomSheet>

      <ConfirmDialog
        visible={!!confirmRemove}
        title={confirmRemove ? t('communities.removeMemberTitle').replace('{name}', confirmRemove.name ?? '') : ''}
        description={t('communities.removeMemberDesc')}
        confirmLabel={t('communities.remove')}
        confirmIconStart={<UserMinusIcon color={WHITE} />}
        busy={!!busy}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && doRemove(confirmRemove)}
        draggable
      />
    </View>
  )
}

// ── Group settings (name / description / visibility / join policy / delete) ──
// Reached from the manage page's settings summary row. Owner + managers edit
// name/description/visibility/join-policy; only the owner can delete.
function GroupSettingsView({ group, onChanged, onDeleted }: { group: OwnedGroup; onChanged: (g: OwnedGroup) => void; onDeleted: () => void }) {
  const kb = useKeyboardHeight()
  const iAmOwner = !!group.is_owner
  const [isPublic, setIsPublic] = useState(group.is_public)
  const [requiresApproval, setRequiresApproval] = useState(!!group.requires_approval)
  const [savingName, setSavingName] = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const setPublic = async (next: boolean) => {
    if (next === isPublic) return
    tap(); setIsPublic(next)
    try { const g = await updateGroup(group.id, { is_public: next }); onChanged(g) } catch { setIsPublic(!next) }
  }
  const setApproval = async (next: boolean) => {
    if (next === requiresApproval) return
    tap(); setRequiresApproval(next)
    try { const g = await updateGroup(group.id, { requires_approval: next }); onChanged(g) } catch { setRequiresApproval(!next) }
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
    try { await deleteGroup(group.id); onDeleted() } finally { setDeleting(false); setConfirmDelete(false) }
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

      <Text style={s.section}>{t('communities.whoCanFind')}</Text>
      <View style={s.toggle}>
        <Pressable style={[s.toggleItem, !isPublic && s.toggleOn]} onPress={() => setPublic(false)}>
          <Text style={[s.toggleTitle, !isPublic && { color: INK }]}>{t('communities.private')}</Text>
          <Text style={s.toggleSub}>{t('communities.privateSub')}</Text>
        </Pressable>
        <Pressable style={[s.toggleItem, isPublic && s.toggleOn]} onPress={() => setPublic(true)}>
          <Text style={[s.toggleTitle, isPublic && { color: INK }]}>{t('communities.public')}</Text>
          <Text style={s.toggleSub}>{t('communities.publicSub')}</Text>
        </Pressable>
      </View>

      <Text style={s.section}>{t('communities.joining')}</Text>
      <View style={s.toggle}>
        <Pressable style={[s.toggleItem, !requiresApproval && s.toggleOn]} onPress={() => setApproval(false)}>
          <Text style={[s.toggleTitle, !requiresApproval && { color: INK }]}>{t('communities.approvalOff')}</Text>
          <Text style={s.toggleSub}>{t('communities.approvalOffSub')}</Text>
        </Pressable>
        <Pressable style={[s.toggleItem, requiresApproval && s.toggleOn]} onPress={() => setApproval(true)}>
          <Text style={[s.toggleTitle, requiresApproval && { color: INK }]}>{t('communities.approvalOn')}</Text>
          <Text style={s.toggleSub}>{t('communities.approvalOnSub')}</Text>
        </Pressable>
      </View>
      <Text style={s.note}>{requiresApproval ? t('communities.approvalOnNote') : t('communities.approvalOffNote')}</Text>

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
    return <Button label={g.requires_approval ? t('communities.requestJoin') : t('communities.join')} variant="primary" size="lg" onPress={() => joinPublic(g)} />
  }

  return (
    <View style={{ gap: MD, marginBottom: kb }}>
      <View style={s.field}>
        <SearchGlyph color={GREEN_HALF} />
        <TextInput style={s.fieldInput} value={q} onChangeText={setQ} placeholder={t('communities.findSearch')} placeholderTextColor={BLACK_MID} autoFocus />
      </View>
      {q.trim().length >= 2 && (results == null ? <Loading /> : results.length === 0 ? <Empty text={t('communities.noResults')} /> : (
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
                <Text style={s.rowMeta} numberOfLines={1}>{memberLabel(g.members)}</Text>
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
          <Text style={s.sheetDesc}>{preview ? memberLabel(preview.members) : ''}</Text>
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
const Loading = () => <View style={s.loading}><ActivityIndicator color={GREEN} /></View>
const Empty = ({ text }: { text: string }) => <Text style={s.empty}>{text}</Text>

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: MD, paddingTop: SM, gap: SM },
  card: { backgroundColor: SURFACE, borderRadius: RADIUS, overflow: 'hidden' },
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
  summaryDesc: { fontSize: TEXT.sm, color: INK, lineHeight: lhSm(), marginStart: XS },
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
  loading: { padding: LG, alignItems: 'center' },
  field: { ...FIELD_SKIN, flexDirection: 'row', alignItems: 'center', gap: SM, paddingHorizontal: MD, paddingVertical: MD },
  fieldInput: { flex: 1, fontSize: TEXT.md, color: INK, padding: 0 },
  codeInput: { textAlign: 'center', letterSpacing: LG, fontWeight: WEIGHT.extrabold },
  toggle: { flexDirection: 'row', backgroundColor: GREEN_SOFT, borderRadius: RADIUS, padding: XS, gap: XS },
  toggleItem: { flex: 1, alignItems: 'center', paddingVertical: SM, borderRadius: RADIUS, gap: XS },
  toggleOn: { backgroundColor: SURFACE },
  toggleTitle: { fontSize: TEXT.md, fontWeight: WEIGHT.extrabold, color: GREEN_HALF },
  toggleSub: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold, color: GREEN_HALF },
})

// Body line-height for the muted note (kept a small helper so the ratio lives
// in one place rather than as an inline literal at the style site).
function lhSm() { return Math.round(TEXT.sm * 1.5) }
