/**
 * Open-redirect-safe "return to" path. Accepts only a same-origin absolute
 * path: it must start with a single "/" and never "//" (a browser treats a
 * leading "//" as a protocol-relative URL to an arbitrary host). Anything
 * else (full URL, non-string, empty) → null.
 *
 * Single source of truth for the post-login redirect chain — the middleware
 * (writes `?next=`), the /login page (honors it when already signed in
 * and forwards it to the form), and /auth/callback (final redirect target)
 * all validate through this. None re-implement the check.
 */
export function safeNextPath(value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : null;
}
