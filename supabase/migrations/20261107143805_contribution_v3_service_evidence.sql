-- V3 missions use the same image/time/GPS service protocol as request bonuses.
-- Number-only publication must not accidentally require retired OCR field/unit gates.
-- Preserve the applied v3 migration and all legacy v2 behavior.
do $service_protocol$
declare definition text; previous text; replacement text;
begin
 definition:=pg_get_functiondef('public.process_community_xp(integer)'::regprocedure);
 previous:='if v2 and (not v3 or ctl.missions_enabled) and m->''evidence_extraction''->>''pm25_field_verified''=''true'' and m->''evidence_extraction''->>''unit_verified''=''true'' and base_reason';
 replacement:='if v2 and (not v3 or ctl.missions_enabled) and (v3 or (m->''evidence_extraction''->>''pm25_field_verified''=''true'' and m->''evidence_extraction''->>''unit_verified''=''true'')) and base_reason';
 if strpos(definition,previous)=0 then raise exception 'unexpected_contribution_worker_revision';end if;
 execute replace(definition,previous,replacement);
end $service_protocol$;
revoke all on function public.process_community_xp(integer) from public,anon,authenticated;
grant execute on function public.process_community_xp(integer) to service_role;
notify pgrst,'reload schema';
