import lodash from "lodash";
import Tools from "./tools.ts";
import Log from "./log.ts";
import { Data, Pages, PushToken } from "./global.ts";

const defaultRelations: Pages = { page1: { state: "locked" }, page2: { state: "free" } };

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
  is_for_kids: boolean | null = null;
  name: string | null = null;
  data: Data = { items: [], units: "km", os: "unknown", lang: "unknown", appearance: "light", push_token: null };
  relations: Pages = defaultRelations;
  db: { new: Record<string, unknown>; old: Record<string, unknown> } = { new: {}, old: {} };

  static LEGAL = 18;

  constructor(data: string | Record<string, unknown>) {
    if (typeof data === "string") this.user_id = data;
    else {
      this.user_id = data.user_id as string;
      lodash.merge(this, data);
      // lodash.merge can clobber the relations subtree by merging keys instead
      // of replacing the page1/page2 objects wholesale; override to preserve.
      this.relations = (data.relations as Pages) ?? defaultRelations;
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
    this.age_from = Math.max(is_male ? age - 10 : age - 5, User.LEGAL);
    this.age_to = is_male ? age + 5 : age + 10;
    this.range = 100000;
    this.relations = defaultRelations;
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
