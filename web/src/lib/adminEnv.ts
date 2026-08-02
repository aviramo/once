import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * THE PANEL WORKS IN ONE ENVIRONMENT AT A TIME.
 *
 * `users.is_test` partitions the matching pool: a test user is matchable ONLY
 * with other test users and a normal user ONLY with normal users (one
 * unconditional clause in `public.others()`, the sole candidacy chokepoint),
 * and since 20260727120000 `groups.is_test` partitions the circles the same
 * way. The two sides never meet — so a panel that lists them together is
 * showing one number for two products, and every count, every facet and every
 * "who is watching whom" reads as a population that does not exist.
 *
 * The environment is therefore a PRIMARY selector, not one filter among the
 * others: it is chosen once in the header and it bounds every query on every
 * screen. It used to be `?seg=test` / `?seg=not_test` — one option inside the
 * advanced-filters dropdown, defaulted to "both" — and those two options are
 * deleted with this, along with the per-card "test user" badge (every card on
 * screen is now the selected environment, so a badge saying so is noise).
 *
 * It lives in a cookie rather than a URL param for one reason: a param would
 * have to be threaded through every `<Link>` in the panel, and the one that
 * got missed would silently drop the operator back into production. A cookie
 * cannot be forgotten by a link, and deep links stay canonical.
 *
 * Scoping rule, in one sentence: a row belongs to the environment of the USER
 * it names. `users` and `groups` answer with their own column; everything else
 * (reports, bug reports, watch rows, log, chat) is scoped through the user at
 * its end. A row whose user no longer exists reads as production, so a
 * moderation queue can never contain something unreachable from both sides.
 */

export type AdminEnv = "prod" | "test";

export const ADMIN_ENVS = ["prod", "test"] as const;
export const ADMIN_ENV_COOKIE = "once_admin_env";
/** Production is what an operator who has chosen nothing must be looking at. */
export const DEFAULT_ADMIN_ENV: AdminEnv = "prod";

export function parseAdminEnv(raw: string | null | undefined): AdminEnv {
  return raw === "test" ? "test" : DEFAULT_ADMIN_ENV;
}

/** The `is_test` value every scoped query compares against. */
export function envIsTest(env: AdminEnv): boolean {
  return env === "test";
}

/** The environment every screen is bound to. Read next to
 * {@link requireViewerScope} at the top of each page. */
export async function readAdminEnv(): Promise<AdminEnv> {
  const jar = await cookies();
  return parseAdminEnv(jar.get(ADMIN_ENV_COOKIE)?.value);
}

/** No row carries this id — used to force an empty result when an id-set
 * filter resolves to nothing, so a query returns "none" rather than
 * degenerating into "everyone". */
export const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

/**
 * The environment's user ids, for the tables that carry no `is_test` of their
 * own and no foreign key PostgREST could embed through — `reports` and
 * `bug_reports`, both of which deliberately have neither so a record survives
 * the account it names.
 *
 * Applied as `.in(<reporter column>, …)` so the environment bound is a real
 * server-side filter and a `limit(300)` still means 300 rows of the selected
 * environment, not 300 mixed rows thinned afterwards. `scopeIds` is the
 * group-manager scope, intersected here.
 */
export async function envUserIds(
  admin: SupabaseClient,
  env: AdminEnv,
  scopeIds: string[] | null = null,
): Promise<string[]> {
  let q = admin.from("users").select("user_id").eq("is_test", envIsTest(env));
  if (scopeIds) q = q.in("user_id", scopeIds.length ? scopeIds : [NO_MATCH_ID]);
  const { data } = await q;
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}
