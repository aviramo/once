-- Group search: browse + approximate match + relevance ordering.
--
-- Three changes to `app_search_groups`, all driven by the same product call
-- (user directive 2026-07-28):
--
--   1. An EMPTY query is now legal and means "browse": the whole findable
--      catalogue, paged. The window no longer sits blank until two characters
--      are typed.
--   2. Matching is APPROXIMATE, not just containment. A transposed or dropped
--      letter still finds the group (the case that started this: "הדגומה" must
--      find "קבוצת הדוגמה").
--   3. Ordering is by how many people in the group are RELEVANT TO THE CALLER,
--      not by raw size. "Relevant" is not redefined here: it is exactly
--      `others(me)`, the same candidate pool the matching engine uses, so
--      mutual gender preference, mutual age fit, mutual distance,
--      restrictions, hidden-group pairs and the test partition all come along
--      for free and can never drift from the game's own definition.
--
-- The caller-facing shape changes from a bare array to `{results, has_more}`.
-- The published app reads `results` off the edge function's response body, so
-- the edge hands the object straight through and the old client keeps working
-- (it ignores `has_more`, and `p_limit`/`p_offset` default to the first page).

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

-- Comparison form of a name or a query: lowercased, Hebrew niqqud dropped, and
-- every run of non-alphanumerics folded to one space. So "בְּנֵי־בְּרַק" and
-- "בני ברק" are the same string, and a maqaf or a hyphen never hides a match.
-- U+05BE (maqaf) is deliberately OUTSIDE the stripped range — it separates
-- words, so it must become a space rather than vanish and glue them together.
-- Folding also removes every LIKE metacharacter, which is what lets the match
-- function below interpolate the query into a pattern safely.
CREATE OR REPLACE FUNCTION public._search_norm(p_t text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT btrim(regexp_replace(
           regexp_replace(lower(coalesce(p_t, '')), E'[\\u0591-\\u05BD\\u05BF-\\u05C7]', '', 'g'),
           '[^[:alnum:]]+', ' ', 'g'))
$$;

-- How well `p_q` matches `p_name`, 0 (no match) to 1 (identical). Banded, so
-- an exact hit can never be outranked by a lucky fuzzy one:
--
--   1.00  the whole name
--   0.95  the name starts with the query
--   0.90  a word inside the name starts with the query
--   0.85  the query appears anywhere in the name
--   ≤0.80 approximate, and only here does spelling get a say
--
-- The approximate band is the better of two signals. The first is token-wise:
-- every word of the QUERY takes its best word in the NAME (a prefix counts
-- whole, otherwise edit distance over the longer of the two), and those best
-- scores are averaged, so a two-word query has to earn both halves. The second
-- is trigram word_similarity, which catches a query that is a scattered
-- fragment of a long name where whole-word alignment fails. Edit distance is
-- what carries the transposition case: trigram similarity alone scores
-- "הדגומה" against "קבוצת הדוגמה" at 0.29, well under any usable threshold,
-- while the token-wise ratio puts it at 0.67.
--
-- `levenshtein` here is character-aware, not byte-aware, so Hebrew costs the
-- same as Latin.
CREATE OR REPLACE FUNCTION public._name_match(p_q text, p_name text)
RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $$
  WITH n AS (SELECT public._search_norm(p_q) q, public._search_norm(p_name) nm),
  nw AS (SELECT n.q, n.nm, array_remove(string_to_array(n.nm, ' '), '') w FROM n),
  fuzzy AS (
    SELECT avg(best) s FROM (
      SELECT (SELECT max(CASE WHEN nt LIKE qt || '%' THEN 1.0
                              ELSE 1.0 - extensions.levenshtein(qt, nt)::double precision
                                         / greatest(char_length(qt), char_length(nt)) END)
              FROM unnest(nw.w) nt) best
      FROM nw, unnest(string_to_array(nw.q, ' ')) qt
      WHERE qt <> ''
    ) x
  )
  SELECT CASE
    WHEN (SELECT q FROM n) = '' THEN 0
    WHEN (SELECT nm FROM n) = (SELECT q FROM n) THEN 1.0
    WHEN (SELECT nm FROM n) LIKE (SELECT q FROM n) || '%' THEN 0.95
    WHEN (SELECT nm FROM n) LIKE '% ' || (SELECT q FROM n) || '%' THEN 0.9
    WHEN position((SELECT q FROM n) in (SELECT nm FROM n)) > 0 THEN 0.85
    ELSE least(0.8::double precision, greatest(
      coalesce((SELECT s FROM fuzzy), 0),
      extensions.word_similarity((SELECT q FROM n), (SELECT nm FROM n))::double precision))
  END
$$;

-- The old two-argument form has to go rather than be replaced: adding
-- defaulted arguments beside it would leave `app_search_groups(uuid, text)`
-- ambiguous.
DROP FUNCTION IF EXISTS public.app_search_groups(uuid, text);

CREATE OR REPLACE FUNCTION public.app_search_groups(
  me_id    uuid,
  p_q      text    DEFAULT '',
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SET search_path TO 'public', 'extensions'
AS $$
WITH lim AS (
  SELECT least(greatest(coalesce(p_limit, 20), 1), 50) AS n,
         greatest(coalesce(p_offset, 0), 0)            AS off,
         public._search_norm(p_q)                      AS q
),
me AS (SELECT * FROM public.users u WHERE u.user_id = me_id),
-- ONE call for the whole request, materialised: `others` is the expensive part
-- (it walks the user table applying the full candidate predicate), and it must
-- not run once per group.
cand AS MATERIALIZED (
  SELECT o.user_id, o.relevance FROM me, public.others(me) o
),
-- Members of each group who are candidates for me. `relevant` is the count the
-- row shows; `fit` is the graded sum, which is what actually orders the list,
-- so three strong matches beat five marginal ones. `relevance` already carries
-- the friend and shared-group multipliers, so a community holding people from
-- my circle rises on its own.
gcand AS (
  SELECT ug.group_id, count(*)::int AS relevant, sum(c.relevance) AS fit
  FROM public.user_groups ug JOIN cand c ON c.user_id = ug.user_id
  GROUP BY ug.group_id
),
gsize AS (SELECT group_id, count(*)::int AS members FROM public.user_groups GROUP BY group_id),
-- Scanned per request over the findable groups only. At catalogue sizes in the
-- thousands this is well under a millisecond; the escape hatch when it stops
-- being one is a stored `_search_norm(name)` column with a trgm index used as a
-- pre-filter, NOT a lower threshold here (a trigram pre-filter set loose enough
-- to keep the transposition cases would let most of the catalogue through).
hit AS (
  SELECT g.id, g.name, g.invite_code, g.owner_id, g.description, g.requires_approval,
         CASE WHEN (SELECT q FROM lim) = '' THEN 0
              ELSE public._name_match(p_q, g.name) END AS text_score
  FROM public.groups g
  WHERE g.is_public = true
    AND g.is_test = public._is_test(me_id)
),
kept AS (
  SELECT h.*,
         coalesce(gs.members, 0)  AS members,
         coalesce(gc.relevant, 0) AS relevant,
         coalesce(gc.fit, 0)      AS fit
  FROM hit h
  LEFT JOIN gcand gc ON gc.group_id = h.id
  LEFT JOIN gsize gs ON gs.group_id = h.id
  -- An empty query keeps everything (browse); a real one keeps what clears the
  -- approximate bar. 0.6 sits in open space: every intended hit measured at or
  -- above 0.667, every unrelated name at or below 0.18.
  WHERE (SELECT q FROM lim) = '' OR h.text_score >= 0.6
),
-- The window runs before LIMIT, so `total` is the full match count and paging
-- can tell the client whether another page exists.
page AS (
  SELECT k.*, count(*) OVER () AS total
  FROM kept k
  ORDER BY k.text_score DESC, k.fit DESC, k.members DESC, k.name, k.id
  LIMIT (SELECT n FROM lim) OFFSET (SELECT off FROM lim)
)
SELECT jsonb_build_object(
  'results', coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'invite_code', p.invite_code,
      'owner_id', p.owner_id, 'owner_name', ownr.name, 'owner_image', ownr.data->'images'->0,
      'description', p.description, 'requires_approval', p.requires_approval,
      'members', p.members, 'relevant', p.relevant,
      'joined',    EXISTS(SELECT 1 FROM public.user_groups ug WHERE ug.group_id = p.id AND ug.user_id = me_id),
      'requested', EXISTS(SELECT 1 FROM public.group_join_requests jr WHERE jr.group_id = p.id AND jr.user_id = me_id)
    ) ORDER BY p.text_score DESC, p.fit DESC, p.members DESC, p.name, p.id), '[]'::jsonb),
  'has_more', coalesce(max(p.total), 0) > (SELECT off FROM lim) + count(p.id)
)
FROM page p
LEFT JOIN public.users ownr ON ownr.user_id = p.owner_id;
$$;

-- Postgres hands every new function to PUBLIC and PostgREST publishes whatever
-- it can reach, so each one is closed and re-opened to the service role only.
REVOKE ALL ON FUNCTION public._search_norm(text)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._name_match(text, text)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_search_groups(uuid, text, int, int)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._search_norm(text)                      TO service_role;
GRANT EXECUTE ON FUNCTION public._name_match(text, text)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.app_search_groups(uuid, text, int, int) TO service_role;
