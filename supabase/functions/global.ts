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

export type ProfileItem =
  | { kind: "photo"; normal?: string; hash: string }
  | { kind: "bio"; value: string }
  | { kind: "kids"; value: boolean };

export type Data = {
  items: ProfileItem[];
  units: string;
  os: string;
  lang: string;
  appearance: string;
  push_token: PushToken | null;
  role?: string | null;
};

export type Profile = {
  created_at: string;
  user_id: string;
  title: string;
  name: string;
  images: Image[];
  bio: string;
  is_male: boolean;
  is_for_kids: boolean | null;
  last_seen?: string;
  push_enabled?: boolean;
  distance?: number;
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

export const PUSH_BODY: Record<string, Record<string, string>> = {
  he: {
    'invite-in': "הזמנה לצ'אט",
    'match': 'אתם אחד על אחד',
    'declined': 'ההזמנה נדחתה',
    'expired-out': 'ההזמנה פגה',
    'expired-in': 'ההזמנה פגה',
    'cancelled-in': 'ההזמנה בוטלה',
    'removed': 'הוסרת מרשימת הצופים',
    'left': "הצ'אט הסתיים",
    'extended': 'ההזמנה הוארכה',
    'invite-fail': 'איחרת להזמנה',
    'approve-fail': 'איחרת לאישור',
    'chat': 'התקבלה הודעה',
  },
  en: {
    'invite-in': 'Chat invitation',
    'match': 'One on one',
    'declined': 'Invitation declined',
    'expired-out': 'Invitation expired',
    'expired-in': 'Invitation expired',
    'cancelled-in': 'Invitation cancelled',
    'removed': 'Removed from viewers',
    'left': 'Chat ended',
    'extended': 'Invitation extended',
    'invite-fail': 'You missed it',
    'approve-fail': 'You missed the approval',
    'chat': 'New message',
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
