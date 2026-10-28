-- Gallery evidence metadata; private fields are exposed only by the admin presenter.
BEGIN;
ALTER TABLE public.report_drafts
  ADD COLUMN IF NOT EXISTS capture_source text NOT NULL DEFAULT 'camera'
    CHECK (capture_source IN ('camera', 'gallery')),
  ADD COLUMN IF NOT EXISTS image_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS original_image_path text;
ALTER TABLE public.report_evidence
  ADD COLUMN IF NOT EXISTS image_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS original_image_path text;
ALTER TABLE public.community_reports
  DROP CONSTRAINT IF EXISTS community_reports_capture_source_check;
ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_capture_source_check
    CHECK (capture_source IN ('camera', 'gallery')),
  ADD COLUMN IF NOT EXISTS image_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMIT;
