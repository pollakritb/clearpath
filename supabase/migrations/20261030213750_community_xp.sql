-- Participation XP. No backfill, no reset, no changes to Trust/reputation.
create table public.community_xp_accounts (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 member_id uuid not null unique default gen_random_uuid(),
 alias text not null default ('สมาชิก CP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)))
 check (char_length(alias) between 3 and 40),
 hidden boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.community_xp_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 report_id uuid, request_id uuid, requester_id uuid,
 kind text not null check(kind in ('report','help','reversal')),
 points integer not null check ((kind='report' and points in (0,10)) or (kind='help' and points in (0,5)) or (kind='reversal' and points<0)),
 reason text not null, occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
 policy_version text not null default 'xp-v1', reverses uuid unique references public.community_xp_events(id),
 unique(report_id,kind)
);
create unique index community_xp_help_once on public.community_xp_events(user_id,request_id) where kind='help' and points>0;
create index community_xp_user_time on public.community_xp_events(user_id,occurred_at desc);
create index community_xp_pair_time on public.community_xp_events(user_id,requester_id,occurred_at desc) where kind='help' and points>0;
create table public.community_help_claims (
 request_id uuid not null references public.measurement_requests(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 started_at timestamptz not null default now(), primary key(request_id,user_id)
);
create table public.community_xp_jobs (
 report_id uuid primary key references public.community_reports(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 occurred_at timestamptz not null, report_snapshot jsonb not null, evidence_snapshot jsonb not null,
 state text not null default 'pending' check(state in ('pending','done')),
 processed_at timestamptz
);
create index community_xp_jobs_pending on public.community_xp_jobs(occurred_at) where state='pending';
create table public.community_xp_control (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 maintenance boolean not null default false, reset_version uuid not null default gen_random_uuid()
);
insert into public.community_xp_control(singleton) values(true);
-- Service-only access: all client reads go through the backend's filtered models.
alter table public.community_xp_accounts enable row level security;
alter table public.community_xp_events enable row level security;
alter table public.community_help_claims enable row level security;
alter table public.community_xp_jobs enable row level security;
alter table public.community_xp_control enable row level security;
revoke all on public.community_xp_accounts,public.community_xp_events,public.community_help_claims,public.community_xp_jobs,public.community_xp_control from public,anon,authenticated;
grant all on public.community_xp_accounts,public.community_xp_events,public.community_help_claims,public.community_xp_jobs,public.community_xp_control to service_role;

create function public.enqueue_community_xp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status in ('approved','rejected') and old.status='pending'
 and exists(select 1 from public.community_xp_control where enabled and not maintenance) then
  insert into public.community_xp_jobs(report_id,user_id,occurred_at,report_snapshot,evidence_snapshot)
  values(new.id,new.user_id,coalesce(new.moderated_at,now()),to_jsonb(new),
   coalesce((select to_jsonb(e) from public.report_evidence e where e.report_id=new.id),'{}'))
  on conflict do nothing;
 end if;
 return new;
end $$;
create trigger community_xp_on_decision after update of status on public.community_reports
 for each row execute function public.enqueue_community_xp();

create function public.claim_community_help(p_user uuid,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.measurement_requests; c public.community_help_claims;
begin
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then raise exception 'xp_disabled'; end if;
 select * into r from public.measurement_requests where id=p_request for update;
 if not found or r.user_id=p_user or not exists(select 1 from public.measurement_request_recipients where request_id=p_request and user_id=p_user and not declined) then raise exception 'not_invited'; end if;
 select * into c from public.community_help_claims where request_id=p_request and user_id=p_user;
 if c.user_id is null then
  if r.status<>'active' or r.starts_at>now() or r.expires_at<=now() then raise exception 'request_closed'; end if;
  insert into public.community_help_claims(request_id,user_id) values(p_request,p_user) returning * into c;
 end if;
 if r.status in ('cancelled','expired') or r.expires_at<=now() then raise exception 'request_closed'; end if;
 if r.status='fulfilled' and r.updated_at+interval '15 minutes'<=now() then raise exception 'request_closed'; end if;
 return jsonb_build_object('request_id',p_request,'started_at',c.started_at,'deadline',
 case when r.status='fulfilled' then least(r.expires_at,r.updated_at+interval '15 minutes') else r.expires_at end,'potential_xp',5);
end $$;

create function public.process_community_xp(p_limit integer default 50) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.community_xp_jobs; r jsonb; e jsonb; m jsonb; req public.measurement_requests; c public.community_help_claims;
 t timestamptz; submitted timestamptz; captured timestamptz; day_start timestamptz; last_xp timestamptz;
 v_request uuid; base_reason text; bonus_reason text; base integer; bonus integer; n integer:=0;
 gps_lat float8; gps_lon float8; accuracy float8; deadline timestamptz;
begin
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then return jsonb_build_object('processed',0); end if;
 -- One short transaction worker lease; per-user caps cannot race across workers.
 if not pg_try_advisory_xact_lock(hashtextextended('community-xp-worker',0)) then return jsonb_build_object('processed',0,'busy',true); end if;
 for j in select * from public.community_xp_jobs where state='pending' order by occurred_at,report_id limit least(greatest(p_limit,1),100) for update skip locked loop
  r:=j.report_snapshot; e:=j.evidence_snapshot; m:=coalesce(e->'image_metadata','{}'); t:=j.occurred_at;
  submitted:=(r->>'created_at')::timestamptz; captured:=(r->>'captured_at')::timestamptz;
  day_start:=date_trunc('day',t at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  insert into public.community_xp_accounts(user_id) values(j.user_id) on conflict do nothing;
  perform pg_advisory_xact_lock(hashtextextended('xp:'||j.user_id::text,0));
  base:=0; bonus:=0; base_reason:='granted'; bonus_reason:='no_claim'; v_request:=null;
  select max(occurred_at) into last_xp from public.community_xp_events where user_id=j.user_id and points>0 and occurred_at<=t;
  if r->>'status'<>'approved' then base_reason:='not_approved';
  elsif r->>'duplicate_of_report_id' is not null then base_reason:='duplicate';
  elsif captured>submitted or captured<submitted-interval '3 hours' then base_reason:='stale';
  elsif last_xp>t-interval '30 minutes' then base_reason:='cooldown';
  elsif (select count(*) from public.community_xp_events where user_id=j.user_id and kind='report' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')>=5 then base_reason:='report_limit';
  else base:=10; end if;
  -- Metadata has been validated by the upload service and is never client-authored JSON.
  if coalesce(m->>'measurement_request_id','') ~ '^[0-9a-fA-F-]{36}$' then
   v_request:=(m->>'measurement_request_id')::uuid;
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
  insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at) values(j.user_id,j.report_id,'report',base,base_reason,t) on conflict do nothing;
  if v_request is not null then
   insert into public.community_xp_events(user_id,report_id,request_id,requester_id,kind,points,reason,occurred_at)
   values(j.user_id,j.report_id,v_request,req.user_id,'help',bonus,bonus_reason,t) on conflict do nothing;
  end if;
  update public.community_xp_jobs set state='done',processed_at=now(),report_snapshot='{}',evidence_snapshot='{}' where report_id=j.report_id;
  n:=n+1;
 end loop;
 return jsonb_build_object('processed',n,'pending',(select count(*) from public.community_xp_jobs where state='pending'));
end $$;

-- Aggregation occurs in SQL (no REST default-row-limit truncation). Reversals are
-- attributed to the original achievement timestamp for rolling ranks.
create function public.community_xp_totals(p_user uuid default null) returns table(user_id uuid,lifetime_xp bigint,days bigint,reports bigint,helped bigint,today_reports bigint,today_help bigint,xp7 bigint,xp30 bigint)
language sql stable security invoker set search_path='' as $$
 with live as (select e.* from public.community_xp_events e where (p_user is null or e.user_id=p_user) and e.points>0 and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id))
 select a.user_id,coalesce(sum(l.points),0),count(distinct (l.occurred_at at time zone 'Asia/Bangkok')::date),
 count(*) filter(where l.kind='report'),count(*) filter(where l.kind='help'),
 (select count(*) from public.community_xp_events q where q.user_id=a.user_id and q.points>0 and q.kind='report' and (q.occurred_at at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),
 (select count(*) from public.community_xp_events q where q.user_id=a.user_id and q.points>0 and q.kind='help' and (q.occurred_at at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),
 coalesce(sum(l.points) filter(where l.occurred_at>now()-interval '168 hours'),0),
 coalesce(sum(l.points) filter(where l.occurred_at>now()-interval '720 hours'),0)
 from public.community_xp_accounts a left join live l on l.user_id=a.user_id where p_user is null or a.user_id=p_user group by a.user_id;
$$;
create function public.community_xp_board(p_period text default 'all',p_offset integer default 0,p_user uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with scored as (
 select a.member_id,a.alias,a.user_id,t.lifetime_xp,t.days,
 case p_period when '7d' then t.xp7 when '30d' then t.xp30 else t.lifetime_xp end xp
 from public.community_xp_accounts a join public.community_xp_totals() t using(user_id) where not a.hidden
 ), ranked as (select *,rank() over(order by xp desc) rank from scored where xp>0),
 page as (select * from ranked order by xp desc,member_id offset greatest(p_offset,0) limit 51)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'user_id') from page p),'[]'),
 'me',(select to_jsonb(r)-'user_id' from ranked r where r.user_id=p_user));
$$;

create function public.reverse_community_xp(p_event uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare e public.community_xp_events;
begin
 if char_length(trim(p_reason))<10 then raise exception 'reason_required'; end if;
 select * into e from public.community_xp_events where id=p_event and points>0 for update;
 if not found then raise exception 'event_not_found'; end if;
 insert into public.community_xp_events(user_id,kind,points,reason,occurred_at,reverses)
 values(e.user_id,'reversal',-e.points,p_reason,e.occurred_at,e.id) on conflict(reverses) do nothing;
end $$;
revoke execute on function public.enqueue_community_xp(),public.claim_community_help(uuid,uuid),public.process_community_xp(integer),public.community_xp_totals(uuid),public.community_xp_board(text,integer,uuid),public.reverse_community_xp(uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_community_xp(),public.claim_community_help(uuid,uuid),public.process_community_xp(integer),public.community_xp_totals(uuid),public.community_xp_board(text,integer,uuid),public.reverse_community_xp(uuid,text) to service_role;

-- Maintenance freezes community writes only; official stations/CAMS are unaffected.
create function public.guard_community_xp_maintenance() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(current_setting('clearpath.community_reset',true),'')<>'approved'
 and exists(select 1 from public.community_xp_control where maintenance) then
  raise exception 'community_maintenance';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger community_maintenance_reports before insert or update or delete on public.community_reports for each row execute function public.guard_community_xp_maintenance();
create trigger community_maintenance_requests before insert or update or delete on public.measurement_requests for each row execute function public.guard_community_xp_maintenance();
revoke execute on function public.guard_community_xp_maintenance() from public,anon,authenticated;
grant execute on function public.guard_community_xp_maintenance() to service_role;
alter table public.community_xp_control add column reset_manifest text;
create index community_help_claims_user on public.community_help_claims(user_id);
create index community_xp_jobs_user on public.community_xp_jobs(user_id);

create function public.community_xp_admin_overview() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'pending_jobs',(select count(*) from public.community_xp_jobs where state='pending'),
 'accounts',(select count(*) from public.community_xp_accounts),
 'zero_reasons',(select coalesce(jsonb_object_agg(reason,n),'{}') from (select reason,count(*) n from public.community_xp_events where points=0 and recorded_at>now()-interval '7 days' group by reason) x),
 'repeated_pairs',(select count(*) from (select user_id,requester_id from public.community_xp_events where kind='help' and points>0 and occurred_at>now()-interval '7 days' group by user_id,requester_id having count(*)>=3) x)
 );
$$;
revoke execute on function public.community_xp_admin_overview() from public,anon,authenticated;
grant execute on function public.community_xp_admin_overview() to service_role;

create trigger community_maintenance_drafts before insert or update or delete on public.report_drafts for each row execute function public.guard_community_xp_maintenance();
create trigger community_maintenance_capture before insert or update or delete on public.capture_sessions for each row execute function public.guard_community_xp_maintenance();
create trigger community_maintenance_xp_events before insert or update or delete on public.community_xp_events for each row execute function public.guard_community_xp_maintenance();
