import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewerScope } from "@/lib/admin-auth";
import { safeNextPath } from "@/lib/safeNext";

/**
 * `/login` is a server route handler — NOT a page. The marketing site's
 * "Login" link and the middleware's "redirect signed-out user from a
 * protected path" both land here, and the handler immediately initiates
 * Google OAuth (`supabase.auth.signInWithOAuth({ provider:'google',
 * skipBrowserRedirect:true })`) and redirects the browser to the Google
 * account-picker URL. No UI is ever rendered — the user goes straight from
 * "click Login" to Google's account chooser.
 *
 * `?next=<path>` is the deep-link the middleware preserved (or `/` if
 * absent); it rides through `/auth/callback` so the user lands on their
 * intended page after Google sends them back.
 *
 * Already-signed-in visits short-circuit to `next` (or `/`) — without this
 * an admin who refreshes `/login` would get bounced through Google again
 * for no reason.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next")) ?? "/";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Already signed in. If they have admin/manager scope, send them to
    // their requested destination. Otherwise this session is stuck — the
    // dashboard would just bounce them back here, and there is no panel
    // for them. Sign that session out and fall through to the OAuth init
    // so the click on "Login" leads to a real account picker instead of
    // an infinite /login → / → /login loop.
    const scope = await getViewerScope();
    if (scope) return NextResponse.redirect(`${origin}${next}`);
    await supabase.auth.signOut();
  }

  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Force Google's account chooser every time. Without this, the
      // browser silently reuses the last Google session, so a user who
      // signed in with the wrong account can never pick a different one
      // by clicking "Login" again.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) {
    // OAuth init failed — bounce to the marketing root with an error flag
    // (the static site can show / log this later if we want). Avoid an
    // infinite /login → /login loop on persistent OAuth misconfig.
    return NextResponse.redirect(`${origin}/?error=oauth`);
  }
  return NextResponse.redirect(data.url);
}
