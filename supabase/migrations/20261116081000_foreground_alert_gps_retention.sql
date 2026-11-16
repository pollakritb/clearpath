-- Expire alert GPS independently of the LINE daemon. Each account retains only
-- its latest location; no location history is introduced by this job.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Serialize opt-out deletion with set_air_alert_location's preference-row lock.
create function private.clear_disabled_air_alert_location() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not new.air_alerts or not new.consent_granted then
    delete from public.air_alert_locations where user_id=new.user_id;
  end if;
  return new;
end $$;
revoke all on function private.clear_disabled_air_alert_location() from public,anon,authenticated;
grant execute on function private.clear_disabled_air_alert_location() to service_role;
create trigger clear_disabled_air_alert_location
after insert or update of air_alerts,consent_granted on public.notification_preferences
for each row execute function private.clear_disabled_air_alert_location();
delete from public.air_alert_locations
where observed_at < now() - interval '24 hours';
select cron.schedule(
  'clearpath-air-alert-location-retention',
  '23 * * * *',
  $job$delete from public.air_alert_locations
        where observed_at < now() - interval '24 hours';$job$
);
