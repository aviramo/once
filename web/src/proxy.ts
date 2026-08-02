import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, hasLocale } from "@/i18n/locales";
import { updateSupabaseSession } from "@/lib/supabase/proxy";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const PUBLIC_FILE_RE = /\.(.*)$/;

// Clean URL -> static marketing file in /public. The deployed mobile app
// links to the extensionless /privacy and /terms (with ?lang=), so those
// paths must keep resolving here. /download is the store-redirect landing;
// both the slashless and trailing-slash forms map to it
// (skipTrailingSlashRedirect keeps /download/ from being stripped).
//
// `/` is a special case: it shows the static marketing site for visitors
// who are signed OUT, and the admin dashboard (the Next-rendered page) for
// visitors who are signed IN. So `/` is NOT in STATIC_PAGES — the middleware
// auth-checks first and only rewrites to /index.html when the user is
// signed out.
const STATIC_PAGES: Record<string, string> = {
  "/privacy": "/privacy.html",
  "/terms": "/terms.html",
  "/child-safety": "/child-safety.html",
  "/download": "/download.html",
  "/download/": "/download.html",
};

// Referral landing: /i/<CODE> is the link a user shares from the app's invite
// row. On Android we bounce straight to the Play listing with the code packed
// into `referrer`, which Play preserves through the install and hands back to
// the app via the Install Referrer API on first launch — that is the whole
// attribution mechanism, and it is why the invitee never has to type anything.
// Everyone else (desktop, iPhone) falls through to the normal download page,
// which offers the Play link on desktop and states plainly on iPhone that
// Once is Android-only; a desktop install simply goes unattributed.
//
// Duplicated from public/download.html on purpose: that file is a static asset
// served straight from /public and cannot import a shared constant.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.aviramo.once";
const REFERRAL_PATH_RE = /^\/i\/([A-Za-z0-9]{4,16})\/?$/;
// Group invite link: /g/<TOKEN> serves a small redirect page that hands off to
// the installed app (once://g/<TOKEN>) with a Play-store fallback. The invite's
// opaque token stays in the URL — the user never sees or types a "code".
const GROUP_PATH_RE = /^\/g\/(\d{6})\/?$/;
// Friend invite link: /f/<CODE> serves a redirect page that hands off to the
// installed app (once://f/<CODE>, which links the pair as mutual friends) with
// a Play-store fallback that packs the code into the referrer (ref=<CODE>&f=1)
// so a fresh install connects on first launch. CODE = the inviter's
// referral_code (7-char, but accept the same 4..16 alnum window as /i/).
const FRIEND_PATH_RE = /^\/f\/([A-Za-z0-9]{4,16})\/?$/;

// Paths that REQUIRE an authenticated session. The root `/` is auth-aware
// (handled separately below); these are the panel sub-routes. A signed-out
// visit redirects to /login with `?next=<intended>` so the deep-link
// survives the auth round-trip.
const PROTECTED_PREFIXES = ["/users", "/groups", "/areas", "/reports", "/map"];

function pickLocale(request: NextRequest): string {
  // The admin panel is Hebrew-only (there is no in-app language switcher).
  // An explicit NEXT_LOCALE cookie still wins — that is the seam a future
  // switcher would use — but we deliberately do NOT fall back to the
  // browser's Accept-Language, which was silently flipping the panel to
  // English for admins whose browser lists en ahead of he. Default is he.
  const cookie = request.cookies.get("NEXT_LOCALE")?.value;
  if (cookie && hasLocale(cookie)) return cookie;
  return defaultLocale;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Referral link. Runs before anything else so it costs no session lookup.
  const referral = REFERRAL_PATH_RE.exec(pathname);
  if (referral) {
    const code = referral[1].toUpperCase();
    const isAndroid = /android/i.test(request.headers.get("user-agent") ?? "");
    if (isAndroid) {
      const play = new URL(PLAY_STORE_URL);
      // searchParams encodes the '=' for us, so Play receives the raw
      // referrer string "ref=<CODE>" exactly as the app expects to parse it.
      play.searchParams.set("referrer", `ref=${code}`);
      return NextResponse.redirect(play);
    }
    const url = request.nextUrl.clone();
    url.pathname = "/download.html";
    return NextResponse.rewrite(url);
  }

  // Group invite link. Rewrite (not redirect) so the browser keeps /g/<TOKEN>
  // and the page's script can read the token off the path. Static — no session.
  if (GROUP_PATH_RE.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/group.html";
    return NextResponse.rewrite(url);
  }

  // Friend invite link. Same rewrite treatment as the group link — the browser
  // keeps /f/<CODE> so friend.html's script can read the code off the path.
  if (FRIEND_PATH_RE.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/friend.html";
    return NextResponse.rewrite(url);
  }

  // Legal / store-redirect static pages: serve straight from /public.
  const staticTarget = STATIC_PAGES[pathname];
  if (staticTarget) {
    const url = request.nextUrl.clone();
    url.pathname = staticTarget;
    return NextResponse.rewrite(url);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    PUBLIC_FILE_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Already-localized URL (`/he/...`, `/en/...`, or bare `/he` / `/en`): the
  // browser hit the internal rewrite target directly, so don't run the locale
  // prefix again (would double to `/he/he`). Let Next render `[lang]/...` as-is.
  const firstSeg = pathname.split("/", 2)[1] ?? "";
  if (hasLocale(firstSeg)) {
    return NextResponse.next();
  }

  const { response: sessionResponse, user } = await updateSupabaseSession(request);

  // Root `/`: only privileged viewers (admin OR group-manager) see the panel
  // dashboard here. Everyone else — signed-out visitors AND signed-in plain
  // users — gets the static marketing site. User decision 2026-05-25.
  //
  // The admin role lives in the JWT (`app_metadata.role='admin'`) so checking
  // it is free; the manager check requires a DB roundtrip via the
  // SECURITY-DEFINER helper. The query runs only at root and only when the
  // visitor is signed in but not a JWT admin — most marketing-site traffic
  // pays zero DB cost.
  if (pathname === "/") {
    let hasPanelAccess = false;
    if (user) {
      const role = (user.app_metadata as { role?: string } | undefined)?.role;
      if (role === "admin") {
        hasPanelAccess = true;
      } else {
        const admin = createSupabaseAdmin();
        const { data } = await admin.rpc("is_group_manager", {
          p_user_id: user.id,
        });
        hasPanelAccess = data === true;
      }
    }
    if (!hasPanelAccess) {
      const url = request.nextUrl.clone();
      url.pathname = "/index.html";
      return NextResponse.rewrite(url);
    }
  }

  // Auth-gate the panel sub-routes. /login is intentionally public so an
  // unauthenticated user can reach it; /auth/* is the OAuth callback path.
  const isProtected = PROTECTED_PREFIXES.some((p) =>
    pathname === p || pathname.startsWith(p + "/"),
  );
  if (isProtected && !user) {
    const intended = pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", intended);
    return NextResponse.redirect(url);
  }

  const locale = pickLocale(request);
  const url = request.nextUrl.clone();
  // Strip a bare "/" from the suffix so the rewrite target is `/he` instead
  // of `/he/` — with `skipTrailingSlashRedirect: true` (next.config.ts) Next
  // would otherwise treat `/he/` as a distinct, un-routed path and 404.
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  const rewrite = NextResponse.rewrite(url);
  for (const c of sessionResponse.cookies.getAll()) rewrite.cookies.set(c);
  return rewrite;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
