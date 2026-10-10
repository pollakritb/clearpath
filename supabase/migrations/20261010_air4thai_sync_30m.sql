-- Change only the existing ClearPath Air4Thai primary job to a 30-minute cadence.
-- Keep its Vault-backed request command and all observation tables untouched.

begin;

do $$
declare
  old_job record;
  new_job record;
begin
  select jobid, command into old_job
  from cron.job
  where jobname = 'clearpath-air4thai-sync-15m';

  select schedule, command into new_job
  from cron.job
  where jobname = 'clearpath-air4thai-sync-30m';

  if old_job.jobid is null then
    if new_job.schedule = '2,32 * * * *'
      and new_job.command like '%/api/cron/sync%' then
      return; -- Already updated in the ClearPath SQL Editor.
    end if;
    raise exception 'Expected ClearPath Air4Thai job was not found';
  end if;

  if old_job.command not like '%/api/cron/sync%' or new_job.schedule is not null then
    raise exception 'ClearPath Air4Thai job state is unexpected';
  end if;

  perform cron.unschedule(old_job.jobid);
  perform cron.schedule(
    'clearpath-air4thai-sync-30m',
    '2,32 * * * *',
    old_job.command
  );
end
$$;

commit;
