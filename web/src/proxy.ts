import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, hasLocale } from "@/i18n/locales";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

const PUBLIC_FILE_RE = /\.(.*)$/;

// Clean URL -> static marketing file in /public. The deployed mobile app
// links to the extensionless /privacy and /terms (with ?lang=), and GitHub
// Pages served those via implicit clean URLs; this app must keep doing so
// for the unified domain to be a true drop-in replacement for once-app.
const STATIC_PAGES: Record<string, string> = {
  "/": "/index.html",
  "/privacy": "/privacy.html",
  "/terms": "/terms.html",
  "/child-safety": "/child-safety.html",
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
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
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
