import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * The business card's counter: /scan tells this route that a device opened it.
 *
 * It is a route handler and not a call straight from the page to Supabase
 * because the write must not put a key of any kind into a public HTML file —
 * the service role stays on the server, and the browser talks to its own
 * origin. `proxy.ts` lets `/api/*` through untouched, so this costs no session
 * lookup.
 *
 * ONE ROW PER DEVICE, not per visit — see the migration. The identity is the
 * page's own localStorage id; a browser that has none (private mode, storage
 * blocked) is identified here instead by a hash of IP + user-agent, which is
 * computed and thrown away in the same breath. Neither input is stored.
 *
 * It answers 204 to everything, including its own failures. This is a beacon
 * fired by a page whose job is to get someone to the store: nothing it reports
 * is worth a visible error, a retry, or a millisecond of the visitor's time.
 */

/** What the page may call itself. Anything else is dropped rather than
 * corrected — a fourth platform means this file is out of date, and a silent
 * "other" bucket would hide that. */
const PLATFORMS = new Set(["android", "ios", "desktop"]);

/** The shape `crypto.randomUUID()` produces, plus room for the hashed
 * fallback. Bounding it is what keeps a hostile caller from writing rows of
 * arbitrary text into the table. */
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** A stable id for a visitor whose browser kept nothing. Two phones behind one
 * Wi-Fi with the same phone model collide into a single device, which is the
 * under-count the panel's hint states; the pepper is what stops the digest
 * being a lookup table of IP addresses. */
function fallbackDevice(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  const digest = createHash("sha256").update(`once/scan|${ip}|${ua}`).digest("hex");
  return `h-${digest.slice(0, 32)}`;
}

/** The server's own read of the device, for a body that did not state one (or
 * stated something this route does not recognise). Deliberately cruder than
 * `store.js`'s — that one also catches an iPad reporting itself as a Mac, and
 * it is the answer the page sends when it can. */
function platformFromUA(request: NextRequest): string {
  const ua = request.headers.get("user-agent") ?? "";
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  return "desktop";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { device?: unknown; platform?: unknown }
      | null;

    const claimed = typeof body?.device === "string" ? body.device : "";
    const device = DEVICE_RE.test(claimed) ? claimed : fallbackDevice(request);

    const stated = typeof body?.platform === "string" ? body.platform : "";
    const platform = PLATFORMS.has(stated) ? stated : platformFromUA(request);

    const admin = createSupabaseAdmin();
    await admin.rpc("app_scan_seen", { p_device: device, p_platform: platform });
  } catch (err) {
    // Nothing is retried and nothing reaches the visitor: a lost scan is one
    // row missing from a marketing counter.
    console.error("scan_beacon_failed", (err as Error)?.message);
  }
  return new NextResponse(null, { status: 204 });
}
