begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Every fresh eligible pin in 2 km; own reports remain excluded before selection.
create or replace function public.air_alert_candidates_for_user(p_user bigint,p_lat float8,p_lon float8,p_radius float8) returns jsonb
language sql stable security invoker set search_path='' as $$
 with candidates as (
 select 'station'::text source_type,id::text source_id,coalesce(name_th,id) name,pm25,lat,lon,recorded_at source_at,'approved'::text status
 from public.stations where p_user is not null and exists(select 1 from public.profiles where id=p_user) and recorded_at between now()-interval '1 hour' and now()
 and pm25>=0 and pm25<'Infinity'::float8 and lat between -90 and 90 and lon between -180 and 180 and lat between p_lat-p_radius/110 and p_lat+p_radius/110
 and (abs(p_lat)>85 or abs(lon-p_lon)<=p_radius/(110*greatest(0.01,cos(radians(p_lat)))) or abs(lon-p_lon)>350)
 union all
 select 'community',id::text,'รายงานชุมชน',pm25,public_lat,public_lon,captured_at,status
 from public.community_reports where user_id<>p_user and exists(select 1 from public.profiles where id=p_user) and status='approved' and captured_at between now()-interval '3 hours' and now()
 and pm25>=0 and pm25<'Infinity'::float8 and public_lat between -90 and 90 and public_lon between -180 and 180 and public_lat between p_lat-p_radius/110 and p_lat+p_radius/110
 and (abs(p_lat)>85 or abs(public_lon-p_lon)<=p_radius/(110*greatest(0.01,cos(radians(p_lat)))) or abs(public_lon-p_lon)>350)

 ), ranked as (
 select *,2*6371.0088*asin(sqrt(least(1.0,greatest(0.0,
 power(sin(radians(lat-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(lat))*power(sin(radians(lon-p_lon)/2),2))))) distance_km
 from candidates
 order by distance_km,source_at desc,source_type||':'||source_id
 ) select coalesce(jsonb_agg(to_jsonb(ranked)),'[]'::jsonb) from ranked where distance_km<=2.0;
$$;

revoke all on function public.air_alert_candidates_for_user(bigint,float8,float8,float8) from public,anon,authenticated;
grant execute on function public.air_alert_candidates_for_user(bigint,float8,float8,float8) to service_role;


-- One transaction for the whole batch. Existing notification uniqueness is the
-- observation ledger; retention exceeds source freshness (1h/3h). No daily quota.
create function public.commit_nearby_air_alerts(p_user bigint,p_location_version uuid,p_preferences_at timestamptz,p_notices jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare prefs public.notification_preferences; loc public.air_alert_locations;
 item jsonb; payload jsonb; k text; n bigint; band smallint; added integer:=0; eligible jsonb;
begin
 select * into prefs from public.notification_preferences where user_id=p_user and updated_at=p_preferences_at and consent_granted and air_alerts for update;
 if not found then return 0; end if;
 select * into loc from public.air_alert_locations where user_id=p_user and version=p_location_version
  and accuracy_m between 0 and 200 and observed_at between now()-interval '24 hours' and now() for update;
 if not found then return 0; end if;
 insert into public.air_alert_states(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.air_alert_states where user_id=p_user for update;
 eligible:=public.air_alert_candidates_for_user(p_user,loc.lat,loc.lon,2);
 for item in select * from jsonb_array_elements(p_notices) loop
  payload:=item->'payload'; k:=item->>'deduplication_key';
  if payload->>'policy_version' is distinct from 'nearby-pin-observation-v3'
   or nullif(k,'') is null or jsonb_typeof(payload->'pm25') is distinct from 'number'
   or (payload->>'pm25')::float8<37.6 then continue; end if;
  band:=case when (payload->>'pm25')::float8>75 then 2 else 1 end;
  if (payload->>'alert_severity')::smallint is distinct from band
   or (band=1 and not prefs.air_alert_warning) or (band=2 and not prefs.air_alert_danger)
   or not exists(select 1 from jsonb_array_elements(eligible) c
    where c->>'source_type'=payload->>'source_type' and c->>'source_id'=payload->>'source_id'
     and (c->>'source_at')::timestamptz=(payload->>'source_at')::timestamptz
     and (c->>'pm25')::float8=(payload->>'pm25')::float8) then continue; end if;
  n:=null;
  insert into public.user_notifications(user_id,event_type,title,body,url,payload,deduplication_key)
   values(p_user,'air_alert',item->>'title',item->>'body',item->>'url',payload,k)
   on conflict(user_id,deduplication_key) do nothing returning id into n;
  if n is null then continue; end if;
  added:=added+1;
  insert into public.notification_outbox(user_id,notification_id,event_key,payload)
   select p_user,n,k||':line',payload||jsonb_build_object('channel','line','event_type','air_alert','title',item->>'title','body',item->>'body','url',item->>'url','tag',k)
   where prefs.line_enabled and exists(select 1 from public.line_notification_links l where l.user_id=p_user and l.active and l.line_user_id is not null)
   on conflict(event_key) do nothing;
 end loop;
 update public.air_alert_states set revision=revision+1,evaluated_at=now(),evaluation_lease_until=null,
  state=(state-'_pending_key'-'_rollback')||jsonb_build_object('policy_version','nearby-pin-observation-v3') where user_id=p_user;
 return added;
end $$;
revoke all on function public.commit_nearby_air_alerts(bigint,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.commit_nearby_air_alerts(bigint,uuid,timestamptz,jsonb) to service_role;

-- Retire old-writer enqueueing during a rolling release. Preserve historical
-- quota audit rows and the legacy resolver for already-existing outbox attempts.
create or replace function public.commit_air_alert(p_user bigint,p_location_version uuid,p_preferences_at timestamptz,p_revision bigint,p_state jsonb,p_notice jsonb) returns boolean
language sql security invoker set search_path='' as $$ select false $$;

create or replace function private.record_air_alert_delivery() returns trigger
language plpgsql security invoker set search_path='' as $$
declare notice public.user_notifications; day date; band smallint;
begin
 if new.status not in ('sent','dead') or old.status=new.status then return new; end if;
 select * into notice from public.user_notifications where id=new.notification_id and event_type='air_alert';
 if not found then return new; end if;
 if notice.payload->>'policy_version'='nearby-pin-observation-v3' then return new; end if;
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
notify pgrst,'reload schema';
commit;
