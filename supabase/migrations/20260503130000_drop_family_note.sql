-- Drop the free-text `note` field from family items in users.data.items.
-- The popup that authored it has been removed; existing rows are cleaned up.

UPDATE public.users
SET data = jsonb_set(
  data,
  '{items}',
  COALESCE(
    (SELECT jsonb_agg(
       CASE WHEN item->>'kind' = 'family' THEN item - 'note' ELSE item END
       ORDER BY ordinality
     )
     FROM jsonb_array_elements(data->'items') WITH ORDINALITY AS t(item, ordinality)),
    '[]'::jsonb
  )
)
WHERE jsonb_typeof(data->'items') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(data->'items') it
    WHERE it->>'kind' = 'family' AND it ? 'note'
  );
