-- Durable direct-pin alerts. All writes are server-only; no new admin mutations.
create table public.air_alert_locations (
 user_id bigint primary key references public.profiles(id) on delete cascade,
 lat double precision not null check(lat between -90 and 90),
 lon double precision not null check(lon between -180 and 180),
 accuracy_m double precision not null check(accuracy_m between 0 and 200),
 observed_at timestamptz not null,
 received_at timestamptz not null default now(),
 version uuid not null default gen_random_uuid()
);
create table public.air_alert_states (
 user_id bigint primary key references public.profiles(id) on delete cascade,
 revision bigint not null default 0,
 state jsonb not null default '{}'::jsonb,
 evaluated_at timestamptz not null default now(),
 evaluation_lease_until timestamptz
);
create index air_alert_states_due on public.air_alert_states(evaluated_at,user_id);
create index air_alert_locations_fresh on public.air_alert_locations(observed_at,user_id);
create index community_alert_candidates on public.community_reports(public_lat,public_lon,captured_at) where status='approved';
create table public.line_webhook_inbox (
 event_id text primary key,
 event jsonb not null,
 event_at timestamptz not null,
 created_at timestamptz not null default now(),
 available_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 attempts integer not null default 0,
 last_error text,
 status text not null default 'pending' check(status in ('pending','processing','done','dead'))
);
create index line_webhook_inbox_due on public.line_webhook_inbox(available_at,created_at) where status in ('pending','processing');
create table public.line_provider_budget (
 bucket text primary key,
 used bigint not null default 0,
 expires_at timestamptz not null
);
alter table public.notification_outbox add column lease_token uuid;
alter table public.notification_outbox add column lease_until timestamptz;
alter table public.notification_outbox add column frozen_request jsonb;
alter table public.notification_outbox add column first_attempt_at timestamptz;
alter table public.notification_outbox add column provider_request_id text;

alter table public.air_alert_locations enable row level security;
alter table public.air_alert_states enable row level security;
alter table public.line_webhook_inbox enable row level security;
alter table public.line_provider_budget enable row level security;
revoke all on public.air_alert_locations,public.air_alert_states,public.line_webhook_inbox,public.line_provider_budget from public,anon,authenticated;
grant all on public.air_alert_locations,public.air_alert_states,public.line_webhook_inbox,public.line_provider_budget to service_role;

create function public.set_air_alert_location(p_user bigint,p_location jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.air_alert_locations; t timestamptz := (p_location->>'observed_at')::timestamptz;
begin
 if t > now() or t < now()-interval '24 hours' then raise exception 'invalid_location_time'; end if;
 perform 1 from public.notification_preferences where user_id=p_user and consent_granted and air_alerts for update;
 if not found then raise exception 'notification_consent_required'; end if;
 insert into public.air_alert_locations(user_id,lat,lon,accuracy_m,observed_at)
 values(p_user,(p_location->>'lat')::float8,(p_location->>'lon')::float8,(p_location->>'accuracy_m')::float8,t)
 on conflict(user_id) do update set lat=excluded.lat,lon=excluded.lon,accuracy_m=excluded.accuracy_m,
 observed_at=excluded.observed_at,received_at=now(),version=gen_random_uuid()
 where air_alert_locations.observed_at < excluded.observed_at returning * into r;
 if r.user_id is null then select * into r from public.air_alert_locations where user_id=p_user; end if;
 return to_jsonb(r);
end $$;

-- Radius-first bounding filters use public report points. No global newest-N cap.
create function public.air_alert_candidates(p_lat float8,p_lon float8,p_radius float8) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with candidates as (
 select 'station'::text source_type,id::text source_id,coalesce(name_th,id) name,pm25,lat,lon,recorded_at source_at,'approved'::text status
 from public.stations where recorded_at between now()-interval '1 hour' and now()
 and pm25>=0 and pm25<'Infinity'::float8 and lat between -90 and 90 and lon between -180 and 180 and lat between p_lat-p_radius/110 and p_lat+p_radius/110
 and (abs(p_lat)>85 or abs(lon-p_lon)<=p_radius/(110*greatest(0.01,cos(radians(p_lat)))) or abs(lon-p_lon)>350)
 union all
 select 'community',id::text,'รายงานชุมชน',pm25,public_lat,public_lon,captured_at,status
 from public.community_reports where status='approved' and captured_at between now()-interval '3 hours' and now()
 and pm25>=0 and pm25<'Infinity'::float8 and public_lat between -90 and 90 and public_lon between -180 and 180 and public_lat between p_lat-p_radius/110 and p_lat+p_radius/110
 and (abs(p_lat)>85 or abs(public_lon-p_lon)<=p_radius/(110*greatest(0.01,cos(radians(p_lat)))) or abs(public_lon-p_lon)>350)

 ), ranked as (
 select *,2*6371.0088*asin(sqrt(least(1.0,greatest(0.0,
 power(sin(radians(lat-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(lat))*power(sin(radians(lon-p_lon)/2),2))))) distance_km
 from candidates
 order by distance_km,source_at desc,source_type||':'||source_id limit 1
 ) select coalesce(jsonb_agg(to_jsonb(ranked)),'[]'::jsonb) from ranked;
$$;

-- The application computes the pure transition, then CAS commits state+notice+outbox.
create function public.commit_air_alert(p_user bigint,p_location_version uuid,p_preferences_at timestamptz,p_revision bigint,p_state jsonb,p_notice jsonb) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n bigint; payload jsonb; k text;
begin
 perform 1 from public.notification_preferences where user_id=p_user and updated_at=p_preferences_at and consent_granted and air_alerts for update;
 if not found then return false; end if;
 perform 1 from public.air_alert_locations where user_id=p_user and version=p_location_version and observed_at>=now()-interval '24 hours' for update;
 if not found then return false; end if;
 insert into public.air_alert_states(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.air_alert_states where user_id=p_user and revision=p_revision for update;
 if not found then return false; end if;
 update public.air_alert_states set revision=revision+1,state=p_state,evaluated_at=now(),evaluation_lease_until=null where user_id=p_user;
 if p_notice is null then return true; end if;
 k:=p_notice->>'deduplication_key'; payload:=p_notice->'payload';
 insert into public.user_notifications(user_id,event_type,title,body,url,payload,deduplication_key)
 values(p_user,'air_alert',p_notice->>'title',p_notice->>'body',p_notice->>'url',payload,k)
 on conflict(user_id,deduplication_key) do update set deduplication_key=excluded.deduplication_key returning id into n;
 insert into public.notification_outbox(user_id,notification_id,event_key,payload)
 select p_user,n,k||':line',payload||jsonb_build_object('channel','line','event_type','air_alert','title',p_notice->>'title','body',p_notice->>'body','url',p_notice->>'url','tag',k)
 from public.notification_preferences p where p.user_id=p_user and p.line_enabled
 and exists(select 1 from public.line_notification_links l where l.user_id=p_user and l.active and l.line_user_id is not null)
 on conflict(event_key) do nothing;
 if not found then
  update public.air_alert_states set state=state-'_pending_key'-'_rollback' where user_id=p_user;
 end if;
 return true;
end $$;

create function public.accept_line_webhook(p_events jsonb) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare item jsonb; added integer:=0; changed integer;
begin
 for item in select * from jsonb_array_elements(p_events) loop
  if nullif(item->>'webhookEventId','') is null then raise exception 'missing_webhook_event_id'; end if;
  insert into public.line_webhook_inbox(event_id,event,event_at)
  select item->>'webhookEventId',item,to_timestamp((item->>'timestamp')::numeric/1000)
  where not exists(select 1 from public.line_webhook_events where event_id=item->>'webhookEventId' and expires_at>now()) on conflict do nothing;
  get diagnostics changed=row_count; added:=added+changed;
 end loop;
 return added;
end $$;

create function public.claim_line_webhooks(p_limit integer default 20) returns setof public.line_webhook_inbox
language sql security invoker set search_path=public,pg_temp as $$
 with due as (
 select i.event_id from public.line_webhook_inbox i where
 (i.status='pending' or (i.status='processing' and i.lease_until<now())) and i.available_at<=now()
 and not exists(select 1 from public.line_webhook_inbox older where older.event->'source'->>'userId'=i.event->'source'->>'userId'
 and older.status in ('pending','processing') and (older.event_at,older.created_at,older.event_id)<(i.event_at,i.created_at,i.event_id))
 order by i.event_at,i.created_at for update skip locked limit least(greatest(p_limit,1),100)
 ) update public.line_webhook_inbox i set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
 from due where i.event_id=due.event_id returning i.*;
$$;

create function public.claim_line_outbox(p_limit integer default 10) returns setof public.notification_outbox
language sql security invoker set search_path=public,pg_temp as $$
 with due as (
 select o.id from public.notification_outbox o where o.status in ('pending','failed','processing') and o.next_attempt_at<=now()
 and (o.lease_until is null or o.lease_until<now()) order by o.created_at
 for update skip locked limit least(greatest(p_limit,1),100)
 ) update public.notification_outbox o set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 from due where o.id=due.id returning o.*;
$$;

-- Budget reservation shared by every process. Monthly reservation is conservative:
-- uncertain/timeouts consume capacity too, so retries cannot overrun the local cap.
create function public.reserve_line_budget(p_endpoint text,p_per_second integer,p_monthly_cap integer) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s text:=p_endpoint||':'||date_trunc('second',now())::text; m text:='month:'||to_char(now() at time zone 'Asia/Bangkok','YYYY-MM'); used_count bigint;
begin
 perform pg_advisory_xact_lock(hashtext('line-provider-budget'));
 if p_monthly_cap>0 and p_endpoint='push' then
  select used into used_count from public.line_provider_budget where bucket=m;
  if coalesce(used_count,0)>=p_monthly_cap then return false; end if;
 end if;
 insert into public.line_provider_budget(bucket,used,expires_at) values(s,1,now()+interval '1 minute')
 on conflict(bucket) do update set used=line_provider_budget.used+1 where line_provider_budget.used<greatest(p_per_second,1);
 if not found then return false; end if;
 if p_monthly_cap>0 and p_endpoint='push' then
  insert into public.line_provider_budget(bucket,used,expires_at) values(m,1,now()+interval '32 days') on conflict(bucket) do update set used=line_provider_budget.used+1;
 end if;
 return true;
end $$;

-- Bound hot data and clear raw webhook payload after processing. Retain dedup IDs.
create function public.prune_line_delivery_data() returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 delete from public.line_provider_budget where expires_at<now();
 delete from public.line_user_event_cursors c where c.event_at<now()-interval '30 days' and not exists(select 1 from public.line_notification_links l where l.line_user_id=c.line_user_id);
 delete from public.air_alert_locations where observed_at<now()-interval '24 hours';
 update public.line_webhook_inbox set event='{}'::jsonb where status in ('done','dead') and created_at<now()-interval '1 day' and event<>'{}'::jsonb;
 delete from public.line_webhook_inbox where status in ('done','dead') and created_at<now()-interval '30 days';
end $$;

revoke all on function public.set_air_alert_location(bigint,jsonb),public.air_alert_candidates(float8,float8,float8),public.commit_air_alert(bigint,uuid,timestamptz,bigint,jsonb,jsonb),public.accept_line_webhook(jsonb),public.claim_line_webhooks(integer),public.claim_line_outbox(integer),public.reserve_line_budget(text,integer,integer),public.prune_line_delivery_data() from public,anon,authenticated;
grant execute on function public.set_air_alert_location(bigint,jsonb),public.air_alert_candidates(float8,float8,float8),public.commit_air_alert(bigint,uuid,timestamptz,bigint,jsonb,jsonb),public.accept_line_webhook(jsonb),public.claim_line_webhooks(integer),public.claim_line_outbox(integer),public.reserve_line_budget(text,integer,integer),public.prune_line_delivery_data() to service_role;

create function public.due_air_alert_users(p_limit integer default 100) returns setof bigint
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into public.air_alert_states(user_id,evaluated_at)
 select l.user_id,'epoch'::timestamptz from public.air_alert_locations l
 join public.notification_preferences p using(user_id)
 left join public.air_alert_states s using(user_id)
 where s.user_id is null and p.air_alerts and p.consent_granted and l.observed_at between now()-interval '24 hours' and now()
 order by l.user_id limit least(greatest(p_limit,1),1000) on conflict do nothing;
 return query with due as (
 select s.user_id from public.air_alert_states s join public.air_alert_locations l using(user_id) join public.notification_preferences p using(user_id)
 where p.air_alerts and p.consent_granted and l.observed_at between now()-interval '24 hours' and now()
 and s.evaluated_at<=now()-interval '30 seconds' and (s.evaluation_lease_until is null or s.evaluation_lease_until<now())
 order by s.evaluated_at,s.user_id for update of s skip locked limit least(greatest(p_limit,1),1000)
 ) update public.air_alert_states s set evaluation_lease_until=now()+interval '2 minutes',evaluated_at=now()
 from due where s.user_id=due.user_id returning s.user_id;
end $$;
revoke all on function public.due_air_alert_users(integer) from public,anon,authenticated;
grant execute on function public.due_air_alert_users(integer) to service_role;

create function public.enqueue_notification(p_user bigint,p_notice jsonb,p_outbox jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n public.user_notifications;
begin
 insert into public.user_notifications(user_id,event_type,title,body,url,entity_type,entity_id,payload,deduplication_key)
 values(p_user,p_notice->>'event_type',p_notice->>'title',p_notice->>'body',coalesce(p_notice->>'url','/'),p_notice->>'entity_type',p_notice->>'entity_id',coalesce(p_notice->'payload','{}'::jsonb),p_notice->>'deduplication_key')
 on conflict(user_id,deduplication_key) do update set deduplication_key=excluded.deduplication_key returning * into n;
 if p_outbox is not null then
  insert into public.notification_outbox(user_id,notification_id,event_key,payload)
  values(p_user,n.id,p_outbox->>'event_key',p_outbox->'payload') on conflict(event_key) do nothing;
 end if;
 return to_jsonb(n);
end $$;
revoke all on function public.enqueue_notification(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_notification(bigint,jsonb,jsonb) to service_role;

-- Durable webhook projection: one-time codes and unfollow ordering are atomic.
alter table public.line_webhook_inbox add column applied boolean not null default false;
alter table public.line_webhook_inbox add column reply_text text;
create table public.line_user_event_cursors (
 line_user_id text primary key,
 event_at timestamptz not null,
 event_id text not null
);
alter table public.line_user_event_cursors enable row level security;
revoke all on public.line_user_event_cursors from public,anon,authenticated;
grant all on public.line_user_event_cursors to service_role;
create function public.apply_line_webhook(p_event text,p_lease uuid,p_code_hash text) returns text
language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.line_webhook_inbox; c public.line_notification_links; target text; kind text; reply text;
begin
 select * into i from public.line_webhook_inbox where event_id=p_event and lease_token=p_lease and lease_until>now() for update;
 if not found then raise exception 'webhook_lease_lost'; end if;
 if i.applied then return i.reply_text; end if;
 target:=i.event->'source'->>'userId'; kind:=i.event->>'type';
 if coalesce(i.event->'source'->>'type','')<>'user' or coalesce(target,'') !~ '^U[0-9a-fA-F]{32}$' then
  update public.line_webhook_inbox set applied=true where event_id=p_event; return null;
 end if;
 perform pg_advisory_xact_lock(hashtext('line-user:'||target));
 if exists(select 1 from public.line_user_event_cursors where line_user_id=target and (event_at,event_id)>(i.event_at,i.event_id)) then
  update public.line_webhook_inbox set applied=true where event_id=p_event; return null;
 end if;
 insert into public.line_user_event_cursors values(target,i.event_at,i.event_id)
 on conflict(line_user_id) do update set event_at=excluded.event_at,event_id=excluded.event_id;
 if kind='unfollow' then
  update public.line_notification_links set active=false,updated_at=now() where line_user_id=target;
 elsif kind='follow' then
  reply:='เพิ่มเพื่อน ClearPath สำเร็จแล้ว กลับไปสร้างรหัสเชื่อมบัญชีจากหน้าแจ้งเตือนบนเว็บ';
 elsif kind='message' and i.event->'message'->>'type'='text' then
  if p_code_hash is null then
   reply:='กรุณาสร้างรหัสเชื่อม LINE จากหน้าแจ้งเตือนใน ClearPath แล้วส่งรหัส CP-XXXXXXXX ที่นี่';
  else
   perform pg_advisory_xact_lock(hashtext('line-link-codes'));
   select * into c from public.line_notification_links where link_code_hash=p_code_hash and link_code_expires_at>now() for update;
   if c.user_id is not null and not exists(select 1 from public.line_notification_links where line_user_id=target and active and user_id<>c.user_id) then
    update public.line_notification_links set line_user_id=target,active=true,linked_at=now(),updated_at=now(),link_code_hash=null,link_code_expires_at=null where user_id=c.user_id;
    insert into public.notification_preferences(user_id,line_enabled,consent_granted,consent_granted_at)
    values(c.user_id,true,true,now()) on conflict(user_id) do update set line_enabled=true,consent_granted=true,consent_granted_at=now(),updated_at=now();
    update public.air_alert_states set state='{}'::jsonb,revision=revision+1,evaluated_at='epoch',evaluation_lease_until=null where user_id=c.user_id;
    reply:='เชื่อม LINE กับ ClearPath สำเร็จแล้ว';
   else reply:='รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่จาก ClearPath'; end if;
  end if;
 end if;
 update public.line_webhook_inbox set applied=true,reply_text=reply where event_id=p_event;
 return reply;
end $$;
revoke all on function public.apply_line_webhook(text,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_line_webhook(text,uuid,text) to service_role;

create function public.resolve_air_alert(p_user bigint,p_key text,p_re_evaluate boolean) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.air_alert_states set state=case when p_re_evaluate then coalesce(state->'_rollback','{}'::jsonb)||jsonb_build_object('low_since',null) else state-'_pending_key'-'_rollback' end,
 revision=revision+1,evaluated_at='epoch'::timestamptz
 where user_id=p_user and state->>'_pending_key'=p_key;
end $$;
revoke all on function public.resolve_air_alert(bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.resolve_air_alert(bigint,text,boolean) to service_role;

create function public.finish_line_outbox(p_event bigint,p_lease uuid,p_values jsonb) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare old public.notification_outbox;
begin
 select * into old from public.notification_outbox where id=p_event and lease_token=p_lease and lease_until>now() for update;
 if not found then return false; end if;
 update public.notification_outbox set status=coalesce(p_values->>'status',status),
 attempts=coalesce((p_values->>'attempts')::integer,attempts),
 next_attempt_at=coalesce((p_values->>'next_attempt_at')::timestamptz,next_attempt_at),
 processed_at=coalesce((p_values->>'processed_at')::timestamptz,processed_at),
 provider_request_id=coalesce(p_values->>'provider_request_id',provider_request_id),
 last_error=p_values->>'last_error',
 frozen_request=case when p_values ? 'frozen_request' then nullif(p_values->'frozen_request','null'::jsonb) else frozen_request end,
 payload=coalesce(p_values->'payload',payload),lease_token=null,lease_until=null,updated_at=now() where id=p_event;
 if old.payload->>'event_type'='air_alert' and p_values->>'status' in ('sent','dead') then
  if p_values->>'status'='sent' then
   update public.air_alert_states set state=state||jsonb_build_object('last_notified_at',now()) where user_id=old.user_id and state->>'_pending_key'=old.payload->>'tag';
  end if;
  perform public.resolve_air_alert(old.user_id,old.payload->>'tag',coalesce(p_values->>'last_error' in ('superseded_or_opted_out','line_recipient_changed'),false));
 end if;
 return true;
end $$;
revoke all on function public.finish_line_outbox(bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_line_outbox(bigint,uuid,jsonb) to service_role;

create function public.line_delivery_metrics() returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'pending',count(*) filter(where status='pending' and (lease_until is null or lease_until<=now())),
 'processing',count(*) filter(where status='processing' or (lease_until>now() and status in ('pending','failed'))),
 'sent',count(*) filter(where status='sent'),
 'failed',count(*) filter(where status='failed' and (lease_until is null or lease_until<=now())),
 'dead',count(*) filter(where status='dead'),
 'oldest_waiting_at',min(created_at) filter(where status in ('pending','failed','processing')),
 'latest_error',(select last_error from public.notification_outbox where status in ('failed','dead') order by updated_at desc limit 1),
 'webhook_pending',(select count(*) from public.line_webhook_inbox where status in ('pending','processing')))
 from public.notification_outbox;
$$;
revoke all on function public.line_delivery_metrics() from public,anon,authenticated;
grant execute on function public.line_delivery_metrics() to service_role;

create function public.touch_line_outbox(p_event bigint,p_lease uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.notification_outbox set lease_until=now()+interval '2 minutes'
 where id=p_event and lease_token=p_lease and lease_until>now();
 return found;
end $$;
revoke all on function public.touch_line_outbox(bigint,uuid) from public,anon,authenticated;
grant execute on function public.touch_line_outbox(bigint,uuid) to service_role;
create index notification_outbox_durable_due on public.notification_outbox(next_attempt_at,created_at) where status in ('pending','failed','processing');

-- Frozen requests contain LINE recipient identifiers; never expose the outbox.
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon,authenticated;
grant all on public.notification_outbox to service_role;
