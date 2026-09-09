-- Optional Google reporter identity for individual community reports.
-- Existing and unspecified reports remain anonymous by default.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS identity_provider TEXT;

ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS show_reporter_profile BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reporter_avatar_url TEXT;

UPDATE public.community_reports
SET show_reporter_profile = FALSE
WHERE show_reporter_profile IS NULL;

COMMENT ON COLUMN public.profiles.avatar_url IS
  'Server-synchronized Google avatar URL. Never accepted from a report request body.';
COMMENT ON COLUMN public.profiles.identity_provider IS
  'Verified Supabase Auth identity provider used to gate public reporter profiles.';
COMMENT ON COLUMN public.community_reports.show_reporter_profile IS
  'Per-report opt-in. FALSE hides both reporter name and avatar from public responses.';
COMMENT ON COLUMN public.community_reports.reporter_avatar_url IS
  'Google avatar snapshot copied server-side only when the reporter opts in.';

COMMIT;
