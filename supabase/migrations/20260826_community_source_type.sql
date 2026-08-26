-- Keep source ownership separate from device quality metadata.
-- Camera + GPS submissions remain individual reports even when calibrated.
ALTER TABLE public.community_reports
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'individual';

UPDATE public.community_reports
SET source_type = 'individual'
WHERE source_type IS NULL
   OR source_type NOT IN ('individual', 'community_sensor');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_reports_source_type_check'
      AND conrelid = 'public.community_reports'::regclass
  ) THEN
    ALTER TABLE public.community_reports
      ADD CONSTRAINT community_reports_source_type_check
      CHECK (source_type IN ('individual', 'community_sensor'));
  END IF;
END
$$;

COMMENT ON COLUMN public.community_reports.source_type IS
  'Owner class: individual camera report or registered fixed community sensor. Calibration is stored separately.';
