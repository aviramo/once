-- "locked + message" is an unread notification, not a hide.
--
-- page2 uses ONE state (`locked`) for two unrelated things:
--   * `locked` + message  -> "your invitation expired / was cancelled", an
--                            unread card the user clears with app_clear2
--   * `locked` + NO message -> the user chose to hide (app_lock2), or the pair
--                            just matched (app_approve)
-- Every consumer treated both as "hidden", so an invitee who never reopened
-- the app stayed undiscoverable indefinitely -- the punishment for not
-- answering an invite was disappearing from the game. Live pool 2026-07-20:
-- 12 of 13 hidden users were in this state, the oldest stuck 13 days.
--
-- Fix: one predicate, `_page2_open`, for "this page2 accepts discovery and
-- invitations", and every matching-path consumer switched to it. The stored
-- shape is UNCHANGED (`locked` + message still), so the deployed mobile build
-- keeps rendering the dead-invite card exactly as before -- this only changes
-- server-side discoverability. Not breaking.
--
-- The SENDER's side needed no equivalent change and is verified symmetric
-- below; see the comment on _expire_invite_pair at the end.
--
-- Every patch is a textual replacement against the LIVE function body with an
-- assertion that the anchor matched exactly once, rather than re-emitting
-- hundred-line bodies by hand (the repo has known repo<->live drift).

create or replace function public._page2_open(page2 jsonb)
returns boolean
language sql
immutable
as $function$
  -- Discoverable + invitable. `free` is the resting open state; `locked` WITH
  -- a message is an unacknowledged "what happened" card, which must not cost
  -- the user visibility. `locked` with NO message is a real hide (app_lock2 /
  -- post-approve) and `pending` is a live incoming invite -- both closed.
  SELECT coalesce(page2->>'state', 'free') = 'free'
      OR (coalesce(page2->>'state', 'free') = 'locked'
          AND page2 ? 'message')
$function$;

do $$
declare
  -- {function signature, anchor, replacement}
  v_patch text[][] := array[
    -- 1. Candidate selection: a locked-with-message user is a valid candidate.
    array[
      'public.others(public.users, boolean)',
      E'        AND COALESCE(other.relations->''page2''->>''state'', ''free'') NOT IN (''locked'', ''pending'')',
      E'        AND public._page2_open(other.relations->''page2'')'
    ],
    -- 2. app_find re-checks the pick under the lock; same relaxation.
    array[
      'public.app_find(uuid, boolean, text)',
      E'       OR COALESCE(picked_row.relations->''page2''->>''state'', ''free'') IN (''locked'', ''pending'') THEN',
      E'       OR NOT public._page2_open(picked_row.relations->''page2'') THEN'
    ],
    -- 3. ...and registers the searcher as a viewer. Without this the newly
    --    discoverable user would show 0 viewers forever, so relevance_watchers
    --    would peg at 1.0 and rank them top for EVERYONE at once.
    array[
      'public.app_find(uuid, boolean, text)',
      E'    ) WHERE user_id = picked_id\n      AND relations->''page2''->>''state'' = ''free'';',
      E'    ) WHERE user_id = picked_id\n      AND public._page2_open(relations->''page2'');'
    ],
    -- 4. Detaching a viewer must be symmetric with attaching one (3).
    array[
      'public._remove_from_profiles(uuid, uuid)',
      E'  WHERE user_id = owner_id\n    AND relations->''page2''->>''state'' = ''free'';',
      E'  WHERE user_id = owner_id\n    AND public._page2_open(relations->''page2'');'
    ],
    -- 5. The invite precondition. This is the half that made option "just show
    --    them" wrong on its own: without it we would surface candidates whom
    --    nobody can actually invite. The pending write below replaces the whole
    --    page2 object, so the stale card is dropped by a live invitation --
    --    which is the correct precedence.
    array[
      'public.app_invite(uuid)',
      E'     OR COALESCE(target_row.relations->''page2''->>''state'', ''free'') NOT IN (''free'') THEN',
      E'     OR NOT public._page2_open(target_row.relations->''page2'') THEN'
    ],
    -- 6+7. Clearing the card must KEEP the viewers picked up while it was up
    --      (3 can now populate them); both used to hardcode an empty list.
    array[
      'public.app_clear2(uuid)',
      E'    jsonb_build_object(''state'', ''free'', ''profiles'', ''[]''::jsonb)',
      E'    jsonb_build_object(''state'', ''free'', ''profiles'',\n      COALESCE(relations->''page2''->''profiles'', ''[]''::jsonb))'
    ],
    array[
      'public.app_free2(uuid)',
      E'    public._page2_free(''[]''::jsonb)',
      E'    public._page2_free(COALESCE(relations->''page2''->''profiles'', ''[]''::jsonb))'
    ]
  ];
  v_sig text;
  v_old text;
  v_new text;
  v_def text;
  v_out text;
  i     int;
begin
  for i in 1 .. array_length(v_patch, 1) loop
    v_sig := v_patch[i][1];
    v_old := v_patch[i][2];
    v_new := v_patch[i][3];

    v_def := pg_get_functiondef(v_sig::regprocedure);

    if position(v_old in v_def) = 0 then
      raise exception 'patch %: anchor not found in % -- live body drifted', i, v_sig;
    end if;

    v_out := replace(v_def, v_old, v_new);

    if position(v_old in v_out) <> 0 then
      raise exception 'patch %: anchor matched more than once in %', i, v_sig;
    end if;

    execute v_out;
  end loop;
end $$;

-- The sender's side: verified, no change needed.
--
-- _expire_invite_pair writes the inviter's page1 (locked + 'expire', held heart
-- refunded) and the invitee's page2 (locked + 'expire'). It never touches the
-- INVITER's page2 -- and page1 state has never gated discovery (others() only
-- excludes page1 = 'chat'). So the inviter stays discoverable and invitable
-- through the whole expiry, and always did; the asymmetry was entirely that
-- page2 gates visibility while page1 does not. app_cancel lands the same shape.
--
-- The one behaviour that does change for the sender: expiry writes no
-- restriction (only ignore/cancel/remove/decline/leave/block do), so once the
-- invitee is discoverable again the sender can immediately re-invite them.
-- That is intended -- a missed invite should not permanently block a retry --
-- and it is self-limiting, since each invite costs a heart out of a daily 3.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public._expire_invite_pair(uuid, uuid)'::regprocedure);
  -- The inviter branch must still write page1 only. If a future change makes it
  -- touch the inviter's page2, the symmetry argued above no longer holds and
  -- the sender needs the same _page2_open treatment as the invitee.
  if v_def ~ 'WHERE user_id = p_inviter[^;]*page2' then
    raise exception '_expire_invite_pair now writes the inviter page2 -- revisit the symmetry note above';
  end if;
end $$;
