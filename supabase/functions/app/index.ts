import Logger from "../logger.ts";
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
  const event = segments[segments.indexOf('app') + 1];
  const logger = new Logger(event, body);
  const user = await User.getByRequest(logger, req);
  logger.user = user;
  if (!event && Object.keys(logger.body).length === 0) return logger.response('options');
  if (!user) return logger.error('api', "unauthenticated", 401);
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
      return logger.error('location', 'invalid coordinates', 400);
    user.location = `SRID=4326;POINT(${lng} ${lat})`;
  }

  const other = await user.other(logger);

  switch (event) {
    case "account":
      if (!user.state && typeof body.name === 'string' && typeof body.birth_date === 'string' && typeof body.is_male === 'boolean') {
        const birthDate = new Date(body.birth_date);
        if (!Number.isNaN(birthDate.getTime())) await user.insert(logger, body.name, birthDate, body.is_male);
        else return logger.error('account', 'invalid birth_date', 400);
      }
      break;
    case "profile":
      await user.search(logger, event);
      break;
    case "delete":
      await user.delete(logger);
      user.removeRrlations(logger, State.OTHER_DELETED, other);
      break;
    case 'visibility': {
      switch (body.state) {
        case State.OFF:
          user.removeRrlations(logger, State.OTHER_OFF, other);
          user.location = null;
          EdgeRuntime.waitUntil(user.update(logger, body.state));
          break;
        case State.VISIBLE:
          if (other) {
            delete other.watchers[user.user_id];
            EdgeRuntime.waitUntil(other.update(logger));
          }
          await user.addWatchers(logger);
          EdgeRuntime.waitUntil(user.update(logger, body.state));
          break;
        case State.HIDDEN:
          user.removeRrlations(logger, State.OTHER_HIDDEN, other);
          await user.search(logger, event);
          break;
        default:
          return logger.error('visibility', 'invalid state', 400);
      }
      break;
    }
    case "ignore":
      if (user.state == State.WATCHING) {
        user.action(logger, event);
        delete other?.watchers[user.user_id];
        if (other) EdgeRuntime.waitUntil(other.update(logger));
        await user.search(logger, event, other);
      } else user.update(logger, State.HIDDEN, other);
      break;
    case "invite":
      if (user.state == State.WATCHING && other) {
        if (await other.update(logger, State.REPLYING, user, true)) {
          EdgeRuntime.waitUntil(user.chat(logger, event, true));
          other.removeRrlations(logger, State.OTHER_INVITED, undefined, user);
          EdgeRuntime.waitUntil(user.update(logger, State.WAITING, other));
        } else EdgeRuntime.waitUntil(user.update(logger, State.HIDDEN, other));
      }
      break;
    case "cancel":
      if (user.state == State.WAITING)
        await user.removeOther(logger, event, State.OTHER_CANCELLED, other);
      break;
    case "refuse":
      if (user.state == State.REPLYING)
        await user.removeOther(logger, event, State.OTHER_REFUSED, other);
      break;
    case "approve":
      if (user.state == State.REPLYING) {
        EdgeRuntime.waitUntil(user.update(logger, State.CHAT, other));
        EdgeRuntime.waitUntil(user.chat(logger, event, true));
        if (other) EdgeRuntime.waitUntil(other.update(logger, State.CHAT, user, true));
      }
      break;
    case "leave":
      if (user.state == State.CHAT)
        await user.removeOther(logger, event, State.OTHER_LEFT, other);
      break;
    case "block":
      if (user.state == State.CHAT)
        await user.removeOther(logger, event, State.OTHER_LEFT, other);
      break;
    case 'ok':
      await user.search(logger, event);
      break;
    case "reset": {
      if (user.role == 'ADMIN') await user.reset(logger, body.state as State || State.VISIBLE);
      else return logger.error("reset", "unauthorized", 403);
      break;
    }
    case "chat": {
      EdgeRuntime.waitUntil(user.update(logger));
      if (!body.chat || typeof (body.chat as Record<string, unknown>).text !== 'string' || ((body.chat as Record<string, unknown>).text as string).trim() === '')
        return logger.error("chat", "no text", 400);
      EdgeRuntime.waitUntil(user.chat(logger, (body.chat as Record<string, unknown>).text as string));
      if (other) EdgeRuntime.waitUntil(other.update(logger, undefined, undefined, true));
      break;
    }
    case "remove": {
      if (typeof body.user_id !== 'string' || !user.watchers[body.user_id]) break;
      EdgeRuntime.waitUntil(user.removeRelation(logger, State.OTHER_REMOVED, body.user_id));
      EdgeRuntime.waitUntil(user.update(logger));
      break;
    }
    case "logout": {
      user.removeRrlations(logger, State.OTHER_LOGGED_OUT, other);
      if (user.data) user.data.push_token = null;
      user.location = null;
      EdgeRuntime.waitUntil(user.update(logger, State.HIDDEN));
      break;
    }
    default:
      switch (user.state) {
        case State.VISIBLE:
          await user.updateRelations(logger, other);
          EdgeRuntime.waitUntil(user.addWatchers(logger));
          EdgeRuntime.waitUntil(user.update(logger));
          break;
        case State.WATCHING:
        case State.WAITING:
        case State.REPLYING:
        case State.CHAT:
          await user.updateRelations(logger, other);
          break;
        case State.HIDDEN:
          await user.search(logger, event);
          break;
      }
  }
  return logger.response();
});