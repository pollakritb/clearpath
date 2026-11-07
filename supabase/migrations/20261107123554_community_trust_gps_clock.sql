-- Explicit timezone/future-clock diagnostics; retains the original acceptance ledger.
create or replace function public.community_trust_react(p_user bigint,p_report bigint,p_key uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.community_reports; old community_trust_private.reactions; ev community_trust_private.events;
 v_subject bigint; v_now timestamptz; v_day date; today date; reason text; audit jsonb:='{}'; admitted boolean:=false;
 fix jsonb; distance double precision; accuracy double precision; fix_age double precision; report_age double precision;
 v_accept boolean:=true; latitude double precision; longitude double precision; v_hold community_trust_private.holds; ids jsonb; n integer; v_seq bigint; v_result jsonb;
begin
 if not (select collecting_enabled from community_trust_private.control where singleton) then raise exception 'community_trust_disabled';end if;
 select * into r from public.community_reports where id=p_report;
 if not found then raise exception 'report_missing';end if;
 -- Serialize all writes for a subject: pair quotas, representative slots and burst admission are atomic.
 v_subject:=r.user_id;
 perform pg_advisory_xact_lock(hashtextextended('community-trust:'||v_subject,0));
 select * into r from public.community_reports where id=p_report for share;
 if r.user_id<>v_subject then raise exception 'report_owner_changed_retry';end if;
 select * into ev from community_trust_private.events where voter_id=p_user and request_key=p_key;
 if found then
  if ev.report_id<>p_report or ev.action<>p_action or ev.payload->'intent' is distinct from jsonb_build_object('reaction',p_payload->>'reaction','reason_code',p_payload->>'reason_code') then raise exception 'idempotency_conflict';end if;
  return ev.payload->'result';
 end if;
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'account_unavailable';end if;
 if r.user_id=p_user then raise exception 'self_vote';end if;
 v_now:=clock_timestamp(); today:=(v_now at time zone 'Asia/Bangkok')::date;
 select * into old from community_trust_private.reactions where voter_id=p_user and report_id=p_report;
 v_day:=coalesce(old.vote_day,today);
 if p_action not in ('set','withdraw') then raise exception 'invalid_action';end if;
 if p_action='set' then
  if p_payload->>'policy_version' is distinct from 'community-trust-v1' then raise exception 'policy_notice_required';end if;
  if coalesce(p_payload->>'reaction','') not in ('like','dislike') then raise exception 'invalid_reaction';end if;
  if p_payload->>'reaction'='dislike' and coalesce(p_payload->>'reason_code','') not in ('report_context_doubt','image_context_doubt','ocr_mismatch','system_display_issue','station_disagreement_only','cannot_assess') then raise exception 'reason_required';end if;
  report_age:=extract(epoch from v_now-r.captured_at);
  reason:=case when r.status<>'approved' then 'report_not_approved'
   when not coalesce((p_payload->>'evidence_available')::boolean,false) or r.image_path is null or r.evidence_purged_at is not null then 'evidence_unavailable'
   when report_age<0 or report_age>10800 then 'report_expired' else null end;
  fix:=coalesce(p_payload->'location','{}');
  begin
   latitude:=(fix->>'lat')::double precision; longitude:=(fix->>'lon')::double precision;
   accuracy:=(fix->>'accuracy_m')::double precision;
   if coalesce(fix->>'observed_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then reason:=coalesce(reason,'gps_invalid');end if;
   fix_age:=extract(epoch from v_now-(fix->>'observed_at')::timestamptz);
   if latitude is null or longitude is null or accuracy is null or fix_age is null or latitude not between -90 and 90 or longitude not between -180 and 180 or accuracy<0 or accuracy='NaN'::float8 or accuracy='Infinity'::float8 then reason:=coalesce(reason,'gps_invalid');
   elsif fix_age<0 then reason:=coalesce(reason,'gps_clock_invalid');
   elsif fix_age>120 then reason:=coalesce(reason,'gps_expired');
   else
    distance:=6371000*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(r.lat-latitude)/2),2)+cos(radians(latitude))*cos(radians(r.lat))*power(sin(radians(r.lon-longitude)/2),2)))));
    if distance+accuracy>500 then reason:=coalesce(reason,case when distance-accuracy<=500 then 'gps_uncertain' else 'outside_area' end);end if;
   end if;
  exception when others then reason:=coalesce(reason,'gps_invalid');end;
  if reason is null and p_payload->>'reaction'='dislike' and p_payload->>'reason_code' not in ('report_context_doubt','image_context_doubt') then reason:='reason_not_trust';end if;
  audit:=jsonb_strip_nulls(jsonb_build_object('evidence_available',coalesce((p_payload->>'evidence_available')::boolean,false),'distance_m',distance,'accuracy_m',accuracy,'fix_age_seconds',fix_age,'report_age_seconds',report_age));
  -- Admission is only attempted by otherwise eligible votes; denied days never auto-admit later.
  if reason is null then
   select d.admitted into admitted from community_trust_private.pair_days d where d.voter_id=p_user and d.reporter_id=r.user_id and d.vote_day=v_day;
   if not found then
    select count(*) into n from community_trust_private.pair_days d where d.voter_id=p_user and d.reporter_id=r.user_id and d.admitted and d.vote_day between today-29 and today;
    admitted:=n<3;
    insert into community_trust_private.pair_days values(p_user,r.user_id,v_day,admitted,v_now);
   end if;
   if not admitted then reason:='pair_day_limit';end if;
  end if;
  v_accept:=reason is null or reason in ('pair_day_limit','reason_not_trust');
  if v_accept then
  insert into community_trust_private.reactions values(p_user,p_report,r.user_id,v_day,p_payload->>'reaction',p_payload->>'reason_code',true,coalesce(old.first_accepted_at,v_now),v_now)
   on conflict(voter_id,report_id) do update set reaction=excluded.reaction,reason_code=excluded.reason_code,active=true,updated_at=v_now;
  insert into public.report_reactions(report_id,user_id,reaction,created_at,updated_at,reason_code,geofence_policy)
   values(p_report,p_user,p_payload->>'reaction',v_now,v_now,p_payload->>'reason_code','community-trust-v1')
   on conflict(report_id,user_id) do update set reaction=excluded.reaction,reason_code=excluded.reason_code,geofence_policy=excluded.geofence_policy,updated_at=v_now;
  end if;
 else
  update community_trust_private.reactions set active=false,updated_at=v_now where voter_id=p_user and report_id=p_report;
  delete from public.report_reactions where report_id=p_report and user_id=p_user;
 end if;
 insert into community_trust_private.events(request_key,voter_id,reporter_id,report_id,vote_day,action,reaction,reason_code,eligible,exclusion_reason,payload,created_at)
 values(p_key,p_user,r.user_id,p_report,v_day,p_action,p_payload->>'reaction',p_payload->>'reason_code',p_action='set' and reason is null,reason,jsonb_build_object('accepted',v_accept,'audit',audit,'intent',jsonb_build_object('reaction',p_payload->>'reaction','reason_code',p_payload->>'reason_code')),v_now) returning seq into v_seq;
 if p_action='set' and reason is null then
  insert into community_trust_private.daily_slots values(p_user,r.user_id,v_day,v_seq,p_report)
   on conflict(voter_id,reporter_id,vote_day) do update set event_seq=v_seq,report_id=p_report;
 elsif v_accept then
  -- Withdrawal/ineligible replacement never resurrects an older report's vote.
  update community_trust_private.daily_slots set event_seq=null,report_id=null where voter_id=p_user and reporter_id=r.user_id and vote_day=v_day and report_id=p_report;
 end if;
 if p_action='set' and reason is null then
  select * into v_hold from community_trust_private.holds where reporter_id=r.user_id and expires_at>v_now order by id limit 1;
  if not found then
   select count(distinct voter_id) into n from community_trust_private.events where reporter_id=r.user_id and action='set' and eligible and created_at>=v_now-interval '3 minutes';
   if n>=10 then
    insert into community_trust_private.holds(reporter_id,started_at,expires_at) values(r.user_id,v_now,v_now+interval '30 minutes') returning * into v_hold;
    select jsonb_agg(seq) into ids from community_trust_private.events where reporter_id=r.user_id and action='set' and eligible and created_at>=v_now-interval '3 minutes';
   end if;
  else ids:=jsonb_build_array(v_seq);end if;
  if v_hold.id is not null then
   insert into community_trust_private.events(request_key,reporter_id,action,payload,created_at) values(gen_random_uuid(),r.user_id,'hold',jsonb_build_object('target_sequences',ids,'until',v_hold.expires_at,'hold_id',v_hold.id),v_now);
  end if;
 end if;
 v_result:=jsonb_build_object('trust_eligible',p_action='set' and reason is null,'trust_exclusion_reason',reason,'trust_hold_until',v_hold.expires_at,'trust_projection_status','updating');
 update community_trust_private.events set payload=payload||jsonb_build_object('result',v_result) where seq=v_seq;
 return v_result;
end $$;


revoke all on function public.community_trust_react(bigint,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.community_trust_react(bigint,bigint,uuid,text,jsonb) to service_role;
notify pgrst, 'reload schema';
