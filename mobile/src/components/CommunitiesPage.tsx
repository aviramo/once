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
import { View, StyleSheet, Image, Pressable, ActivityIndicator, Share } from 'react-native'
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
import { publicImageUrl } from '../lib/api'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { type Group } from '../lib/groups'
import { shareReferral } from '../lib/referral'
import { groupInviteUrl } from '../lib/links'
import {
  ownedGroups, myGroups, myFriends, groupMembers, removeMember, deleteGroup,
  updateGroup, createGroup, searchGroups, redeemInvite, leaveGroup, setManager,
  searchPeople, friendRequest, friendRespond, unfriend, communitiesSummary,
  type OwnedGroup, type GroupMember, type MyFriends, type PublicGroup,
  type Person, type FriendItem, type MemberImage, type CommunitiesSummary,
} from '../lib/communities'
import { XS, SM, MD, LG, XL, RADIUS, TEXT, WEIGHT, ICON } from '../tokens'
import { BG, SURFACE, INK, GREEN, GREEN_HALF, PRIMARY, BORDER_SOFT, GREEN_SOFT, WHITE, BLACK_MID } from '../colors'
import { FIELD_SKIN } from '../field'

const AVATAR = 40
const AVATAR_LG = 60

// A member's / person's main photo, or their initial on a brand ground.
function Avatar({ userId, name, image, size = AVATAR }: { userId: string; name: string | null; image: MemberImage; size?: number }) {
  const uri = image?.normal ? publicImageUrl(userId, 'normal', image.normal) : null
  const label = (name ?? '').trim()
  const initial = label.charAt(0) || '?'
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
      {label === '★' ? (
        <StarGlyph size={size * 0.5} color={WHITE} />
      ) : (
        <Text style={{ color: WHITE, fontWeight: WEIGHT.extrabold, fontSize: size * 0.4 }}>{initial}</Text>
      )}
    </View>
  )
}

const StarGlyph = ({ size, color }: { size: number; color: string }) => (
  <Glyph width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
    <Path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.4l-5.8 3.05 1.1-6.47L2.6 9.35l6.5-.95z" />
  </Glyph>
)

const ChevGlyph = () => (
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={GREEN_HALF} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 5l7 7-7 7" />
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
const LinkGlyph = ({ color = GREEN }: { color?: string }) => (
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><Path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </Glyph>
)
const MoreGlyph = () => (
  <Glyph width={ICON.md} height={ICON.md} viewBox="0 0 24 24" fill={GREEN_HALF}>
    <Circle cx="5" cy="12" r="1.6" /><Circle cx="12" cy="12" r="1.6" /><Circle cx="19" cy="12" r="1.6" />
  </Glyph>
)

// ── View stack ─────────────────────────────────────────────────────────────
type CView =
  | { k: 'hub' }
  | { k: 'friends' }
  | { k: 'linkFriend' }
  | { k: 'find' }
  | { k: 'create' }
  | { k: 'owned'; group: OwnedGroup }
  | { k: 'member'; group: Group }

const titleFor = (v: CView): string => {
  switch (v.k) {
    case 'hub': return t('communities.title')
    case 'friends': return t('communities.myFriends')
    case 'linkFriend': return t('communities.linkTitle')
    case 'find': return t('communities.findTitle')
    case 'create': return t('communities.newGroup')
    case 'owned': return v.group.name
    case 'member': return v.group.name
  }
}

export function CommunitiesPage({
  onClose, onRegisterBack,
  dismissGestureRef, onScrollAtTop, headerBottomShared, pulling,
}: OverlaySheetBody & { onClose: () => void; onRegisterBack: (fn: () => boolean) => void }) {
  const insets = useSafeAreaInsets()
  const profile = useUserStore(st => st.profile)

  const [stack, setStack] = useState<CView[]>([{ k: 'hub' }])
  const view = stack[stack.length - 1]
  const push = useCallback((v: CView) => setStack(sk => [...sk, v]), [])
  const pop = useCallback(() => setStack(sk => (sk.length > 1 ? sk.slice(0, -1) : sk)), [])

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

  const goBack = () => { tap(); if (stack.length > 1) pop(); else onClose() }

  return (
    <PullContext.Provider value={pullCtx}>
      <View style={s.root}>
        <SheetHeader
          title={titleFor(view)}
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
          style={s.scroll}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + XL }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {view.k === 'hub' && <HubView push={push} />}
          {view.k === 'friends' && <FriendsView push={push} profile={profile} />}
          {view.k === 'linkFriend' && <LinkFriendView />}
          {view.k === 'find' && <FindView />}
          {view.k === 'create' && <CreateView onCreated={g => setStack([{ k: 'hub' }, { k: 'owned', group: g }])} />}
          {view.k === 'owned' && <OwnedGroupView group={view.group} onDeleted={pop} onChanged={g => setStack(sk => sk.map(x => x.k === 'owned' ? { k: 'owned', group: g } : x))} />}
          {view.k === 'member' && <MemberGroupView group={view.group} onLeft={pop} />}
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
        setFallback({ managed: o, joined: all.filter(g => !ids.has(g.id)), friends: f.friends.length, requests: f.requests.length })
      })
      .catch(() => { if (alive) setFallback({ managed: [], joined: [], friends: 0, requests: 0 }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!summary])

  const data = summary ?? fallback
  const loading = data == null
  const friendsMeta = data
    ? (data.requests > 0
        ? `${t('communities.friendsCount').replace('{count}', String(data.friends))} · ${t('communities.requestsChip').replace('{count}', String(data.requests))}`
        : t('communities.friendsCount').replace('{count}', String(data.friends)))
    : t('communities.myFriendsSub')

  return (
    <View style={{ gap: MD }}>
      <View style={s.card}>
        <NavRow
          icon={<Avatar userId="me" name="★" image={null} size={38} />}
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
        ) : data!.managed.map((g, i) => (
          <NavRow
            key={g.id}
            first={i === 0}
            icon={<GroupsIcon color={GREEN} />}
            title={g.name}
            meta={`${g.is_public ? t('communities.public') : t('communities.private')} · ${memberLabel(g.members)}`}
            onPress={() => push({ k: 'owned', group: g })}
          />
        ))}
      </View>
      <Button label={t('communities.create')} variant="secondary" size="lg" iconStart={<PlusGlyph color={GREEN} />} onPress={() => push({ k: 'create' })} />

      <Text style={s.section}>{t('communities.inSection')}</Text>
      <View style={s.card}>
        {loading ? <Loading /> : data!.joined.length === 0 ? (
          <Empty text={t('communities.emptyIn')} />
        ) : data!.joined.map((g, i) => (
          <NavRow key={g.id} first={i === 0} icon={<GroupsIcon color={GREEN} />} title={g.name} onPress={() => push({ k: 'member', group: g })} />
        ))}
      </View>
      <Button label={t('communities.find')} variant="secondary" size="lg" iconStart={<SearchGlyph color={GREEN} />} onPress={() => push({ k: 'find' })} />
    </View>
  )
}

// A single tappable card row: leading icon/avatar, title + optional meta, chevron.
function NavRow({ icon, title, meta, first, onPress }: { icon: React.ReactNode; title: string; meta?: string; first?: boolean; onPress: () => void }) {
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      onPress={() => { tap(); onPress() }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[s.row, first && s.rowFirst, pressed && { backgroundColor: GREEN_SOFT }]}
    >
      <View style={s.rowIcon}>{icon}</View>
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {meta ? <Text style={s.rowMeta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      <ChevGlyph />
    </Pressable>
  )
}

// ── My friends ─────────────────────────────────────────────────────────────
function FriendsView({ push, profile }: { push: (v: CView) => void; profile: StoreProfile }) {
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
      <Button label={t('communities.inviteFriend')} variant="primary" size="lg" iconStart={<LinkGlyph color={WHITE} />} onPress={() => { tap(); if (profile) shareReferral(profile) }} />
      <Button label={t('communities.linkFriend')} variant="secondary" size="lg" iconStart={<SearchGlyph color={GREEN} />} onPress={() => push({ k: 'linkFriend' })} />

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

// ── Link an existing friend (people search) ──────────────────────────────
function LinkFriendView() {
  const kb = useKeyboardHeight()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Person[] | null>(null)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const seq = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) { setResults(null); return }
    const mine = ++seq.current
    const h = setTimeout(() => {
      searchPeople(query).then(r => { if (mine === seq.current) setResults(r) }).catch(() => { if (mine === seq.current) setResults([]) })
    }, 300)
    return () => clearTimeout(h)
  }, [q])

  const request = async (p: Person) => {
    tap(); setSent(sc => ({ ...sc, [p.user_id]: true }))
    try { await friendRequest(p.user_id) } catch { setSent(sc => ({ ...sc, [p.user_id]: false })) }
  }

  return (
    <View style={{ gap: MD, marginBottom: kb }}>
      <View style={s.field}>
        <SearchGlyph color={GREEN_HALF} />
        <TextInput style={s.fieldInput} value={q} onChangeText={setQ} placeholder={t('communities.searchPeople')} placeholderTextColor={BLACK_MID} autoFocus returnKeyType="search" />
      </View>
      {q.trim().length < 2 ? (
        <Text style={s.note}>{t('communities.searchHint')}</Text>
      ) : results == null ? <Loading /> : results.length === 0 ? (
        <Empty text={t('communities.noResults')} />
      ) : (
        <View style={s.card}>
          {results.map((p, i) => {
            const isSent = sent[p.user_id] || p.requested
            return (
              <View key={p.user_id} style={[s.memberRow, i === 0 && s.rowFirst]}>
                <Avatar userId={p.user_id} name={p.name} image={p.image} />
                <Text style={s.memberName} numberOfLines={1}>{p.name}</Text>
                {p.friend ? (
                  <View style={[s.pillBtn, { backgroundColor: GREEN_SOFT }]}><Text style={[s.pillBtnInk, { color: GREEN }]}>{t('communities.alreadyFriend')}</Text></View>
                ) : isSent ? (
                  <View style={[s.pillBtn, { backgroundColor: GREEN_SOFT }]}><Text style={[s.pillBtnInk, { color: GREEN_HALF }]}>{t('communities.requested')}</Text></View>
                ) : (
                  <Pressable style={[s.pillBtn, { backgroundColor: PRIMARY}]} onPress={() => request(p)}><Text style={s.pillBtnInk}>{t('communities.request')}</Text></Pressable>
                )}
              </View>
            )
          })}
        </View>
      )}
      <Text style={s.note}>{t('communities.linkNote')}</Text>
    </View>
  )
}

// ── Create a group ─────────────────────────────────────────────────────────
function CreateView({ onCreated }: { onCreated: (g: OwnedGroup) => void }) {
  const kb = useKeyboardHeight()
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (busy || name.trim().length === 0) return
    setBusy(true); tap()
    try { const g = await createGroup(name.trim(), isPublic); onCreated(g) }
    catch { setBusy(false) }
  }

  return (
    <View style={{ gap: MD, marginBottom: kb }}>
      <Text style={s.section}>{t('communities.name')}</Text>
      <View style={s.field}>
        <TextInput style={s.fieldInput} value={name} onChangeText={setName} placeholder={t('communities.namePlaceholder')} placeholderTextColor={BLACK_MID} autoFocus maxLength={60} />
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
      <Button label={t('communities.createAction')} variant="primary" size="lg" iconStart={<GroupsIcon color={WHITE} />} loading={busy} disabled={name.trim().length === 0} onPress={create} />
    </View>
  )
}

// ── A group you manage ─────────────────────────────────────────────────────
function OwnedGroupView({ group, onDeleted, onChanged }: { group: OwnedGroup; onDeleted: () => void; onChanged: (g: OwnedGroup) => void }) {
  const iAmOwner = !!group.is_owner
  const [members, setMembers] = useState<GroupMember[] | null>(null)
  const [isPublic, setIsPublic] = useState(group.is_public)
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<GroupMember | null>(null)  // member-actions sheet
  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => { groupMembers(group.id).then(setMembers).catch(() => setMembers([])) }, [group.id])
  useEffect(load, [load])

  // I can open the actions sheet on a member if I'm the owner (anyone but
  // myself-as-owner), or a manager acting on a non-manager.
  const canAct = (m: GroupMember) => !m.owner && (iAmOwner || !m.manager)
  const canRemove = (m: GroupMember) => !m.owner && (iAmOwner || !m.manager)

  const share = () => { tap(); Share.share({ message: t('communities.shareMessage').replace('{name}', group.name).replace('{link}', groupInviteUrl(group.invite_code)) }) }
  const togglePublic = async () => {
    tap(); const next = !isPublic; setIsPublic(next)
    try { const g = await updateGroup(group.id, { is_public: next }); onChanged(g) } catch { setIsPublic(!next) }
  }
  const doSetManager = async (m: GroupMember, make: boolean) => {
    setBusy(m.user_id); tap()
    try { const fresh = await setManager(group.id, m.user_id, make); setMembers(fresh) } finally { setBusy(null); setSelected(null) }
  }
  const doRemove = async (m: GroupMember) => {
    setBusy(m.user_id); tapWarning()
    try { const fresh = await removeMember(group.id, m.user_id); setMembers(fresh) } finally { setBusy(null); setConfirmRemove(null) }
  }
  const doDelete = async () => {
    setBusy('delete'); tapWarning()
    try { await deleteGroup(group.id); onDeleted() } finally { setBusy(null); setConfirmDelete(false) }
  }

  const roleTag = (m: GroupMember) => m.owner ? t('communities.owner') : m.manager ? t('communities.manager') : null

  return (
    <View style={{ gap: MD }}>
      <Button label={t('communities.shareInvite')} variant="primary" size="lg" onPress={share} />
      <Button label={isPublic ? t('communities.makePrivate') : t('communities.makePublic')} variant="secondary" size="lg" onPress={togglePublic} />

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
              {actionable ? <MoreGlyph /> : null}
            </Pressable>
          )
        })}
      </View>

      {iAmOwner ? (
        <Button label={t('communities.deleteGroup')} variant="secondary" size="lg" iconStart={<TrashIcon color={INK} />} onPress={() => setConfirmDelete(true)} />
      ) : null}

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
      <ConfirmDialog
        visible={confirmDelete}
        title={t('communities.deleteTitle').replace('{name}', group.name)}
        description={t('communities.deleteDesc')}
        confirmLabel={t('communities.deleteConfirm')}
        confirmIconStart={<TrashIcon color={WHITE} />}
        busy={busy === 'delete'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        draggable
      />
    </View>
  )
}

// ── A group you're in ──────────────────────────────────────────────────────
function MemberGroupView({ group, onLeft }: { group: Group; onLeft: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const leave = async () => {
    setBusy(true); tapWarning()
    try { await leaveGroup(group.id); onLeft() } finally { setBusy(false); setConfirm(false) }
  }
  return (
    <View style={{ gap: MD }}>
      <View style={[s.card, s.hero]}>
        <View style={s.heroBadge}><GroupsIcon color={WHITE} /></View>
        <Text style={s.heroName}>{group.name}</Text>
      </View>
      <Text style={s.note}>{t('communities.memberNote')}</Text>
      <Button label={t('communities.leave')} variant="secondary" size="lg" onPress={() => setConfirm(true)} />
      <ConfirmDialog
        visible={confirm}
        title={t('settings.groupsLeaveTitle').replace('{name}', group.name)}
        description={t('settings.groupsLeaveDesc')}
        confirmLabel={t('settings.groupsLeaveConfirm')}
        confirmIconStart={<SignOutIcon color={WHITE} />}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={leave}
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
  const seq = useRef(0)

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
    tap(); setJoined(j => ({ ...j, [g.id]: true }))
    // A public group is joinable by anyone found it in search; joining reuses
    // the redeem path under the hood (no manual code needed).
    if (g.invite_code) redeemInvite(g.invite_code).catch(() => setJoined(j => ({ ...j, [g.id]: false })))
  }
  const metaFor = (g: PublicGroup) =>
    g.owner_name
      ? `${t('communities.managedBy').replace('{name}', g.owner_name)} · ${memberLabel(g.members)}`
      : memberLabel(g.members)

  return (
    <View style={{ gap: MD, marginBottom: kb }}>
      <View style={s.field}>
        <SearchGlyph color={GREEN_HALF} />
        <TextInput style={s.fieldInput} value={q} onChangeText={setQ} placeholder={t('communities.findSearch')} placeholderTextColor={BLACK_MID} autoFocus />
      </View>
      {q.trim().length >= 2 && (results == null ? <Loading /> : results.length === 0 ? <Empty text={t('communities.noResults')} /> : (
        <View style={s.card}>
          {results.map((g, i) => (
            <View key={g.id} style={[s.memberRow, i === 0 && s.rowFirst]}>
              <View style={s.rowIcon}><GroupsIcon color={GREEN} /></View>
              <View style={s.rowText}>
                <Text style={s.rowTitle} numberOfLines={1}>{g.name}</Text>
                <Text style={s.rowMeta} numberOfLines={1}>{metaFor(g)}</Text>
              </View>
              {g.joined || joined[g.id] ? (
                <View style={[s.pillBtn, { backgroundColor: GREEN_SOFT }]}><Text style={[s.pillBtnInk, { color: GREEN }]}>{t('communities.joined')}</Text></View>
              ) : (
                <Pressable style={[s.pillBtn, { backgroundColor: PRIMARY }]} onPress={() => joinPublic(g)}><Text style={s.pillBtnInk}>{t('communities.join')}</Text></Pressable>
              )}
            </View>
          ))}
        </View>
      ))}
      <Text style={s.note}>{t('communities.findNote')}</Text>
    </View>
  )
}

// ── shared bits ────────────────────────────────────────────────────────────
const memberLabel = (n: number) => n === 1 ? t('communities.oneMember') : t('communities.membersCount').replace('{count}', String(n))
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
  sheetTitle: { fontSize: TEXT.lg, fontWeight: WEIGHT.extrabold, color: INK, textAlign: 'center', paddingBottom: XS },
  pillBtn: { paddingHorizontal: MD, paddingVertical: SM, borderRadius: RADIUS },
  pillBtnInk: { fontSize: TEXT.sm, fontWeight: WEIGHT.extrabold, color: WHITE },
  note: { fontSize: TEXT.sm, color: GREEN_HALF, lineHeight: lhSm(), marginStart: XS, marginTop: XS },
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
  hero: { alignItems: 'center', paddingVertical: XL, gap: SM },
  heroBadge: { width: AVATAR_LG, height: AVATAR_LG, borderRadius: AVATAR_LG / 2, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  heroName: { fontSize: TEXT.xl, fontWeight: WEIGHT.extrabold, color: INK },
})

// Body line-height for the muted note (kept a small helper so the ratio lives
// in one place rather than as an inline literal at the style site).
function lhSm() { return Math.round(TEXT.sm * 1.5) }
