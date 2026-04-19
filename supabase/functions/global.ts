declare global {

  const EdgeRuntime: {
    waitUntil(promise: Promise<unknown>): void;
  };
}

export enum State {
  HIDDEN = "HIDDEN",
  VISIBLE = "VISIBLE",
  WATCHING = "WATCHING",
  WAITING = "WAITING",
  REPLYING = "REPLYING",
  CHAT = "CHAT",
  CANCELLED = "CANCELLED",
  MISSED = "MISSED",
  REFUSED = "REFUSED",
  LEFT = "LEFT",
  REMOVED = "REMOVED",
  LOGGED_OUT = "LOGGED_OUT",
  INVITED = "INVITED",
  HID = "HID",
  DELETED = "DELETED",
}

export type UserData = {
  bio?: string,
  images: { normal: string[], blur: string[] },
  units?: string,
  os?: string,
  lang?: string,
  push_token: JSON | null,
  match: Match | null,
  wachers: Record<string, Watcher>;
};

type BaseMatch = {
  created_at: Date;
  user_id: string;
  last_seen?: Date;
  title: string;
  name?: string;
  is_male?: boolean;
  push_enabled?: boolean;
  bio?: string;
  is_for_kids: boolean | null;
  distance?: number;
};

export type Match = BaseMatch & {
  images?: string[];
};

export type Watcher = BaseMatch & {
  image?: string;
};

export type PushToken = { type: "expo"; token: string };