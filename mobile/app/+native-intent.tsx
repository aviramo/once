import { parseGroupInviteToken, parseFriendInviteCode } from '../src/lib/communities'

// Expo Router's door for inbound deep links: every URL the OS hands the app
// passes through here before the router does anything with it, both the
// cold-start URL and every in-session one.
//
// The invite links (`once://g/<TOKEN>`, `once://f/<CODE>`) are DATA, not
// destinations — there is no screen for them, and _layout.tsx's URL listener
// reads them straight out of the URL. So they are swallowed here: returning
// nothing leaves the router with no route to resolve, which means a cold start
// boots normally at the root and an in-session link does not navigate AT ALL.
// That last part is the point — letting it navigate would tear the current
// screen off the stack and remount home (losing an open chat, a draft, a
// scrolled card) just to land back where the user already was.
//
// Everything else passes through untouched. Deliberately no fallback behaviour
// here beyond that: if this file ever stops being picked up, an invite link
// simply routes as before, and app/+not-found.tsx bounces it to the boot route
// with the invite still redeemed — degraded (home remounts), never broken.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  if (parseGroupInviteToken(path) || parseFriendInviteCode(path)) return null
  return path
}
