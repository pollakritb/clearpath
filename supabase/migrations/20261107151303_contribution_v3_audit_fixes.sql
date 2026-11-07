-- Correct explanations and activity counts; no point reset or policy activation.
do $audit$
declare definition text; previous text; replacement text;
begin
 definition:=pg_get_functiondef('public.process_community_xp(integer)'::regprocedure);
 previous:='     if bonus=0 and (select count(*) from public.community_xp_events where user_id=j.user_id and kind=''help'' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval ''1 day'')<3 then
      bonus:=5;bonus_reason:=''coverage_mission'';v_request:=null;
     end if;';
 replacement:='     if bonus=0 then
      if (select count(*) from public.community_xp_events where user_id=j.user_id and kind=''help'' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval ''1 day'')<3 then
       bonus:=5;bonus_reason:=''coverage_mission'';v_request:=null;
      elsif v3 then
       bonus_reason:=''help_limit'';v_request:=null;
      end if;
     end if;';
 if strpos(definition,previous)=0 then raise exception 'unexpected_contribution_worker_revision';end if;
 execute replace(definition,previous,replacement);

 definition:=pg_get_functiondef('public.community_xp_totals(bigint)'::regprocedure);
 previous:='count(*) filter(where l.kind=''help''),';
 replacement:='count(*) filter(where l.kind=''help'' and l.mission_id is null),';
 if strpos(definition,previous)=0 then raise exception 'unexpected_contribution_totals_revision';end if;
 execute replace(definition,previous,replacement);

 definition:=pg_get_functiondef('public.publish_community_missions(jsonb)'::regprocedure);
 previous:='where state=''open'' and expires_at<=now();';
 replacement:='where state=''open'' and (expires_at<=now() or policy_version<>version);';
 if strpos(definition,previous)=0 then raise exception 'unexpected_contribution_publisher_revision';end if;
 execute replace(definition,previous,replacement);
end $audit$;
revoke all on function public.process_community_xp(integer),public.community_xp_totals(bigint),public.publish_community_missions(jsonb) from public,anon,authenticated;
grant execute on function public.process_community_xp(integer),public.community_xp_totals(bigint),public.publish_community_missions(jsonb) to service_role;
notify pgrst,'reload schema';
