import lodash from "lodash";
import Tools, { Subscription } from "./tools.ts";
import Logger from "./logger.ts";
import { State, Match, Watcher, UserData } from "./global.ts";

export default class User {
  user_id: string;
  is_active: boolean = true;
  is_male?: boolean;
  last_seen: Date = new Date();
  name?: string;
  birth_date?: Date;
  state: State | null = null;
  other_id: string | null = null;
  match: Match | null = null;
  location: string | null = null;
  range?: number;
  age_from?: number;
  age_to?: number;
  is_for_male?: boolean;
  is_for_female?: boolean;
  is_for_kids: boolean | null = null;
  role?: string | null;
  watchers: Record<string, Watcher> = {};
  data?: UserData;

  db: { new: Record<string, unknown>, old: Record<string, unknown> } = { new: {}, old: {} };

  static LEGAL = 18;
  static WATCHERS = 5;

  constructor(data: string | Record<string, unknown>) {
    if (typeof data === 'string') this.user_id = data;
    else {
      this.user_id = data.user_id as string;
      lodash.merge(this, data);
      this.db = { new: data, old: lodash.cloneDeep(data) };
    }
  }

  static async getAuth(req: Request) {
    const token = req.headers.get("authorization")?.split(" ")[1];
    const auth = await Tools.supabase.auth.getUser(token);
    return auth.data.user;
  }

  static async getById(logger: Logger, user_id: string) {
    const data = await Tools.invoke(logger, "get user", Tools.supabase.from("users").select().eq("user_id", user_id));
    if (data && data[0]) return new User(data[0]);
  }

  static async getByRequest(logger: Logger, req: Request) {
    const token = req.headers.get("authorization")?.split(" ")[1];
    const auth = await Tools.supabase.auth.getUser(token);
    if (!auth.data.user) return;
    return await User.getById(logger, auth.data.user.id) ?? new User(auth.data.user.id);
  }

  async insert(logger: Logger, name: string, birth_date: Date, is_male: boolean) {
    this.birth_date = birth_date;
    const age = this.age();
    if (age < User.LEGAL) return logger.error('insert', 'age', 400);
    const values = {
      user_id: this.user_id,
      name: name,
      birth_date: birth_date,
      is_male: is_male,
      is_for_male: !is_male,
      is_for_female: is_male,
      age_from: Math.max(is_male ? age - 10 : age - 5, User.LEGAL),
      age_to: is_male ? age + 5 : age + 10,
      range: 100000,
      watchers: {},
    }
    const data = await Tools.invoke(logger, 'insert', Tools.supabase.from("users").insert(values).select());
    if (data) {
      lodash.merge(this, data[0]);
      lodash.merge(this.db.new, data[0]);
    }
  }

  validate(other?: User) {
    if (this.age_from && this.age_from < User.LEGAL) this.age_from = User.LEGAL;
    if (this.age_from && this.age_to && this.age_from > this.age_to) this.age_to = this.age_from;
    if (this.state && [State.WATCHING, State.WAITING, State.REPLYING, State.CHAT].includes(this.state)) {
      this.setMatch(other);
      this.watchers = {};
    }
    else this.other_id = null;
  }

  async update(logger: Logger, state?: State, other?: User, notify?: boolean) {
    if (state) {
      this.state = state;
      this.other_id = other?.user_id ?? null;
    }
    this.validate(other);
    const delta = this.delta();
    if (lodash.size(delta) > 0) {
      lodash.merge(this.db.new, delta);
      let query = Tools.supabase.from("users").update(delta).eq("user_id", this.user_id);
      if (this.state == State.REPLYING) query = query.is("other_id", null);
      const data = await Tools.invoke(logger, 'update', query.select());
      if (data && data[0]) {
        lodash.merge(this, data[0]);
        lodash.merge(this.db.new, data[0]);
        if (notify) EdgeRuntime.waitUntil(this.notify(state));
        return true;
      } else lodash.merge(this.db.new, this.db.old);
    }
    return false;
  }

  async notify(state?: State) {
    const logger = new Logger('notify', { state }, this);
    const matchImageFilename = (this.match?.images as string[] | undefined)?.[0];
    const matchImageUrl = matchImageFilename && this.match?.user_id
      ? `${Tools.supabaseUrl}/storage/v1/object/public/users/${this.match.user_id}/normal/${matchImageFilename}`
      : null;
    const payload = {
      type: state ? 'state' : 'message',
      state: state ?? null,
      match: this.match,
      icon: matchImageUrl,
    };
    const log = logger.log("notify", payload);
    if (!this.data?.subscription) return logger.error('notify', "no subscription", 400);
    const subJson: Subscription | null =
      typeof this.data.subscription === "string"
        ? JSON.parse(this.data.subscription)
        : this.data.subscription as unknown as Subscription | null;
    if (subJson?.type !== "expo" || !subJson.token)
      return logger.error('notify', "subscription missing token", 400);
    const result = await Tools.notify(log, subJson, payload);
    if (!result.ok) {
      const dead = result.error === "DeviceNotRegistered" || result.error === "InvalidCredentials";
      if (dead) {
        this.data.subscription = null;
        EdgeRuntime.waitUntil(this.update(logger));
      }
      return logger.error('notify', `failed to send notification: ${result.error ?? "unknown"}`, 500);
    }
    return logger.response();
  }

  // deno-lint-ignore no-explicit-any
  async others(logger: Logger, extend?: (query: any) => any, exclude?: User) {
    const sp = "others";
    const others: Other[] = [];
    this.db.new.location = this.location;
    let query = Tools.supabase.rpc(sp, { me: this.db.new });
    if (exclude) query = query.neq("user_id", exclude.user_id);
    if (extend) query = extend(query);
    const data = await Tools.invoke(logger, sp, query.select());
    if (Array.isArray(data)) for (const d of data) others.push(new Other(d));
    return others;
  }

  async other(logger: Logger) {
    if (!this.other_id) return;
    return (await this.others(logger, query => query.eq("user_id", this.other_id)))[0];
  }

  renderMatch(other?: User): Match | null {
    const match: Match | null = other ? {
      created_at: this.match?.created_at ?? new Date(),
      user_id: other.user_id,
      last_seen: other.last_seen,
      title: other.name + ', ' + other.age(),
      is_male: other.is_male,
      subscribed: other.data?.subscription != null,
      images: (other.data?.images)?.normal,
      bio: other.data?.bio,
      is_for_kids: other.is_for_kids,
      distance: other instanceof Other ? other.distance : this instanceof Other ? this.distance : undefined,
    } : this.match;
    if (match)
      switch (this.state) {
        case State.CHAT:
          delete match.distance;
          break;
        case State.MISSED:
        case State.REFUSED:
        case State.LEFT:
        case State.CANCELLED:
          delete match.distance;
          delete match.last_seen;
          delete match.subscribed;
          break;
      }
    return match;
  }

  setMatch(other?: User) {
    this.match = this.renderMatch(other);
  }

  setWatcher(other: User) {
    const match = this.renderMatch(other);
    if (match) {
      const { images: _images, ...rest } = match;
      const watcher: Watcher = { ...rest, image: other.data?.images?.blur?.[0] };
      if (this.watchers[other.user_id]?.created_at) watcher.created_at = new Date();
      this.watchers[other.user_id] = watcher;
    }
  }

  async addWatchers(logger: Logger) {
    const watchersToAdd = User.WATCHERS - Object.keys(this.watchers).length;
    for (const watcher of await this.others(logger, query => query.is("other_id", null).gt("relevance", 0).eq('state', State.HIDDEN).limit(watchersToAdd).order("relevance", { ascending: false }))) {
      this.setWatcher(watcher);
      EdgeRuntime.waitUntil(watcher.update(logger, State.WATCHING, this, true));
    }
  }

  async updateRelations(logger: Logger, other?: Other) {
    const watchers = await this.others(logger, query => {
      return query.eq("other_id", this.user_id);
    });
    let otherUpdated = false;
    for (const watcher of watchers) {
      watcher.setMatch(this);
      if (this.other_id == watcher.user_id) {
        this.setMatch(watcher);
        otherUpdated = true;
      }
      else
        this.setWatcher(watcher);
      EdgeRuntime.waitUntil(watcher.update(logger));
    }
    if (!otherUpdated && other) {
      this.setMatch(other);
      other.setWatcher(this);
      EdgeRuntime.waitUntil(other.update(logger));
    }

  }

  removeRrlations(logger: Logger, state: State, other?: Other, exclude?: User) {
    for (const watcher_id of Object.keys(this.watchers)) {
      if (watcher_id != exclude?.user_id)
        EdgeRuntime.waitUntil(this.removeRelation(logger, state, watcher_id));
    }
    if (other) EdgeRuntime.waitUntil(other.update(logger, state, this, true));
  }

  async removeRelation(logger: Logger, state: State, watcher_id: string) {
    delete this.watchers[watcher_id];
    const watcher = await User.getById(logger, watcher_id);
    await watcher?.update(logger, state, this, true);
  }

  async action(logger: Logger, key: string) {
    await Tools.invoke(logger, 'action', Tools.supabase.from("actions").insert({ user_id: this.user_id, other_id: this.other_id, key: key }));
  }

  async delete(logger: Logger) {
    await Tools.invoke(logger, 'delete', Tools.supabase.from("users").delete().eq("user_id", this.user_id));
  }

  async reset(logger: Logger, state: State) {
    await Tools.invoke(logger, 'reset log', Tools.supabase.from("log").delete().not("user_id", "is", null));
    await Tools.invoke(logger, 'reset log', Tools.supabase.from("log").delete().is("user_id", null));
    await Tools.invoke(logger, 'reset chat', Tools.supabase.from("chat").delete().not("user_id", "is", null));
    await Tools.invoke(logger, 'reset actions', Tools.supabase.from("actions").delete().not("user_id", "is", null));
    await Tools.invoke(logger, 'reset users', Tools.supabase.from("users").update({ state: state, other_id: null, match: null, watchers: {} }).not("user_id", "is", null));
    this.other_id = null;
    this.match = null;
    this.watchers = {};
  }

  async chat(logger: Logger, text: string, is_event: boolean = false) {
    const data = await Tools.invoke(logger, 'chat', Tools.supabase.from("chat").insert({ user_id: this.user_id, other_id: this.other_id, text: text, is_event: is_event }));
    if (data) return data[0];
  }

  delta() {
    const delta = lodash.omitBy(this, (v: unknown, k: string) => lodash.isEqual(v, (this.db.new as Record<string, unknown>)?.[k]));
    delete (delta as Record<string, unknown>).db;
    return delta;
  }

  age() {
    if (this.birth_date) return Math.floor((Date.now() - new Date(this.birth_date).getTime()) / 31536000000);
    return 0;
  }

}

export class Other extends User {

  distance: number;

  constructor(data: Record<string, unknown>) {
    super(data.user as Record<string, unknown>);
    this.distance = data.distance as number;
  }

  override delta() {
    const delta = super.delta();
    delete (delta as Record<string, unknown>).distance;
    return delta;
  }

}