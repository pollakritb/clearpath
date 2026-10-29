-- Retire the twelve unused Web Push/local-forecast tables. Keep raw CAMS,
-- observations, data-quality evidence, community, identity and notifications.
-- Production preflight: all twelve tables contained zero rows on 2026-10-30
-- (Asia/Bangkok). An external schema/data backup was taken before application.
-- Deploy the paused-mode Admin/preflight compatibility changes first.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Lock and recheck each existing target in this transaction. If a producer has
-- written since the backup, abort rather than delete unbacked-up rows.
DO $$
DECLARE
  table_name text;
  has_rows boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'community_forecast_feature_snapshots', 'forecast_consensus_latest',
    'forecast_drift_snapshots', 'forecast_evaluation_daily',
    'forecast_false_safe_reviews', 'forecast_prediction_sources',
    'forecast_predictions', 'forecast_release_decisions', 'forecast_runs',
    'model_registry', 'push_subscriptions', 'weather_forecasts'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', table_name);
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', table_name)
        INTO has_rows;
      IF has_rows THEN
        RAISE EXCEPTION 'legacy_table_not_empty: %; refresh backup and review', table_name;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Explicitly retire only the functions belonging to the removed model registry.
DROP FUNCTION IF EXISTS public.promote_forecast_model(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.rollback_forecast_model(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.transition_forecast_model(uuid, uuid, text, text, jsonb);

-- RESTRICT is intentional: unexpected external dependencies must abort the
-- entire transaction. Table-owned indexes/policies/triggers disappear with it.
DROP TABLE IF EXISTS
  public.forecast_false_safe_reviews,
  public.forecast_predictions,
  public.forecast_release_decisions,
  public.forecast_runs,
  public.model_registry,
  public.forecast_consensus_latest,
  public.forecast_prediction_sources,
  public.community_forecast_feature_snapshots,
  public.forecast_evaluation_daily,
  public.forecast_drift_snapshots,
  public.weather_forecasts,
  public.push_subscriptions
RESTRICT;

-- The reset barrier function remains: the retained raw CAMS tables use it.
NOTIFY pgrst, 'reload schema';
COMMIT;
