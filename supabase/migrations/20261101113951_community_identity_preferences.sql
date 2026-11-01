-- Preserve existing leaderboard privacy; new members default to Google.
alter table public.community_xp_accounts
  add column identity_mode text not null default 'alias'
  check (identity_mode in ('google', 'alias'));
alter table public.community_xp_accounts alter column identity_mode set default 'google';
-- Snapshot a nickname only for new reports that explicitly choose it.
-- Existing anonymous reports remain anonymous; no identity backfill.
alter table public.community_reports add column anonymous_alias text
  check (anonymous_alias is null or char_length(anonymous_alias) between 3 and 40);
