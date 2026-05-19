import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, hasLocale } from "@/i18n/locales";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

const PUBLIC_FILE_RE = /\.(.*)$/;

// Clean URL -> static marketing file in /public. This Vercel deployment is
// now the only site (the GitHub Pages once-app copy is retired): the
// deployed mobile app links to the extensionless /privacy and /terms (with
// ?lang=), so those paths must keep resolving here. /download is the
// store-redirect landing; both the slashless and trailing-slash forms map
// to it (skipTrailingSlashRedirect keeps /download/ from being stripped).
const STATIC_PAGES: Record<string, string> = {
  "/": "/index.html",
  "/privacy": "/privacy.html",
  "/terms": "/terms.html",
  "/child-safety": "/child-safety.html",
  "/download": "/download.html",
  "/download/": "/download.html",
};

function pickLocale(request: NextRequest): string {
  const cookie = request.cookies.get("NEXT_LOCALE")?.value;
  if (cookie && hasLocale(cookie)) return cookie;
  const accept = request.headers.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("he")) return "he";
    if (tag.startsWith("en")) return "en";
  }
  return defaultLocale;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Marketing landing + legal pages: serve the static files from /public,
  // preserving the query string (the pages read ?lang= client-side).
  // /admin/* stays the dynamic dashboard; *.html requests fall through
  // PUBLIC_FILE_RE below and are served straight from /public.
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

  const { response: sessionResponse, user } = await updateSupabaseSession(request);

  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";
  if (isAdminRoute && !isAdminLogin && !user) {
    // Preserve where they were headed (e.g. the /admin/users/<id> deep-link
    // from a join-request email) so /auth/callback can bounce them back there
    // after Google sign-in instead of dumping them on the dashboard.
    const intended = pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", intended);
    return NextResponse.redirect(url);
  }

  const locale = pickLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  const rewrite = NextResponse.rewrite(url);
  for (const c of sessionResponse.cookies.getAll()) rewrite.cookies.set(c);
  return rewrite;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
