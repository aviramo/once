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

export type Pages = {
  page1: Page1;
  page2: Page2;
};

export type Notify = { user_id: string; code: string; actor_id?: string };

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
  },
};

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
