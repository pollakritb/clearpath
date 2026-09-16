-- Preserve the interpreted OCR outcome for moderation evidence.
-- Additive and safe to apply before the matching application release.

BEGIN;

ALTER TABLE report_drafts
  ADD COLUMN IF NOT EXISTS ocr_status TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (ocr_status IN (
      'unavailable',
      'service_error',
      'no_device',
      'unclear_display',
      'no_reading',
      'low_confidence',
      'ready'
    )),
  ADD COLUMN IF NOT EXISTS unexpected_exif BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE report_evidence
  ADD COLUMN IF NOT EXISTS ocr_status TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (ocr_status IN (
      'unavailable',
      'service_error',
      'no_device',
      'unclear_display',
      'no_reading',
      'low_confidence',
      'ready'
    )),
  ADD COLUMN IF NOT EXISTS unexpected_exif BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
