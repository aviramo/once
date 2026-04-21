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