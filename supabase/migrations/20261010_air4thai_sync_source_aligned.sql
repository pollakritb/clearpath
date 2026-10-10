-- Air4Thai usually publishes the new hourly observation after :02.
-- Keep the 30-minute cadence, but fetch at :17/:47 to reduce stale windows.

begin;

do $$
declare
  air4thai_job record;
begin
  select jobid, schedule, command into air4thai_job
  from cron.job
  where jobname = 'clearpath-air4thai-sync-30m';

  if air4thai_job.jobid is null
    or air4thai_job.command not like '%/api/cron/sync%' then
    raise exception 'Expected ClearPath Air4Thai job was not found';
  end if;

  if air4thai_job.schedule = '17,47 * * * *' then
    return;
  end if;

  if air4thai_job.schedule <> '2,32 * * * *' then
    raise exception 'ClearPath Air4Thai schedule is unexpected';
  end if;

  perform cron.alter_job(air4thai_job.jobid, schedule := '17,47 * * * *');
end
$$;

commit;
