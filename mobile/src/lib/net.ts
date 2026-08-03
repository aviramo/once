import { useSyncExternalStore } from 'react'

// THE DEVICE'S OWN VERDICT IS NOT THE ONLY EVIDENCE OF NO INTERNET.
// `expo-network` answers about the RADIO: a phone on a wifi that leads nowhere
// (a captive portal, a router with no uplink, data disabled for this app)
// reports `isConnected: true` and the app was left silently failing every
// request with nothing on the screen to say why — while the very same
// situation on location or notifications puts a button and a line of text in
// front of the user. So the app's OWN requests are the second source: a fetch
// that never reached a server IS the statement that there is no internet, and
// it is the only one that can see the cases the radio cannot.
//
// A REFUSAL IS NOT AN OUTAGE. Only a fetch that THREW — DNS/connection failure,
// or the request's own timeout aborting it — counts here; every HTTP answer,
// 500s included, means the network carried the request and is reported as
// online. That keeps a server having a bad minute from reading as "check your
// wifi", which is advice the user cannot act on.

let offline = false
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (offline === next) return
  offline = next
  listeners.forEach(l => l())
}

/** Called by `invoke` for every attempt: `ok` false only when the fetch itself
 *  failed (no response at all). */
export function reportNetOutcome(ok: boolean) { set(!ok) }

/** The retry button's half: forget the last failure so the notice comes down
 *  and the app is free to try again. If there is still no internet the next
 *  request brings it straight back. */
export function clearNetOffline() { set(false) }

/** True when the app's own last request could not reach the network at all. */
export function useRequestOffline() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => offline,
  )
}
