-- A TRIGGER IS NOT AN ENDPOINT.
--
-- Six SECURITY DEFINER trigger functions were reachable as REST RPCs
-- (/rest/v1/rpc/_trg_comm_membership and friends) by `anon` and by every signed-in
-- user, because Postgres grants EXECUTE to PUBLIC on a new function by default and
-- PostgREST publishes everything in the exposed schema. They run as `postgres` and
-- write the denormalized communities summary onto users.relations, i.e. exactly the
-- kind of thing a caller must never be able to fire by hand.
--
-- Nothing legitimate loses anything: a trigger firing does NOT check EXECUTE on its
-- function (only ownership matters, and all six are owned by postgres), and none of
-- them is called by name from an edge function — they are called from other RPC
-- bodies, which run as their own definer. This is the convention already recorded
-- for every new SECURITY DEFINER function in this project; these six predate it.
do $$
declare fn text;
begin
  foreach fn in array array[
    '_trg_comm_friend_link()',
    '_trg_comm_friend_req()',
    '_trg_comm_group()',
    '_trg_comm_join_req()',
    '_trg_comm_membership()',
    '_users_keep_communities()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to postgres, service_role', fn);
  end loop;
end $$;
