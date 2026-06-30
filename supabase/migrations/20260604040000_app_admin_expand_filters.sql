-- Admin bulk "expand filters" action: for each selected user, widen their
-- matching preferences to the broadest the app allows --
--   * range -> NULL (unlimited distance)
--   * age_from/age_to -> the per-user slider bounds the mobile app exposes:
--       min = greatest(18, age - 20), max = least(80, age + 20)
--     (age derived from birth_date; null birth_date defaults to 40, matching
--      the app's `profile?.birth_date ? calcAge : 40` fallback)
--   * data.family removed entirely (clears hasKids / kids / schedule /
--     isForKids -- every family/kids setting the user configured)
-- Admin/service-role only (EXECUTE revoked); the web bulkUserAction gates auth
-- before calling. Set-based single UPDATE -- one round trip for the whole
-- selection.
create or replace function public.app_admin_expand_filters(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return jsonb_build_object('users', 0);
  end if;

  with upd as (
    update public.users u
    set
      range = null,
      age_from = greatest(
        18,
        least(80, coalesce(extract(year from age(u.birth_date))::int, 40) - 20)
      ),
      age_to = greatest(
        18,
        least(80, coalesce(extract(year from age(u.birth_date))::int, 40) + 20)
      ),
      data = coalesce(u.data, '{}'::jsonb) - 'family'
    where u.user_id = any(p_user_ids)
    returning 1
  )
  select count(*) into v_count from upd;

  return jsonb_build_object('users', v_count);
end;
$$;

revoke execute on function public.app_admin_expand_filters(uuid[]) from anon, authenticated;
