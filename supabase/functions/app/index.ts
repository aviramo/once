import Action from "../action.ts";
import Tools from "../tools.ts";
import User from "../user.ts";
import { State } from "../global.ts";

const searchable = [
  "is_for_male",
  "is_for_female",
  "age_from",
  "age_to",
  "range",
  "is_for_kids",
];

const updatable = [
  "bio",
  "images",
  "units",
  "os",
  "lang",
  "push_token",
];

Deno.serve(async (req) => {
  const body = await Tools.getBody(req);
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const key = segments[segments.indexOf('app') + 1];
  const action = new Action(key, body, new User({ user_id: "unknown" }));
  if (!action.key && Object.keys(action.body).length === 0) return action.error('options', 'options', 200);
  const user = await User.getByRequest(action, req);
  if (!user) return action.error('api', "unauthenticated", 401);
  action.user = user;
  user.last_seen = new Date();

  for (const [key, value] of Object.entries(body)) {
    if (searchable.includes(key))
      (user as unknown as Record<string, unknown>)[key] = value;
    if (updatable.includes(key))
      (user.data as unknown as Record<string, unknown>)[key] = value;
  }

  if ('location' in body && body.location) {
    const lng = Number(body.location.longitude);
    const lat = Number(body.location.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat))
      return action.error('location', 'invalid coordinates', 400);
    user.location = `SRID=4326;POINT(${lng} ${lat})`;
  }

  const other = await user.other(action);

  switch (key) {
    case "account":
      if (!user.state && typeof body.name === 'string' && typeof body.birth_date === 'string' && typeof body.is_male === 'boolean') {
        const birthDate = new Date(body.birth_date);
        if (!Number.isNaN(birthDate.getTime())) await user.insert(action, body.name, birthDate, body.is_male);

        else return action.error('account', 'invalid birth_date', 400);
      }
      break;
    case "profile":
      await user.search(action);
      break;
    case "delete":
      await user.delete(action);
      user.removeRelations(action, State.OTHER_DELETED, other);
      break;
    case 'visibility': {
      switch (body.state) {
        case State.OFF:
          user.removeRelations(action, State.OTHER_OFF, other);
          user.location = null;
          EdgeRuntime.waitUntil(user.update(action, body.state));
          break;
        case State.VISIBLE:
          if (other) {
            delete other.watchers[user.user_id];
            EdgeRuntime.waitUntil(other.update(action));
          }
          await user.addWatchers(action);
          EdgeRuntime.waitUntil(user.update(action, body.state));
          break;
        case State.HIDDEN:
          user.removeRelations(action, State.OTHER_HIDDEN, other);
          await user.search(action);
          break;
        default:
          return action.error('visibility', 'invalid state', 400);
      }
      break;
    }
    case "ignore":
      if (user.state == State.WATCHING) {
        EdgeRuntime.waitUntil(user.restriction(action));
        if (other) {
          delete other.watchers[user.user_id];
          EdgeRuntime.waitUntil(other.update(action));
        }
        await user.search(action, other);
      } else user.update(action, State.HIDDEN, other);
      break;
    case "invite":
      if (user.state == State.WATCHING && other) {
        if (await other.update(action, State.REPLYING, user, true)) {
          EdgeRuntime.waitUntil(user.chat(action, key, true));
          other.removeRelations(action, State.OTHER_INVITED, undefined, user);
          EdgeRuntime.waitUntil(user.update(action, State.WAITING, other));
        } else EdgeRuntime.waitUntil(user.update(action, State.HIDDEN, other));
      }
      break;
    case "cancel":
      if (user.state == State.WAITING)
        await user.removeOther(action, State.OTHER_CANCELLED, other);
      break;
    case "refuse":
      if (user.state == State.REPLYING)
        await user.removeOther(action, State.OTHER_REFUSED, other);
      break;
    case "approve":
      if (user.state == State.REPLYING) {
        EdgeRuntime.waitUntil(user.update(action, State.CHAT, other));
        EdgeRuntime.waitUntil(user.chat(action, key, true));
        if (other) EdgeRuntime.waitUntil(other.update(action, State.CHAT, user, true));
      }
      break;
    case "leave":
      if (user.state == State.CHAT)
        await user.removeOther(action, State.OTHER_LEFT, other);
      break;
    case "block":
      if (user.state == State.CHAT)
        await user.removeOther(action, State.OTHER_LEFT, other);
      break;
    case 'ok':
      await user.search(action);
      break;
    case "reset": {
      if (user.role == 'ADMIN') await user.reset(action, body.state);
      else return action.error("reset", "unauthorized", 403);
      break;
    }
    case "chat": {
      EdgeRuntime.waitUntil(user.update(action));
      if (!body.chat || typeof (body.chat as Record<string, unknown>).text !== 'string' || ((body.chat as Record<string, unknown>).text as string).trim() === '')
        return action.error("chat", "no text", 400);
      EdgeRuntime.waitUntil(user.chat(action, (body.chat as Record<string, unknown>).text as string));
      if (other) EdgeRuntime.waitUntil(other.update(action, undefined, undefined, true));
      break;
    }
    case "remove": {
      if (typeof body.user_id !== 'string' || !user.watchers[body.user_id]) break;
      EdgeRuntime.waitUntil(user.removeRelation(action, State.OTHER_REMOVED, body.user_id));
      EdgeRuntime.waitUntil(user.update(action));
      break;
    }
    case "logout": {
      user.removeRelations(action, State.OTHER_LOGGED_OUT, other);
      if (user.data) user.data.push_token = null;
      user.location = null;
      EdgeRuntime.waitUntil(user.update(action, State.HIDDEN));
      break;
    }
    default:
      switch (user.state) {
        case State.VISIBLE:
          await user.updateRelations(action, other);
          EdgeRuntime.waitUntil(user.addWatchers(action));
          EdgeRuntime.waitUntil(user.update(action));
          break;
        case State.WATCHING:
        case State.WAITING:
        case State.REPLYING:
        case State.CHAT:
          await user.updateRelations(action, other);
          break;
        case State.HIDDEN:
          await user.search(action);
          break;
      }
  }
  return action.response();
});