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