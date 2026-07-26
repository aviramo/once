-- Reply-to-message: a frozen, display-only snapshot of the message a chat row
-- answers. Shape: { user_id, created_at, kind, preview? } where kind is one of
-- text|image|audio|location|schedule and preview is a short text excerpt (only
-- for text quotes). Nullable and additive — old clients ignore it, so this is a
-- pure Expand with no BACKWARD_COMPAT entry required.
alter table public.chat add column if not exists reply_to jsonb;
