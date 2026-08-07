import { NextResponse, type NextRequest } from "next/server";
import { getViewerScope } from "@/lib/admin-auth";
import {
  ADMIN_ENV_COOKIE,
  ADMIN_ENV_COOKIE_MAX_AGE,
  parseAdminEnv,
} from "@/lib/adminEnv";
import { safeNextPath } from "@/lib/safeNext";

/**
 * Switch the whole panel to one matching environment: `?to=prod|test`.
 *
 * A GET route rather than a server action — see ADMIN_ENV_ROUTE in
 * `lib/adminEnv.ts` for why the panel's primary control may not depend on a
 * live JS bundle. `parseAdminEnv` is what makes any other value harmless: it
 * answers `prod` for everything it does not recognise.
 *
 * The way back is the REFERER, so the operator returns to the screen he was
 * on, filters and all, without every link in the panel having to carry a
 * `next=`. Same-origin only (a redirect target read off a header is a
 * redirector otherwise), and `/` when there is none — a browser that strips
 * the header still gets the switch, just not the way back.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const env = parseAdminEnv(searchParams.get("to"));

  // Same gate the panel's screens apply. The environment only decides what is
  // SHOWN — what a viewer may see is `requireViewerScope` on every page — but
  // a stranger has no panel to set a preference for.
  const scope = await getViewerScope();
  if (!scope) return NextResponse.redirect(`${origin}/login`);

  let back: string | null = null;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const from = new URL(referer);
      if (from.origin === origin) back = safeNextPath(from.pathname + from.search);
    } catch {
      // Unparseable Referer: fall back to the dashboard.
    }
  }

  const res = NextResponse.redirect(`${origin}${back ?? "/"}`);
  res.cookies.set(ADMIN_ENV_COOKIE, env, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_ENV_COOKIE_MAX_AGE,
  });
  return res;
}
