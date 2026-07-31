import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { STORAGE } from '../keys'

// THE BROWSE ALLOWANCE: how far an account with NO PROFILE gets before the app
// asks for one (user directive 2026-07-31).
//
// A user who has not finished onboarding may watch BROWSE_ALLOWANCE people and
// no more: the next candidate does not rise at all, and home's one action
// surface stops being the play button and becomes the build-profile gate (see
// home.tsx's centerNotice). It is the same fact the dock's profile key already
// wears a dot for, said at the point where it starts costing the user something
// — he has seen what the game is, and the next face is behind a profile.
//
// The record is a LIST OF IDS, not a count, because the allowance is spent on
// two PEOPLE: page1 keeps its occupant across a relaunch, so the same card read
// again is the same view and must not spend a second one. It is bounded by the
// allowance itself, so this is two strings on disk at most.
//
// Everything here is CLIENT-SIDE, deliberately. The server's own profileComplete
// gate is what stops an unbuilt account from being SEEN or from inviting; how
// many faces it has been shown is a nudge, and a server that refused candidates
// would refuse them to the published mobile build too, where nothing explains
// why the play button stopped working.

/** Two: enough to see what the game is, not enough to play it without a face. */
export const BROWSE_ALLOWANCE = 2

async function readSpent(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE.browseWatched)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Forget the allowance. Called when the profile is built (there is nothing
 *  left to hold) and by the sign-out / identity-switch wipe, since the record
 *  belongs to one person the way every other cache on this disk does. */
export async function clearBrowseAllowance(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE.browseWatched)
  } catch {
    /* best-effort */
  }
}

export interface BrowseAllowance {
  /** SPENT: this account has watched its allowance and still has no profile.
   *  While true home draws the build-profile gate where the play button is and
   *  no fresh candidate may rise. */
  spent: boolean
  /** Register the person whose card is on screen. Idempotent per person, and a
   *  no-op once the profile is built or the allowance is full. */
  watch: (userId: string) => void
  /** May this candidate be on screen? Everyone, until the allowance is spent;
   *  after that only the people it was spent on — the card the user is already
   *  looking at is never taken out from under him, the gate simply stands where
   *  the NEXT one would have been. */
  allows: (userId: string) => boolean
}

export function useBrowseAllowance(built: boolean): BrowseAllowance {
  const [spentOn, setSpentOn] = useState<string[]>([])
  // Both callbacks below are stable — they are read from a gesture commit and
  // from the card-promotion effect, neither of which may re-run because a face
  // was counted — so the live values are held in refs and the state exists only
  // to repaint the centre.
  const spentOnRef = useRef(spentOn)
  const builtRef = useRef(built)
  builtRef.current = built

  const write = useCallback((next: string[]) => {
    spentOnRef.current = next
    setSpentOn(next)
    AsyncStorage.setItem(STORAGE.browseWatched, JSON.stringify(next)).catch(() => {})
  }, [])

  // Read the record once. A profile that is already built has no allowance to
  // hold, so the same pass is what sweeps a stale record off the disk.
  useEffect(() => {
    let alive = true
    void (async () => {
      const stored = await readSpent()
      if (!alive || stored.length === 0) return
      if (builtRef.current) { void clearBrowseAllowance(); return }
      spentOnRef.current = stored
      setSpentOn(stored)
    })()
    return () => { alive = false }
  }, [])

  // Building the profile ends the allowance for good.
  useEffect(() => {
    if (!built || spentOnRef.current.length === 0) return
    spentOnRef.current = []
    setSpentOn([])
    void clearBrowseAllowance()
  }, [built])

  const watch = useCallback((userId: string) => {
    if (builtRef.current || !userId) return
    const current = spentOnRef.current
    if (current.includes(userId) || current.length >= BROWSE_ALLOWANCE) return
    write([...current, userId])
  }, [write])

  const allows = useCallback((userId: string) => {
    if (builtRef.current) return true
    if (spentOnRef.current.length < BROWSE_ALLOWANCE) return true
    return spentOnRef.current.includes(userId)
  }, [])

  return { spent: !built && spentOn.length >= BROWSE_ALLOWANCE, watch, allows }
}
