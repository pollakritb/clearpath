-- Primary production Air4Thai scheduler. GitHub Actions remains an hourly backup.
-- Secret values are provisioned in the ClearPath Supabase Vault and never stored here.

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'clearpath_production_url'
      and decrypted_secret ~ '^https://[^/]+/?$'
  ) then
    raise exception 'Vault secret clearpath_production_url is missing or invalid';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'clearpath_supabase_cron_secret'
      and length(decrypted_secret) >= 32
  ) then
    raise exception 'Vault secret clearpath_supabase_cron_secret is missing or too short';
  end if;
end
$$;

select cron.schedule(
  'clearpath-air4thai-sync-15m',
  '2,17,32,47 * * * *',
  $job$
  select net.http_get(
    url := rtrim(
      (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'clearpath_production_url'
        limit 1
      ),
      '/'
    ) || '/api/cron/sync',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'clearpath_supabase_cron_secret'
        limit 1
      ),
      'User-Agent',
      'ClearPath-Supabase-Cron/1.0'
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

commit;
