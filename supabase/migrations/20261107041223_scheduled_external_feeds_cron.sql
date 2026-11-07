-- Dispatcher runs every five minutes; durable due times enforce hourly news,
-- half-hourly FIRMS, and 5/15-minute retries without sleeping in a function.
begin;
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='clearpath_production_url' and decrypted_secret ~ '^https://[^/]+/?$')
    or not exists (select 1 from vault.decrypted_secrets where name='clearpath_supabase_cron_secret' and length(decrypted_secret)>=32) then
    raise exception 'External feed cron requires the existing ClearPath URL and server token in Vault';
  end if;
end $$;
select cron.schedule(
  'clearpath-external-feeds',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets
      where name='clearpath_production_url' limit 1), '/') || '/api/cron/external-feeds',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets
        where name='clearpath_supabase_cron_secret' limit 1)),
    timeout_milliseconds := 60000
  );
  $job$
);
commit;
