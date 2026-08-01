import Log from "./log.ts";

declare global {
  const EdgeRuntime: {
    waitUntil(promise: Promise<unknown>): void;
  };
}

export type Image = {
  normal?: string;
  hash: string;
};

export type FamilyData = {
  hasKids: boolean;
  kids?: { age?: number }[];
  schedule?: { weeks: boolean[][]; anchor?: string };
  /** Whether the user wants their own (more) kids. Lives inside family
   * because everything kids-related is captured in one blob. */
  isForKids?: boolean;
};

export type Data = {
  images: Image[];
  bio?: string | null;
  family?: FamilyData | null;
  weekStart?: number;
  os: string;
  lang: string;
  push_token: PushToken | null;
  role?: string | null;
  /** True if the user picked a manual address instead of using the device's
   * GPS. While true the server treats `location` as user-provided and the
   * client suppresses permission prompts + skips periodic location updates.
   * Kept alongside `location_type` for backward compat with mobile builds
   * that predate the typed model (they only read this boolean). */
  location_custom?: boolean;
  /** Which anchor the stored `location` point represents: 'device' (live
   * GPS), 'home', or 'work'. Supersedes the boolean `location_custom`
   * (home/work ⇒ custom). Absent on rows last written by a pre-typed-model
   * build — derive from `location_custom` then (true ⇒ home, else device). */
  location_type?: 'device' | 'home' | 'work';
  /** Human-readable label of the manually-picked address (e.g. "תל אביב"),
   * shown in the settings row when location_type is home/work. Null/undefined
   * when device mode is active. */
  location_label?: string | null;
};

export type Profile = {
  created_at: string;
  user_id: string;
  title: string;
  name: string;
  images: Image[];
  bio?: string;
  family?: FamilyData;
  is_male: boolean;
  last_seen?: string;
  push_enabled?: boolean;
  distance?: number;
  /** Embedded by make_profile when this user's location anchor is home/work
   * (omitted for device). Lets the viewer's distance chip pick the right
   * icon. `location_custom` is still embedded too for old mobile builds. */
  location_type?: 'device' | 'home' | 'work';
};

export type Page1State = 'free' | 'watching' | 'waiting' | 'chat' | 'locked';
export type Page2State = 'free' | 'pending' | 'chat' | 'locked';

export type Page1 = {
  state: Page1State;
  // The single watched counterpart (watching / waiting / chat / locked).
  profile?: Profile;
  message?: string;
  invited_at?: string;
  expires_at?: string;
  extended?: boolean;
};

export type Page2 = {
  state: Page2State;
  profile?: Profile;
  profiles?: Profile[];
  message?: string;
  invited_at?: string;
  expires_at?: string;
  extended?: boolean;
};

// Credits wallet. Lives at relations.credits (sibling of last_add_at /
// availability). Mutated atomically inside the same FOR UPDATE transaction as
// the state transition that spends it. The balance/extra/cap math is the
// source-of-truth in SQL (_credits_* helpers); this type just describes the
// shape the client reads. Tier model retired 2026-06-01: there is no
// `tier` field; total spendable = balance + extra and charging always
// deducts balance first.
// The daily pool's cap, mirroring SQL `_credits_cap()`. One a day since
// 2026-07-22 (was 3): the daily pool has to be a decision, not a number nobody
// reaches. This is the ONLY place the number appears on the server outside the
// SQL helper — `user.ts` seeds a new wallet from it. Also mirrored in
// mobile/src/lib/credits.ts (CREDIT_CAP); change all three in lockstep.
export const CREDIT_CAP = 1;

export type Credits = {
  // Daily pool. Refilled to _credits_cap() == CREDIT_CAP every 20:00
  // Asia/Jerusalem.
  balance: number;
  // Purchased pool, no daily cap. Bought via app_buy_extra (3/10/50). Charge
  // order is balance FIRST, then extra. Refund overflow lands here so a
  // hold + refund cycle never loses a heart.
  extra: number;
  // Reserved against a live waiting invite. `app_invite` moves 1 from balance
  // to held (extra if balance was empty). It is refunded only when the
  // invitation dies without a chat (expiry / decline / the target matching
  // someone else); a MATCH and a self-cancel both consume it (2026-07-29), so
  // a chat costs one credit on each side.
  //
  // The deposit is also SPENDABLE, on one thing: accepting an invitation
  // (2026-07-31). balance + extra pay first, and only where they cannot does
  // app_approve take the accept out of `held` — and then it stays spent, since
  // the invitation the deposit was holding ends with that accept (the person I
  // had invited lands on the same 'cancel' card app_cancel gives him). With a
  // daily pool of 1 the deposit IS the whole wallet of anyone still waiting on
  // an invitation of his own, so without this the app held a user's only credit
  // and refused him the invitation that arrived while it did. When the wallet
  // pays instead, that same ending refunds the deposit like any other death.
  held?: number;
  granted_on?: string | null;
  next_grant_at?: string | null;
};

// Notification-presence signal. Lives at relations.push (sibling of credits /
// availability / last_add_at). Drives push_blocked() in SQL: a user POSITIVELY
// known not to receive notifications (perm 'denied', or a dead Expo token) is
// gated unavailable, exactly like a geo-/group-gated user. `perm` is
// client-reported on start/focus/location (absent on old builds => not gated).
// `dead` is set by app_push_dead when Expo returns DeviceNotRegistered, and
// cleared when a fresh token re-registers. `token` mirrors whether a usable
// push_token is on the row (observability only — NOT a gate input: bare
// missing-token is an unreliable signal, see the push_presence_gate migration).
export type PushPresence = {
  perm?: "granted" | "denied" | "undetermined";
  token?: boolean;
  dead?: boolean;
  checked_at?: string;
};

export type Pages = {
  page1: Page1;
  page2: Page2;
  credits?: Credits;
  push?: PushPresence;
};

// `group_id` / `group_name` ride on group-lifecycle notifications (group_join,
// group_approved) so firePush can interpolate the group name into the body and
// stamp the push payload with the group id the mobile tap handler deep-links to.
export type Notify = { user_id: string; code: string; actor_id?: string; group_id?: string; group_name?: string };

// Push title source. Two regimes:
//   1. Active-interaction codes (invite-in, match, extended, chat) are NOT in this
//      table — firePush falls back to the actor's name as the title.
//   2. pageX.message codes ARE in this table — the title must read identically to
//      the in-app page header for that message (mobile i18n keys home.ended.* /
//      home.page2.*). Tapping deep-links to that pageX.
// Gender suffixes (_m / _f) are picked when the actor's is_male is known; the
// base key is the masculine form (matches the page's tg() default).
export const PUSH_TITLE: Record<string, Record<string, string>> = {
  he: {
    'declined': 'ההזמנה נדחתה',
    'expired-out': 'פג תוקף ההזמנה',
    'expired-in': 'פג תוקף ההזמנה',
    'cancelled-in': 'ההזמנה בוטלה',
    'removed_m': 'לא זמין',
    'removed_f': 'לא זמינה',
    'removed': 'לא זמין',
    'left_m': 'סיים את השיחה',
    'left_f': 'סיימה את השיחה',
    'left': 'סיים את השיחה',
    'invite-fail': 'מישהו הקדים אותך',
    'approve-fail': 'איחרת לאישור',
  },
  en: {
    'declined': 'Invitation declined',
    'expired-out': 'Invitation expired',
    'expired-in': 'Invitation expired',
    'cancelled-in': 'Invitation canceled',
    'removed': 'Unavailable',
    'left': 'Ended chat',
    'invite-fail': 'Already invited',
    'approve-fail': 'You missed the approval',
  },
};

export const PUSH_BODY: Record<string, Record<string, string>> = {
  he: {
    'invite-in': "הזמנה לצ'אט",
    'candidate_m': 'מישהו חדש בקרבתך',
    'candidate_f': 'מישהי חדשה בקרבתך',
    'candidate': 'מישהו חדש בקרבתך',
    'match': 'אתם אחד על אחד',
    'declined': 'ההזמנה נדחתה',
    'expired-out': 'ההזמנה פגה',
    'expired-in': 'ההזמנה פגה',
    'cancelled-in': 'ההזמנה בוטלה',
    'removed': 'הוסרת מרשימת הצופים',
    'left': "הצ'אט הסתיים",
    'extended': 'ההזמנה הוארכה',
    'invite-fail': 'מישהו הקדים אותך',
    'approve-fail': 'איחרת לאישור',
    'chat': 'התקבלה הודעה',
    'area-open': 'המשחק התחיל! האפליקציה זמינה עכשיו באזור שלך',
    'area-closed': 'האפליקציה כבר לא זמינה באזור שלך',
    // Referral payout. Actor = the friend who joined, so firePush titles it
    // with THEIR name and this line explains why a credit just appeared.
    'referral_m': 'הצטרף דרך ההזמנה שלך, קיבלת קרדיט',
    'referral_f': 'הצטרפה דרך ההזמנה שלך, קיבלת קרדיט',
    'referral': 'הצטרף דרך ההזמנה שלך, קיבלת קרדיט',
    'friend_request': 'נשלחה אליך בקשת חברות',
    'friend_accept': 'בקשת החברות שלך אושרה',
    // Auto-link via an invite link (no request/approval). Actor = the friend
    // who opened the link, so firePush titles it with THEIR name.
    'friend_link_m': 'הצטרף אליך כחבר ב-Once',
    'friend_link_f': 'הצטרפה אליך כחברה ב-Once',
    'friend_link': 'הצטרף אליך כחבר ב-Once',
    // Circle join-approval. {group} is interpolated with the circle name in
    // firePush. group_join is gendered on the requester (the actor); the push
    // payload carries group_id so tapping deep-links to that circle.
    // THE WORD A USER READS IS "מעגל" (user directive 2026-08-01) — the codes,
    // the payload keys and the {group} placeholder are identifiers and stay as
    // they are; only these sentences moved, and with them the gender of every
    // word agreeing with the noun (עברה → עבר).
    'group_join_m': 'ביקש להצטרף למעגל {group}',
    'group_join_f': 'ביקשה להצטרף למעגל {group}',
    'group_join': 'ביקש להצטרף למעגל {group}',
    'group_approved': 'בקשתך להצטרף למעגל {group} אושרה',
    // Nudge from the cron sweep: a queue nobody answered for two days. No
    // actor, so the push title falls back to the app name.
    'group_pending': '{count} בקשות הצטרפות מחכות לתשובה במעגל {group}',
    // Ownership succession: the owner deleted their account and app_delete_cleanup
    // handed the circle to its most senior manager, else its most senior member.
    // The actor is already gone by the time the push fires, so the title falls
    // back to the app name.
    'group_owner': 'המעגל {group} עבר לניהול שלך',
  },
  en: {
    'invite-in': 'Chat invitation',
    'candidate': 'Someone new nearby',
    'match': 'One on one',
    'declined': 'Invitation declined',
    'expired-out': 'Invitation expired',
    'expired-in': 'Invitation expired',
    'cancelled-in': 'Invitation cancelled',
    'removed': 'Removed from viewers',
    'left': 'Chat ended',
    'extended': 'Invitation extended',
    'invite-fail': 'Already invited',
    'approve-fail': 'You missed the approval',
    'chat': 'New message',
    'area-open': 'The game has started. The app is now available in your area.',
    'area-closed': 'The app is no longer available in your area.',
    'referral': 'Joined with your invite. You earned a credit.',
    'friend_request': 'You have a new friend request',
    'friend_accept': 'Your friend request was accepted',
    'friend_link': 'Connected with you as a friend on Once',
    'group_join': 'Asked to join {group}',
    'group_approved': 'Your request to join {group} was approved',
    'group_pending': '{count} join requests are waiting in {group}',
    'group_owner': 'You are now the owner of {group}',
  },
};

/** Pull a push line out of one of the two tables above, in the ACTOR's gender.
 *
 *  Every gendered line in this catalog is about the person the push is ABOUT
 *  (who joined, who asked, who left), never about the reader — the reader's own
 *  half of each sentence is written genderless on purpose. Lives here rather
 *  than in one edge function because BOTH senders need it: app/index.ts for the
 *  game's lifecycle pushes and ext/index.ts for friends, referrals and groups.
 *  ext used to look the bare code up and so sent every one of its gendered
 *  bodies in the masculine ("ביקש להצטרף") whatever the actor's sex.
 *  A null sex (or a code with no variants) falls back to the base key, which is
 *  the masculine form — the same default the app's own tg() takes. */
export function pickGendered(
  table: Record<string, Record<string, string>>,
  code: string,
  lang: string,
  actorIsMale: boolean | null,
): string | undefined {
  const dict = table[lang] ?? table.he;
  if (actorIsMale !== null) {
    const variant = dict[`${code}_${actorIsMale ? "m" : "f"}`];
    if (variant) return variant;
  }
  return dict[code];
}

// Operator alerting. A join-to-group request is emailed here (fire-and-forget
// from the join_request endpoint) so the admin knows to add the user to a
// group — the user is otherwise gated and stuck until then. ADMIN_USER_URL is
// the single source of truth for the deep-link into the web admin. It is
// LOCALE-LESS on purpose: every internal admin link in the web app is
// `/admin/...` and the Next middleware (web/src/proxy.ts) adds the locale via
// rewrite. A `/he/admin/...` form would 404 (double prefix) AND bypass the
// middleware auth guard (its check is pathname.startsWith("/admin")). If the
// admin isn't signed in the middleware redirects to /admin/login?next=<this>
// and bounces back here after Google sign-in.
export const SUPPORT_EMAIL = "once.app.support@gmail.com";
// onboarding@resend.dev is Resend's shared sender that needs no domain
// verification (delivers to the Resend account's own address, which is
// once.app.support@gmail.com == SUPPORT_EMAIL). Swap to a once.app address
// once that domain is Resend-verified for a branded from.
export const EMAIL_FROM = "Once <onboarding@resend.dev>";
export const ADMIN_USER_URL = (userId: string) =>
  `https://once-lake.vercel.app/users/${userId}`;

export type RpcResult = {
  user?: Record<string, unknown>;
  notify?: Notify[];
  error?: string;
  processed?: number;
};

export type PushToken = { type: "expo"; token: string };

export class LogEntry {
  log: Log;
  task: string;
  body?: Record<string, unknown>;
  created_at: Date = new Date();
  run_ms?: number;
  data?: unknown;
  error?: unknown;

  constructor(log: Log, task: string, body?: Record<string, unknown>) {
    this.log = log;
    this.task = task;
    this.body = body;
  }

  result(data: unknown, status: number) {
    this.run_ms = new Date().getTime() - this.created_at.getTime();
    if (status >= 200 && status < 300) this.data = data;
    else {
      this.error = data;
      this.log.status = status;
      this.log.error_response = this.error;
    }
  }

  toJSON() {
    return {
      task: this.task,
      body: this.body,
      created_at: this.created_at,
      run_ms: this.run_ms,
      data: this.data,
      error: this.error,
    };
  }
}
