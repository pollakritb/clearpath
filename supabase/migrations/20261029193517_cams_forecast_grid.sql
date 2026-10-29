-- Independent raw CAMS grid. No legacy forecast tables or production cron changes.
BEGIN;
CREATE TABLE public.cams_grid_definitions (
 id text PRIMARY KEY, latitudes double precision[] NOT NULL, longitudes double precision[] NOT NULL,
 CHECK (cardinality(latitudes) BETWEEN 2 AND 100), CHECK (cardinality(longitudes) BETWEEN 2 AND 100)
);
CREATE TABLE public.cams_grid_generations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grid_id text NOT NULL REFERENCES public.cams_grid_definitions(id),
 status text NOT NULL DEFAULT 'staging' CHECK(status IN ('staging','ready','failed')),
 started_at timestamptz NOT NULL DEFAULT now(), retrieved_at timestamptz,
 model_issued_at timestamptz, valid_times timestamptz[] NOT NULL DEFAULT '{}', fingerprint text
);
CREATE TABLE public.cams_grid_frames (
 generation_id uuid NOT NULL REFERENCES public.cams_grid_generations(id) ON DELETE CASCADE,
 valid_at timestamptz NOT NULL, values double precision[] NOT NULL,
 PRIMARY KEY(generation_id,valid_at)
);
CREATE TABLE public.cams_grid_active (
 id integer PRIMARY KEY CHECK(id=1), generation_id uuid NOT NULL REFERENCES public.cams_grid_generations(id)
);
CREATE TABLE public.cams_grid_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slot timestamptz NOT NULL UNIQUE,
 generation_id uuid REFERENCES public.cams_grid_generations(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','ready','failed')),
 next_batch integer NOT NULL DEFAULT 0, batch_count integer NOT NULL,
 lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, last_error boolean NOT NULL DEFAULT false
);
CREATE TABLE public.cams_grid_chunks (
 job_id uuid NOT NULL REFERENCES public.cams_grid_jobs(id) ON DELETE CASCADE,
 batch_index integer NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(job_id,batch_index)
);
CREATE INDEX cams_grid_generation_ready ON public.cams_grid_generations(retrieved_at DESC) WHERE status='ready';

-- Public HTTP reads go through the backend; browser roles cannot read staging/leases.
ALTER TABLE public.cams_grid_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cams_grid_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cams_grid_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cams_grid_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cams_grid_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cams_grid_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cams_grid_definitions,public.cams_grid_generations,public.cams_grid_frames,public.cams_grid_active,public.cams_grid_jobs,public.cams_grid_chunks FROM anon,authenticated;
GRANT ALL ON public.cams_grid_definitions,public.cams_grid_generations,public.cams_grid_frames,public.cams_grid_active,public.cams_grid_jobs,public.cams_grid_chunks TO service_role;

CREATE FUNCTION public.claim_cams_grid(p_slot timestamptz,p_token uuid,p_grid jsonb,p_batches integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE j cams_grid_jobs; gid uuid;
BEGIN
 IF p_slot <> date_trunc('day',p_slot AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + make_interval(hours => (extract(hour from p_slot AT TIME ZONE 'UTC')::integer / 6)*6)
 OR p_batches NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'grid_slot_invalid'; END IF;
 -- Serialize job creation/claim across scheduled and manual invocations.
 IF NOT pg_try_advisory_xact_lock(71834012) THEN RETURN jsonb_build_object('status','in_progress'); END IF;
 -- A crashed older slot can be superseded only after its lease has expired.
 IF EXISTS(SELECT 1 FROM cams_grid_jobs WHERE status='running' AND lease_until>now()) THEN
   RETURN jsonb_build_object('status','in_progress');
 END IF;
 SELECT * INTO j FROM cams_grid_jobs WHERE slot=p_slot FOR UPDATE;
 IF FOUND AND j.status IN ('ready','failed') THEN
   RETURN jsonb_build_object('status',CASE WHEN j.status='ready' THEN 'not_due' ELSE 'failed' END);
 END IF;
 IF j.id IS NOT NULL AND j.created_at<now()-interval '20 minutes' THEN
   UPDATE cams_grid_jobs SET status='failed',completed_at=now() WHERE id=j.id;
   UPDATE cams_grid_generations SET status='failed' WHERE id=j.generation_id;
   RETURN jsonb_build_object('status','failed');
 END IF;
 IF j.id IS NULL THEN
   INSERT INTO cams_grid_definitions(id,latitudes,longitudes)
   VALUES(p_grid->>'id',ARRAY(SELECT jsonb_array_elements_text(p_grid->'latitudes')::float8),ARRAY(SELECT jsonb_array_elements_text(p_grid->'longitudes')::float8)) ON CONFLICT DO NOTHING;
   INSERT INTO cams_grid_generations(grid_id) VALUES(p_grid->>'id') RETURNING id INTO gid;
   INSERT INTO cams_grid_jobs(slot,generation_id,batch_count) VALUES(p_slot,gid,p_batches) RETURNING * INTO j;
 END IF;
 UPDATE cams_grid_jobs SET lease_token=p_token,lease_until=now()+interval '90 seconds' WHERE id=j.id RETURNING * INTO j;
 RETURN jsonb_build_object('status','claimed','id',j.id,'next_batch',j.next_batch,'generation_id',j.generation_id);
END $$;

CREATE FUNCTION public.checkpoint_cams_grid(p_job uuid,p_token uuid,p_batch integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE j cams_grid_jobs;
BEGIN
 SELECT * INTO j FROM cams_grid_jobs WHERE id=p_job FOR UPDATE;
 IF j.status<>'running' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=now() OR j.next_batch<>p_batch THEN RAISE EXCEPTION 'grid_lease_lost'; END IF;
 INSERT INTO cams_grid_chunks VALUES(p_job,p_batch,p_payload) ON CONFLICT(job_id,batch_index) DO UPDATE SET payload=excluded.payload;
 UPDATE cams_grid_jobs SET next_batch=next_batch+1,attempts=0,last_error=false WHERE id=p_job;
 RETURN jsonb_build_object('status','checkpointed');
END $$;

CREATE FUNCTION public.release_cams_grid(p_job uuid,p_token uuid,p_error boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE cams_grid_jobs SET lease_token=NULL,lease_until=NULL,last_error=p_error,
 attempts=CASE WHEN p_error THEN attempts+1 ELSE attempts END,
 status=CASE WHEN p_error AND attempts>=4 THEN 'failed' ELSE status END
 WHERE id=p_job AND lease_token=p_token;
 UPDATE cams_grid_generations SET status='failed' WHERE id=(SELECT generation_id FROM cams_grid_jobs WHERE id=p_job AND status='failed');
 RETURN jsonb_build_object('status','released');
END $$;

CREATE FUNCTION public.publish_cams_grid(p_job uuid,p_token uuid,p_frames jsonb,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE j cams_grid_jobs; grid cams_grid_definitions; f jsonb; vals float8[]; ats timestamptz[]='{}'; previous_id uuid; gid uuid; last_at timestamptz;
BEGIN
 SELECT * INTO j FROM cams_grid_jobs WHERE id=p_job FOR UPDATE;
 IF j.status<>'running' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=now() OR j.created_at<now()-interval '20 minutes' OR j.next_batch<>j.batch_count
 OR (SELECT count(*) FROM cams_grid_chunks WHERE job_id=p_job)<>j.batch_count THEN RAISE EXCEPTION 'grid_incomplete_or_lease_lost'; END IF;
 IF jsonb_array_length(p_frames) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'grid_frame_count_invalid'; END IF;
 SELECT d.* INTO grid FROM cams_grid_definitions d JOIN cams_grid_generations g ON g.grid_id=d.id WHERE g.id=j.generation_id;
 IF grid.id IS NULL THEN RAISE EXCEPTION 'grid_definition_missing'; END IF;
 FOR f IN SELECT * FROM jsonb_array_elements(p_frames) LOOP
   vals=ARRAY(SELECT CASE WHEN v='null'::jsonb THEN NULL ELSE v::text::float8 END FROM jsonb_array_elements(f->'values') v);
   IF cardinality(vals)<>cardinality(grid.latitudes)*cardinality(grid.longitudes)
      OR EXISTS(SELECT 1 FROM unnest(vals) v WHERE v IS NOT NULL AND NOT(v>=0 AND v<=2000)) THEN RAISE EXCEPTION 'grid_frame_shape_invalid'; END IF;
   IF (f->>'valid_at')::timestamptz IS NULL OR (last_at IS NOT NULL AND (f->>'valid_at')::timestamptz<=last_at) THEN RAISE EXCEPTION 'grid_time_invalid'; END IF;
   last_at=(f->>'valid_at')::timestamptz;
   ats=array_append(ats,last_at);
   INSERT INTO cams_grid_frames(generation_id,valid_at,values) VALUES(j.generation_id,last_at,vals);
 END LOOP;
 IF last_at<=now() THEN RAISE EXCEPTION 'grid_forecast_expired'; END IF;
 SELECT a.generation_id INTO previous_id FROM cams_grid_active a WHERE a.id=1;
 gid=j.generation_id;
 IF EXISTS(SELECT 1 FROM cams_grid_generations WHERE id=previous_id AND fingerprint=p_fingerprint AND grid_id=grid.id) THEN
   -- Keep original retrieval time when payload is unchanged; do not pretend it is newer.
   gid=previous_id;
   UPDATE cams_grid_jobs SET generation_id=gid WHERE id=p_job;
   DELETE FROM cams_grid_generations WHERE id=j.generation_id;
 ELSE
   UPDATE cams_grid_generations SET status='ready',retrieved_at=now(),valid_times=ats,fingerprint=p_fingerprint WHERE id=gid;
   INSERT INTO cams_grid_active VALUES(1,gid) ON CONFLICT(id) DO UPDATE SET generation_id=excluded.generation_id;
 END IF;
 UPDATE cams_grid_jobs SET status='ready',completed_at=now(),lease_until=NULL,lease_token=NULL WHERE id=p_job;
 DELETE FROM cams_grid_chunks WHERE job_id=p_job;
 -- Retain active, previous ready generation and a one-hour reader grace period.
 DELETE FROM cams_grid_generations WHERE id NOT IN(SELECT generation_id FROM cams_grid_active)
 AND id NOT IN(SELECT id FROM cams_grid_generations WHERE status='ready' ORDER BY retrieved_at DESC LIMIT 2)
 AND started_at<now()-interval '1 hour';
 DELETE FROM cams_grid_jobs WHERE created_at<now()-interval '30 days';
 RETURN jsonb_build_object('status','ready','generation_id',gid,'frame_count',cardinality(ats));
END $$;
REVOKE ALL ON FUNCTION public.claim_cams_grid(timestamptz,uuid,jsonb,integer),public.checkpoint_cams_grid(uuid,uuid,integer,jsonb),public.release_cams_grid(uuid,uuid,boolean),public.publish_cams_grid(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cams_grid(timestamptz,uuid,jsonb,integer),public.checkpoint_cams_grid(uuid,uuid,integer,jsonb),public.release_cams_grid(uuid,uuid,boolean),public.publish_cams_grid(uuid,uuid,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
