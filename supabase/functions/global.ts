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
    LEFT = "LEFT"
}

type BaseMatch = {
  created_at: Date | null;
  user_id: string;
  last_seen?: Date;
  title: string;
  is_male?: boolean;
  subscribed?: boolean;
  message?: string;
  is_for_kids?: boolean | null;
  distance?: number | null;
};

export type Match = BaseMatch & {
  images?: string[];
};

export type Watcher = BaseMatch & {
  image?: string;
};