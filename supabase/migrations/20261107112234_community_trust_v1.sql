-- Additive, dormant policy. No old reaction backfill, XP reset or public activation.
alter table public.report_reactions add column if not exists reason_code text, add column if not exists geofence_policy text;
create schema if not exists community_trust_private;
revoke all on schema community_trust_private from public, anon, authenticated;
grant usage on schema community_trust_private to service_role;
create table community_trust_private.control (
 singleton boolean primary key default true check(singleton),
 policy_version text not null default 'community-trust-v1' check(policy_version='community-trust-v1'),
 collecting_enabled boolean not null default false,
 public_enabled boolean not null default false,
 notice_ref text, review_owner text, review_channel text, retention_days integer check(retention_days is null or retention_days>=90),
 retention_ref text, experiment_ref text, privacy_ref text, concurrency_ref text,
 check(not collecting_enabled or coalesce(length(notice_ref)>10,false)),
 check(not public_enabled or coalesce((collecting_enabled and length(review_owner)>2 and length(review_channel)>5 and retention_days>=90 and length(retention_ref)>10 and length(experiment_ref)>10 and length(privacy_ref)>10 and length(concurrency_ref)>10),false))
);
insert into community_trust_private.control(singleton) values(true);
create table community_trust_private.reactions (
 voter_id bigint not null references public.profiles(id), report_id bigint not null references public.community_reports(id),
 reporter_id bigint not null references public.profiles(id), vote_day date not null,
 reaction text check(reaction in ('like','dislike')), reason_code text, active boolean not null,
 first_accepted_at timestamptz not null, updated_at timestamptz not null,
 primary key(voter_id,report_id)
);
create table community_trust_private.pair_days (
 voter_id bigint not null references public.profiles(id), reporter_id bigint not null references public.profiles(id),
 vote_day date not null, admitted boolean not null, first_accepted_at timestamptz not null,
 primary key(voter_id,reporter_id,vote_day)
);
create table community_trust_private.events (
 seq bigint generated always as identity primary key, request_key uuid not null,
 voter_id bigint references public.profiles(id), reporter_id bigint not null references public.profiles(id), report_id bigint references public.community_reports(id),
 vote_day date, action text not null check(action in ('set','withdraw','hold','finding')),
 reaction text check(reaction in ('like','dislike')), reason_code text, eligible boolean not null default false,
 exclusion_reason text, payload jsonb not null default '{}', created_at timestamptz not null default now(),
 policy_version text not null default 'community-trust-v1' check(policy_version='community-trust-v1'),
 unique(voter_id,request_key)
);
create unique index community_trust_finding_key on community_trust_private.events(reporter_id,request_key) where action='finding';
create index community_trust_events_retention on community_trust_private.events(created_at);
create index community_trust_events_subject on community_trust_private.events(reporter_id,seq);
create index community_trust_events_wave on community_trust_private.events(reporter_id,created_at) where eligible;
create table community_trust_private.daily_slots (
 voter_id bigint not null, reporter_id bigint not null, vote_day date not null,
 event_seq bigint references community_trust_private.events(seq), report_id bigint,
 primary key(voter_id,reporter_id,vote_day)
);
create table community_trust_private.holds (
 id bigint generated always as identity primary key, reporter_id bigint not null,
 started_at timestamptz not null, expires_at timestamptz not null,
 check(expires_at=started_at+interval '30 minutes')
);
create table community_trust_private.daily_aggregates (
 reporter_id bigint not null, vote_day date not null, positive integer not null, negative integer not null,
 value double precision not null, weight integer not null check(weight between 1 and 3),
 primary key(reporter_id,vote_day)
);
create table community_trust_private.projections (
 reporter_id bigint primary key references public.profiles(id), ledger_seq bigint not null,
 payload jsonb not null, calculated_at timestamptz not null
);
create table community_trust_private.review_requests (
 id uuid primary key default gen_random_uuid(), reporter_id bigint not null references public.profiles(id),
 report_id bigint references public.community_reports(id), from_day date, to_day date,
 message text not null check(length(btrim(message)) between 10 and 1000), created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','reviewed'))
);
create index community_trust_review_queue_idx on community_trust_private.review_requests(created_at) where status='pending';
create unique index community_trust_review_pending on community_trust_private.review_requests(reporter_id,coalesce(report_id,0),coalesce(from_day,date '0001-01-01'),coalesce(to_day,date '0001-01-01')) where status='pending';
-- No browser or Admin JWT can access these tables. Writes only through service RPCs.
do $$ declare t text; begin
 foreach t in array array['control','reactions','pair_days','events','daily_slots','holds','daily_aggregates','projections','review_requests'] loop
  execute format('alter table community_trust_private.%I enable row level security',t);
  execute format('revoke all on community_trust_private.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on community_trust_private.%I to service_role',t);
 end loop;
end $$;

create function public.community_trust_control() returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(c) from community_trust_private.control c where singleton
$$;

create function public.community_trust_react(p_user bigint,p_report bigint,p_key uuid,p_action text,p_payload jsonb) returns jsonb
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
   fix_age:=extract(epoch from v_now-(fix->>'observed_at')::timestamptz);
   if latitude is null or longitude is null or accuracy is null or fix_age is null or latitude not between -90 and 90 or longitude not between -180 and 180 or accuracy<0 or accuracy='NaN'::float8 or accuracy='Infinity'::float8 then reason:=coalesce(reason,'gps_invalid');
   elsif fix_age<0 or fix_age>120 then reason:=coalesce(reason,'gps_expired');
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

create function public.community_trust_snapshot(p_user bigint,p_after bigint default 0,p_limit integer default 5000,p_watermark bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; head bigint; watermark bigint; records jsonb; last_seq bigint; batch_count integer; batch_limit integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-trust:'||p_user,0));
 select coalesce(max(seq),0) into head from community_trust_private.events where reporter_id=p_user;
 watermark:=least(head,coalesce(p_watermark,head));batch_limit:=least(5000,greatest(0,p_limit));
 select coalesce(jsonb_agg(to_jsonb(e) order by seq),'[]'::jsonb),max(seq),count(*) into records,last_seq,batch_count from (select * from community_trust_private.events where reporter_id=p_user and seq>p_after and seq<=watermark order by seq limit batch_limit) e;
 result:=jsonb_build_object('ledger_seq',watermark,'events',records,'next_seq',case when batch_limit=0 and watermark>0 then 0 when batch_count=batch_limit and batch_limit>0 then last_seq else null end);
 return result||jsonb_build_object('projection',(select payload from community_trust_private.projections where reporter_id=p_user),'contribution_days_30',(select count(distinct (created_at at time zone 'Asia/Bangkok')::date) from public.community_reports r where r.user_id=p_user and r.status='approved' and not exists(select 1 from public.community_reports d where d.image_sha256=r.image_sha256 and d.status='approved' and (d.created_at,d.id)<(r.created_at,r.id)) and (created_at at time zone 'Asia/Bangkok')::date between (now() at time zone 'Asia/Bangkok')::date-29 and (now() at time zone 'Asia/Bangkok')::date));
end $$;
create function public.community_trust_store_projection(p_user bigint,p_seq bigint,p_payload jsonb,p_slots jsonb default '[]'::jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('community-trust:'||p_user,0));
 if p_seq<>(select coalesce(max(seq),0) from community_trust_private.events where reporter_id=p_user) then return false;end if;
 insert into community_trust_private.projections values(p_user,p_seq,p_payload,now()) on conflict(reporter_id) do update set ledger_seq=p_seq,payload=p_payload,calculated_at=now();
 delete from community_trust_private.daily_slots where reporter_id=p_user;
 insert into community_trust_private.daily_slots select (s->>'voter_id')::bigint,p_user,(s->>'vote_day')::date,(s->>'event_seq')::bigint,(s->>'report_id')::bigint from jsonb_array_elements(p_slots) s;
 delete from community_trust_private.daily_aggregates where reporter_id=p_user;
 insert into community_trust_private.daily_aggregates select p_user,(d->>'day')::date,(d->>'positive')::int,(d->>'negative')::int,(d->>'value')::float8,(d->>'weight')::int from jsonb_array_elements(p_payload->'daily') d;
 return true;
end $$;
-- Review intake is not a score editing API.
create function public.community_trust_request_review(p_user bigint,p_report bigint,p_from date,p_to date,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not exists(select 1 from community_trust_private.control where singleton and length(review_owner)>2 and length(review_channel)>5) then raise exception 'review_not_operational';end if;
 if p_report is not null and not exists(select 1 from public.community_reports where id=p_report and user_id=p_user) then raise exception 'review_subject_mismatch';end if;
 if p_report is null and (p_from is null or p_to is null or p_from>p_to) then raise exception 'review_scope_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-trust:'||p_user,0));
 select id into result from community_trust_private.review_requests where reporter_id=p_user and report_id is not distinct from p_report and from_day is not distinct from p_from and to_day is not distinct from p_to and status='pending';
 if not found then insert into community_trust_private.review_requests(reporter_id,report_id,from_day,to_day,message) values(p_user,p_report,p_from,p_to,p_message) returning id into result;end if;
 return result;
end $$;
-- Server operations only; no Admin/Moderator route is granted this capability.
create function public.community_trust_record_finding(p_user bigint,p_key uuid,p_payload jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare result bigint; target bigint;
begin
 if jsonb_typeof(p_payload->'target_sequences') is distinct from 'array' or (jsonb_array_length(p_payload->'target_sequences')>1000 or (jsonb_array_length(p_payload->'target_sequences')=0 and not (p_payload->>'outcome'='unresolved' and p_payload ? 'review_id'))) then raise exception 'finding_targets_required';end if;
 if p_payload ? 'review_id' and not exists(select 1 from community_trust_private.review_requests where id=(p_payload->>'review_id')::uuid and reporter_id=p_user) then raise exception 'review_subject_mismatch';end if;
 if coalesce(p_payload->>'outcome','') not in ('valid','invalid','unresolved') or length(coalesce(p_payload->>'evidence_ref',''))<10 or length(coalesce(p_payload->>'operator_ref',''))<3 or length(coalesce(p_payload->>'reason',''))<10 then raise exception 'finding_evidence_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-trust:'||p_user,0));
 for target in select value::bigint from jsonb_array_elements_text(p_payload->'target_sequences') loop
  if not exists(select 1 from community_trust_private.events where seq=target and reporter_id=p_user and action in ('set','withdraw')) then raise exception 'finding_subject_mismatch';end if;
 end loop;
 select seq into result from community_trust_private.events where reporter_id=p_user and request_key=p_key and action='finding';
 if found then
  if (select payload from community_trust_private.events where seq=result) is distinct from p_payload then raise exception 'finding_key_conflict';end if;
  return result;
 end if;
 insert into community_trust_private.events(request_key,reporter_id,action,payload) values(p_key,p_user,'finding',p_payload) returning seq into result;
 if p_payload ? 'review_id' then update community_trust_private.review_requests set status='reviewed' where id=(p_payload->>'review_id')::uuid and reporter_id=p_user;end if;
 return result;
end $$;

do $$ declare f regprocedure; begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname like 'community_trust_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;

create function public.community_trust_viewer_state(p_user bigint,p_report bigint) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce((select e.payload->'result' || jsonb_build_object(
  'trust_eligible',e.eligible and coalesce(finding.outcome<>'invalid',true) and exists(select 1 from community_trust_private.daily_slots s where s.event_seq=e.seq),
  'trust_projection_status',case when exists(select 1 from community_trust_private.projections p where p.reporter_id=e.reporter_id and p.ledger_seq=(select max(seq) from community_trust_private.events where reporter_id=e.reporter_id) and p.payload->>'window_end'=(now() at time zone 'Asia/Bangkok')::date::text and p.payload->>'status' in ('available','insufficient')) then 'updated' else 'updating' end,
  'trust_exclusion_reason',case when finding.outcome='invalid' then 'vote_invalidated_by_review' when e.eligible and not exists(select 1 from community_trust_private.daily_slots s where s.event_seq=e.seq) then 'superseded_daily_vote' else e.exclusion_reason end,
  'trust_hold_until',(select case when (h.payload->>'until')::timestamptz>now() then h.payload->>'until' else null end from community_trust_private.events h where h.reporter_id=e.reporter_id and h.action='hold' and h.payload->'target_sequences' @> jsonb_build_array(e.seq) order by h.seq limit 1))
 from community_trust_private.events e left join lateral (select f.payload->>'outcome' as outcome from community_trust_private.events f where f.reporter_id=e.reporter_id and f.action='finding' and f.payload->>'outcome' in ('valid','invalid') and f.payload->'target_sequences' @> jsonb_build_array(e.seq) order by f.seq desc limit 1) finding on true where e.voter_id=p_user and e.report_id=p_report and e.action in ('set','withdraw') and coalesce((e.payload->>'accepted')::boolean,true) order by seq desc limit 1),'{}'::jsonb)
$$;
revoke all on function public.community_trust_viewer_state(bigint,bigint) from public,anon,authenticated;
grant execute on function public.community_trust_viewer_state(bigint,bigint) to service_role;

create function public.community_trust_subjects(p_after bigint default 0,p_limit integer default 100) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(reporter_id),'[]'::jsonb) from (select reporter_id from (select reporter_id from community_trust_private.events union select reporter_id from community_trust_private.projections) subjects where reporter_id>p_after order by reporter_id limit least(100,greatest(1,p_limit))) s
$$;
revoke all on function public.community_trust_subjects(bigint,integer) from public,anon,authenticated;
grant execute on function public.community_trust_subjects(bigint,integer) to service_role;

create table community_trust_private.control_events (
 id bigint generated always as identity primary key, created_at timestamptz not null default now(),
 operation text not null, operator_ref text not null, payload jsonb not null
);
alter table community_trust_private.control_events enable row level security;
revoke all on community_trust_private.control_events from public,anon,authenticated,service_role;
grant select on community_trust_private.control_events to service_role;
alter table community_trust_private.control add column retention_last_ran_at timestamptz;
create function public.community_trust_release(p_stage text,p_refs jsonb,p_operator text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_stage not in ('off','shadow','public') or length(coalesce(p_operator,''))<3 then raise exception 'release_fields_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-trust-release',0));
 update community_trust_private.control set
 collecting_enabled=p_stage<>'off', public_enabled=p_stage='public',
 notice_ref=coalesce(p_refs->>'notice_ref',notice_ref),review_owner=coalesce(p_refs->>'review_owner',review_owner),review_channel=coalesce(p_refs->>'review_channel',review_channel),
 retention_days=coalesce((p_refs->>'retention_days')::int,retention_days),retention_ref=coalesce(p_refs->>'retention_ref',retention_ref),
 experiment_ref=coalesce(p_refs->>'experiment_ref',experiment_ref),privacy_ref=coalesce(p_refs->>'privacy_ref',privacy_ref),concurrency_ref=coalesce(p_refs->>'concurrency_ref',concurrency_ref)
 where singleton returning to_jsonb(control.*) into result;
 insert into community_trust_private.control_events(operation,operator_ref,payload) values('release:'||p_stage,p_operator,result);
 return result;
end $$;
revoke all on function public.community_trust_release(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.community_trust_release(text,jsonb,text) to service_role;

create function public.community_trust_retention() returns jsonb
language plpgsql security definer set search_path='' as $$
declare days integer; cutoff timestamptz; n integer; counts jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-trust-release',0));
 select retention_days into days from community_trust_private.control where singleton and retention_days>=90 and length(retention_ref)>10 and (retention_last_ran_at is null or retention_last_ran_at<now()-interval '1 day');
 if days is null then return jsonb_build_object('skipped',true);end if;
 cutoff:=now()-make_interval(days=>days);
 -- Preserve original event dates until the entire reaction is outside retention.
 delete from community_trust_private.daily_slots where vote_day<(cutoff at time zone 'Asia/Bangkok')::date or event_seq in(select seq from community_trust_private.events where created_at<cutoff);
 delete from community_trust_private.events where created_at<cutoff;
 get diagnostics n=row_count;counts:=jsonb_build_object('events',n);
 delete from public.report_reactions r using community_trust_private.reactions c where r.report_id=c.report_id and r.user_id=c.voter_id and r.geofence_policy='community-trust-v1' and c.first_accepted_at<cutoff;
 delete from community_trust_private.reactions where first_accepted_at<cutoff;
 delete from community_trust_private.pair_days where vote_day<(cutoff at time zone 'Asia/Bangkok')::date;
 delete from community_trust_private.holds where expires_at<cutoff;
 delete from community_trust_private.review_requests where created_at<cutoff and status='reviewed';
 delete from community_trust_private.control_events where created_at<cutoff;
 update community_trust_private.control set retention_last_ran_at=now() where singleton;
 insert into community_trust_private.control_events(operation,operator_ref,payload) values('retention','scheduled-server-job',counts||jsonb_build_object('retention_days',days));
 return counts;
end $$;
revoke all on function public.community_trust_retention() from public,anon,authenticated;
grant execute on function public.community_trust_retention() to service_role;

create function public.community_trust_review_queue(p_limit integer default 50) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select id,reporter_id,report_id,from_day,to_day,message,status,created_at from community_trust_private.review_requests where status='pending' order by created_at limit least(100,greatest(1,p_limit))) r
$$;
revoke all on function public.community_trust_review_queue(integer) from public,anon,authenticated;
grant execute on function public.community_trust_review_queue(integer) to service_role;

create function public.community_trust_owner_reviews(p_user bigint) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'created_at',r.created_at,'reason',(select e.payload->>'reason' from community_trust_private.events e where e.action='finding' and e.reporter_id=p_user and e.payload->>'review_id'=r.id::text order by seq desc limit 1))),'[]'::jsonb)
 from (select * from community_trust_private.review_requests where reporter_id=p_user order by created_at desc limit 50) r
$$;
revoke all on function public.community_trust_owner_reviews(bigint) from public,anon,authenticated;
grant execute on function public.community_trust_owner_reviews(bigint) to service_role;

-- Retention survives a UI/collection rollback. No-op until a reviewed retention policy exists.
do $$ begin
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.schedule('clearpath-community-trust-retention','15 17 * * *','select public.community_trust_retention()');
 end if;
end $$;

alter table community_trust_private.control add column reconcile_cursor bigint not null default 0;
create function public.community_trust_cursor(p_after bigint default null,p_expected bigint default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 if p_after is not null then
  perform pg_advisory_xact_lock(hashtextextended('community-trust-cursor',0));
  update community_trust_private.control set reconcile_cursor=p_after where singleton and reconcile_cursor=p_expected;
 end if;
 select reconcile_cursor into result from community_trust_private.control where singleton;
 return result;
end $$;
revoke all on function public.community_trust_cursor(bigint,bigint) from public,anon,authenticated;
grant execute on function public.community_trust_cursor(bigint,bigint) to service_role;

notify pgrst, 'reload schema';
