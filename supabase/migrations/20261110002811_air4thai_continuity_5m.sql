-- Poll centrally every five minutes, offset from the hourly publication edge.
-- Keep the existing job identity and Vault-backed command; never create a
-- second writer or change the 60-minute observation freshness policy.
begin;

do $$
declare
  air4thai_job record;
begin
  select jobid, schedule, command, active into air4thai_job
  from cron.job
  where jobname = 'clearpath-air4thai-sync-30m';

  if air4thai_job.jobid is null
    or air4thai_job.command not like '%/api/cron/sync%'
    or not air4thai_job.active then
    raise exception 'Expected active ClearPath Air4Thai job was not found';
  end if;

  if air4thai_job.schedule = '2-57/5 * * * *' then
    return;
  end if;
  if air4thai_job.schedule <> '17,47 * * * *' then
    raise exception 'ClearPath Air4Thai schedule is unexpected';
  end if;

  perform cron.alter_job(air4thai_job.jobid, schedule := '2-57/5 * * * *');
end
$$;

commit;
