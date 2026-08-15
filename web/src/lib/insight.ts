import type { Tone } from "@/lib/humanize";
import { DEFAULT_RANGE, type Range } from "@/lib/range";

/**
 * EVERY TILE ON THE ADMIN HOME IS A DOOR, AND THERE ARE ONLY THREE ROOMS
 * BEHIND THEM (user directive 2026-08-15).
 *
 * The dashboard was deliberately a screen you only READ — "no tile is a link",
 * because a stat that deep-linked into a filtered list made a snapshot into
 * something you could fall out of by brushing a number. That is reversed here,
 * and the reason it is safe to reverse is that the destination changed: a tile
 * no longer throws you into a working list with filters of its own, it opens
 * the ROWS IT COUNTED and nothing else. Four declined invitations open four
 * invitations, with who invited whom and how long each stood before it was
 * answered. The way back is one link, and nothing on the far side can be
 * mistaken for a place you now have to work in.
 *
 * A screen per number would be thirty screens saying the same three things, so
 * there is ONE screen (`/insight/<metric>`) and this file is the registry that
 * feeds it. A metric is one entry here — its shape, its tone, and which
 * section it belongs to — and its label is the dashboard's own
 * (`dashboard.metrics[key]`), so a tile and the page it opens can never
 * disagree about what they are called.
 *
 * The SHAPE is the whole of what the screen needs to know:
 *
 *   `person` — one account. `pair` — two parties and what passed between
 *   them, where the second party may be a CIRCLE (a joining) rather than a
 *   person. `device` — an anonymous visitor to the card or the home page.
 *
 * Plain module, not a `"use client"` one, for the same reason `lib/range.ts`
 * is: a server component must be able to call these, and every export of a
 * client module is a proxy in the server graph.
 */

export type InsightShape = "person" | "pair" | "device";

type Spec = { shape: InsightShape; tone?: Tone };

/**
 * The tile's tone lives HERE rather than at the `<Stat>` call site so the
 * number and the page behind it are stated once. A metric with no tone is the
 * neutral `idle` the Stat defaults to.
 */
export const INSIGHT: Record<string, Spec> = {
  // Who is here — the population, split. Under a window these are the
  // accounts OPENED inside it.
  total: { shape: "person" },
  men: { shape: "person" },
  women: { shape: "person" },
  avgAge: { shape: "person" },
  osIos: { shape: "person" },
  osAndroid: { shape: "person" },

  // What happened.
  aActive: { shape: "person", tone: "ok" },
  aAccounts: { shape: "person", tone: "ok" },
  aProfiles: { shape: "person", tone: "ok" },
  aFriendships: { shape: "pair", tone: "ok" },
  aMemberships: { shape: "pair", tone: "ok" },
  aInvites: { shape: "pair" },
  aDeclined: { shape: "pair", tone: "ended" },
  aCancelled: { shape: "pair", tone: "ended" },
  aExpired: { shape: "pair", tone: "ended" },
  aChats: { shape: "pair", tone: "chat" },
  aAvgMessages: { shape: "pair", tone: "chat" },
  aBlocks: { shape: "pair", tone: "ended" },
  aReports: { shape: "pair", tone: "ended" },
  aLogouts: { shape: "person", tone: "ended" },
  aDeletes: { shape: "person", tone: "ended" },

  // The wallets of those same accounts.
  balanceTotal: { shape: "person" },
  heldTotal: { shape: "person", tone: "busy" },
  extraTotal: { shape: "person", tone: "ok" },
  withExtra: { shape: "person" },

  // Nobody's account: an anonymous device that opened a printed address or
  // the home page. No environment and no manager scope reaches these.
  scanAndroid: { shape: "device" },
  scanIos: { shape: "device" },
  siteTotal: { shape: "device" },
  siteAndroid: { shape: "device" },
  siteIos: { shape: "device" },
  siteDesktop: { shape: "device" },
};

export type InsightMetric = keyof typeof INSIGHT;

export function isInsightMetric(raw: string | undefined): raw is InsightMetric {
  return !!raw && Object.hasOwn(INSIGHT, raw);
}

/** How many rows the screen will draw. Stated once: the RPC caps at it and the
 * page says so when the cap was reached, so a truncated list never reads as a
 * complete one. */
export const INSIGHT_LIMIT = 300;

/**
 * The door itself. The range travels in the link because the range is what the
 * tile was counting under — a drill-down that lost it would be answering a
 * different question from the one that was asked.
 */
export function insightHref(metric: InsightMetric, range: Range): string {
  const qs = range === DEFAULT_RANGE ? "" : `?range=${range}`;
  return `/insight/${metric}${qs}`;
}

/* ------------------------------------------------------------------ rows -- */

/** One party on a row: a person, or a circle where a joining puts one. Always
 * an object — `gone` is how a row says the account behind it no longer exists,
 * which half these lists (a report, a block, an old invitation) will always
 * have some of. */
export type InsightParty = {
  id: string;
  name: string | null;
  /** A live person's BARE FILENAME, composed into a URL by `userImageUrl`; an
   * archived person's FULL PATH inside the private `users-archive` bucket,
   * which the page signs instead. `archived` says which. */
  image?: string | null;
  age?: number | null;
  circle?: boolean;
  device?: boolean;
  archived?: boolean;
  gone?: boolean;
  photos?: number;
  joined?: string | null;
};

export type InsightRow = {
  kind: InsightShape;
  /** The moment the row is dated by — the same moment the tile counted it
   * under. */
  at: string | null;
  a: InsightParty;
  b?: InsightParty | null;
  /** An outcome key the panel translates (`insight.tags`), never a sentence. */
  tag?: string | null;
  /** How long something stood: an invitation in the air, a conversation from
   * its first line to its last, a device from first sight to last. */
  ms?: number | null;
  /** A quantity on the row: messages in a conversation, credits in a wallet,
   * hits from a device, photographs in an archive. */
  n?: number | null;
  /** Free text whose meaning is the metric's: an invitation's expiry, a
   * report's note, the presses a device made. */
  note?: string | null;
};
