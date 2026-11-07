-- Owner-authorized immediate cutover; preserve evidence gates, immutable start and ledger.
create or replace function public.set_contribution_v3_release(p_enabled boolean,p_starts_at timestamptz,p_missions boolean,p_refs jsonb,p_operator text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.contribution_v3_control; result jsonb; immediate_launch boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtextextended('community-xp-worker',0));
 select * into previous from public.contribution_v3_control where singleton for update;
 if length(coalesce(p_operator,''))<3 then raise exception 'operator_required';end if;
 if p_starts_at is null and p_refs->>'release_mode'='immediate' then
  if previous.starts_at is not null then
   p_starts_at:=previous.starts_at;
  elsif p_enabled then
   if length(coalesce(p_refs->>'immediate_reason',''))<10 then raise exception 'immediate_release_reason_required';end if;
   p_starts_at:=clock_timestamp();immediate_launch:=true;
  end if;
 end if;
 if previous.starts_at is not null and p_starts_at is distinct from previous.starts_at then raise exception 'launch_timestamp_immutable';end if;
 if previous.starts_at is null and p_starts_at is not null and not immediate_launch and (p_starts_at<=now() or p_starts_at<>(date_trunc('month',p_starts_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')) then raise exception 'future_thai_month_boundary_required';end if;
 if p_enabled and p_starts_at is null then raise exception 'future_thai_month_boundary_required';end if;
 if p_enabled and (coalesce(length(p_refs->>'notice_ref'),0)<10 or coalesce(length(p_refs->>'concurrency_ref'),0)<10 or coalesce(length(p_refs->>'preservation_ref'),0)<10 or coalesce(length(p_refs->>'device_validation_ref'),0)<10) then raise exception 'release_evidence_required';end if;
 update public.contribution_v3_control set enabled=p_enabled,paused=not p_enabled,starts_at=p_starts_at,missions_enabled=p_missions,refs=p_refs,updated_at=now() where singleton returning to_jsonb(contribution_v3_control.*) into result;
 insert into public.contribution_v3_release_events(operator_ref,configuration) values(p_operator,result);
 return result;
end $$;
-- In the transition month, count all actually awarded versions without backfilling grants.
do $month$
declare definition text;
begin
 definition:=pg_get_functiondef('private.community_season_rows(text)'::regprocedure);
 if strpos(definition,'b.start_at>=ctl.starts_at')=0 then raise exception 'unexpected_season_revision';end if;
 execute replace(definition,'b.start_at>=ctl.starts_at','b.end_at>ctl.starts_at');
end $month$;
revoke all on function public.set_contribution_v3_release(boolean,timestamptz,boolean,jsonb,text) from public,anon,authenticated;
grant execute on function public.set_contribution_v3_release(boolean,timestamptz,boolean,jsonb,text) to service_role;
notify pgrst,'reload schema';
