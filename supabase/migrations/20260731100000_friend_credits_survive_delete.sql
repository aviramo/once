-- The friend-reward ledger outlives an account deletion.
--
-- friend_credits is the ONE thing that says "this pair was already rewarded":
-- _friend_credit_side inserts (user_id, peer_id) ON CONFLICT DO NOTHING and
-- grants _friend_reward() only when that insert actually took a row. Both of
-- its FKs pointed at public.users ON DELETE CASCADE, so deleting an account
-- erased the ledger for every friendship it was part of, in BOTH directions
-- (peer_id cascaded too). And a deletion does not take the identity with it:
-- app/delete removes the public.users row only, and a re-registration from the
-- same phone comes back on the same auth uid, hence the same user_id. So the
-- same two people could be re-friended and BOTH credited again, without limit
-- and without either of them ever leaving for real.
--
-- The ledger is keyed to the IDENTITY now rather than to the account row: it
-- follows auth.users, exactly as chat and log already do. A row survives every
-- delete / re-register cycle and only ever goes when the identity itself does.
-- Nothing else in the schema reads this table (_friend_credit_side is its only
-- consumer), and its own not-found branch already deletes a row it inserted
-- against a users row that is not there.
alter table public.friend_credits
  drop constraint friend_credits_user_id_fkey,
  drop constraint friend_credits_peer_id_fkey;

alter table public.friend_credits
  add constraint friend_credits_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  add constraint friend_credits_peer_id_fkey
    foreign key (peer_id) references auth.users(id) on delete cascade;
