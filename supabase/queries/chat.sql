create
or replace function chat (user_id uuid, other_id uuid) returns table (
  created_at timestamp with time zone,
  text text,
  received boolean
) language sql security definer
set
  search_path = '' as $$

  select 
    created_at AT TIME ZONE 'UTC',
    text,
    user_id = $2 as received
  from public.chat
  where (user_id = $1 and other_id = $2) or (user_id = $2 and other_id = $1)
  order by created_at desc;

$$