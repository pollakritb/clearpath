-- Public engagement for approved community reports.
-- Reactions are intentionally separate from gratitude/star reviews and never
-- affect Trust Score, forecast weighting, reputation or moderation.

BEGIN;

ALTER TABLE community_reports
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  ADD COLUMN IF NOT EXISTS dislike_count INTEGER NOT NULL DEFAULT 0 CHECK (dislike_count >= 0),
  ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0);

CREATE TABLE IF NOT EXISTS report_reactions (
  report_id UUID NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (report_id, user_id)
);

CREATE TABLE IF NOT EXISTS report_comments (
  id UUID PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_reactions_report_idx
  ON report_reactions (report_id, reaction);
CREATE INDEX IF NOT EXISTS report_comments_report_time_idx
  ON report_comments (report_id, created_at DESC)
  WHERE status = 'published';

ALTER TABLE report_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION refresh_report_engagement_counts(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE community_reports
  SET like_count = (
        SELECT COUNT(*) FROM report_reactions
        WHERE report_id = p_report_id AND reaction = 'like'
      ),
      dislike_count = (
        SELECT COUNT(*) FROM report_reactions
        WHERE report_id = p_report_id AND reaction = 'dislike'
      ),
      comment_count = (
        SELECT COUNT(*) FROM report_comments
        WHERE report_id = p_report_id AND status = 'published'
      ),
      updated_at = NOW()
  WHERE id = p_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION report_engagement_counts_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM refresh_report_engagement_counts(COALESCE(NEW.report_id, OLD.report_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS report_reactions_refresh_counts ON report_reactions;
CREATE TRIGGER report_reactions_refresh_counts
AFTER INSERT OR UPDATE OR DELETE ON report_reactions
FOR EACH ROW EXECUTE FUNCTION report_engagement_counts_trigger();

DROP TRIGGER IF EXISTS report_comments_refresh_counts ON report_comments;
CREATE TRIGGER report_comments_refresh_counts
AFTER INSERT OR UPDATE OR DELETE ON report_comments
FOR EACH ROW EXECUTE FUNCTION report_engagement_counts_trigger();

COMMIT;
