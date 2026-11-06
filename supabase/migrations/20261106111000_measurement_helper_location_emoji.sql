begin;
alter table public.measurement_helper_locations add column emoji text not null default '📍'
  check (emoji in ('🏠','🏢','🏫','🏥','🏡','🏪','🌳','📍'));
create or replace function public.save_measurement_helper_location(p_user bigint,p_slot integer,p_values jsonb,p_existing boolean default false)
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
 insert into public.measurement_helper_locations(user_id,slot,name,address,lat,lon,enabled,emoji)
 values(p_user,chosen,btrim(p_values->>'name'),coalesce(p_values->>'address',''),(p_values->>'lat')::float8,(p_values->>'lon')::float8,coalesce((p_values->>'enabled')::boolean,true),coalesce(p_values->>'emoji','📍'))
 on conflict(user_id,slot) do update set name=excluded.name,address=excluded.address,lat=excluded.lat,lon=excluded.lon,enabled=excluded.enabled,emoji=excluded.emoji,updated_at=now() returning * into result;
 update public.measurement_requests set dispatch_cursor=null where status='active' and expires_at>now();
 return to_jsonb(result)-'user_id'-'updated_at';
end $$;

revoke all on function public.save_measurement_helper_location(bigint,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_measurement_helper_location(bigint,integer,jsonb,boolean) to service_role;
commit;
