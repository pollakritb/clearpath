-- contribution-v3: additive, independently released; no reset/backfill of XP.
create table public.contribution_v3_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false, starts_at timestamptz,
 paused boolean not null default false, missions_enabled boolean not null default false,
 refs jsonb not null default '{}', updated_at timestamptz not null default now(),
 check(not enabled or starts_at is not null),
 check(not missions_enabled or coalesce(length(refs->>'coverage_validation_ref'),0)>10)
);
insert into public.contribution_v3_control(singleton) values(true);
alter table public.contribution_v3_control enable row level security;
revoke all on public.contribution_v3_control from public,anon,authenticated;
grant select on public.contribution_v3_control to service_role;
create table public.contribution_v3_release_events (
 id bigint generated always as identity primary key, occurred_at timestamptz not null default now(),
 operator_ref text not null, configuration jsonb not null
);
alter table public.contribution_v3_release_events enable row level security;
revoke all on public.contribution_v3_release_events from public,anon,authenticated;
grant select on public.contribution_v3_release_events to service_role;
create function public.contribution_v3_release() returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(c) from public.contribution_v3_control c where singleton
$$;
create function public.set_contribution_v3_release(p_enabled boolean,p_starts_at timestamptz,p_missions boolean,p_refs jsonb,p_operator text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.contribution_v3_control; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-xp-worker',0));
 select * into previous from public.contribution_v3_control where singleton for update;
 if length(coalesce(p_operator,''))<3 then raise exception 'operator_required';end if;
 if previous.starts_at is not null and p_starts_at is distinct from previous.starts_at then raise exception 'launch_timestamp_immutable';end if;
 if previous.starts_at is null and p_starts_at is not null and (p_starts_at<=now() or p_starts_at<>(date_trunc('month',p_starts_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')) then raise exception 'future_thai_month_boundary_required';end if;
 if p_enabled and p_starts_at is null then raise exception 'future_thai_month_boundary_required';end if;
 if p_enabled and (coalesce(length(p_refs->>'notice_ref'),0)<10 or coalesce(length(p_refs->>'concurrency_ref'),0)<10 or coalesce(length(p_refs->>'preservation_ref'),0)<10 or coalesce(length(p_refs->>'device_validation_ref'),0)<10) then raise exception 'release_evidence_required';end if;
 update public.contribution_v3_control set enabled=p_enabled,paused=not p_enabled,starts_at=p_starts_at,missions_enabled=p_missions,refs=p_refs,updated_at=now() where singleton returning to_jsonb(contribution_v3_control.*) into result;
 insert into public.contribution_v3_release_events(operator_ref,configuration) values(p_operator,result);
 return result;
end $$;
-- Select policy once at server submission; rollback pauses v3 jobs, never reclassifies them.
create or replace function private.community_job_submission_time() returns trigger language plpgsql set search_path='' as $$
declare policy public.community_policy_release; v3 public.contribution_v3_control;
begin
 select * into v3 from public.contribution_v3_control where singleton for share;
 select * into policy from public.community_policy_release where singleton for share;
 if v3.starts_at is not null and (new.report_snapshot->>'created_at')::timestamptz>=v3.starts_at then
  new.occurred_at:=(new.report_snapshot->>'created_at')::timestamptz;new.policy_version:='contribution-v3';
 elsif policy.active_version='v2' and (new.report_snapshot->>'created_at')::timestamptz>=policy.launched_at then
  new.occurred_at:=(new.report_snapshot->>'created_at')::timestamptz;new.policy_version:='contribution-v2';
 end if;return new;
end $$;

CREATE OR REPLACE FUNCTION public.process_community_xp(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.community_xp_jobs; r jsonb; e jsonb; m jsonb; req public.measurement_requests; c public.community_help_claims;
 t timestamptz; submitted timestamptz; captured timestamptz; day_start timestamptz; last_xp timestamptz;
 v_request bigint; base_reason text; bonus_reason text; base integer; bonus integer; n integer:=0;
 v3 boolean; ctl public.contribution_v3_control; v2 boolean; release public.community_policy_release; version text; week_start timestamptz; mission uuid; previous_rank integer; current_rank integer; before_points bigint;
 gps_lat float8; gps_lon float8; accuracy float8; deadline timestamptz;
begin
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then return jsonb_build_object('processed',0); end if;
 select * into release from public.community_policy_release where singleton;
 select * into ctl from public.contribution_v3_control where singleton;
 -- One short transaction worker lease; per-user caps cannot race across workers.
 if not pg_try_advisory_xact_lock(hashtextextended('community-xp-worker',0)) then return jsonb_build_object('processed',0,'busy',true); end if;
 for j in select * from public.community_xp_jobs where state='pending' and (policy_version<>'contribution-v3' or (ctl.enabled and not ctl.paused)) and not exists(select 1 from public.community_reports pr where pr.user_id=community_xp_jobs.user_id and pr.status='pending' and pr.created_at<=community_xp_jobs.occurred_at) and not exists(select 1 from public.community_xp_jobs prior where prior.user_id=community_xp_jobs.user_id and prior.state='pending' and (prior.occurred_at,prior.report_id)<(community_xp_jobs.occurred_at,community_xp_jobs.report_id)) and not exists(select 1 from public.measurement_report_jobs mjob where mjob.report_id=community_xp_jobs.report_id and mjob.state='pending') order by occurred_at,report_id limit least(greatest(p_limit,1),100) for update skip locked loop
  if exists(select 1 from public.community_xp_events where report_id=j.report_id and kind='report') then
   update public.community_xp_jobs set state='done',processed_at=now(),report_snapshot='{}',evidence_snapshot='{}' where report_id=j.report_id; continue;
  end if;
  r:=j.report_snapshot; e:=j.evidence_snapshot; m:=coalesce(e->'image_metadata','{}'); t:=j.occurred_at;
  submitted:=(r->>'created_at')::timestamptz; captured:=(r->>'captured_at')::timestamptz;
  v3:=j.policy_version='contribution-v3';
  v2:=j.policy_version in ('contribution-v2','contribution-v3');
  version:=j.policy_version;
  if v2 then t:=submitted;end if;
  if v3 and (exists(select 1 from public.community_xp_jobs earlier where earlier.state='pending' and (coalesce((earlier.report_snapshot->>'created_at')::timestamptz,earlier.occurred_at),earlier.report_id)<(submitted,j.report_id)) or exists(select 1 from public.community_reports earlier where earlier.status='pending' and (earlier.created_at,earlier.id)<(submitted,j.report_id))) then
   -- A slower earlier matching/OCR job must not lose a contested public-area mission.
   continue;
  end if;
  mission:=null;
  week_start:=date_trunc('week',t at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  day_start:=date_trunc('day',t at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  insert into public.community_xp_accounts(user_id) values(j.user_id) on conflict do nothing;
  perform pg_advisory_xact_lock(hashtextextended('xp:'||j.user_id::text,0));
  base:=0; bonus:=0; base_reason:='granted'; bonus_reason:='no_claim'; v_request:=null;
  select max(occurred_at) into last_xp from public.community_xp_events where user_id=j.user_id and points>0 and (not v2 or kind in ('report','help')) and occurred_at<=t;
  if r->>'status'<>'approved' or (v2 and (r->>'pm25' is null or ((r->>'pm25')::float8<0 or (r->>'pm25')::float8 in ('NaN'::float8,'Infinity'::float8)))) then base_reason:='not_approved';
  elsif r->>'duplicate_of_report_id' is not null or (v3 and exists(select 1 from public.community_reports current_report join public.community_reports prior on prior.image_sha256=current_report.image_sha256 and prior.status='approved' and (prior.created_at,prior.id)<(current_report.created_at,current_report.id) where current_report.id=j.report_id)) then base_reason:='duplicate';
  elsif captured>submitted or captured<submitted-interval '3 hours' then base_reason:='stale';
  elsif last_xp>t-interval '30 minutes' then base_reason:='cooldown';
  elsif (select count(*) from public.community_xp_events where user_id=j.user_id and kind='report' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')>=5 then base_reason:='report_limit';
  else base:=10; end if;
  -- Metadata has been validated by the upload service and is never client-authored JSON.
  v_request:=private.identifier_number('measurement_requests',m->>'measurement_request_id');
  if exists(select 1 from public.measurement_report_jobs where report_id=j.report_id) then
   v_request:=null;
   select q.* into req from public.measurement_report_matches link join public.measurement_requests q on q.id=link.request_id
    where link.report_id=j.report_id and q.user_id<>j.user_id
    and (v3 or not exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.request_id=q.id and ev.kind='help' and ev.points>0))
    and (v3 or not exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.requester_id=q.user_id and ev.kind='help' and ev.points>0 and ev.occurred_at>=day_start and ev.occurred_at<day_start+interval '1 day'))
    and (v3 or (select count(*) from public.community_xp_events ev where ev.user_id=j.user_id and ev.requester_id=q.user_id and ev.kind='help' and ev.points>0 and ev.occurred_at>t-interval '7 days' and ev.occurred_at<=t)<3)
    order by case when not exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.kind='help' and ev.points>0 and (ev.request_id=q.id or (ev.requester_id=q.user_id and ev.occurred_at>=day_start and ev.occurred_at<day_start+interval '1 day'))) and (select count(*) from public.community_xp_events ev where ev.user_id=j.user_id and ev.requester_id=q.user_id and ev.kind='help' and ev.points>0 and ev.occurred_at>t-interval '7 days' and ev.occurred_at<=t)<3 then 0 else 1 end,q.created_at,q.id limit 1;
   if found then
    v_request:=req.id;
    gps_lat:=(m->'bonus_gps_at_submission'->>'lat')::float8; gps_lon:=(m->'bonus_gps_at_submission'->>'lon')::float8; accuracy:=(m->'bonus_gps_at_submission'->>'accuracy_m')::float8;
    if base_reason in ('not_approved','duplicate','stale','cooldown') then bonus_reason:=base_reason;
    elsif v3 and exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.request_id=req.id and ev.kind='help' and ev.points>0) then bonus_reason:='already_rewarded';
    elsif v3 and (exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.requester_id=req.user_id and ev.kind='help' and ev.points>0 and ev.occurred_at>=day_start and ev.occurred_at<day_start+interval '1 day') or (select count(*) from public.community_xp_events ev where ev.user_id=j.user_id and ev.requester_id=req.user_id and ev.kind='help' and ev.points>0 and ev.occurred_at>t-interval '7 days' and ev.occurred_at<=t)>=3) then bonus_reason:='pair_limit';
    elsif v3 and (captured<req.starts_at or captured>req.expires_at or submitted>case when req.status='fulfilled' then least(req.expires_at,req.updated_at+interval '15 minutes') else req.expires_at end or (req.status='cancelled' and submitted>=req.updated_at) or private.measurement_distance(req.lat,req.lon,(r->>'lat')::float8,(r->>'lon')::float8)>2) then bonus_reason:='request_closed';
    elsif captured>submitted or submitted-captured>interval '15 minutes' or accuracy is null or accuracy not between 0 and 200 or gps_lat is null or gps_lon is null or gps_lat not between -90 and 90 or gps_lon not between -180 and 180 or (v3 and (r->>'capture_source' is null or coalesce((r->>'clock_warning')::boolean,false)))
     or not (coalesce(r->>'capture_source','camera')='camera' or (m->>'exif_captured_at' is not null and m->'exif_gps' is not null))
     or private.measurement_distance(gps_lat,gps_lon,(r->>'lat')::float8,(r->>'lon')::float8)>.2 then bonus_reason:='invalid_evidence';
    elsif (select count(*) from public.community_xp_events where user_id=j.user_id and kind='help' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')>=3 then bonus_reason:='help_limit';
    else bonus:=5;bonus_reason:='granted';end if;
   end if;
  elsif v_request is not null then
   select * into req from public.measurement_requests where id=v_request for update;
   select * into c from public.community_help_claims where request_id=v_request and user_id=j.user_id;
   deadline:=req.expires_at;
   if req.status='fulfilled' then deadline:=least(deadline,req.updated_at+interval '15 minutes'); end if;
   gps_lat:=(m->'bonus_gps_at_submission'->>'lat')::float8; gps_lon:=(m->'bonus_gps_at_submission'->>'lon')::float8; accuracy:=(m->'bonus_gps_at_submission'->>'accuracy_m')::float8;
   if c.user_id is null then bonus_reason:='no_claim';
   elsif (req.status='cancelled' and t>=req.updated_at) or submitted>deadline then bonus_reason:='request_closed';
   elsif base_reason in ('not_approved','duplicate','stale','cooldown') then bonus_reason:=base_reason;
   elsif v3 and private.measurement_distance(req.lat,req.lon,(r->>'lat')::float8,(r->>'lon')::float8)>2 then bonus_reason:='invalid_evidence';
   elsif req.user_id=j.user_id or c.started_at>captured or captured>req.expires_at or captured<req.starts_at or captured>submitted or submitted-captured>interval '15 minutes'
    or accuracy is null or accuracy not between 0 and 200 or gps_lat is null or gps_lon is null or gps_lat not between -90 and 90 or gps_lon not between -180 and 180 or (v3 and (r->>'capture_source' is null or coalesce((r->>'clock_warning')::boolean,false)))
    or not (coalesce(r->>'capture_source','camera')='camera' or (m->>'exif_captured_at' is not null and m->'exif_gps' is not null))
    or 6371*2*asin(sqrt(least(1.0,power(sin(radians(gps_lat-(r->>'lat')::float8)/2),2)+cos(radians(gps_lat))*cos(radians((r->>'lat')::float8))*power(sin(radians(gps_lon-(r->>'lon')::float8)/2),2))))>.2
    or 6371*2*asin(sqrt(least(1.0,power(sin(radians(req.lat-(r->>'lat')::float8)/2),2)+cos(radians(req.lat))*cos(radians((r->>'lat')::float8))*power(sin(radians(req.lon-(r->>'lon')::float8)/2),2))))>req.radius_km then bonus_reason:='invalid_evidence';
   elsif exists(select 1 from public.community_xp_events where user_id=j.user_id and request_id=v_request and kind='help' and points>0) then bonus_reason:='already_rewarded';
   elsif (select count(*) from public.community_xp_events where user_id=j.user_id and kind='help' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')>=3 then bonus_reason:='help_limit';
   elsif exists(select 1 from public.community_xp_events where user_id=j.user_id and requester_id=req.user_id and kind='help' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')
    or (select count(*) from public.community_xp_events where user_id=j.user_id and requester_id=req.user_id and kind='help' and points>0 and occurred_at>t-interval '7 days' and occurred_at<=t)>=3 then bonus_reason:='pair_limit';
   else bonus:=5; bonus_reason:='granted'; end if;
  end if;
  if v2 and (not v3 or ctl.missions_enabled) and m->'evidence_extraction'->>'pm25_field_verified'='true' and m->'evidence_extraction'->>'unit_verified'='true' and base_reason in ('granted','report_limit') and submitted-captured<=interval '15 minutes'
   and m->'bonus_gps_at_submission'->>'accuracy_m' is not null
   and (m->'bonus_gps_at_submission'->>'accuracy_m')::float8 between 0 and 200
   and m->'bonus_gps_at_submission'->>'lat' is not null and m->'bonus_gps_at_submission'->>'lon' is not null
   and coalesce(r->>'measurement_environment','')='outdoor' and not coalesce((r->>'near_emission_source')::boolean,false)
   and not coalesce((r->>'clock_warning')::boolean,false)
   and (coalesce(r->>'capture_source','')='camera' or (m->>'exif_captured_at' is not null and m->'exif_gps' is not null))
   and private.measurement_distance((m->'bonus_gps_at_submission'->>'lat')::float8,(m->'bonus_gps_at_submission'->>'lon')::float8,(r->>'lat')::float8,(r->>'lon')::float8)<=.2
   then
    select mi.id into mission from public.community_coverage_missions mi where mi.policy_version=version and (mi.state='open' or (mi.state='expired' and mi.fulfilled_report_id is null and not (mi.inputs ? 'covered_by_report')))
     and captured>=mi.starts_at and submitted<mi.expires_at and captured<=submitted
     and private.measurement_distance(mi.lat,mi.lon,(r->>'lat')::float8,(r->>'lon')::float8)<=mi.radius_km
     order by mi.starts_at,mi.id limit 1 for update skip locked;
    if mission is not null and not exists(select 1 from public.community_coverage_missions prior join public.community_reports pr on pr.id=prior.fulfilled_report_id
      where prior.state='fulfilled' and abs(extract(epoch from ((pr.captured_at)-captured)))<3600
      and private.measurement_distance((r->>'lat')::float8,(r->>'lon')::float8,pr.lat,pr.lon)<=2) then
     update public.community_coverage_missions set state='fulfilled',fulfilled_report_id=j.report_id where id=mission;
     update public.community_coverage_missions set state='expired',inputs=inputs||jsonb_build_object('covered_by_report',j.report_id) where state='open' and id<>mission and starts_at<=captured+interval '60 minutes' and expires_at>captured and private.measurement_distance(lat,lon,(r->>'lat')::float8,(r->>'lon')::float8)<=radius_km;
     if bonus=0 and (select count(*) from public.community_xp_events where user_id=j.user_id and kind='help' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')<3 then
      bonus:=5;bonus_reason:='coverage_mission';v_request:=null;
     end if;
    else mission:=null;end if;
  end if;
  select lifetime_xp into before_points from public.community_xp_totals(j.user_id);
  insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version)
   values(j.user_id,j.report_id,'report',base,base_reason,t,version) on conflict do nothing;
  if v_request is not null or mission is not null then
   insert into public.community_xp_events(user_id,report_id,request_id,requester_id,kind,points,reason,occurred_at,policy_version,mission_id)
   values(j.user_id,j.report_id,v_request,case when v_request is not null then req.user_id else null end,'help',bonus,bonus_reason,t,version,case when v_request is null then mission else null end) on conflict do nothing;
  end if;
  if v2 and base>0 then
   insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version,award_key)
   select j.user_id,j.report_id,'first_day',5,'first_day',t,version,'first:'||j.user_id||':'||(t at time zone 'Asia/Bangkok')::date where not v3 or not exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.kind='first_day' and ev.points>0 and ev.occurred_at>=day_start and ev.occurred_at<day_start+interval '1 day') on conflict do nothing;
   if (select count(distinct (occurred_at at time zone 'Asia/Bangkok')::date) from public.community_xp_events where user_id=j.user_id and kind='report' and points>0 and (v3 or policy_version=version) and not exists(select 1 from public.community_xp_events rev where rev.reverses=community_xp_events.id) and occurred_at>=week_start and occurred_at<week_start+interval '7 days' and occurred_at<=t)>=5 then
    insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version,award_key)
    select j.user_id,j.report_id,'contribution_week',20,'five_days',t,version,'week:'||j.user_id||':'||(week_start at time zone 'Asia/Bangkok')::date where not v3 or not exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.kind='contribution_week' and ev.points>0 and ev.occurred_at>=week_start and ev.occurred_at<week_start+interval '7 days') on conflict do nothing;
   end if;
  end if;
  if v2 then
   select count(*) into previous_rank from unnest(array[100,500,1500,5000]) b where b<=coalesce(before_points,0);
   select count(*) into current_rank from unnest(array[100,500,1500,5000]) b where b<=(select lifetime_xp from public.community_xp_totals(j.user_id));
   if current_rank>previous_rank then
    insert into public.user_notifications(user_id,event_type,title,body,url,entity_type,entity_id,payload,deduplication_key)
    values(j.user_id,'rank_up','คุณเลื่อนยศแล้ว','เปิดดูคะแนนสะสมและยศใหม่ของคุณ','/profile','community_report',j.report_id::text,jsonb_build_object('rank_level',current_rank),'rank:'||j.user_id||':'||current_rank) on conflict do nothing;
   end if;
  end if;
  update public.community_xp_jobs set state='done',processed_at=now(),report_snapshot='{}',evidence_snapshot='{}' where report_id=j.report_id;
  n:=n+1;
 end loop;
 return jsonb_build_object('processed',n,'pending',(select count(*) from public.community_xp_jobs where state='pending'));
end $function$
;

create or replace function private.community_season_rows(p_month text) returns jsonb language sql stable set search_path='' as $$
 with bounds as(select to_date(p_month||'-01','YYYY-MM-DD')::timestamp at time zone 'Asia/Bangkok' start_at,
 (to_date(p_month||'-01','YYYY-MM-DD')+interval '1 month')::timestamp at time zone 'Asia/Bangkok' end_at),
 scored as(select a.user_id,a.member_id,a.alias,t.lifetime_xp,t.days,sum(e.points) xp
 from public.community_xp_accounts a join public.community_xp_totals() t using(user_id)
 join public.community_xp_events e on e.user_id=a.user_id cross join bounds b
 where e.points>0 and (e.policy_version='contribution-v2' or exists(select 1 from public.contribution_v3_control ctl where ctl.starts_at is not null and b.start_at>=ctl.starts_at)) and e.occurred_at>=b.start_at and e.occurred_at<b.end_at
 and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)
 group by a.user_id,a.member_id,a.alias,t.lifetime_xp,t.days),
 ranked as(select *,rank() over(order by xp desc) rank from scored)
 select coalesce(jsonb_agg(to_jsonb(r) order by xp desc,member_id),'[]') from ranked r
$$;

create or replace function public.community_v2_month_points(p_month text,p_user bigint) returns bigint language sql stable set search_path='' as $$
 select coalesce((select (r->>'xp')::bigint from jsonb_array_elements(private.community_season_rows(p_month)) r where (r->>'user_id')::bigint=p_user),0)
$$;

create or replace function public.community_v2_counters(p_user bigint) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
 'month_rank',((public.community_v2_month_board(to_char(now() at time zone 'Asia/Bangkok','YYYY-MM'),0,p_user)->'me')->>'rank')::bigint,
 'month_rank',(public.community_v2_month_board(to_char(now() at time zone 'Asia/Bangkok','YYYY-MM'),0,p_user)->'me'->'rank'),
 'fulfilled_requests',(select count(*) from public.measurement_report_matches m join public.community_reports r on r.id=m.report_id where r.user_id=p_user),
 'missions_completed',(select count(*) from public.community_coverage_missions m join public.community_reports r on r.id=m.fulfilled_report_id where r.user_id=p_user),
 'week_days',(select count(distinct (e.occurred_at at time zone 'Asia/Bangkok')::date) from public.community_xp_events e where e.user_id=p_user and e.kind='report' and e.points>0 and (e.policy_version='contribution-v2' or exists(select 1 from public.contribution_v3_control ctl where ctl.starts_at is not null and now()>=ctl.starts_at)) and e.occurred_at>=date_trunc('week',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)),
 'month_points',(select coalesce(sum(e.points),0) from public.community_xp_events e where e.user_id=p_user and e.points>0 and (e.policy_version='contribution-v2' or exists(select 1 from public.contribution_v3_control ctl where ctl.starts_at is not null and now()>=ctl.starts_at)) and e.occurred_at>=date_trunc('month',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)))
$$;

create or replace function public.freeze_community_seasons() returns integer language plpgsql set search_path='' as $$
declare m date; payload jsonb; old public.community_season_results; changed boolean; n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-season-freeze',0));
 for m in select distinct date_trunc('month',occurred_at at time zone 'Asia/Bangkok')::date from public.community_xp_events
 where (policy_version='contribution-v2' or exists(select 1 from public.contribution_v3_control ctl where ctl.starts_at is not null and occurred_at>=ctl.starts_at)) and (date_trunc('month',occurred_at at time zone 'Asia/Bangkok')+interval '1 month 72 hours') at time zone 'Asia/Bangkok'<=now() loop
  payload:=private.community_season_rows(to_char(m,'YYYY-MM'));
  select * into old from public.community_season_results where month=m;
  -- Lifetime totals and public names can change without revising monthly points.
  changed:=not found or (select coalesce(jsonb_agg(jsonb_build_array(r->'user_id',r->'xp',r->'rank')),'[]') from jsonb_array_elements(payload) r)
   is distinct from (select coalesce(jsonb_agg(jsonb_build_array(r->'user_id',r->'xp',r->'rank')),'[]') from jsonb_array_elements(coalesce(old.results,'[]')) r);
  if changed then
   insert into public.community_season_results(month,results) values(m,payload)
   on conflict(month) do update set results=excluded.results,revision=community_season_results.revision+1,frozen_at=now(),
    previous_results=community_season_results.previous_results||jsonb_build_array(jsonb_build_object('revision',community_season_results.revision,'results',community_season_results.results,'frozen_at',community_season_results.frozen_at,'reason','late_settlement_or_confirmed_compensation'));
   n:=n+1;
  end if;
 end loop;return n;
end $$;

create function public.reconcile_contribution_v3() returns integer language plpgsql set search_path='' as $$
declare e public.community_xp_events; d record; chosen record; start_at timestamptz; end_at timestamptz; n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-xp-worker',0));
 for e in select ev.* from public.community_xp_events ev where ev.policy_version='contribution-v3' and ev.points>0 and ev.kind in ('first_day','contribution_week') and not exists(select 1 from public.community_xp_events rev where rev.reverses=ev.id) loop
  start_at:=date_trunc(case when e.kind='first_day' then 'day' else 'week' end,e.occurred_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  end_at:=start_at+case when e.kind='first_day' then interval '1 day' else interval '7 days' end;
  if (select count(distinct (b.occurred_at at time zone 'Asia/Bangkok')::date) from public.community_xp_events b where b.user_id=e.user_id and b.kind='report' and b.points>0 and b.occurred_at>=start_at and b.occurred_at<end_at and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id)) < (case when e.kind='first_day' then 1 else 5 end) then
   perform public.reverse_community_xp(e.id,'dependent-contribution-bonus-no-longer-earned');n:=n+1;
  end if;
 end loop;
 -- A confirmed reversal can be compensated after a different valid contribution restores the day/week.
 for d in select user_id,date_trunc('day',occurred_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' start_at from public.community_xp_events ev where policy_version='contribution-v3' and kind='report' and points>0 group by user_id,start_at loop
  select b.* into chosen from public.community_xp_events b where b.user_id=d.user_id and b.kind='report' and b.points>0 and b.occurred_at>=d.start_at and b.occurred_at<d.start_at+interval '1 day' and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id) order by b.occurred_at,b.id limit 1;
  if found and not exists(select 1 from public.community_xp_events aw where aw.user_id=d.user_id and aw.kind='first_day' and aw.points>0 and aw.occurred_at>=d.start_at and aw.occurred_at<d.start_at+interval '1 day' and not exists(select 1 from public.community_xp_events rev where rev.reverses=aw.id)) then
   insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version,award_key) values(d.user_id,chosen.report_id,'first_day',5,'first_day',chosen.occurred_at,'contribution-v3','first-v3-reconciled:'||d.user_id||':'||chosen.report_id) on conflict do nothing;
  end if;
 end loop;
 for d in select user_id,date_trunc('week',occurred_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' start_at from public.community_xp_events ev where policy_version='contribution-v3' and kind='report' and points>0 group by user_id,start_at loop
  select days.* into chosen from (select distinct on ((occurred_at at time zone 'Asia/Bangkok')::date) b.* from public.community_xp_events b where b.user_id=d.user_id and b.kind='report' and b.points>0 and b.occurred_at>=d.start_at and b.occurred_at<d.start_at+interval '7 days' and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id) order by (occurred_at at time zone 'Asia/Bangkok')::date,occurred_at,id) days order by occurred_at,id offset 4 limit 1;
  if found and not exists(select 1 from public.community_xp_events aw where aw.user_id=d.user_id and aw.kind='contribution_week' and aw.points>0 and aw.occurred_at>=d.start_at and aw.occurred_at<d.start_at+interval '7 days' and not exists(select 1 from public.community_xp_events rev where rev.reverses=aw.id)) then
   insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version,award_key) values(d.user_id,chosen.report_id,'contribution_week',20,'five_days',chosen.occurred_at,'contribution-v3','week-v3-reconciled:'||d.user_id||':'||chosen.report_id) on conflict do nothing;
  end if;
 end loop;
 return n;
end $$;
do $$ declare f regprocedure; begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('contribution_v3_release','set_contribution_v3_release','reconcile_contribution_v3','process_community_xp','community_v2_counters','community_v2_month_points','freeze_community_seasons') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
notify pgrst,'reload schema';

alter table public.contribution_v3_control add column missions_checked_at timestamptz;
create or replace function public.publish_community_missions(p_candidates jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; n integer:=0; changed integer; v3 public.contribution_v3_control; version text;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-mission-publish',0));
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then return 0;end if;
 select * into v3 from public.contribution_v3_control where singleton;
 if v3.starts_at is not null and now()>=v3.starts_at then
  if not v3.enabled or v3.paused or not v3.missions_enabled or v3.missions_checked_at>now()-interval '15 minutes' then return 0;end if;
  update public.contribution_v3_control set missions_checked_at=now() where singleton;version:='contribution-v3';
 else
  if not exists(select 1 from public.community_policy_release where singleton and active_version='v2' and (missions_checked_at is null or missions_checked_at<=now()-interval '15 minutes')) then return 0;end if;
  update public.community_policy_release set missions_checked_at=now() where singleton;version:='contribution-v2';
 end if;
 update public.community_coverage_missions set state='expired' where state='open' and expires_at<=now();
 for item in select * from jsonb_array_elements(p_candidates) limit 100 loop
  -- Public, predeclared area centres are server generated, never residential points.
  insert into public.community_coverage_missions(area_key,place_name,lat,lon,starts_at,expires_at,inputs,policy_version)
  values(item->>'area_key',item->>'place_name',(item->>'lat')::float8,(item->>'lon')::float8,now(),now()+interval '60 minutes',item->'inputs',version) on conflict do nothing;
  get diagnostics changed=row_count;n:=n+changed;
 end loop;return n;
end $$;
revoke all on function public.publish_community_missions(jsonb) from public,anon,authenticated;
grant execute on function public.publish_community_missions(jsonb) to service_role;

-- Server-only compensated events preserve original occurrence and policy attribution.
create or replace function public.reverse_community_xp(p_event bigint,p_reason text) returns void
language plpgsql set search_path='' as $$
declare e public.community_xp_events;
begin
 if char_length(trim(coalesce(p_reason,'')))<10 then raise exception 'reason_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-xp-worker',0));
 select * into e from public.community_xp_events where id=p_event and points>0 for update;
 if not found then raise exception 'event_not_found';end if;
 insert into public.community_xp_events(user_id,kind,points,reason,occurred_at,reverses,policy_version)
 values(e.user_id,'reversal',-e.points,p_reason,e.occurred_at,e.id,e.policy_version) on conflict(reverses) do nothing;
end $$;
revoke all on function public.reverse_community_xp(bigint,text) from public,anon,authenticated;
grant execute on function public.reverse_community_xp(bigint,text) to service_role;

alter table public.community_xp_events add column idempotency_key text;
create unique index contribution_v3_event_idempotency on public.community_xp_events(idempotency_key) where idempotency_key is not null;
create function private.contribution_v3_event_key() returns trigger language plpgsql set search_path='' as $$
begin
 if new.policy_version='contribution-v3' then
  new.idempotency_key:=coalesce(new.award_key,case when new.reverses is not null then 'reverse:'||new.reverses else 'report:'||new.report_id||':'||new.kind end);
 end if;return new;
end $$;
create trigger contribution_v3_event_key before insert on public.community_xp_events for each row execute function private.contribution_v3_event_key();
revoke all on function private.contribution_v3_event_key() from public,anon,authenticated;
grant execute on function private.contribution_v3_event_key() to service_role;
notify pgrst,'reload schema';
