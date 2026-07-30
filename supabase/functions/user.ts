import lodash from "lodash";
import Tools from "./tools.ts";
import Log from "./log.ts";
import { Data, Pages, PushToken, CREDIT_CAP } from "./global.ts";

// A new wallet starts at the daily pool's cap, taken from CREDIT_CAP rather
// than typed here — the literal `3` sat in this seed for a week after the cap
// dropped to 1 (2026-07-22), so every signup got a silent 3-credit bonus.
// extra 0 / held 0 == nothing purchased, nothing reserved against a live
// waiting invite. granted_on / next_grant_at are intentionally omitted: the
// next /ext/cron tick (≤60s) runs app_credits_grant, which fills both.
//
// A FACTORY, never a shared module constant (2026-07-30). It used to be a
// single `const defaultRelations` handed out by reference, and the constructor
// below runs `lodash.merge(this, data)` while `this.relations` still points AT
// it — lodash merges INTO the destination, so every user loaded by an isolate
// deep-merged their own page1/page2/credits/communities into the one shared
// seed. The next signup served by that warm isolate was then INSERTED carrying
// the previous user's relations: a phantom watcher, a candidate they never
// drew, someone else's wallet. It happened in production to a user who deleted
// his account and immediately re-registered (2026-07-30 16:03Z): the auth
// identity survives a delete, so he came back on the same user_id and his new,
// photo-less row was born with his own pre-delete page1/page2 restored.
// Nothing may hand out this object; every caller gets its own copy.
const newRelations = (): Pages => ({
  page1: { state: "locked" },
  page2: { state: "free" },
  credits: { balance: CREDIT_CAP, extra: 0, held: 0 },
});

export default class User {
  user_id: string;
  is_male: boolean = true;
  last_seen: Date = new Date();
  birth_date?: Date;
  location: string | null = null;
  range?: number;
  age_from?: number;
  age_to?: number;
  is_for_male?: boolean;
  is_for_female?: boolean;
  name: string | null = null;
  data: Data = { images: [], os: "unknown", lang: "unknown", push_token: null };
  relations: Pages = newRelations();
  db: { new: Record<string, unknown>; old: Record<string, unknown> } = { new: {}, old: {} };

  static LEGAL = 18;

  constructor(data: string | Record<string, unknown>) {
    if (typeof data === "string") this.user_id = data;
    else {
      this.user_id = data.user_id as string;
      lodash.merge(this, data);
      // lodash.merge can clobber the relations subtree by merging keys instead
      // of replacing the page1/page2 objects wholesale; override to preserve.
      this.relations = (data.relations as Pages) ?? newRelations();
      this.db = { new: { ...data }, old: lodash.cloneDeep(data) };
    }
  }

  static async getById(log: Log, user_id: string) {
    const data = await Tools.invoke(log, "get user", Tools.supabase.from("users").select().eq("user_id", user_id));
    if (data && data[0]) return new User(data[0]);
  }

  static async getByRequest(log: Log, req: Request) {
    const token = req.headers.get("authorization")?.split(" ")[1];
    const auth = await Tools.supabase.auth.getUser(token);
    if (!auth.data.user) return;
    return (await User.getById(log, auth.data.user.id)) ?? new User(auth.data.user.id);
  }

  age() {
    if (this.birth_date) return Math.floor((Date.now() - new Date(this.birth_date).getTime()) / 31536000000);
    return 0;
  }

  async insert(log: Log, name: string, birth_date: Date, is_male: boolean) {
    this.birth_date = birth_date;
    const age = this.age();
    if (age < User.LEGAL) return log.error("insert", "age", 400);
    this.name = name;
    this.is_male = is_male;
    this.is_for_male = !is_male;
    this.is_for_female = is_male;
    // Gendered default age spans: men +5/-10, women -10/+5 (age_from floored
    // at the legal minimum). age_to is unclamped.
    this.age_from = Math.max(is_male ? age - 10 : age - 5, User.LEGAL);
    this.age_to = is_male ? age + 5 : age + 10;
    // range left unset => NULL = unlimited search distance. others() treats a
    // NULL range as "no distance filter" (LEAST(me.range, other.range) IS NULL
    // skips st_dwithin, and the relevance_location factor falls back to 1.0).
    this.range = undefined;
    this.relations = newRelations();
    const { db: _db, ...rest } = this;
    const data = await Tools.invoke(log, "insert", Tools.supabase.from("users").insert(rest).select());
    if (data && data[0]) {
      Object.assign(this, data[0]);
      this.db.new = { ...data[0] };
      this.db.old = lodash.cloneDeep(data[0]);
    }
  }

  delta() {
    const delta = lodash.omitBy(this, (v: unknown, k: string) => k === "db" || lodash.isEqual(v, (this.db.old as Record<string, unknown>)?.[k]));
    delete (delta as Record<string, unknown>).db;
    return delta as Record<string, unknown>;
  }

  async persist(log: Log) {
    const delta = this.delta();
    if (lodash.size(delta) === 0) return;
    const data = await Tools.invoke(log, "update user", Tools.supabase.from("users").update(delta).eq("user_id", this.user_id).select());
    if (data && data[0]) {
      Object.assign(this, data[0]);
      this.db.new = { ...data[0] };
      this.db.old = lodash.cloneDeep(data[0]);
    }
  }

  async delete(log: Log) {
    await Tools.invoke(log, "delete", Tools.supabase.from("users").delete().eq("user_id", this.user_id));
  }

  pushToken(): PushToken | null {
    const t = this.data?.push_token;
    if (!t) return null;
    if (typeof t === "string") {
      try {
        return JSON.parse(t) as PushToken;
      } catch {
        return null;
      }
    }
    return t as unknown as PushToken;
  }
}
