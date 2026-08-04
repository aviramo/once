-- AN INVITATION SENT IN THE REVIEW ENVIRONMENT IS ANSWERED, NEVER LEFT TO
-- EXPIRE (2026-08-04).
--
-- The other side of every invitation a store reviewer sends is a seeded row,
-- not a person, so an invitation sent there could only ever run its 10 minutes
-- down and land on the expired card -- a screen the shipped build renders with
-- an untranslated string, and one that says nothing good about the product
-- either way. The fix in the app is in the next build; this is the one that
-- reaches the reviewer now, because the server deploys instantly.
--
-- So the pool answers. Every minute (not every five: the invitation lives ten,
-- and a skipped tick must never be able to cost one), each invitation aimed at
-- a review account that has been standing for at least 10 seconds is accepted
-- through the ordinary RPC -- app_approve, the same call the accept button
-- makes, with all of its locking, credit and board rules. Nothing here
-- reimplements the transition.
--
-- The 10 seconds are deliberate: the reviewer sees the waiting card and its
-- clock, and then it becomes a chat, which is the product working rather than
-- a button that answers itself.
--
-- Scoped to is_test AND the seed marker, so it can never answer for a real
-- user. A real invitation between two real people is untouched by all of this.
CREATE OR REPLACE FUNCTION public._review_pool_answer(p_limit int DEFAULT 20)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r        record;
  n        int := 0;
  v_hello  text;
  HELLOS   text[] := ARRAY[
    'Hi! Glad you reached out. What are you up to today?',
    'Hey, nice to meet you. How is your day going?',
    'Hello! I saw we are in the same circle. How did you find it?',
    'Hi there, thanks for the invitation. Are you around this week?',
    'Hey! Good to hear from you. What brought you here?'
  ];
BEGIN
  FOR r IN
    SELECT w.watcher_id, w.target_id
    FROM public.watch w
    JOIN public.users u ON u.user_id = w.target_id
    WHERE w.state = 'invited'
      AND w.invited_at < now() - interval '10 seconds'
      AND u.is_test
      AND u.data->>'seed' = 'app-store-review'
    ORDER BY w.invited_at
    LIMIT p_limit
  LOOP
    -- A seeded wallet holds one credit and an accept costs one, so the second
    -- invitation this account is ever sent would fail to pay and land on the
    -- very card this function exists to avoid. Top it up first, and clear the
    -- could-not-pay mark if an earlier round left one.
    UPDATE public.users u
       SET relations = jsonb_set(
             jsonb_set(u.relations, '{credits}', (u.relations->'credits') - 'unpaid_at'),
             '{credits,balance}', to_jsonb(3))
     WHERE u.user_id = r.target_id
       AND public._credits_total(u.relations) < public._credits_cost('approve');

    PERFORM public.app_approve(r.target_id);

    -- A chat nobody has spoken in is a dead end for somebody testing chat, so
    -- the account that just accepted opens it. One line, only where the two
    -- have never exchanged anything, and only if the accept did land a chat.
    IF EXISTS (SELECT 1 FROM public.watch w
                WHERE w.watcher_id = r.target_id AND w.target_id = r.watcher_id
                  AND w.state = 'chat')
       AND NOT EXISTS (SELECT 1 FROM public.chat c
                WHERE (c.user_id = r.target_id AND c.other_id = r.watcher_id)
                   OR (c.user_id = r.watcher_id AND c.other_id = r.target_id))
    THEN
      v_hello := HELLOS[1 + (('x' || substr(replace(r.target_id::text, '-', ''), 1, 8))::bit(32)::bigint
                             % array_length(HELLOS, 1))];
      INSERT INTO public.chat (user_id, other_id, text)
      VALUES (r.target_id, r.watcher_id, v_hello);
    END IF;

    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public._review_pool_answer(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._review_pool_answer(int) TO service_role;

SELECT cron.schedule('review-pool-answer', '* * * * *', $$SELECT public._review_pool_answer(20)$$);
