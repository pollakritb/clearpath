-- Run only on the chosen staging/production project after schema and application rollout.
-- Reuses existing Vault names; never put secret values in source control.
-- Feature remains disabled until MEASUREMENT_REQUESTS_ENABLED=true on the API.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='clearpath_production_url' and decrypted_secret ~ '^https://[^/]+/?$') then
  raise exception 'Vault clearpath_production_url must identify the intended environment';
 end if;
 if not exists(select 1 from vault.decrypted_secrets where name='clearpath_supabase_cron_secret' and length(decrypted_secret)>=32) then
  raise exception 'Vault clearpath_supabase_cron_secret is missing';
 end if;
end $$;
select cron.schedule('clearpath-measurement-requests','* * * * *', $job$
 select net.http_get(
  url:=rtrim((select decrypted_secret from vault.decrypted_secrets where name='clearpath_production_url' limit 1),'/')||'/api/cron/measurement-requests',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='clearpath_supabase_cron_secret' limit 1),'User-Agent','ClearPath-Measurement-Cron/1.0'),
  timeout_milliseconds:=60000
 );
$job$);
commit;
-- Disable later with: select cron.unschedule('clearpath-measurement-requests');
