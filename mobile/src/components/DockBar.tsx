import React, { useMemo, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useRouter } from 'expo-router'
import { HomeDock, type DockItem } from './HomeDock'
import { PreferencesPopup, AppSettingsPopup } from './SettingsSurfaces'
import { UserIcon, GroupsIcon, SearchIcon, CreditIcon } from './icons'
import { INK } from '../colors'
import { ICON } from '../tokens'
import { t } from '../i18n'
import { tap } from '../lib/haptics'

// ── THE DOCK AND WHAT IT OPENS, OUT OF HOME'S OWN RENDER ────────────────────
// The strip and its two popups are one component, and the popups' open/closed
// state lives HERE — not in home (measured 2026-08-03).
//
// Home is the app's one big component: a single render pass over it costs
// ~200ms on a dev build, and every flag it holds pays that pass. `prefsPopupOpen`
// and `appSettingsPopupOpen` were two such flags, so tapping a dock key rebuilt
// the whole screen — the card, the pane, the overlays — before the popup could
// be told to open, and the user watched a still screen for half a second before
// anything moved. Nothing outside this strip needs to know that one of these two
// popups is up, so nothing outside it re-renders when one opens.
//
// It builds its own items for the same reason: an array assembled in home would
// be a new identity on every home render and would drag this subtree back into
// each one. What it takes instead is the DATA the keys state — counts and
// entitlement — and the two doors that genuinely belong to the shell (the
// profile preview and the Circles gate, both of which open surfaces home owns).
//
// The dock is still a row of buttons and nothing else: `HomeDock` knows nothing
// about popups. This component is what stands between the two.
export type DockBarProps = {
  /** Bottom air, from home (it owns the shell's safe-area reading). */
  bottom: number
  /** Onboarding finished — two photos. Fades the Circles key, moves the profile
   *  key to /onboarding, and silences every marker that would point at a door
   *  the members-only gate refuses. */
  profileBuilt: boolean
  /** Join + friend requests waiting behind Circles. */
  pendingCount: number
  /** Has this account ever opened the hub? Until it has, the key wears the dot. */
  circlesSeen: boolean
  /** People watching me right now — the number the visibility row states in
   *  words inside the preferences popup. */
  watcherCount: number
  /** The wallet — the balance the credits key states. The DEPOSIT is not on this
   *  strip (user directive 2026-08-03): one mark per key, and what is on hold is
   *  said in words on the credits row the key opens. */
  starsBalance: number
  /** The profile preview — home's overlay, so home opens it. Only ever called
   *  for a BUILT profile; an unfinished account goes to /onboarding from here,
   *  which is the same resume point onboarding's own `initialStep` decides. */
  onProfile: () => void
  /** The one members-only gate, shared with the push + invite-link routers. */
  onCircles: () => void
}

/** The ONE thing outside this component that may raise one of its popups:
 *  home's centre circle in the no-candidate state, which opens the search
 *  preferences and wears that popup's own glyph (the dock's SearchIcon). It is
 *  an imperative handle rather than a `visible` prop precisely because a prop
 *  would put the popup's open/closed back into home's render — which is the one
 *  thing this split exists to prevent. It fires no haptic: the caller's own tap
 *  responder already did, exactly as the dock key's does before calling in. */
export type DockBarHandle = { openPreferences: () => void }

const DockBarBase = forwardRef<DockBarHandle, DockBarProps>(({
  bottom,
  profileBuilt,
  pendingCount,
  circlesSeen,
  watcherCount,
  starsBalance,
  onProfile,
  onCircles,
}, ref) => {
  const router = useRouter()
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const openPrefs = useCallback(() => { tap(); setPrefsOpen(true) }, [])
  const closePrefs = useCallback(() => setPrefsOpen(false), [])
  const openMore = useCallback(() => { tap(); setMoreOpen(true) }, [])
  const closeMore = useCallback(() => setMoreOpen(false), [])
  useImperativeHandle(ref, () => ({ openPreferences: () => setPrefsOpen(true) }), [])

  const items = useMemo<DockItem[]>(() => [
    {
      key: 'profile',
      label: t('home.dock.profile'),
      icon: <UserIcon color={INK} size={ICON.xxl} />,
      // An UNFINISHED account opens ONBOARDING, not the preview (user directive
      // 2026-07-30), and it lands on the one step that is still missing: the
      // photos. That resume is onboarding's own (`initialStep`, which reads the
      // profile — fewer than MIN_PHOTOS photos → the photo step), so this passes
      // no step and nothing here can disagree with it. A preview of a profile
      // that does not exist yet is a blank card with nothing to do on it; the
      // door has to be the flow that fills it.
      onPress: profileBuilt
        ? onProfile
        : () => { tap(); router.push('/onboarding') },
      // Onboarding not finished (under two photos → the server treats this
      // account as "browse only"). Same dot the Circles entry wears for a
      // pending queue — one marker, so the entry that fixes the problem is the
      // one that says so.
      badge: !profileBuilt,
    },
    {
      key: 'circles',
      label: t('circles.menuRow'),
      icon: <GroupsIcon color={INK} size={ICON.xxl} />,
      onPress: onCircles,
      // BOTH reasons hang off entitlement, not just the first-visit one: an
      // unbuilt account can still be sent a friend request, and a marker over a
      // faded key would point at a door the gate refuses — the one thing this
      // rule says must not happen. While dimmed the key carries nothing at all,
      // whatever is queued behind it; it comes back the moment the profile does,
      // with the queue intact.
      //
      // The queue is a number and the first visit is a dot, and the number wins
      // when both are true: it says everything the dot says and how many besides.
      count: profileBuilt && pendingCount > 0 ? pendingCount : undefined,
      // The one dock number that is people WAITING ON ME rather than a tally I
      // may read when I like, so it is painted as the app paints anything that
      // wants answering: purple disc, white digit (user directive 2026-08-03).
      urgent: true,
      badge: profileBuilt && !circlesSeen,
      dimmed: !profileBuilt,
    },
    {
      key: 'preferences',
      label: t('home.dock.preferences'),
      // The magnifying glass (user directive 2026-07-30, replacing the sliders
      // that stood here): what these preferences decide is WHO the app goes
      // looking for, and that is the mark every app uses for looking. The age
      // rows keep their sliders INSIDE — a row states its own field, the key
      // states what the whole set is for.
      icon: <SearchIcon color={INK} size={ICON.xxl} />,
      // The live watcher count, under the same condition the visibility row
      // inside this popup states it by, so the two are one statement of one fact.
      // The reason is no longer part of that condition (user directive
      // 2026-08-02): a match locks page2 and the row reads hidden, but my card is
      // on my partner's screen and the row now says so by name, so a key that
      // went blank there would be contradicting the row it opens. A hidden user
      // with nobody on his card counts 0 and paints nothing, exactly as before.
      count: watcherCount > 0 ? watcherCount : undefined,
      onPress: openPrefs,
    },
    {
      key: 'settings',
      // "More", not "Settings" (user directive 2026-07-30): what it opens is the
      // wallet first and then the account, support and the site — a drawer of
      // everything else, not a preferences screen. The glyph follows the label to
      // the thing at the head of that list, the CREDITS mark.
      label: t('home.dock.more'),
      icon: <CreditIcon color={INK} size={ICON.xxl} />,
      // The wallet is the head of what this opens and the glyph already says so;
      // the number says how much is in it — always shown, exactly as the credits
      // row shows it, zero included.
      count: starsBalance,
      // ONE MARK PER KEY (user directive 2026-08-03): the deposit stood at the
      // glyph's other top corner from 2026-08-01 and is deleted. A key annotated
      // at both corners reads as two tallies sharing a mark; what the deposit is
      // and what it costs is the credits ROW's to say, in words.
      onPress: openMore,
    },
  ], [profileBuilt, onProfile, onCircles, router, pendingCount, circlesSeen, watcherCount, starsBalance, openPrefs, openMore])

  return (
    <>
      <HomeDock items={items} bottom={bottom} />
      {/* The dock's two settings keys. Popups, not sheets: each is a short list
          of rows the user reads and closes, where the profile and Circles keys
          open surfaces you stay in. They stand HERE rather than out in the
          shell's popup block so that opening one costs this subtree's render and
          not the whole screen's — the dock itself still knows nothing about
          them. */}
      <PreferencesPopup visible={prefsOpen} onDismiss={closePrefs} />
      <AppSettingsPopup visible={moreOpen} onDismiss={closeMore} />
    </>
  )
})

export const DockBar = React.memo(DockBarBase)
