alter table public.measurement_request_recipients add column matched_source text not null default 'gps' check(matched_source in ('gps','registered'));

-- Opt-in rollout. Enable the API flag first, then this server-only control.
create table public.measurement_request_control (
 singleton boolean primary key default true check (singleton),
 registered_enabled boolean not null default false,
 enabled_at timestamptz
);
insert into public.measurement_request_control(singleton) values(true);
create table public.measurement_helper_locations (
 user_id bigint not null references public.profiles(id) on delete cascade,
 slot smallint not null check(slot in (1,2)),
 name text not null check(length(btrim(name)) between 1 and 80),
 address text not null default '' check(length(address)<=240),
 lat double precision not null check(lat between 5 and 21),
 lon double precision not null check(lon between 97 and 106),
 enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(user_id,slot)
);
create index measurement_helper_locations_dispatch on public.measurement_helper_locations(lat,user_id) where enabled;
create index measurement_requests_registered_area on public.measurement_requests(lat,id) where status in ('active','scheduled');
create table public.measurement_report_jobs (
 report_id bigint primary key references public.community_reports(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','done')),
 matched_count integer not null default 0,
 created_at timestamptz not null default now(), processed_at timestamptz
);
create index measurement_report_jobs_pending on public.measurement_report_jobs(created_at,report_id) where state='pending';
create table public.measurement_report_matches (
 report_id bigint not null references public.community_reports(id) on delete cascade,
 request_id bigint not null unique references public.measurement_requests(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(report_id,request_id)
);
create table public.measurement_notification_batches (
 id uuid primary key default gen_random_uuid(),
 user_id bigint not null references public.profiles(id) on delete cascade,
 closes_at timestamptz not null default now()+interval '60 seconds',
 created_at timestamptz not null default now()
);
create index measurement_notification_batches_user on public.measurement_notification_batches(user_id,closes_at desc);
create table public.measurement_notification_batch_items (
 batch_id uuid not null references public.measurement_notification_batches(id) on delete cascade,
 request_id bigint not null references public.measurement_requests(id) on delete cascade,
 user_id bigint not null references public.profiles(id) on delete cascade,
 primary key(batch_id,request_id),unique(user_id,request_id)
);
-- Browsers can only read their own saved places. All writes pass authenticated API validation.
alter table public.measurement_helper_locations enable row level security;
revoke all on public.measurement_helper_locations from public,anon,authenticated;
grant select on public.measurement_helper_locations to authenticated;
grant all on public.measurement_helper_locations to service_role;
create policy measurement_helper_locations_own on public.measurement_helper_locations for select to authenticated
 using(exists(select 1 from public.profiles p where p.id=user_id and p.auth_user_id=(select auth.uid())));
alter table public.measurement_request_control enable row level security;
revoke all on public.measurement_request_control from public,anon,authenticated;
grant all on public.measurement_request_control to service_role;
alter table public.measurement_report_jobs enable row level security;
revoke all on public.measurement_report_jobs from public,anon,authenticated;
grant all on public.measurement_report_jobs to service_role;
alter table public.measurement_report_matches enable row level security;
revoke all on public.measurement_report_matches from public,anon,authenticated;
grant all on public.measurement_report_matches to service_role;
alter table public.measurement_notification_batches enable row level security;
revoke all on public.measurement_notification_batches from public,anon,authenticated;
grant all on public.measurement_notification_batches to service_role;
alter table public.measurement_notification_batch_items enable row level security;
revoke all on public.measurement_notification_batch_items from public,anon,authenticated;
grant all on public.measurement_notification_batch_items to service_role;

create function private.measurement_distance(a double precision,b double precision,c double precision,d double precision)
 returns double precision language sql immutable strict parallel safe set search_path='' as $$
 select 6371*2*asin(sqrt(least(1.0,power(sin(radians(a-c)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(b-d)/2),2))))
$$;
create function public.save_measurement_helper_location(p_user bigint,p_slot integer,p_values jsonb,p_existing boolean default false)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare chosen integer:=p_slot; result public.measurement_helper_locations;
begin
 perform 1 from public.profiles where id=p_user for update;
 if not found then raise exception 'profile_not_found'; end if;
 if chosen is null then
  select slot into chosen from public.measurement_helper_locations where user_id=p_user and name=btrim(p_values->>'name') and address=coalesce(p_values->>'address','') and lat=(p_values->>'lat')::float8 and lon=(p_values->>'lon')::float8 limit 1;
 end if;
 if chosen is null then
  select s into chosen from generate_series(1,2) s where not exists(select 1 from public.measurement_helper_locations where user_id=p_user and slot=s) order by s limit 1;
 end if;
 if chosen is null then raise exception 'location_limit'; end if;
 if chosen not in (1,2) then raise exception 'invalid_slot'; end if;
 if p_existing and not exists(select 1 from public.measurement_helper_locations where user_id=p_user and slot=chosen) then raise exception 'location_not_found'; end if;
 insert into public.measurement_helper_locations(user_id,slot,name,address,lat,lon,enabled)
 values(p_user,chosen,btrim(p_values->>'name'),coalesce(p_values->>'address',''),(p_values->>'lat')::float8,(p_values->>'lon')::float8,coalesce((p_values->>'enabled')::boolean,true))
 on conflict(user_id,slot) do update set name=excluded.name,address=excluded.address,lat=excluded.lat,lon=excluded.lon,enabled=excluded.enabled,updated_at=now() returning * into result;
 update public.measurement_requests set dispatch_cursor=null where status='active' and expires_at>now();
 return to_jsonb(result)-'user_id'-'updated_at';
end $$;

create function private.activate_registered_measurement() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.registered_enabled and not old.registered_enabled then
  new.enabled_at:=now();
  update public.measurement_helper_presence set enabled=false,lat=null,lon=null,accuracy_m=null,observed_at=null,updated_at=now();
  update public.measurement_requests set dispatch_cursor=null where status in ('scheduled','active');
 end if;
 return new;
end $$;
create trigger registered_measurement_activation before update on public.measurement_request_control for each row execute function private.activate_registered_measurement();

alter function public.set_measurement_presence(bigint,jsonb) rename to set_measurement_presence_legacy;
create function public.set_measurement_presence(p_user bigint,p_values jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.measurement_helper_presence;
begin
 if not exists(select 1 from public.measurement_request_control where registered_enabled) then
  return public.set_measurement_presence_legacy(p_user,p_values);
 end if;
 if p_values ? 'enabled' then
  if (p_values->>'enabled')::boolean and not exists(select 1 from public.measurement_helper_locations where user_id=p_user and enabled) then raise exception 'location_required'; end if;
  insert into public.measurement_helper_presence(user_id,enabled) values(p_user,(p_values->>'enabled')::boolean)
  on conflict(user_id) do update set enabled=excluded.enabled,lat=null,lon=null,accuracy_m=null,observed_at=null,updated_at=now();
  update public.measurement_requests set dispatch_cursor=null where status='active' and expires_at>now();
 end if;
 select * into r from public.measurement_helper_presence where user_id=p_user;
 return coalesce(to_jsonb(r),'{}');
end $$;

create function public.registered_measurement_helpers(p_request bigint,p_cursor bigint default 0) returns table(user_id bigint) language sql stable security invoker set search_path='' as $$
 select distinct l.user_id from public.measurement_helper_locations l
 join public.measurement_helper_presence p on p.user_id=l.user_id and p.enabled
 join public.measurement_requests r on r.id=p_request
 where l.enabled and l.user_id>coalesce(p_cursor,0) and l.user_id<>r.user_id
 and l.lat between r.lat-r.radius_km/110.0 and r.lat+r.radius_km/110.0
 and private.measurement_distance(l.lat,l.lon,r.lat,r.lon)<=r.radius_km+1e-9
 order by l.user_id limit 100
$$;

create function private.queue_measurement_report() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='approved' and (tg_op='INSERT' or old.status is distinct from 'approved')
 and exists(select 1 from public.measurement_request_control where registered_enabled) then
  insert into public.measurement_report_jobs(report_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger queue_registered_measurement_report after insert or update of status on public.community_reports for each row execute function private.queue_measurement_report();

create function public.process_measurement_report_jobs(p_limit integer default 50) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.measurement_report_jobs; r public.community_reports; q public.measurement_requests; n integer:=0; matched integer:=0; one_count integer;
begin
 if not exists(select 1 from public.measurement_request_control where registered_enabled) then return jsonb_build_object('processed',0,'matched',0); end if;
 for j in select * from public.measurement_report_jobs where state='pending' order by created_at,report_id limit least(greatest(p_limit,1),100) for update skip locked loop
  select * into r from public.community_reports where id=j.report_id;
  one_count:=0;
  if r.status='approved' and r.pm25 between 0 and 1000 then
   for q in select * from public.measurement_requests where status in ('active','scheduled')
    and lat between r.lat-5/110.0 and r.lat+5/110.0
    and r.captured_at between starts_at and expires_at and r.created_at between starts_at and expires_at and r.moderated_at<=expires_at
    and private.measurement_distance(lat,lon,r.lat,r.lon)<=radius_km+1e-9 order by id for update loop
    update public.measurement_requests set status='fulfilled',result_report_id=r.id,updated_at=now() where id=q.id and status in ('active','scheduled');
    if found then
     insert into public.measurement_report_matches(report_id,request_id) values(r.id,q.id) on conflict do nothing;
     one_count:=one_count+1;
    end if;
   end loop;
  end if;
  update public.measurement_report_jobs set state='done',matched_count=one_count,processed_at=now() where report_id=j.report_id;
  matched:=matched+one_count;n:=n+1;
 end loop;
 return jsonb_build_object('processed',n,'matched',matched);
end $$;

-- Do not expire a request while a qualifying publication is waiting in the durable queue.
alter function public.finish_measurement_request(bigint,text,bigint) rename to finish_measurement_request_legacy;
create function public.finish_measurement_request(p_id bigint,p_status text,p_report bigint default null) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status='expired' and exists(select 1 from public.measurement_request_control where registered_enabled)
 and exists(select 1 from public.measurement_requests q join public.community_reports r on r.status='approved'
  join public.measurement_report_jobs j on j.report_id=r.id and j.state='pending'
  where q.id=p_id and r.captured_at between q.starts_at and q.expires_at and r.created_at between q.starts_at and q.expires_at
  and r.moderated_at<=q.expires_at and private.measurement_distance(q.lat,q.lon,r.lat,r.lon)<=q.radius_km+1e-9) then return false; end if;
 return public.finish_measurement_request_legacy(p_id,p_status,p_report);
end $$;

create function public.queue_measurement_group(p_request bigint,p_user bigint,p_line boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.measurement_requests; batch public.measurement_notification_batches; nid bigint; total integer;
begin
 if not exists(select 1 from public.measurement_request_control where registered_enabled) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('measurement-group:'||p_user::text,0));
 select * into q from public.measurement_requests where id=p_request;
 if q.status<>'active' or q.starts_at>now() or q.expires_at<=now() or q.user_id=p_user then return false; end if;
 if not exists(select 1 from public.measurement_helper_locations l join public.measurement_helper_presence p on p.user_id=l.user_id and p.enabled where l.user_id=p_user and l.enabled and private.measurement_distance(l.lat,l.lon,q.lat,q.lon)<=q.radius_km+1e-9) then return false; end if;
 if exists(select 1 from public.measurement_request_recipients where request_id=q.id and user_id=p_user and declined) then return false; end if;
 if exists(select 1 from public.measurement_notification_batch_items where request_id=q.id and user_id=p_user) then return false; end if;
 select * into batch from public.measurement_notification_batches where user_id=p_user and closes_at>now() order by closes_at limit 1 for update;
 if not found then insert into public.measurement_notification_batches(user_id) values(p_user) returning * into batch; end if;
 insert into public.measurement_request_recipients(request_id,user_id,matched_location_at,matched_source) values(q.id,p_user,now(),'registered') on conflict do nothing;
 insert into public.measurement_notification_batch_items(batch_id,request_id,user_id) values(batch.id,q.id,p_user) on conflict do nothing;
 select count(*) into total from public.measurement_notification_batch_items where batch_id=batch.id;
 insert into public.user_notifications(user_id,event_type,title,body,url,entity_type,entity_id,payload,deduplication_key)
 values(p_user,'measurement_request','มีคำขอให้ช่วยวัดค่าฝุ่น',total||' คำขอใกล้พื้นที่ที่บันทึกไว้','/requests?group='||batch.id,'measurement_request_group',batch.id::text,
 jsonb_build_object('measurement_group_id',batch.id,'request_count',total),'measurement-group:'||batch.id)
 on conflict(user_id,deduplication_key) do update set body=excluded.body,payload=excluded.payload,read_at=null returning id into nid;
 if p_line then
  insert into public.notification_outbox(user_id,notification_id,event_key,payload,next_attempt_at)
  values(p_user,nid,'measurement-group:'||batch.id||':line',jsonb_build_object('channel','line','measurement_group_id',batch.id,'tag','measurement-group:'||batch.id,'retry_key',batch.id),batch.closes_at)
  on conflict(event_key) do nothing;
 end if;
 return true;
end $$;

create function public.prepare_measurement_group(p_batch uuid,p_user bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare total integer; ids jsonb;
begin
 if not exists(select 1 from public.measurement_notification_batches where id=p_batch and user_id=p_user) then return null; end if;
 select count(*),jsonb_agg(q.id order by q.created_at,q.id) into total,ids from public.measurement_notification_batch_items i
 join public.measurement_requests q on q.id=i.request_id
 join public.measurement_request_recipients r on r.request_id=q.id and r.user_id=p_user and not r.declined
 where i.batch_id=p_batch and q.status='active' and q.starts_at<=now() and q.expires_at>now()
 and exists(select 1 from public.measurement_helper_locations l join public.measurement_helper_presence p on p.user_id=l.user_id and p.enabled
  where l.user_id=p_user and l.enabled and private.measurement_distance(l.lat,l.lon,q.lat,q.lon)<=q.radius_km+1e-9);
 update public.user_notifications set title=case when total=0 then 'คำขอในกลุ่มนี้สิ้นสุดแล้ว' else 'มีคำขอให้ช่วยวัดค่าฝุ่น' end,
  body=case when total=0 then 'เปิดดูสถานะล่าสุดของคำขอ' else total||' คำขอใกล้พื้นที่ที่บันทึกไว้' end,
  payload=payload||jsonb_build_object('request_count',total) where entity_type='measurement_request_group' and entity_id=p_batch::text and user_id=p_user;
 if total=0 then return null; end if;
 return jsonb_build_object('title','ช่วยรายงานค่าฝุ่นบริเวณนี้ได้ไหม?','body',total||' คำขอใกล้พื้นที่ที่บันทึกไว้',
 'url','/requests?group='||p_batch,'request_ids',ids);
end $$;

create unique index community_xp_help_report_once on public.community_xp_events(user_id,report_id) where kind='help' and points>0;
CREATE OR REPLACE FUNCTION public.process_community_xp(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.community_xp_jobs; r jsonb; e jsonb; m jsonb; req public.measurement_requests; c public.community_help_claims;
 t timestamptz; submitted timestamptz; captured timestamptz; day_start timestamptz; last_xp timestamptz;
 v_request bigint; base_reason text; bonus_reason text; base integer; bonus integer; n integer:=0;
 gps_lat float8; gps_lon float8; accuracy float8; deadline timestamptz;
begin
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then return jsonb_build_object('processed',0); end if;
 -- One short transaction worker lease; per-user caps cannot race across workers.
 if not pg_try_advisory_xact_lock(hashtextextended('community-xp-worker',0)) then return jsonb_build_object('processed',0,'busy',true); end if;
 for j in select * from public.community_xp_jobs where state='pending' and not exists(select 1 from public.measurement_report_jobs mjob where mjob.report_id=community_xp_jobs.report_id and mjob.state='pending') order by occurred_at,report_id limit least(greatest(p_limit,1),100) for update skip locked loop
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
  insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at) values(j.user_id,j.report_id,'report',base,base_reason,t) on conflict do nothing;
  if v_request is not null then
   insert into public.community_xp_events(user_id,report_id,request_id,requester_id,kind,points,reason,occurred_at)
   values(j.user_id,j.report_id,v_request,req.user_id,'help',bonus,bonus_reason,t) on conflict do nothing;
  end if;
  update public.community_xp_jobs set state='done',processed_at=now(),report_snapshot='{}',evidence_snapshot='{}' where report_id=j.report_id;
  n:=n+1;
 end loop;
 return jsonb_build_object('processed',n,'pending',(select count(*) from public.community_xp_jobs where state='pending'));
end $function$
;
revoke all on function public.process_community_xp(p_limit integer) from public,anon,authenticated;
grant execute on function public.process_community_xp(p_limit integer) to service_role;
revoke all on function private.measurement_distance(double precision,double precision,double precision,double precision) from public,anon,authenticated;
grant execute on function private.measurement_distance(double precision,double precision,double precision,double precision) to service_role;
revoke all on function public.save_measurement_helper_location(bigint,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_measurement_helper_location(bigint,integer,jsonb,boolean) to service_role;
revoke all on function private.activate_registered_measurement() from public,anon,authenticated;
grant execute on function private.activate_registered_measurement() to service_role;
revoke all on function public.set_measurement_presence(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.set_measurement_presence(bigint,jsonb) to service_role;
revoke all on function public.registered_measurement_helpers(bigint,bigint) from public,anon,authenticated;
grant execute on function public.registered_measurement_helpers(bigint,bigint) to service_role;
revoke all on function private.queue_measurement_report() from public,anon,authenticated;
grant execute on function private.queue_measurement_report() to service_role;
revoke all on function public.process_measurement_report_jobs(integer) from public,anon,authenticated;
grant execute on function public.process_measurement_report_jobs(integer) to service_role;
revoke all on function public.finish_measurement_request(bigint,text,bigint) from public,anon,authenticated;
grant execute on function public.finish_measurement_request(bigint,text,bigint) to service_role;
revoke all on function public.queue_measurement_group(bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function public.queue_measurement_group(bigint,bigint,boolean) to service_role;
revoke all on function public.prepare_measurement_group(uuid,bigint) from public,anon,authenticated;
grant execute on function public.prepare_measurement_group(uuid,bigint) to service_role;
grant usage on schema private to service_role;
