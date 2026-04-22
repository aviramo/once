import Action from "./action.ts";

declare global {

  const EdgeRuntime: {
    waitUntil(promise: Promise<unknown>): void;
  };
}

export enum State {
  OFF = "OFF",
  HIDDEN = "HIDDEN",
  VISIBLE = "VISIBLE",
  WATCHING = "WATCHING",
  WAITING = "WAITING",
  REPLYING = "REPLYING",
  CHAT = "CHAT",
  OTHER_CANCELLED = "OTHER_CANCELLED",
  OTHER_REFUSED = "OTHER_REFUSED",
  OTHER_LEFT = "OTHER_LEFT",
  OTHER_REMOVED = "OTHER_REMOVED",
  OTHER_LOGGED_OUT = "OTHER_LOGGED_OUT",
  OTHER_INVITED = "OTHER_INVITED",
  OTHER_HIDDEN = "OTHER_HIDDEN",
  OTHER_DELETED = "OTHER_DELETED",
  OTHER_OFF = "OTHER_OFF",
}

export type Image = {
  normal?: string;
  hash: string;
};

export type Data = {
  name: string;
  bio: string,
  images: Image[],
  units: string,
  os: string,
  lang: string,
  push_token: JSON | null,
  role?: string | null;
};

export type Profile = {
  created_at: Date;
  user_id: string;
  title: string;
  name: string;
  images: Image[],
  bio: string;
  is_male: boolean;
  is_for_kids: boolean | null;
  last_seen?: Date;
  push_enabled?: boolean;
  distance?: number;
};

export type StateChange = {
  event_id: string;
  created_at: Date;
  user_id: string;
  state: State;
  other_id: string | null;
};

export type PushToken = { type: "expo"; token: string };

export class Log {
  action: Action
  task: string;
  body?: Record<string, unknown>;
  created_at: Date = new Date();
  run_ms?: number;
  data?: unknown;
  error?: unknown;

  constructor(action: Action, task: string, body?: Record<string, unknown>) {
    this.action = action;
    this.task = task;
    this.body = body;
  }

  result(data: unknown, status: number) {
    this.run_ms = new Date().getTime() - this.created_at.getTime();
    if (status >= 200 && status < 300) this.data = data;
    else {
      this.error = data;
      this.action.status = status;
      this.action.error_response = this.error;
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