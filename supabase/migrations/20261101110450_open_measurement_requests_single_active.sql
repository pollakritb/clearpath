-- One open request per account. Advisory lock keeps retries/concurrent tabs atomic.
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
 if (select count(*) from public.measurement_requests where user_id=owner and status in ('scheduled','active') and expires_at>now()) >= 1 then
 return jsonb_build_object('error','active_limit'); end if;
 r:=jsonb_populate_record(null::public.measurement_requests,private.insert_identified_row('measurement_requests',p_row,(p_row->>'legacy_id')::uuid));
 return jsonb_build_object('row',to_jsonb(r));
end $function$;


-- Signed-in viewers can volunteer without a proximity notification invitation.
-- GPS, capture evidence and award quotas remain enforced when XP is awarded.
CREATE OR REPLACE FUNCTION public.claim_community_help(p_user bigint, p_request bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.measurement_requests; c public.community_help_claims;
begin
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then raise exception 'xp_disabled'; end if;
 select * into r from public.measurement_requests where id=p_request for update;
 if not found or r.user_id=p_user or exists(select 1 from public.measurement_request_recipients where request_id=p_request and user_id=p_user and declined) then raise exception 'not_eligible'; end if;
 select * into c from public.community_help_claims where request_id=p_request and user_id=p_user;
 if c.user_id is null then
  if r.status<>'active' or r.starts_at>now() or r.expires_at<=now() then raise exception 'request_closed'; end if;
  insert into public.community_help_claims(request_id,user_id) values(p_request,p_user) returning * into c;
 end if;
 if r.status in ('cancelled','expired') or r.expires_at<=now() then raise exception 'request_closed'; end if;
 if r.status='fulfilled' and r.updated_at+interval '15 minutes'<=now() then raise exception 'request_closed'; end if;
 return jsonb_build_object('request_id',p_request,'started_at',c.started_at,'deadline',
 case when r.status='fulfilled' then least(r.expires_at,r.updated_at+interval '15 minutes') else r.expires_at end,'potential_xp',5);
end $function$
;
revoke all on function public.claim_community_help(p_user bigint, p_request bigint) from public,anon,authenticated;
grant execute on function public.claim_community_help(p_user bigint, p_request bigint) to service_role;
