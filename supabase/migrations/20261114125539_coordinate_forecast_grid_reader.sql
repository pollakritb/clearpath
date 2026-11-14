-- Scoped coordinate forecast reader only. No publishing, retention, cron or table changes.
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.read_cams_grid_point(
 p_generation bigint, p_index integer, p_start timestamptz, p_end timestamptz
) returns table(forecast_at timestamptz, pm25 double precision)
language plpgsql stable security invoker set search_path='' as $$
declare cell_count integer;
begin
 if p_generation is null or p_index is null or p_start is null or p_end is null
    or p_start>=p_end or p_end-p_start>interval '121 hours' then
   raise exception 'grid_point_range_invalid';
 end if;
 select cardinality(d.latitudes)*cardinality(d.longitudes) into cell_count
 from public.cams_grid_generations g join public.cams_grid_definitions d on d.id=g.grid_id
 where g.id=p_generation and g.status='ready'
   and g.retrieved_at<=now() and g.retrieved_at>now()-interval '36 hours';
 if cell_count is null then return; end if;
 if p_index<0 or p_index>=cell_count then raise exception 'grid_point_index_invalid'; end if;
 return query select f.valid_at, f.values[p_index+1]
 from public.cams_grid_frames f where f.generation_id=p_generation
   and f.valid_at>p_start and f.valid_at<=p_end order by f.valid_at limit 120;
end $$;
revoke all on function public.read_cams_grid_point(bigint,integer,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.read_cams_grid_point(bigint,integer,timestamptz,timestamptz) to service_role;

