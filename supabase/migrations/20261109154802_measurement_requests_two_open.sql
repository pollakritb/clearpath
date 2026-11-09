begin;

-- Two open requests per account (active and scheduled combined). Advisory lock keeps retries/concurrent tabs atomic.
CREATE OR REPLACE FUNCTION public.create_measurement_request(p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.measurement_requests; owner bigint := (p_row->>'user_id')::bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('measurement:'||owner::text, 0));
 select * into r from public.measurement_requests where user_id=owner and
 (idempotency_key=(p_row->>'idempotency_key')::uuid or
 (fingerprint=p_row->>'fingerprint' and status in ('scheduled','active') and expires_at>now()))
 order by created_at limit 1;
 if found then return jsonb_build_object('row',to_jsonb(r)); end if;
 if (select count(*) from public.measurement_requests where user_id=owner and
 created_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')) >= 3 then
 return jsonb_build_object('error','daily_limit'); end if;
 if (select count(*) from public.measurement_requests where user_id=owner and status in ('scheduled','active') and expires_at>now()) >= 2 then
 return jsonb_build_object('error','active_limit'); end if;
 r:=jsonb_populate_record(null::public.measurement_requests,private.insert_identified_row('measurement_requests',p_row,(p_row->>'legacy_id')::uuid));
 return jsonb_build_object('row',to_jsonb(r));
end $function$;

revoke all on function public.create_measurement_request(jsonb) from public, anon, authenticated;
grant execute on function public.create_measurement_request(jsonb) to service_role;

commit;
