import Logger from "../logger.ts";
import Tools from "../tools.ts";
import User from "../user.ts";
import { State } from "../global.ts";

const searchable = [
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

  if ('preferred_gender' in body && body.preferred_gender) {
    user.is_for_male = ['B', 'M'].includes(body.preferred_gender as string);
    user.is_for_female = ['B', 'F'].includes(body.preferred_gender as string);
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
      user.removeRrlations(logger, State.DELETED, other);
      break;
    case 'visibility': {
      if (body.state == State.HIDDEN) {
        user.removeRrlations(logger, State.HID, other);
        await user.search(logger, event);
      }
      if (body.state == State.VISIBLE) {
        if (other) {
          delete other.watchers[user.user_id];
          EdgeRuntime.waitUntil(other.update(logger));
        }
        await user.addWatchers(logger);
        EdgeRuntime.waitUntil(user.update(logger, body.state));
      }
      break;
    }
    case "ignore":
      if (user.state == State.WATCHING) {
        EdgeRuntime.waitUntil(user.action(logger, event));
        delete other?.watchers[user.user_id];
        if (other) EdgeRuntime.waitUntil(other.update(logger));
        await user.search(logger, event, other);
      } else user.update(logger, State.MISSED, other);
      break;
    case "invite":
      if (user.state == State.WATCHING && other) {
        if (await other.update(logger, State.REPLYING, user, true)) {
          EdgeRuntime.waitUntil(user.chat(logger, event, true));
          other.removeRrlations(logger, State.INVITED, undefined, user);
          EdgeRuntime.waitUntil(user.update(logger, State.WAITING, other));
        } else EdgeRuntime.waitUntil(user.update(logger, State.MISSED, other));
      }
      break;
    case "cancel":
      if (user.state == State.WAITING)
        await user.removeOther(logger, event, State.CANCELLED, other);
      break;
    case "refuse":
      if (user.state == State.REPLYING)
        await user.removeOther(logger, event, State.REFUSED, other);
      break;
    case "approve":
      if (user.state == State.REPLYING) {
        EdgeRuntime.waitUntil(user.update(logger, State.CHAT, other));
        EdgeRuntime.waitUntil(user.chat(logger, event, true));
        if (other) EdgeRuntime.waitUntil(other.update(logger, State.CHAT, user));
      }
      break;
    case "leave":
      if (user.state == State.CHAT)
        await user.removeOther(logger, event, State.LEFT, other);
      break;
    case "block":
      if (user.state == State.CHAT)
        await user.removeOther(logger, event, State.LEFT, other);
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
      EdgeRuntime.waitUntil(user.removeRelation(logger, State.REMOVED, body.user_id));
      EdgeRuntime.waitUntil(user.update(logger));
      break;
    }
    case "logout": {
      user.removeRrlations(logger, State.LOGGED_OUT, other);
      if (user.data) user.data.push_token = null;
      user.location = null;
      EdgeRuntime.waitUntil(user.update(logger, State.HIDDEN));
      break;
    }
    default:
      await user.updateRelations(logger, other);
      if (user.state == State.VISIBLE)
        EdgeRuntime.waitUntil(user.addWatchers(logger));
      EdgeRuntime.waitUntil(user.update(logger));
      break;
  }
  return logger.response();
});