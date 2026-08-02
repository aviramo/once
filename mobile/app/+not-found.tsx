import { Redirect } from 'expo-router'

// Every URL Expo Router can't map to a screen lands here. That includes the
// invite deep links (`once://g/<TOKEN>`, `once://f/<CODE>`) BY DESIGN: they are
// data, not destinations, and are consumed by the single URL listener in
// _layout.tsx. Without this route the router fell back to its built-in black
// "Unmatched Route" debug page, which is what a user saw after tapping a shared
// group invite or friend link on a device that has the app installed.
//
// Bouncing to the boot route is the whole screen: index.tsx sends the user to
// login / onboarding / home, and the parked invite is redeemed on the way (home
// flushes it and opens the Circles sheet on the result).
export default function NotFound() {
  return <Redirect href="/" />
}
