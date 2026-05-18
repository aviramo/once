-- ============================================================================
-- app_review_seed — backs the App Store / Play "review login" mechanism.
--
-- The app is passwordless (Google / Apple / email magic-link) AND access-gated
-- by group membership, so a store reviewer who signs up fresh is gated and
-- can't review. The review-login edge function authenticates a fixed
-- email+code, mints an OTP for a dedicated review auth user, and calls THIS
-- rpc to make that user a fully-onboarded, group-approved account.
--
-- Idempotent: every review login re-seeds a clean, complete profile (so the
-- reviewer never lands in onboarding — the app routes to /home iff the row
-- exists with a non-empty data.bio) and ensures membership in the enabled
-- "בדיקה" group (so user_availability => available regardless of location).
-- Profile shape/images are cloned from a real onboarded user so every screen
-- renders; identity is neutralised and the stranger's push_token stripped.
-- SECURITY DEFINER, EXECUTE revoked from anon/authenticated (edge-only).
-- Additive / not breaking.
-- ============================================================================

create or replace function public.app_review_seed(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tmpl    public.users;
  v_group uuid;
  v_data  jsonb;
begin
  select * into tmpl
  from public.users
  where data->>'bio' is not null and data->>'bio' <> ''
    and jsonb_array_length(coalesce(data->'images', '[]'::jsonb)) > 0
  order by created_at
  limit 1;

  -- Clone a real onboarded profile (images render), strip the stranger's
  -- push token, force a non-empty bio (the onboarding-complete gate).
  v_data := (coalesce(tmpl.data, '{}'::jsonb) - 'push_token')
            || jsonb_build_object('bio', 'App review / demo account.');

  insert into public.users as u (
    user_id, name, is_male, is_for_male, is_for_female,
    birth_date, age_from, age_to, range, location, data, relations, last_seen
  ) values (
    p_user_id,
    'App Review',
    coalesce(tmpl.is_male, true),
    true, true,
    date '1995-06-15',
    18, 99,
    coalesce(tmpl.range, 100000),
    'SRID=4326;POINT(34.7818 32.0853)'::extensions.geography,
    v_data,
    jsonb_build_object(
      'page1', jsonb_build_object('state', 'free'),
      'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
    ),
    now()
  )
  on conflict (user_id) do update set
    name          = 'App Review',
    is_for_male   = true,
    is_for_female = true,
    age_from      = 18,
    age_to        = 99,
    range         = coalesce(tmpl.range, 100000),
    data          = v_data,
    relations     = jsonb_build_object(
                       'page1', jsonb_build_object('state', 'free'),
                       'page2', jsonb_build_object('state', 'free', 'profiles', '[]'::jsonb)
                     ),
    last_seen     = now();

  select id into v_group from public.groups where name = 'בדיקה' limit 1;
  if v_group is not null then
    insert into public.user_groups (user_id, group_id)
    values (p_user_id, v_group)
    on conflict (user_id, group_id) do nothing;
  end if;
end;
$$;

revoke all on function public.app_review_seed(uuid) from public, anon, authenticated;
