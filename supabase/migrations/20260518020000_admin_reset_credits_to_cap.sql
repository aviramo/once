-- Admin reset: reset the credit balance to the tier CAP, keep the package.
--
-- User decision (2026-05-18): "an admin reset should top the star balance back
-- up to the maximum of the user's package -- do NOT reset the package itself."
--
-- Before this migration both app_admin_reset overloads rebuilt `relations`
-- WITHOUT a `credits` key at all (the roles_model + rename migrations had
-- regressed the credits-preservation that the credits migration originally
-- gave the global reset). A credit-less row then lazily fell back to
-- _credits_default() = free tier / balance 5 on the next credit-touching RPC
-- -- i.e. an admin reset silently *demoted every pro user to free*.
--
-- New behaviour for BOTH overloads (global no-arg + role/group-scoped, the
-- web entry point): rebuild `relations.credits` as a well-formed object that
--   * PRESERVES `tier` (the package) from the user's pre-reset credits,
--   * sets `balance` = that tier's cap (free 5 / pro 10 -- the max),
--   * zeroes `held`,
--   * refreshes `granted_on`/`next_grant_at` to the current grant day so the
--     daily 20:00 cron is consistent (already at cap => the next grant is a
--     no-op LEAST(cap, cap+daily) = cap).
--
-- Additive / not breaking for the deployed mobile app: app_admin_reset is
-- admin/service-role only (web admin -> resetUsersByRoles), the mobile app
-- never calls it, and mobile reads relations.credits defensively -- a
-- well-formed object is strictly better than the previously-missing key.

-- ── helper: credits object reset to the (preserved) tier's cap ─────────────
-- Mirrors _credits_default() exactly, except `tier` is carried over from the
-- caller's relations (via _credits_ensure so a credit-less legacy row resolves
-- to 'free') and `balance` = that tier's cap instead of the daily amount.
create or replace function public._credits_reset_to_cap(rel jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'balance',       (public._credits_tier_cfg(t.tier)->>'cap')::int,
    'tier',          t.tier,
    'granted_on',    public._credits_grant_day()::text,
    'next_grant_at', public._credits_next_grant_at(),
    'held',          0
  )
  from (
    select coalesce(public._credits_ensure(rel)->'credits'->>'tier', 'free') as tier
  ) t
$$;

-- ── global app_admin_reset() (verbatim body + credits) ────────────────────
create or replace function public.app_admin_reset()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users int;
begin
  delete from public.chat where user_id is not null;
  delete from public.log where user_id is not null;
  delete from public.restrictions where id is not null;

  update public.users set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(user_id, location),
      'credits', public._credits_reset_to_cap(relations)
    )
  where user_id is not null;
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$$;

revoke all on function public.app_admin_reset() from public, anon, authenticated;

-- ── role/group-scoped app_admin_reset(p_group_ids) (verbatim + credits) ────
create or replace function public.app_admin_reset(p_group_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users int;
begin
  if p_group_ids is null or array_length(p_group_ids, 1) is null then
    return jsonb_build_object('users', 0);
  end if;

  delete from public.chat
   where user_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids))
      or other_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids));

  delete from public.log
   where user_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids));

  delete from public.restrictions
   where user_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids))
      or other_id in (select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids));

  update public.users u set
    last_seen = now(),
    relations = jsonb_build_object(
      'page1', jsonb_build_object('state', 'locked'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb),
      'availability', public.user_availability(u.user_id, u.location),
      'credits', public._credits_reset_to_cap(u.relations)
    )
  where u.user_id in (
    select ug.user_id from public.user_groups ug where ug.group_id = any(p_group_ids)
  );
  get diagnostics v_users = row_count;

  return jsonb_build_object('users', v_users);
end;
$$;

revoke all on function public.app_admin_reset(uuid[]) from public, anon, authenticated;
