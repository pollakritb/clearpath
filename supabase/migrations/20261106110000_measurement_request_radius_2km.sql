-- Preserve historical request radii; all new requests use a fixed 2 km radius.
begin;
alter table public.measurement_requests
  drop constraint measurement_requests_radius_km_check;
alter table public.measurement_requests
  add constraint measurement_requests_radius_km_check check (radius_km in (1,2,3,5));

create function private.enforce_measurement_request_radius()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.radius_km <> 2 then
    raise exception 'measurement_request_radius_must_be_2km' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_measurement_request_radius() from public, anon, authenticated;
create trigger measurement_request_radius_before_insert
  before insert on public.measurement_requests
  for each row execute function private.enforce_measurement_request_radius();
commit;
