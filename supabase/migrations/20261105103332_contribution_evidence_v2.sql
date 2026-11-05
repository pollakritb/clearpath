-- Additive v2; old points and ranks are never reset. One server-only policy pointer.
create table public.community_policy_release (
 singleton boolean primary key default true check(singleton),
 active_version text not null default 'v1' check(active_version in ('v1','v2')),
 launched_at timestamptz,
 evidence_threshold double precision check(evidence_threshold between 0 and 100),
 evidence_validation_ref text,
 reaction_radius_m double precision check(reaction_radius_m>0 and reaction_radius_m<10000),
 reaction_validation_ref text,
 check(active_version='v1' or (launched_at is not null and evidence_threshold is not null and coalesce(length(btrim(evidence_validation_ref)),0)>0)),
 check(reaction_radius_m is null or coalesce(length(btrim(reaction_validation_ref)),0)>0)
);
insert into public.community_policy_release(singleton,reaction_radius_m,reaction_validation_ref)
values(true,500,'temporary-product-policy:2026-11-05:user-directed');
alter table public.community_reports add column evidence_v2 jsonb;
create table public.community_evidence_outcomes (
 id uuid primary key default gen_random_uuid(), user_id bigint not null references public.profiles(id),
 report_id bigint references public.community_reports(id),
 scope text not null check(scope in ('image','metadata','field_protocol','instrument')),
 outcome text not null check(outcome in ('pass','problem','unresolved')),
 evaluation_key text not null unique, provenance text not null check(length(btrim(provenance))>0),
 policy_version text not null, evaluated_at timestamptz not null default now()
);
create index community_evidence_outcomes_user on public.community_evidence_outcomes(user_id,evaluated_at desc);
create table public.community_coverage_missions (
 id uuid primary key default gen_random_uuid(), area_key text not null, place_name text not null,
 lat double precision not null check(lat between 5 and 21), lon double precision not null check(lon between 97 and 106),
 radius_km double precision not null default 2 check(radius_km=2),
 starts_at timestamptz not null default now(), expires_at timestamptz not null,
 inputs jsonb not null, fulfilled_report_id bigint references public.community_reports(id),
 state text not null default 'open' check(state in ('open','fulfilled','expired')),
 policy_version text not null default 'contribution-v2', unique(area_key,starts_at), check(expires_at>starts_at)
);
create unique index community_mission_one_open_area on public.community_coverage_missions(area_key) where state='open';
create index community_missions_open on public.community_coverage_missions(lat,expires_at) where state='open';
create table public.community_season_results (
 month date primary key, revision integer not null default 1, results jsonb not null,
 frozen_at timestamptz not null default now(), previous_results jsonb not null default '[]'
);
alter table public.community_xp_events add column award_key text;
alter table public.community_xp_events add column mission_id uuid references public.community_coverage_missions(id);
create unique index community_xp_event_key on public.community_xp_events(award_key) where award_key is not null;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.community_xp_events'::regclass and contype='c' and (pg_get_constraintdef(oid) like '%kind%' or pg_get_constraintdef(oid) like '%points%') loop
 execute format('alter table public.community_xp_events drop constraint %I',c.conname);end loop;
end $$;
alter table public.community_xp_events add constraint contribution_event_points check(
 (kind='report' and points in (0,10)) or (kind in ('help','first_day') and points in (0,5)) or
 (kind='contribution_week' and points=20) or (kind='reversal' and points<0));
alter table public.report_reactions add column reason_code text;
alter table public.report_reactions add column geofence_policy text;
-- No raw voter coordinates are retained or exposed.
do $$ declare tab text; begin
 foreach tab in array array['community_policy_release','community_evidence_outcomes','community_coverage_missions','community_season_results'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant all on public.%I to service_role',tab);
 end loop;end $$;

create function private.guard_community_v2_release() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('community-xp-worker',0));
 if new.active_version='v2' and old.active_version<>'v2' then
  if not exists(select 1 from public.community_xp_control where enabled and not maintenance) or not exists(select 1 from public.measurement_request_control where registered_enabled) then raise exception 'enable_xp_and_automatic_matching_before_activation';end if;
  if exists(select 1 from public.community_xp_jobs where state='pending') or exists(select 1 from public.community_reports where status='pending') then raise exception 'drain_xp_jobs_and_submissions_before_activation';end if;
  if old.launched_at is not null and new.launched_at is distinct from old.launched_at then raise exception 'launch_timestamp_immutable';end if;
 end if;
 if old.launched_at is not null and new.launched_at is distinct from old.launched_at then raise exception 'launch_timestamp_immutable';end if;
 return new;
end $$;
create trigger community_v2_release_guard before update on public.community_policy_release for each row execute function private.guard_community_v2_release();

-- Queries return only public mission metadata. Completed reports are never returned here.
create function public.community_v2_month_board(p_month text,p_offset integer default 0,p_user bigint default null) returns jsonb language sql stable set search_path='' as $$
 with bounds as (select to_date(p_month||'-01','YYYY-MM-DD')::timestamp at time zone 'Asia/Bangkok' start_at,
 (to_date(p_month||'-01','YYYY-MM-DD')+interval '1 month')::timestamp at time zone 'Asia/Bangkok' end_at),
 scored as (select a.user_id,a.member_id,a.alias,t.lifetime_xp,t.days,coalesce(sum(e.points),0) xp
 from public.community_xp_accounts a join public.community_xp_totals() t using(user_id)
 cross join bounds b left join public.community_xp_events e on e.user_id=a.user_id and e.policy_version='contribution-v2' and e.points>0 and e.occurred_at>=b.start_at and e.occurred_at<b.end_at
 and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)
 where not a.hidden group by a.user_id,a.member_id,a.alias,t.lifetime_xp,t.days),
 ranked as(select *,rank() over(order by xp desc) rank from scored where xp>0),
 page as(select * from ranked order by xp desc,member_id offset greatest(p_offset,0) limit 51)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'user_id') from page p),'[]'),'me',(select to_jsonb(r)-'user_id' from ranked r where user_id=p_user));
$$;

create function public.community_v2_counters(p_user bigint) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
 'fulfilled_requests',(select count(*) from public.measurement_report_matches m join public.community_reports r on r.id=m.report_id where r.user_id=p_user),
 'missions_completed',(select count(*) from public.community_coverage_missions m join public.community_reports r on r.id=m.fulfilled_report_id where r.user_id=p_user),
 'week_days',(select count(distinct (e.occurred_at at time zone 'Asia/Bangkok')::date) from public.community_xp_events e where e.user_id=p_user and e.kind='report' and e.points>0 and e.policy_version='contribution-v2' and e.occurred_at>=date_trunc('week',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)),
 'month_points',(select coalesce(sum(e.points),0) from public.community_xp_events e where e.user_id=p_user and e.points>0 and e.policy_version='contribution-v2' and e.occurred_at>=date_trunc('month',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)))
$$;

CREATE OR REPLACE FUNCTION public.process_community_xp(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.community_xp_jobs; r jsonb; e jsonb; m jsonb; req public.measurement_requests; c public.community_help_claims;
 t timestamptz; submitted timestamptz; captured timestamptz; day_start timestamptz; last_xp timestamptz;
 v_request bigint; base_reason text; bonus_reason text; base integer; bonus integer; n integer:=0;
 v2 boolean; release public.community_policy_release; version text; week_start timestamptz; mission uuid; previous_rank integer; current_rank integer; before_points bigint;
 gps_lat float8; gps_lon float8; accuracy float8; deadline timestamptz;
begin
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then return jsonb_build_object('processed',0); end if;
 select * into release from public.community_policy_release where singleton;
 -- One short transaction worker lease; per-user caps cannot race across workers.
 if not pg_try_advisory_xact_lock(hashtextextended('community-xp-worker',0)) then return jsonb_build_object('processed',0,'busy',true); end if;
 for j in select * from public.community_xp_jobs where state='pending' and not exists(select 1 from public.community_reports pr where pr.user_id=community_xp_jobs.user_id and pr.status='pending' and pr.created_at<=community_xp_jobs.occurred_at) and not exists(select 1 from public.community_xp_jobs prior where prior.user_id=community_xp_jobs.user_id and prior.state='pending' and (prior.occurred_at,prior.report_id)<(community_xp_jobs.occurred_at,community_xp_jobs.report_id)) and not exists(select 1 from public.measurement_report_jobs mjob where mjob.report_id=community_xp_jobs.report_id and mjob.state='pending') order by occurred_at,report_id limit least(greatest(p_limit,1),100) for update skip locked loop
  if exists(select 1 from public.community_xp_events where report_id=j.report_id and kind='report') then
   update public.community_xp_jobs set state='done',processed_at=now(),report_snapshot='{}',evidence_snapshot='{}' where report_id=j.report_id; continue;
  end if;
  r:=j.report_snapshot; e:=j.evidence_snapshot; m:=coalesce(e->'image_metadata','{}'); t:=j.occurred_at;
  submitted:=(r->>'created_at')::timestamptz; captured:=(r->>'captured_at')::timestamptz;
  v2:=j.policy_version='contribution-v2';
  version:=case when v2 then 'contribution-v2' else 'xp-v1' end;
  if v2 then t:=submitted;end if;
  mission:=null;
  week_start:=date_trunc('week',t at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  day_start:=date_trunc('day',t at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  insert into public.community_xp_accounts(user_id) values(j.user_id) on conflict do nothing;
  perform pg_advisory_xact_lock(hashtextextended('xp:'||j.user_id::text,0));
  base:=0; bonus:=0; base_reason:='granted'; bonus_reason:='no_claim'; v_request:=null;
  select max(occurred_at) into last_xp from public.community_xp_events where user_id=j.user_id and points>0 and (not v2 or kind in ('report','help')) and occurred_at<=t;
  if r->>'status'<>'approved' or (v2 and (r->>'pm25' is null or (r->>'pm25')::float8<0)) then base_reason:='not_approved';
  elsif r->>'duplicate_of_report_id' is not null then base_reason:='duplicate';
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
    and not exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.request_id=q.id and ev.kind='help' and ev.points>0)
    and not exists(select 1 from public.community_xp_events ev where ev.user_id=j.user_id and ev.requester_id=q.user_id and ev.kind='help' and ev.points>0 and ev.occurred_at>=day_start and ev.occurred_at<day_start+interval '1 day')
    and (select count(*) from public.community_xp_events ev where ev.user_id=j.user_id and ev.requester_id=q.user_id and ev.kind='help' and ev.points>0 and ev.occurred_at>t-interval '7 days' and ev.occurred_at<=t)<3
    order by q.created_at,q.id limit 1;
   if found then
    v_request:=req.id;
    gps_lat:=(m->'bonus_gps_at_submission'->>'lat')::float8; gps_lon:=(m->'bonus_gps_at_submission'->>'lon')::float8; accuracy:=(m->'bonus_gps_at_submission'->>'accuracy_m')::float8;
    if base_reason in ('not_approved','duplicate','stale','cooldown') then bonus_reason:=base_reason;
    elsif captured>submitted or submitted-captured>interval '15 minutes' or accuracy is null or accuracy<0 or accuracy>200 or gps_lat is null or gps_lon is null
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
   elsif req.user_id=j.user_id or c.started_at>captured or captured<req.starts_at or captured>submitted or submitted-captured>interval '15 minutes'
    or accuracy is null or accuracy<0 or accuracy>200 or gps_lat is null or gps_lon is null
    or not (coalesce(r->>'capture_source','camera')='camera' or (m->>'exif_captured_at' is not null and m->'exif_gps' is not null))
    or 6371*2*asin(sqrt(least(1.0,power(sin(radians(gps_lat-(r->>'lat')::float8)/2),2)+cos(radians(gps_lat))*cos(radians((r->>'lat')::float8))*power(sin(radians(gps_lon-(r->>'lon')::float8)/2),2))))>.2
    or 6371*2*asin(sqrt(least(1.0,power(sin(radians(req.lat-(r->>'lat')::float8)/2),2)+cos(radians(req.lat))*cos(radians((r->>'lat')::float8))*power(sin(radians(req.lon-(r->>'lon')::float8)/2),2))))>req.radius_km then bonus_reason:='invalid_evidence';
   elsif exists(select 1 from public.community_xp_events where user_id=j.user_id and request_id=v_request and kind='help' and points>0) then bonus_reason:='already_rewarded';
   elsif (select count(*) from public.community_xp_events where user_id=j.user_id and kind='help' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')>=3 then bonus_reason:='help_limit';
   elsif exists(select 1 from public.community_xp_events where user_id=j.user_id and requester_id=req.user_id and kind='help' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')
    or (select count(*) from public.community_xp_events where user_id=j.user_id and requester_id=req.user_id and kind='help' and points>0 and occurred_at>t-interval '7 days' and occurred_at<=t)>=3 then bonus_reason:='pair_limit';
   else bonus:=5; bonus_reason:='granted'; end if;
  end if;
  if v2 and m->'evidence_extraction'->>'pm25_field_verified'='true' and m->'evidence_extraction'->>'unit_verified'='true' and base_reason in ('granted','report_limit') and submitted-captured<=interval '15 minutes'
   and m->'bonus_gps_at_submission'->>'accuracy_m' is not null
   and (m->'bonus_gps_at_submission'->>'accuracy_m')::float8 between 0 and 200
   and m->'bonus_gps_at_submission'->>'lat' is not null and m->'bonus_gps_at_submission'->>'lon' is not null
   and coalesce(r->>'measurement_environment','')='outdoor' and not coalesce((r->>'near_emission_source')::boolean,false)
   and not coalesce((r->>'clock_warning')::boolean,false)
   and (coalesce(r->>'capture_source','')='camera' or (m->>'exif_captured_at' is not null and m->'exif_gps' is not null))
   and private.measurement_distance((m->'bonus_gps_at_submission'->>'lat')::float8,(m->'bonus_gps_at_submission'->>'lon')::float8,(r->>'lat')::float8,(r->>'lon')::float8)<=.2
   then
    select mi.id into mission from public.community_coverage_missions mi where (mi.state='open' or (mi.state='expired' and mi.fulfilled_report_id is null and not (mi.inputs ? 'covered_by_report')))
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
   values(j.user_id,j.report_id,v_request,case when v_request is not null then req.user_id else null end,'help',bonus,bonus_reason,t,version,mission) on conflict do nothing;
  end if;
  if v2 and base>0 then
   insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version,award_key)
   values(j.user_id,j.report_id,'first_day',5,'first_day',t,version,'first:'||j.user_id||':'||(t at time zone 'Asia/Bangkok')::date) on conflict do nothing;
   if (select count(distinct (occurred_at at time zone 'Asia/Bangkok')::date) from public.community_xp_events where user_id=j.user_id and kind='report' and points>0 and policy_version=version and occurred_at>=week_start and occurred_at<week_start+interval '7 days' and occurred_at<=t)>=5 then
    insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version,award_key)
    values(j.user_id,j.report_id,'contribution_week',20,'five_days',t,version,'week:'||j.user_id||':'||(week_start at time zone 'Asia/Bangkok')::date) on conflict do nothing;
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

create function private.community_job_submission_time() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.community_policy_release where singleton and active_version='v2' and (new.report_snapshot->>'created_at')::timestamptz>=launched_at) then
  new.occurred_at:=(new.report_snapshot->>'created_at')::timestamptz;
 end if;return new;
end $$;
create trigger community_job_submission_time before insert on public.community_xp_jobs for each row execute function private.community_job_submission_time();

CREATE OR REPLACE FUNCTION public.community_xp_totals(p_user bigint DEFAULT NULL::bigint)
 RETURNS TABLE(user_id bigint, lifetime_xp bigint, days bigint, reports bigint, helped bigint, today_reports bigint, today_help bigint, xp7 bigint, xp30 bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with live as (select e.* from public.community_xp_events e where (p_user is null or e.user_id=p_user) and e.points>0 and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id))
 select a.user_id,coalesce(sum(l.points),0),count(distinct (l.occurred_at at time zone 'Asia/Bangkok')::date) filter(where l.kind='report'),
 count(*) filter(where l.kind='report'),count(*) filter(where l.kind='help'),
 (select count(*) from public.community_xp_events q where q.user_id=a.user_id and q.points>0 and q.kind='report' and (q.occurred_at at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),
 (select count(*) from public.community_xp_events q where q.user_id=a.user_id and q.points>0 and q.kind='help' and (q.occurred_at at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),
 coalesce(sum(l.points) filter(where l.occurred_at>now()-interval '168 hours'),0),
 coalesce(sum(l.points) filter(where l.occurred_at>now()-interval '720 hours'),0)
 from public.community_xp_accounts a left join live l on l.user_id=a.user_id where p_user is null or a.user_id=p_user group by a.user_id;
$function$
;

revoke all on function public.community_v2_month_board(text,integer,bigint) from public,anon,authenticated;
grant execute on function public.community_v2_month_board(text,integer,bigint) to service_role;

revoke all on function public.community_v2_counters(bigint) from public,anon,authenticated;
grant execute on function public.community_v2_counters(bigint) to service_role;

revoke all on function public.process_community_xp(integer) from public,anon,authenticated;
grant execute on function public.process_community_xp(integer) to service_role;

revoke all on function public.community_xp_totals(bigint) from public,anon,authenticated;
grant execute on function public.community_xp_totals(bigint) to service_role;

revoke all on function private.guard_community_v2_release() from public,anon,authenticated;
grant execute on function private.guard_community_v2_release() to service_role;

revoke all on function private.community_job_submission_time() from public,anon,authenticated;
grant execute on function private.community_job_submission_time() to service_role;

-- Private source identity comes only from independent evaluation ingestion.
alter table public.community_reports add column measurement_source_key text;
create table public.community_device_evaluations (
 id uuid primary key default gen_random_uuid(), user_id bigint not null references public.profiles(id),
 report_id bigint not null references public.community_reports(id), source_key text not null,
 method text not null, reference_instrument text not null, evaluated_at timestamptz not null,
 valid_until timestamptz not null, conditions jsonb not null, provenance text not null,
 evaluation_key text not null unique, check(valid_until>evaluated_at), check(length(btrim(provenance))>0)
);
create index community_device_evaluation_report on public.community_device_evaluations(report_id,valid_until desc);
alter table public.community_device_evaluations enable row level security;
revoke all on public.community_device_evaluations from public,anon,authenticated;
grant all on public.community_device_evaluations to service_role;
alter table public.community_evidence_outcomes add column invalidates_contribution boolean not null default false;
alter table public.community_policy_release add column missions_checked_at timestamptz;
alter table public.community_xp_jobs add column policy_version text not null default 'xp-v1';

create or replace function private.community_job_submission_time() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.community_policy_release where singleton and active_version='v2' and (new.report_snapshot->>'created_at')::timestamptz>=launched_at) then
  new.occurred_at:=(new.report_snapshot->>'created_at')::timestamptz;
  new.policy_version:='contribution-v2';
 end if;return new;
end $$;

create function public.publish_community_missions(p_candidates jsonb) returns integer language plpgsql set search_path='' as $$
declare item jsonb; n integer:=0; changed integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-mission-publish',0));
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then return 0;end if;
 if not exists(select 1 from public.community_policy_release where singleton and active_version='v2' and (missions_checked_at is null or missions_checked_at<=now()-interval '15 minutes')) then return 0;end if;
 update public.community_policy_release set missions_checked_at=now() where singleton;
 update public.community_coverage_missions set state='expired' where state='open' and expires_at<=now();
 for item in select * from jsonb_array_elements(p_candidates) limit 100 loop
  -- The server predeclares candidates. SQL fixes the actual announcement time.
  insert into public.community_coverage_missions(area_key,place_name,lat,lon,starts_at,expires_at,inputs)
  values(item->>'area_key',item->>'place_name',(item->>'lat')::float8,(item->>'lon')::float8,now(),now()+interval '60 minutes',item->'inputs') on conflict do nothing;
  get diagnostics changed=row_count;n:=n+changed;
 end loop;return n;
end $$;

create function private.community_season_rows(p_month text) returns jsonb language sql stable set search_path='' as $$
 with bounds as(select to_date(p_month||'-01','YYYY-MM-DD')::timestamp at time zone 'Asia/Bangkok' start_at,
 (to_date(p_month||'-01','YYYY-MM-DD')+interval '1 month')::timestamp at time zone 'Asia/Bangkok' end_at),
 scored as(select a.user_id,a.member_id,a.alias,t.lifetime_xp,t.days,sum(e.points) xp
 from public.community_xp_accounts a join public.community_xp_totals() t using(user_id)
 join public.community_xp_events e on e.user_id=a.user_id cross join bounds b
 where e.points>0 and e.policy_version='contribution-v2' and e.occurred_at>=b.start_at and e.occurred_at<b.end_at
 and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)
 group by a.user_id,a.member_id,a.alias,t.lifetime_xp,t.days),
 ranked as(select *,rank() over(order by xp desc) rank from scored)
 select coalesce(jsonb_agg(to_jsonb(r) order by xp desc,member_id),'[]') from ranked r
$$;

create or replace function public.community_v2_month_board(p_month text,p_offset integer default 0,p_user bigint default null) returns jsonb language sql stable set search_path='' as $$
 with stored as(select * from public.community_season_results where month=to_date(p_month||'-01','YYYY-MM-DD')),
 data as(select coalesce((select results from stored),private.community_season_rows(p_month)) rows),
 visible_base as(select r from data,jsonb_array_elements(rows) r join public.community_xp_accounts a on a.user_id=(r->>'user_id')::bigint where not a.hidden),
 visible as(select r||jsonb_build_object('rank',rank() over(order by (r->>'xp')::bigint desc)) r from visible_base),
 page as(select r from visible order by (r->>'xp')::bigint desc,(r->>'member_id')::bigint offset greatest(p_offset,0) limit 51)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(r-'user_id') from page),'[]'),
 'me',(select r-'user_id' from visible where (r->>'user_id')::bigint=p_user),
 'provisional',not exists(select 1 from stored),'revision',coalesce((select revision from stored),0),'frozen_at',(select frozen_at from stored))
$$;

create function public.community_v2_month_points(p_month text,p_user bigint) returns bigint language sql stable set search_path='' as $$
 select coalesce((select (r->>'xp')::bigint from jsonb_array_elements(private.community_season_rows(p_month)) r where (r->>'user_id')::bigint=p_user),0)
$$;

create function public.freeze_community_seasons() returns integer language plpgsql set search_path='' as $$
declare m date; payload jsonb; old public.community_season_results; changed boolean; n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-season-freeze',0));
 for m in select distinct date_trunc('month',occurred_at at time zone 'Asia/Bangkok')::date from public.community_xp_events
 where policy_version='contribution-v2' and (date_trunc('month',occurred_at at time zone 'Asia/Bangkok')+interval '1 month 72 hours') at time zone 'Asia/Bangkok'<=now() loop
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

-- Compensation is server-only and requires an independent confirmed invalidation.
-- A concern vote, missing calibration or OCR approval cannot create this outcome.
create function public.reconcile_community_v2() returns integer language plpgsql set search_path='' as $$
declare e public.community_xp_events; d record; selected_report bigint; day_start timestamptz; n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-xp-worker',0));
 for e in select ev.* from public.community_xp_events ev where ev.policy_version='contribution-v2' and ev.points>0 and ev.kind in ('report','help')
 and exists(select 1 from public.community_evidence_outcomes o where o.report_id=ev.report_id and o.outcome='problem' and o.invalidates_contribution)
 and not exists(select 1 from public.community_xp_events rev where rev.reverses=ev.id) order by ev.user_id,ev.id for update loop
  perform public.reverse_community_xp(e.id,'independent-confirmed-invalid-contribution');n:=n+1;
 end loop;
 for e in select ev.* from public.community_xp_events ev where ev.policy_version='contribution-v2' and ev.points>0 and ev.kind in ('first_day','contribution_week')
 and not exists(select 1 from public.community_xp_events rev where rev.reverses=ev.id) order by ev.user_id,ev.id for update loop
  day_start:=date_trunc(case when e.kind='first_day' then 'day' else 'week' end,e.occurred_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  if (select count(distinct (b.occurred_at at time zone 'Asia/Bangkok')::date) from public.community_xp_events b where b.user_id=e.user_id and b.kind='report' and b.points>0 and b.policy_version='contribution-v2'
   and b.occurred_at>=day_start and b.occurred_at<day_start+case when e.kind='first_day' then interval '1 day' else interval '7 days' end
   and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id)) < (case when e.kind='first_day' then 1 else 5 end) then
   perform public.reverse_community_xp(e.id,'dependent-contribution-bonus-no-longer-earned');n:=n+1;
  end if;
 end loop;
 for d in select user_id, date_trunc('day',occurred_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' day_start
 from public.community_xp_events b where b.kind='report' and b.points>0 and b.policy_version='contribution-v2'
 and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id) group by user_id,day_start loop
  if not exists(select 1 from public.community_xp_events b where b.user_id=d.user_id and b.kind='first_day' and b.points>0 and b.occurred_at>=d.day_start and b.occurred_at<d.day_start+interval '1 day' and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id)) then
   select report_id into selected_report from public.community_xp_events b where b.user_id=d.user_id and b.kind='report' and b.points>0 and b.policy_version='contribution-v2' and b.occurred_at>=d.day_start and b.occurred_at<d.day_start+interval '1 day' and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id) order by occurred_at,id limit 1;
   insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version,award_key)
   select d.user_id,selected_report,'first_day',5,'first_day',b.occurred_at,'contribution-v2','first-reconciled:'||d.user_id||':'||selected_report from public.community_xp_events b where b.report_id=selected_report and b.kind='report' on conflict do nothing;
  end if;
 end loop;
 -- Qualifying replacements may restore a previously compensated day/week, once.
 for d in select user_id, date_trunc('week',occurred_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' week_start
 from public.community_xp_events b where b.kind='report' and b.points>0 and b.policy_version='contribution-v2'
 and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id) group by user_id,week_start having count(distinct (occurred_at at time zone 'Asia/Bangkok')::date)>=5 loop
  if not exists(select 1 from public.community_xp_events b where b.user_id=d.user_id and b.kind='contribution_week' and b.points>0 and b.occurred_at>=d.week_start and b.occurred_at<d.week_start+interval '7 days' and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id)) then
   select report_id into selected_report from public.community_xp_events b where b.user_id=d.user_id and b.kind='report' and b.points>0 and b.policy_version='contribution-v2' and b.occurred_at>=d.week_start and b.occurred_at<d.week_start+interval '7 days' and not exists(select 1 from public.community_xp_events rev where rev.reverses=b.id) order by occurred_at desc,id desc limit 1;
   insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at,policy_version,award_key)
   select d.user_id,selected_report,'contribution_week',20,'five_days',b.occurred_at,'contribution-v2','week-reconciled:'||d.user_id||':'||selected_report from public.community_xp_events b where b.report_id=selected_report and b.kind='report' on conflict do nothing;
  end if;
 end loop;
 return n;
end $$;

do $$ declare signature text; begin
 foreach signature in array array['public.publish_community_missions(jsonb)','private.community_season_rows(text)','public.community_v2_month_points(text,bigint)','public.freeze_community_seasons()','public.reconcile_community_v2()'] loop
 execute 'revoke all on function '||signature||' from public,anon,authenticated';
 execute 'grant execute on function '||signature||' to service_role';
 end loop;
end $$;

alter table public.community_reports add column device_evaluation_valid_until timestamptz;
create function public.ingest_community_evaluation(p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare v_user bigint; v_report bigint; existing public.community_evidence_outcomes;
begin
 v_user:=private.identifier_number('profiles',p_payload->>'user_id');
 v_report:=private.identifier_number('community_reports',p_payload->>'report_id');
 if not exists(select 1 from public.community_reports where id=v_report and user_id=v_user) then raise exception 'evaluation_subject_mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended('evaluation:'||(p_payload->>'evaluation_key'),0));
 select * into existing from public.community_evidence_outcomes where evaluation_key=p_payload->>'evaluation_key';
 if found then
  if existing.artifact_input is distinct from p_payload then raise exception 'evaluation_key_conflict';end if;
  if existing.user_id<>v_user or existing.report_id<>v_report or existing.outcome<>p_payload->>'outcome' or existing.scope<>p_payload->>'scope' or existing.provenance<>p_payload->>'provenance' then raise exception 'evaluation_key_conflict';end if;
  return jsonb_build_object('recorded',true,'replayed',true);
 end if;
 if coalesce((p_payload->>'invalidates_contribution')::boolean,false) and p_payload->>'outcome'<>'problem' then raise exception 'invalid_invalidation';end if;
 if p_payload->>'source_key' is not null and (p_payload->>'outcome'<>'pass' or p_payload->>'scope' not in ('field_protocol','instrument')) then raise exception 'invalid_source_evaluation';end if;
 insert into public.community_evidence_outcomes(user_id,report_id,scope,outcome,evaluation_key,provenance,policy_version,evaluated_at,invalidates_contribution,artifact_input)
 values(v_user,v_report,p_payload->>'scope',p_payload->>'outcome',p_payload->>'evaluation_key',p_payload->>'provenance','evidence-v2',(p_payload->>'evaluated_at')::timestamptz,coalesce((p_payload->>'invalidates_contribution')::boolean,false),p_payload);
 if p_payload->>'source_key' is not null then update public.community_reports set measurement_source_key=p_payload->>'source_key' where id=v_report;end if;
 if p_payload->'instrument' is not null and p_payload->'instrument'<>'null'::jsonb then
  if p_payload->>'scope'<>'instrument' or p_payload->>'outcome'<>'pass' or p_payload->>'source_key' is null then raise exception 'invalid_instrument_evaluation';end if;
  insert into public.community_device_evaluations(user_id,report_id,source_key,method,reference_instrument,evaluated_at,valid_until,conditions,provenance,evaluation_key)
  values(v_user,v_report,p_payload->>'source_key',p_payload->'instrument'->>'method',p_payload->'instrument'->>'reference_instrument',(p_payload->>'evaluated_at')::timestamptz,(p_payload->'instrument'->>'valid_until')::timestamptz,p_payload->'instrument'->'conditions',p_payload->>'provenance',p_payload->>'evaluation_key');
  update public.community_reports set device_evaluation_valid_until=(p_payload->'instrument'->>'valid_until')::timestamptz,
   evidence_v2=case when evidence_v2 is null then null else evidence_v2||jsonb_build_object('device_status','evaluation_available','device_evaluated_at',p_payload->>'evaluated_at','device_valid_until',p_payload->'instrument'->>'valid_until','device_method',p_payload->'instrument'->>'method') end where id=v_report;
 end if;
 return jsonb_build_object('recorded',true,'replayed',false);
end $$;
revoke all on function public.ingest_community_evaluation(jsonb) from public,anon,authenticated;
grant execute on function public.ingest_community_evaluation(jsonb) to service_role;

-- Unknown context is retained as unknown, never inferred from a legacy default.
do $$ declare constraint_row record; begin
 for constraint_row in select conname from pg_constraint where conrelid='public.community_reports'::regclass and contype='c' and (pg_get_constraintdef(oid) like '%measurement_environment%' or pg_get_constraintdef(oid) like '%averaging_period%') loop
 execute format('alter table public.community_reports drop constraint %I',constraint_row.conname);end loop;
end $$;
alter table public.community_reports add constraint community_v2_environment check(measurement_environment in ('outdoor','indoor','unknown'));
alter table public.community_reports add constraint community_v2_averaging check(averaging_period in ('instant','1_minute','5_minutes','unknown'));

-- Policy/job ownership is serialized at the submission boundary. Rollback keeps
-- previously accepted v2 jobs v2; it never grants the same report twice.
create or replace function private.community_job_submission_time() returns trigger language plpgsql set search_path='' as $$
declare current_policy public.community_policy_release;
begin
 select * into current_policy from public.community_policy_release where singleton for share;
 if current_policy.active_version='v2' and (new.report_snapshot->>'created_at')::timestamptz>=current_policy.launched_at then
  new.occurred_at:=(new.report_snapshot->>'created_at')::timestamptz;
  new.policy_version:='contribution-v2';
 end if;return new;
end $$;

create function public.set_community_v2_release(p_active boolean,p_threshold double precision default null,p_validation_ref text default null) returns jsonb language plpgsql set search_path='' as $$
declare target public.community_policy_release;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-xp-worker',0));
 select * into target from public.community_policy_release where singleton for update;
 if p_active then
  if p_threshold is null or p_threshold<0 or p_threshold>100 or coalesce(length(btrim(p_validation_ref)),0)=0 then raise exception 'independent_evaluation_required';end if;
  update public.community_policy_release set active_version='v2',launched_at=coalesce(launched_at,clock_timestamp()),evidence_threshold=p_threshold,evidence_validation_ref=p_validation_ref where singleton;
 else
  update public.community_policy_release set active_version='v1' where singleton;
 end if;
 return (select to_jsonb(r) from public.community_policy_release r where singleton);
end $$;
revoke all on function public.set_community_v2_release(boolean,double precision,text) from public,anon,authenticated;
grant execute on function public.set_community_v2_release(boolean,double precision,text) to service_role;

create index community_v2_event_month on public.community_xp_events(occurred_at,user_id)
 where policy_version='contribution-v2' and points>0;
create index community_confirmed_invalidation on public.community_evidence_outcomes(report_id)
 where invalidates_contribution and outcome='problem';
alter table public.community_reports add column current_evidence_issues text[] not null default '{}';
create function private.apply_independent_evidence_finding() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.community_evidence_outcomes o where o.report_id=new.report_id and o.scope=new.scope and o.evaluated_at>new.evaluated_at) then return new;end if;
 if exists(select 1 from public.community_evidence_outcomes o where o.report_id=new.report_id and o.scope=new.scope and o.evaluated_at=new.evaluated_at and o.id<>new.id and o.outcome<>new.outcome) then raise exception 'conflicting_evaluation_time';end if;
 if new.report_id is not null and new.outcome='problem' then
  update public.community_reports set current_evidence_issues=array(select distinct issue from unnest(current_evidence_issues||array['independent_'||new.scope||'_problem']) issue) where id=new.report_id;
 elsif new.report_id is not null and new.outcome='pass' then
  update public.community_reports set current_evidence_issues=array_remove(current_evidence_issues,'independent_'||new.scope||'_problem') where id=new.report_id;
 end if;
 return new;
end $$;
create trigger independent_evidence_finding after insert on public.community_evidence_outcomes for each row execute function private.apply_independent_evidence_finding();
revoke all on function private.apply_independent_evidence_finding() from public,anon,authenticated;
grant execute on function private.apply_independent_evidence_finding() to service_role;

create or replace function public.community_v2_counters(p_user bigint) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
 'month_rank',(public.community_v2_month_board(to_char(now() at time zone 'Asia/Bangkok','YYYY-MM'),0,p_user)->'me'->'rank'),
 'fulfilled_requests',(select count(*) from public.measurement_report_matches m join public.community_reports r on r.id=m.report_id where r.user_id=p_user),
 'missions_completed',(select count(*) from public.community_coverage_missions m join public.community_reports r on r.id=m.fulfilled_report_id where r.user_id=p_user),
 'week_days',(select count(distinct (e.occurred_at at time zone 'Asia/Bangkok')::date) from public.community_xp_events e where e.user_id=p_user and e.kind='report' and e.points>0 and e.policy_version='contribution-v2' and e.occurred_at>=date_trunc('week',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)),
 'month_points',(select coalesce(sum(e.points),0) from public.community_xp_events e where e.user_id=p_user and e.points>0 and e.policy_version='contribution-v2' and e.occurred_at>=date_trunc('month',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id)))
$$;

-- Legacy counters remain compatible; legacy reputation no longer grows or drops
-- from OCR decisions while v2 is active. Independent history is a separate source.
create or replace function public.apply_reputation_event(p_user_id bigint,p_points integer,p_reason text,p_report_id bigint,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.profiles; effective_points integer;
begin
 effective_points:=case when exists(select 1 from public.community_policy_release where singleton and active_version='v2') then 0 else p_points end;
 insert into public.reputation_events(user_id,report_id,points,reason,idempotency_key) values(p_user_id,p_report_id,effective_points,p_reason,p_idempotency_key) on conflict(idempotency_key) do nothing;
 if not found then select * into result from public.profiles where id=p_user_id;return to_jsonb(result);end if;
 update public.profiles set reputation_score=greatest(0,reputation_score+effective_points),approved_reports=approved_reports+case when p_reason='report_approved' then 1 else 0 end,
 helpful_reviews=helpful_reviews+case when p_reason='helpful_review' then 1 else 0 end,updated_at=now() where id=p_user_id returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.apply_reputation_event(bigint,integer,text,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_reputation_event(bigint,integer,text,bigint,text) to service_role;

alter table public.community_evidence_outcomes add column artifact_input jsonb not null default '{}';
