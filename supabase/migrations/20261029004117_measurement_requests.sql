-- Private, server-mediated community measurement requests. No existing rows deleted.
create table public.measurement_helper_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  accuracy_m double precision check (accuracy_m between 0 and 200),
  observed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((lat is null and lon is null and accuracy_m is null and observed_at is null)
    or (enabled and lat is not null and lon is not null and accuracy_m is not null and observed_at is not null))
);
create index measurement_presence_location_idx on public.measurement_helper_presence(lat, lon) where enabled and lat is not null;
create table public.measurement_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  fingerprint text not null,
  place_name text not null check (char_length(place_name) between 1 and 160),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  radius_km integer not null check (radius_km in (1,3,5)),
  starts_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > starts_at),
  dispatch_cursor uuid,
  last_processed_at timestamptz,
  status text not null check (status in ('scheduled','active','fulfilled','expired','cancelled')),
  result_report_id uuid references public.community_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index measurement_requests_owner_idx on public.measurement_requests(user_id, created_at desc);
create index measurement_requests_work_idx on public.measurement_requests(last_processed_at,id) where status in ('scheduled','active');
create index measurement_requests_terminal_idx on public.measurement_requests(updated_at,id) where status in ('fulfilled','expired','cancelled');
create table public.measurement_request_recipients (
  request_id uuid not null references public.measurement_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  matched_location_at timestamptz not null,
  declined boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(request_id,user_id)
);
create index measurement_recipients_user_idx on public.measurement_request_recipients(user_id,created_at desc);
create table public.measurement_delivery_leases (
  event_id uuid primary key references public.notification_outbox(id) on delete cascade,
  lease_until timestamptz not null
);
alter table public.measurement_helper_presence enable row level security;
alter table public.measurement_requests enable row level security;
alter table public.measurement_request_recipients enable row level security;
alter table public.measurement_delivery_leases enable row level security;
-- No direct browser access. Authenticated owners/recipients use checked FastAPI APIs.
revoke all on public.measurement_helper_presence, public.measurement_requests,
 public.measurement_request_recipients, public.measurement_delivery_leases from anon, authenticated;
grant all on public.measurement_helper_presence, public.measurement_requests,
 public.measurement_request_recipients, public.measurement_delivery_leases to service_role;

-- Transactional quota/dedup: concurrent clicks cannot create extra requests.
create function public.create_measurement_request(p_row jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r public.measurement_requests; owner uuid := (p_row->>'user_id')::uuid;
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
 insert into public.measurement_requests select * from jsonb_populate_record(null::public.measurement_requests,p_row) returning * into r;
 return jsonb_build_object('row',to_jsonb(r));
end $$;

create function public.set_measurement_presence(p_user uuid, p_values jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r public.measurement_helper_presence;
begin
 perform pg_advisory_xact_lock(hashtextextended('presence:'||p_user::text,0));
 select * into r from public.measurement_helper_presence where user_id=p_user for update;
 if p_values ? 'enabled' then
  insert into public.measurement_helper_presence(user_id,enabled) values(p_user,(p_values->>'enabled')::boolean)
  on conflict(user_id) do update set enabled=excluded.enabled,
   lat=case when excluded.enabled then measurement_helper_presence.lat else null end,
   lon=case when excluded.enabled then measurement_helper_presence.lon else null end,
   accuracy_m=case when excluded.enabled then measurement_helper_presence.accuracy_m else null end,
   observed_at=case when excluded.enabled then measurement_helper_presence.observed_at else null end,
   updated_at=now() returning * into r;
 elsif r.enabled and (r.updated_at <= now()-interval '5 minutes' or r.observed_at is null) then
  update public.measurement_helper_presence set lat=(p_values->>'lat')::float8,lon=(p_values->>'lon')::float8,
   accuracy_m=(p_values->>'accuracy_m')::float8,observed_at=(p_values->>'observed_at')::timestamptz,updated_at=now()
   where user_id=p_user returning * into r;
 end if;
 return coalesce(to_jsonb(r),'{}'::jsonb);
end $$;

create function public.finish_measurement_request(p_id uuid, p_status text, p_report uuid default null) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
 if p_status not in ('fulfilled','expired','cancelled') then raise exception 'invalid terminal status'; end if;
 update public.measurement_requests set status=p_status,result_report_id=p_report,updated_at=now()
 where id=p_id and status in ('scheduled','active');
 get diagnostics changed = row_count;
 if changed>0 then
  update public.user_notifications set title=case p_status when 'fulfilled' then 'คำขอนี้ได้ค่าฝุ่นแล้ว' when 'cancelled' then 'คำขอนี้ถูกยกเลิก' else 'คำขอนี้หมดเวลาแล้ว' end,
   body='เปิดดูสถานะล่าสุดของคำขอ', payload=payload||jsonb_build_object('request_status',p_status)
   where entity_type='measurement_request' and entity_id=p_id::text and event_type='measurement_request';
 end if;
 return changed>0;
end $$;

-- Notification and channel job are committed together; retries cannot reset sent jobs.
create function public.notify_measurement_request(p_notification jsonb, p_outbox jsonb default null) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare req public.measurement_requests; target uuid := (p_notification->>'user_id')::uuid;
begin
 select * into req from public.measurement_requests where id=(p_notification->>'entity_id')::uuid for update;
 if not found then return false; end if;
 if p_notification->>'event_type'='measurement_request' then
  if req.status <> 'active' or req.starts_at>now() or req.expires_at<=now() or target=req.user_id then return false; end if;
  if not exists(select 1 from public.measurement_helper_presence where user_id=target and enabled) then return false; end if;
  if exists(select 1 from public.measurement_request_recipients where request_id=req.id and user_id=target and declined) then return false; end if;
  insert into public.measurement_request_recipients(request_id,user_id,matched_location_at)
  values(req.id,target,(p_notification->'payload'->>'matched_location_at')::timestamptz) on conflict do nothing;
 else
  if target<>req.user_id or req.status not in ('fulfilled','expired') then return false; end if;
 end if;
 insert into public.user_notifications select * from jsonb_populate_record(null::public.user_notifications,p_notification)
 on conflict(user_id,deduplication_key) do nothing;
 if p_outbox is not null then
  insert into public.notification_outbox select * from jsonb_populate_record(null::public.notification_outbox,p_outbox)
  on conflict(event_key) do nothing;
 end if;
 return true;
end $$;

create function public.claim_measurement_delivery(p_event uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
 insert into public.measurement_delivery_leases(event_id,lease_until) values(p_event,now()+interval '2 minutes')
 on conflict(event_id) do update set lease_until=excluded.lease_until where measurement_delivery_leases.lease_until<now();
 get diagnostics changed = row_count;
 return changed>0;
end $$;
revoke all on function public.create_measurement_request(jsonb), public.set_measurement_presence(uuid,jsonb),
 public.finish_measurement_request(uuid,text,uuid), public.notify_measurement_request(jsonb,jsonb), public.claim_measurement_delivery(uuid) from public,anon,authenticated;
grant execute on function public.create_measurement_request(jsonb), public.set_measurement_presence(uuid,jsonb),
 public.finish_measurement_request(uuid,text,uuid), public.notify_measurement_request(jsonb,jsonb), public.claim_measurement_delivery(uuid) to service_role;
