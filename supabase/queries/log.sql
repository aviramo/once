select 
  log.status,
  me.user_id,
  me.name user,
  other.name other,
  log.event,
  log.state,
  log.data,
  log.created_at
from log
left join users me on me.user_id = log.user_id
left join users other on other.user_id = log.other_id
-- where event = 'locate'
order by log.created_at desc;


-- truncate table log
-- select * from others('193fcbb8-a418-4d80-9073-87535d6c7c85','0101000020E61000006EB99FF8D6FF41402C51AC0958B73F40')