-- Fixed two-band LINE alerts; Bangkok calendar days; server-only quota reservations.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.notification_preferences
 add column air_alert_warning boolean not null default true,
 add column air_alert_danger boolean not null default true;
alter table public.notification_preferences alter column radius_km set default 2;
alter table public.notification_preferences alter column pm25_threshold set default 37.6;
alter table public.notification_preferences alter column quiet_hours_start set default null;
alter table public.notification_preferences alter column quiet_hours_end set default null;
-- Preserve explicit opt-outs, consent and account links.
update public.notification_preferences set radius_km=2,pm25_threshold=37.6,
 quiet_hours_start=null,quiet_hours_end=null,updated_at=now()
 where radius_km is distinct from 2 or pm25_threshold is distinct from 37.6
 or quiet_hours_start is not null or quiet_hours_end is not null;
create function private.fixed_air_alert_preferences() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.radius_km:=2; new.pm25_threshold:=37.6;
 new.quiet_hours_start:=null; new.quiet_hours_end:=null;
 return new;
end $$;
revoke all on function private.fixed_air_alert_preferences() from public,anon,authenticated;
grant execute on function private.fixed_air_alert_preferences() to service_role;
create trigger fixed_air_alert_preferences before insert or update on public.notification_preferences
 for each row execute function private.fixed_air_alert_preferences();

create table public.air_alert_daily_limits (
 user_id bigint not null references public.profiles(id) on delete cascade,
 alert_date date not null,
 severity smallint not null check(severity in (1,2)),
 deduplication_key text not null,
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 primary key(user_id,alert_date,severity)
);
alter table public.air_alert_daily_limits enable row level security;
revoke all on public.air_alert_daily_limits from public,anon,authenticated;
grant all on public.air_alert_daily_limits to service_role;
-- Seed today's acknowledged alerts only; do not replay historical notifications.
insert into public.air_alert_daily_limits(user_id,alert_date,severity,deduplication_key,delivered_at)
 select n.user_id,(o.processed_at at time zone 'Asia/Bangkok')::date,
 case when (case when n.payload->>'pm25' ~ '^[0-9]+([.][0-9]+)?$' then (n.payload->>'pm25')::float8 else 0 end)>75 then 2 else 1 end,
 min(n.deduplication_key),max(o.processed_at)
 from public.user_notifications n join public.notification_outbox o on o.notification_id=n.id
 where n.event_type='air_alert' and o.status='sent' and o.processed_at is not null
 and o.processed_at>=date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
 and n.payload->>'pm25' ~ '^[0-9]+([.][0-9]+)?$' and (case when n.payload->>'pm25' ~ '^[0-9]+([.][0-9]+)?$' then (n.payload->>'pm25')::float8 else 0 end)>=37.6
 group by n.user_id,(o.processed_at at time zone 'Asia/Bangkok')::date,
 case when (case when n.payload->>'pm25' ~ '^[0-9]+([.][0-9]+)?$' then (n.payload->>'pm25')::float8 else 0 end)>75 then 2 else 1 end
 on conflict do nothing;

create or replace function public.commit_air_alert(p_user bigint,p_location_version uuid,p_preferences_at timestamptz,p_revision bigint,p_state jsonb,p_notice jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n bigint; payload jsonb; k text; band smallint; today date:=(now() at time zone 'Asia/Bangkok')::date;
 prefs public.notification_preferences; reserved boolean;
begin
 select * into prefs from public.notification_preferences where user_id=p_user and updated_at=p_preferences_at and consent_granted and air_alerts for update;
 if not found then return false; end if;
 perform 1 from public.air_alert_locations where user_id=p_user and version=p_location_version
 and observed_at between now()-interval '24 hours' and now() for update;
 if not found then return false; end if;
 insert into public.air_alert_states(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.air_alert_states where user_id=p_user and revision=p_revision for update;
 if not found then return false; end if;
 if p_notice is not null then
  payload:=p_notice->'payload'; k:=p_notice->>'deduplication_key';
  -- Old application instances cannot enqueue the retired episode policy.
  if payload->>'policy_version' is distinct from 'nearest-pin-daily-v2'
   or payload->>'alert_day' is distinct from today::text then return false; end if;
  band:=(payload->>'alert_severity')::smallint;
  if band is null or band not in (1,2) or nullif(k,'') is null
   or (band=1 and not prefs.air_alert_warning) or (band=2 and not prefs.air_alert_danger)
   or not (payload->>'pm25' ~ '^[0-9]+([.][0-9]+)?$')
   or (payload->>'pm25')::float8<37.6
   or band is distinct from (case when (payload->>'pm25')::float8>75 then 2 else 1 end)::smallint
   then return false; end if;
  insert into public.air_alert_daily_limits(user_id,alert_date,severity,deduplication_key)
  select p_user,today,band,k where not exists(
   select 1 from public.air_alert_daily_limits where user_id=p_user and alert_date=today and severity>=band)
  on conflict do nothing;
  reserved:=found;
  if not reserved then
   update public.air_alert_states set revision=revision+1,evaluated_at=now(),evaluation_lease_until=null,
    state=(p_state-'_pending_key'-'_rollback')||jsonb_build_object('alert_day',today::text,'severity',
     (select max(severity) from public.air_alert_daily_limits where user_id=p_user and alert_date=today))
    where user_id=p_user;
   return false;
  end if;
 end if;
 update public.air_alert_states set revision=revision+1,state=p_state,evaluated_at=now(),evaluation_lease_until=null where user_id=p_user;
 if p_notice is null then return true; end if;
 insert into public.user_notifications(user_id,event_type,title,body,url,payload,deduplication_key)
 values(p_user,'air_alert',p_notice->>'title',p_notice->>'body',p_notice->>'url',payload,k)
 on conflict(user_id,deduplication_key) do update set deduplication_key=excluded.deduplication_key returning id into n;
 insert into public.notification_outbox(user_id,notification_id,event_key,payload)
 select p_user,n,k||':line',payload||jsonb_build_object('channel','line','event_type','air_alert','title',p_notice->>'title','body',p_notice->>'body','url',p_notice->>'url','tag',k)
 from public.notification_preferences p where p.user_id=p_user and p.line_enabled
 and exists(select 1 from public.line_notification_links l where l.user_id=p_user and l.active and l.line_user_id is not null)
 on conflict(event_key) do nothing;
 if not found then
  -- Inbox-only notices do not spend a LINE quota before the account is linked.
  delete from public.air_alert_daily_limits where user_id=p_user and deduplication_key=k and delivered_at is null;
  update public.air_alert_states set state=state-'_pending_key'-'_rollback' where user_id=p_user;
 end if;
 return true;
end $$;
revoke all on function public.commit_air_alert(bigint,uuid,timestamptz,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_air_alert(bigint,uuid,timestamptz,bigint,jsonb,jsonb) to service_role;

create or replace function public.resolve_air_alert(p_user bigint,p_key text,p_re_evaluate boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 -- Never release a quota for an acknowledged or ambiguous provider attempt.
 if p_re_evaluate then
  delete from public.air_alert_daily_limits q where q.user_id=p_user and q.deduplication_key=p_key and q.delivered_at is null
  and not exists(select 1 from public.notification_outbox o where o.user_id=p_user
   and o.event_key=p_key||':line' and o.first_attempt_at is not null);
 end if;
 update public.air_alert_states set state=case when p_re_evaluate then coalesce(state->'_rollback','{}'::jsonb)||jsonb_build_object('low_since',null) else state-'_pending_key'-'_rollback' end,
 revision=revision+1,evaluated_at='epoch'::timestamptz
 where user_id=p_user and state->>'_pending_key'=p_key;
end $$;
revoke all on function public.resolve_air_alert(bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.resolve_air_alert(bigint,text,boolean) to service_role;

create function private.record_air_alert_delivery() returns trigger
language plpgsql security invoker set search_path='' as $$
declare notice public.user_notifications; day date; band smallint;
begin
 if new.status not in ('sent','dead') or old.status=new.status then return new; end if;
 select * into notice from public.user_notifications where id=new.notification_id and event_type='air_alert';
 if not found then return new; end if;
 if new.status='sent' and new.processed_at is not null
 and notice.payload->>'pm25' ~ '^[0-9]+([.][0-9]+)?$'
 and (notice.payload->>'pm25')::float8>=37.6 then
  day:=(new.processed_at at time zone 'Asia/Bangkok')::date;
  band:=case when (notice.payload->>'pm25')::float8>75 then 2 else 1 end;
  insert into public.air_alert_daily_limits(user_id,alert_date,severity,deduplication_key,delivered_at)
  values(new.user_id,day,band,notice.deduplication_key,new.processed_at)
  on conflict(user_id,alert_date,severity) do update set delivered_at=greatest(public.air_alert_daily_limits.delivered_at,excluded.delivered_at);
  update public.air_alert_states set state=state||jsonb_build_object('last_notified_at',new.processed_at)
   where user_id=new.user_id and state->>'_pending_key'=notice.deduplication_key;
 end if;
 -- Both the leased worker and the cron fallback resolve reservations here.
 -- finish_line_outbox's existing second resolution is an idempotent no-op.
 perform public.resolve_air_alert(new.user_id,notice.deduplication_key,
  new.status='dead' and coalesce(new.last_error in
   ('superseded_or_opted_out','line_recipient_changed','air_alert_no_longer_eligible','line_not_linked'),false));
 return new;
end $$;
revoke all on function private.record_air_alert_delivery() from public,anon,authenticated;
grant execute on function private.record_air_alert_delivery() to service_role;
create trigger record_air_alert_delivery after update of status on public.notification_outbox
 for each row execute function private.record_air_alert_delivery();
notify pgrst,'reload schema';
