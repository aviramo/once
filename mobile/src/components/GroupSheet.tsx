// ── The group popup ────────────────────────────────────────────────────────
//
// THE popup a circle opens into, from EVERY surface that lists one (user
// directive 2026-07-28): the hub's rows, a search result, an arriving invite
// link, and a match card's shared-circles list all open THIS.
//
// It lives in a module of its own for one reason: CirclesPage raises it and so
// does SharedListPopup, while CirclesPage also renders SharedListPopup's
// "everything we share" surface. Kept inside CirclesPage the pair was a require
// cycle (Metro warns on it at every launch), and forking the popup — or forking
// the shared-circles surface — would give the app two of a thing it has one of.
import { useRef, useState } from 'react'
import { View, StyleSheet, Linking } from 'react-native'
import { Text } from './AppText'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { BottomSheet, SheetScroll, SheetActionPair, SHEET_DESC } from './BottomSheet'
import { SignOutIcon, CloseIcon, GlobeIcon } from './icons'
import { GroupHead, NOTE_TEXT, ShareGlyph } from './CircleBits'
import { type StripOption } from './OptionStrip'
import { tap, tapWarning } from '../lib/haptics'
import { t } from '../i18n'
import { useUserStore } from '../stores/userStore'
import { dropGroupCaches } from '../lib/rosterCache'
import { shareInvitation } from '../lib/share'
import { groupInviteUrl } from '../lib/links'
import { leaveGroup, cancelJoinRequest, type GroupBrief } from '../lib/circles'
import { XS, ICON, SHEET_GAP } from '../tokens'
import { INK, WHITE } from '../colors'

// THE one way out to a group's own page, and there is exactly one place that
// offers it (user directive 2026-08-02): the "more details" option in the
// popup's foot. Nothing else in the app opens a circle's link. The server is what
// guarantees the value is an http(s) URL, so opening it here needs no parsing of
// its own; a group with no link has no tap anywhere.
export const openGroupLink = (url?: string | null) => {
  if (!url) return
  tap()
  Linking.openURL(url).catch(() => {})
}

// A group therefore reads identically wherever it was tapped — the owner's
// photo, the name, how big it is and "managed by <them>" under it, what it says
// about itself, its link — and the only thing that changes with where I stand is
// the ACTION at the bottom, which is always the one thing that standing lets me
// do:
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
  // ONE WINDOW AT A TIME: THE QUESTION GOES, AND ONLY THEN THE POPUP IT STANDS
  // IN (2026-08-03). The confirm is a Modal nested inside this popup's Modal, so
  // closing both on the same commit tore the inner window down while it was
  // still on its way out — and Android left it behind, invisible, over the whole
  // app, swallowing every touch: the screen froze exactly as the popup finished
  // sliding away. So an answer taken ON the confirm hands the dismissal to the
  // confirm's own `onClosed`, which is the app's existing chaining mechanism for
  // one Modal following another. The pending / declined options carry no confirm
  // and close straight away, as they always did.
  const closeAfterConfirm = useRef(false)
  const quit = async () => {
    if (!group) return
    const viaConfirm = confirm
    setBusy(true); tapWarning()
    try {
      // The cached roster goes with the membership — it is other people's names
      // and photos, kept only for a group the user is actually in. A request,
      // answered or not, never had one, and both go back through the same
      // endpoint.
      if (status === 'joined') { await leaveGroup(group.id); dropGroupCaches(group.id) }
      else await cancelJoinRequest(group.id)
      onDone?.()
    } finally {
      // THE POPUP GOES WHATEVER THE ANSWER WAS (user directive 2026-08-03): the
      // decision was taken, so the surface it was taken on may not be left
      // standing — a request that comes back a refusal used to throw past the
      // close and leave the user holding a popup with a spinner spent in it, the
      // one state where he could not tell whether anything had happened. Where I
      // now stand is the HUB's to say, off the same summary refresh.
      setBusy(false); setConfirm(false)
      if (viaConfirm) closeAfterConfirm.current = true
      else onClose()
    }
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
        onClosed={() => {
          if (!closeAfterConfirm.current) return
          closeAfterConfirm.current = false
          onClose()
        }}
      />
    </BottomSheet>
  )
}

const s = StyleSheet.create({
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
  // The app's one circles footnote (CircleBits), standing over the foot.
  note: { ...NOTE_TEXT, marginTop: XS },
})
