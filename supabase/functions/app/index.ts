import lodash from "lodash";
import Logger from "../logger.ts";
import Tools from "../tools.ts";
import User from "../user.ts";
import { State } from "../global.ts";

const updatable = [
  "subscription",
  "age_from",
  "age_to",
  "range",
  "lang",
  "os",
  "units",
  "is_for_kids",
  "message",
  "images",
];

Deno.serve(async (req) => {
  const body = await Tools.getBody(req);
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const event = segments[segments.indexOf('app') + 1] ?? null;
  const logger = new Logger(new User("unknown"), body);
  if (event) logger.event = event;
  const user = await User.getByRequest(logger, req);
  logger.user = user;
  if (!event && Object.keys(logger.body).length === 0) return logger.response('options');
  if (!user) return logger.error('api', "unauthenticated", 401);
  user.last_seen = new Date();

  for (const [key, value] of Object.entries(body))
    if (updatable.includes(key))
      (user as unknown as Record<string, unknown>)[key] = value;

  if ('location' in body && body.location) user.location = `SRID=4326;POINT(${body.location.longitude} ${body.location.latitude})`;
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
      await search(logger, user);
      break;
    case "delete":
      EdgeRuntime.waitUntil(user.removeWatchers(logger));
      EdgeRuntime.waitUntil(user.delete(logger));
      break;
    case 'visibility': {
      if (body.state == State.HIDDEN) {
        // Defer the geo-matching search so the response returns quickly;
        // the gateway was timing out (502) while we waited for `search` to
        // finish. The next state transition lands on the client via realtime.
        EdgeRuntime.waitUntil((async () => {
          await user.removeWatchers(logger);
          await search(logger, user);
        })());
      }
      if (body.state == State.VISIBLE) {
        delete other?.watchers[user.user_id];
        if(other) EdgeRuntime.waitUntil(other.update(logger));
        EdgeRuntime.waitUntil((async () => {
          await user.addWatchers(logger);
          await user.update(logger, body.state as State);
        })());
      }
      break;
    }
    case "ignore":
      if (user.state == State.WATCHING) {
        EdgeRuntime.waitUntil(user.action(logger, event));
        delete other?.watchers[user.user_id];
        if(other) EdgeRuntime.waitUntil(other.update(logger));
        await search(logger, user, other);
      }
      break;
    case "invite":
      if (user.state == State.WATCHING) {
        if (await other?.update(logger, State.REPLYING, user, true)) {
          if(other) EdgeRuntime.waitUntil(other.removeWatchers(logger, user));
          EdgeRuntime.waitUntil(user.update(logger, State.WAITING, other));
        } else EdgeRuntime.waitUntil(user.update(logger, State.MISSED, other));
      }
      break;
    case "cancel":
      if (user.state == State.WAITING)
        await no(logger, event, user, State.CANCELLED, other);
      break;
    case "refuse":
      if (user.state == State.REPLYING)
        await no(logger, event, user, State.REFUSED, other);
      break;
    case "approve":
      if (user.state == State.REPLYING) {
        EdgeRuntime.waitUntil(user.update(logger, State.CHAT, other));
        if(other) EdgeRuntime.waitUntil(other.update(logger, State.CHAT, user));
      }
      break;
    case "leave":
      if (user.state == State.CHAT)
        await no(logger, event, user, State.LEFT, other);
      break;
    case "block":
      if (user.state == State.CHAT)
        await no(logger, event, user, State.LEFT, other);
      break;
    case 'ok':
      await search(logger, user);
      break;
    case "reset": {
      if (user.role == 'ADMIN') await user.reset(logger);
      else return logger.error("reset", "unauthorized", 403);
      break;
    }
    case "chat": {
      EdgeRuntime.waitUntil(user.update(logger));
      if (!body.chat || typeof (body.chat as Record<string, unknown>).text !== 'string' || ((body.chat as Record<string, unknown>).text as string).trim() === '')
        return logger.error("chat", "no text", 400);
      await user.chat(logger, (body.chat as Record<string, unknown>).text as string);
      if(other) EdgeRuntime.waitUntil(other.update(logger));
      if(other) EdgeRuntime.waitUntil(other.notify());
      break;
    }
    case "remove": {
      const other = await User.getById(logger, body.user_id);
      if (!other) return logger.error("remove", "user not found", 404);
      user.removeWatcher(logger, other);
      EdgeRuntime.waitUntil(user.update(logger));
      break;
    }
    case "logout": {
      EdgeRuntime.waitUntil(user.removeWatchers(logger));
      user.subscription = null;
      user.location = null;
      EdgeRuntime.waitUntil(user.update(logger, State.HIDDEN));
      break;
    }
    default: {
      await user.updateWatchers(logger);
      if (user.state == State.HIDDEN) await search(logger, user);
      if (user.state == State.VISIBLE && user.location) {
        await user.addWatchers(logger);
        EdgeRuntime.waitUntil(user.update(logger));
      }
      if (user.state == State.WATCHING) {
        other?.setWatcher(user);
        if(other) EdgeRuntime.waitUntil(other.update(logger));
      }
      if (user.state && [State.WAITING, State.REPLYING, State.CHAT].includes(user.state) && other) {
        other.setMatch(user);
        if(other) EdgeRuntime.waitUntil(other.update(logger));
      }
      EdgeRuntime.waitUntil(user.update(logger));
    }
  }
  return logger.response();
});

async function watch(logger: Logger, user: User, exclude?: User) {
  const other = (await user.others(logger, query => query.eq('state', State.VISIBLE).gt("relevance", 0).order("relevance", { ascending: false }).limit(1), exclude))[0];
  if (other) {
    EdgeRuntime.waitUntil(user.update(logger, State.WATCHING, other));
    other.setWatcher(user);
    EdgeRuntime.waitUntil(other.update(logger));
  }
  else EdgeRuntime.waitUntil(user.update(logger, State.HIDDEN));
}

async function search(logger: Logger, user: User, exclude?: User) {
  if (exclude) {
    const newUser = lodash.cloneDeep(user);
    const newLogger = new Logger(newUser, {}, logger);
    newLogger.event = 'search';
    await watch(newLogger, newUser, exclude);
    newLogger.response();
  } else await watch(logger, user, exclude);
  EdgeRuntime.waitUntil(user.update(logger));
}

async function no(logger: Logger, event: string, user: User, state: State, other?: User) {
  EdgeRuntime.waitUntil(user.action(logger, event));
  if (other) EdgeRuntime.waitUntil(other.update(logger, state, user, true));
  await search(logger, user, other);
}