-- Additive, service-only reads. Apply in a separate authorized release;
-- no episode reset, queue replay, backfill or table rewrite occurs here.
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.air_alert_candidates_for_user(p_user bigint,p_lat float8,p_lon float8,p_radius float8) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
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
 order by distance_km,source_at desc,source_type||':'||source_id limit 1
 ) select coalesce(jsonb_agg(to_jsonb(ranked)),'[]'::jsonb) from ranked;
$$;

revoke all on function public.air_alert_candidates_for_user(bigint,float8,float8,float8) from public,anon,authenticated;
grant execute on function public.air_alert_candidates_for_user(bigint,float8,float8,float8) to service_role;

-- Repair evidence must match an acknowledged historical self alert and the
-- episode timestamp. Never clear an unrelated warning/cooldown or pending lease.
create function public.air_alert_previous_was_own(p_user bigint,p_last timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
 with last_sent as (
  select n.payload,o.processed_at,n.created_at from public.user_notifications n
  join public.notification_outbox o on o.notification_id=n.id and o.user_id=n.user_id
  where n.user_id=p_user and n.event_type='air_alert' and o.status='sent'
    and o.processed_at is not null and n.created_at<=p_last
  order by o.processed_at desc,n.id desc limit 1
 ) select exists(select 1 from last_sent n join public.community_reports r
   on r.id::text=n.payload->>'source_id'
   where n.payload->>'source_type'='community' and r.user_id=p_user
     and abs(extract(epoch from n.processed_at-p_last))<=5
     and n.created_at>=p_last-interval '10 minutes');
$$;
revoke all on function public.air_alert_previous_was_own(bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.air_alert_previous_was_own(bigint,timestamptz) to service_role;
notify pgrst,'reload schema';
