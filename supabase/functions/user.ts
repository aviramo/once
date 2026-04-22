import lodash from "lodash";
import Tools from "./tools.ts";
import Action from "./action.ts";
import { Data, PushToken, State, Profile } from "./global.ts";

export default class User {
  user_id: string;
  is_male: boolean = true;
  last_seen: Date = new Date();
  birth_date?: Date;
  state: State | null = null;
  other_id: string | null = null;
  location: string | null = null;
  range?: number;
  age_from?: number;
  age_to?: number;
  is_for_male?: boolean;
  is_for_female?: boolean;
  is_for_kids: boolean | null = null;
  relations: { match: Profile | null, watchers: Profile[] } = { match: null, watchers: [] };
  data?: Data;

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

  static async getById(action: Action, user_id: string) {
    const data = await Tools.invoke(action, "get user", Tools.supabase.from("users").select().eq("user_id", user_id));
    if (data && data[0]) return new User(data[0]);
  }

  static async getByRequest(action: Action, req: Request) {
    const token = req.headers.get("authorization")?.split(" ")[1];
    const auth = await Tools.supabase.auth.getUser(token);
    if (!auth.data.user) return;
    return await User.getById(action, auth.data.user.id) ?? new User(auth.data.user.id);
  }

  async insert(action: Action, name: string, birth_date: Date, is_male: boolean) {
    this.birth_date = birth_date;
    const age = this.age();
    if (age < User.LEGAL) return action.error('insert', 'age', 400);
    const values = {
      user_id: this.user_id,
      data: { name: name },
      birth_date: birth_date,
      is_male: is_male,
      is_for_male: !is_male,
      is_for_female: is_male,
      age_from: Math.max(is_male ? age - 10 : age - 5, User.LEGAL),
      age_to: is_male ? age + 5 : age + 10,
      range: 100000,
    }
    const data = await Tools.invoke(action, 'insert', Tools.supabase.from("users").insert(values).select());
    if (data) {
      lodash.merge(this, data[0]);
      lodash.merge(this.db.new, data[0]);
    }
  }

  async update(action: Action, state?: State, other?: User, notify?: boolean) {
    if (state) {
      this.state = state;
      this.other_id = other?.user_id ?? null;
    }
    this.setMatch(other);
    const delta = this.delta();
    if (lodash.size(delta) > 0) {
      Object.assign(this.db.new, delta);
      let query = Tools.supabase.from("users").update(delta).eq("user_id", this.user_id);
      if (this.state == State.REPLYING) query = query.is("other_id", null);
      const data = await Tools.invoke(action, 'update', query.select());
      if (data && data[0]) {
        const otherId = this.other_id ?? this.db.old.other_id as string | null;
        if (state && (state != this.db.old.state || otherId != this.db.old.other_id))
          if (state && (state != this.db.old.state || this.other_id != this.db.old.other_id)) await Tools.stateChange(action, state, otherId);
        Object.assign(this, data[0]);
        Object.assign(this.db.new, data[0]);
        if (notify) EdgeRuntime.waitUntil(this.notify(action, state));
        return true;
      } else lodash.merge(this.db.new, this.db.old);
    }
    return false;
  }

  async notify(action: Action, state?: State) {
    const matchImageFilename = (this.relations.match?.images as string[] | undefined)?.[0];
    const matchImageUrl = matchImageFilename && this.relations.match?.user_id
      ? `${Tools.supabaseUrl}/storage/v1/object/public/users/${this.relations.match.user_id}/normal/${matchImageFilename}`
      : null;
    const payload = {
      type: state ? 'state' : 'message',
      state: state ?? null,
      match: this.relations.match,
      icon: matchImageUrl,
      collapseId: this.relations.match?.user_id ?? undefined,
    };
    const log = action.log("notify", payload);
    if (!this.data?.push_token) return;// action.error('notify', "no push token", 400);
    const subJson: PushToken | null =
      typeof this.data.push_token === "string"
        ? JSON.parse(this.data.push_token)
        : this.data.push_token as unknown as PushToken | null;
    if (subJson?.type !== "expo" || !subJson.token)
      return; // action.error('notify', "push token missing token", 400);
    const result = await Tools.notify(log, subJson, payload);
    if (!result.ok) {
      const dead = result.error === "DeviceNotRegistered" || result.error === "InvalidCredentials";
      if (dead) {
        this.data.push_token = null;
        EdgeRuntime.waitUntil(this.update(action));
      }
      // return action.error('notify', `failed to send notification: ${result.error ?? "unknown"}`, 500);
    }
  }

  // deno-lint-ignore no-explicit-any
  async others(action: Action, extend?: (query: any) => any, exclude?: User) {
    const others: Other[] = [];
    let query = Tools.supabase.rpc("others", { me: { ...this.db.new, location: this.location } });
    if (exclude) query = query.neq("user_id", exclude.user_id);
    if (extend) query = extend(query);
    const data = await Tools.invoke(action, "others", query.select());
    if (Array.isArray(data)) for (const d of data) others.push(new Other(d));
    return others;
  }

  async other(action: Action) {
    if (this.other_id) return (await this.others(action, query => query.eq("user_id", this.other_id)))[0];
  }


  profile(other: User): Profile | null {
    const images = this.state == State.VISIBLE
      ? (other.data?.images ?? []).map(img => ({ hash: img.hash }))
      : (other.data?.images ?? [])
    return other.data ? {
      created_at: new Date(),
      user_id: other.user_id,
      last_seen: other.last_seen,
      title: other.data.name + ', ' + other.age(),
      name: other.data.name,
      is_male: other.is_male,
      push_enabled: other.data.push_token != null,
      images,
      bio: other.data.bio,
      is_for_kids: other.is_for_kids,
      distance: other instanceof Other ? other.distance : this instanceof Other ? this.distance : undefined,
    } : null
  }

  setMatch(other?: User) {
    if (this.state && [State.WATCHING, State.WAITING, State.REPLYING, State.CHAT].includes(this.state)) {
      if (other) this.relations.match = this.profile(other);
    }
    else this.other_id = null;
    if (this.relations.match) {
      if (this.state == State.CHAT) delete this.relations.match.distance;
      if (!this.other_id) {
        delete this.relations.match.distance;
        delete this.relations.match.last_seen;
        delete this.relations.match.push_enabled;
      }
    }
  }

  setWatcher(other: User) {
    const watcher = this.relations.watchers.find(w => w.user_id === other.user_id);
    const newWatcher = this.profile(other);
    if (watcher && newWatcher) Object.assign(watcher, newWatcher);
    else if (newWatcher) this.relations.watchers.push(newWatcher);
  }

  async addWatchers(action: Action) {
    if (this.relations.watchers.length >= User.WATCHERS) return;
    for (const watcher of await this.others(action, query => query.is("other_id", null).gt("relevance", 0).eq('state', State.HIDDEN).order("relevance", { ascending: false }))) {
      this.setWatcher(watcher);
      EdgeRuntime.waitUntil(watcher.update(action, State.WATCHING, this, true));
    }
  }

  async updateRelations(action: Action, other?: Other) {
    const watchers = await this.others(action, query => {
      return query.eq("other_id", this.user_id);
    });
    let otherUpdated = false;
    for (const watcher of watchers) {
      this.setMatch(this);
      if (this.other_id == watcher.user_id) {
        this.setMatch(watcher);
        otherUpdated = true;
      }
      else
        this.setWatcher(watcher);
      EdgeRuntime.waitUntil(watcher.update(action));
    }
    if (!otherUpdated && other) {
      this.setMatch(other);
      other.setWatcher(this);
      EdgeRuntime.waitUntil(other.update(action));
    }
  }

  removeRelations(action: Action, state: State, other?: Other, exclude?: User) {
    for (const watcher of this.relations.watchers) {
      if (watcher.user_id != exclude?.user_id)
        EdgeRuntime.waitUntil(this.removeRelation(action, state, watcher.user_id));
    }
    if (other) EdgeRuntime.waitUntil(other.update(action, state, this, true));
  }

  async removeRelation(action: Action, state: State, watcher_id: string) {
    this.relations.watchers = this.relations.watchers.filter(w => w.user_id !== watcher_id);
    const watcher = await User.getById(action, watcher_id);
    await watcher?.update(action, state, this, true);
  }

  async restriction(action: Action) {
    await Tools.invoke(action, 'restriction', Tools.supabase.from("restrictions").insert({ user_id: this.user_id, other_id: this.other_id, key: action.key }));
  }

  async delete(action: Action) {
    await Tools.invoke(action, 'delete', Tools.supabase.from("users").delete().eq("user_id", this.user_id));
  }

  async reset(action: Action, state: State) {
    await Promise.all([
      await Tools.invoke(action, 'reset actions', Tools.supabase.from("actions").delete().not("user_id", "is", null)),
      await Tools.invoke(action, 'reset restrictions', Tools.supabase.from("restrictions").delete().not("user_id", "is", null)),
      await Tools.invoke(action, 'reset states', Tools.supabase.from("states").delete().not("user_id", "is", null)),
      await Tools.invoke(action, 'reset chat', Tools.supabase.from("chat").delete().not("user_id", "is", null)),
    ]);
    await Tools.invoke(action, 'reset users', Tools.supabase.from("users").update({ state: state, other_id: null, relations: { match: null, watchers: [] } }).not("user_id", "is", null));
  }

  async chat(action: Action, text: string, is_event: boolean = false) {
    const data = await Tools.invoke(action, 'chat', Tools.supabase.from("chat").insert({ user_id: this.user_id, other_id: this.other_id, text: text, is_event: is_event }));
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

  async search(action: Action, exclude?: User) {
    const other = (await this.others(action, query => query.eq('state', State.VISIBLE).gt("relevance", 0).order("relevance", { ascending: false }).limit(1), exclude))[0];
    if (other) {
      EdgeRuntime.waitUntil(this.update(action, State.WATCHING, other));
      other.setWatcher(this);
      EdgeRuntime.waitUntil(other.update(action));
    }
    else EdgeRuntime.waitUntil(this.update(action, State.HIDDEN));
  }

  async removeOther(action: Action, state: State, other?: User) {
    EdgeRuntime.waitUntil(this.restriction(action));
    if (other) EdgeRuntime.waitUntil(other.update(action, state, this, true));
    await this.search(action, other);
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