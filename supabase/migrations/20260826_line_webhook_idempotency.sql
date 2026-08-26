-- Prevent LINE webhook redelivery from linking or replying more than once.
-- Rows are server-only and expire automatically when the next event is claimed.
CREATE TABLE IF NOT EXISTS public.line_webhook_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS line_webhook_events_expiry_idx
  ON public.line_webhook_events (expires_at);

ALTER TABLE public.line_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_line_webhook_event(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  IF p_event_id IS NULL OR length(trim(p_event_id)) < 8 OR length(p_event_id) > 200 THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.line_webhook_events WHERE expires_at < NOW();

  INSERT INTO public.line_webhook_events(event_id)
  VALUES (p_event_id)
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_line_webhook_event(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_line_webhook_event(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_line_webhook_event(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_line_webhook_event(TEXT) TO service_role;

COMMENT ON TABLE public.line_webhook_events IS
  'Short-lived server-only LINE webhook event IDs used to suppress redelivery.';
