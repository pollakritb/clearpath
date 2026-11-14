-- Account closure must not block expiry cleanup or server-derived public counters.
-- Owner content/identity remains frozen. No new Admin/Moderator capabilities.
create or replace function private.reject_closed_account_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare closed timestamptz;
 -- Generated code is computed after BEFORE triggers, not user-writable.
 projection_fields constant text[] := array['code','updated_at','peer_up','peer_down','like_count','dislike_count','comment_count','rating_count','rating_average','trust_score','base_trust_score','trust_reasons'];
 purge_fields constant text[] := array['code','updated_at','lat','lon','gps_accuracy_m','image_path','image_metadata','image_sha256','image_ahash','burst_hashes','ocr_raw_text','evidence_purged_at'];
begin
 if current_setting('clearpath.account_erasure',true)='true' then return new; end if;
 select deletion_started_at into closed from public.profiles where id=new.user_id for share;
 if closed is null then return new; end if;
 if tg_table_name='community_reports' then
  if tg_op='UPDATE' then
   -- Public reactions/trust are derived from other active users and existing
   -- automated reconciliation. Neither report content nor identity may change.
   if (to_jsonb(new)-projection_fields)=(to_jsonb(old)-projection_fields) then return new; end if;
   -- The retention worker clears report_evidence first. Permit only matching,
   -- expired, non-held cleanup and require private fields to stay erased.
   if not old.audit_hold
    and new.evidence_purged_at is not null
    and new.lat is not distinct from old.public_lat
    and new.lon is not distinct from old.public_lon
    and new.gps_accuracy_m is null and new.image_path is null
    and new.image_metadata='{}'::jsonb and new.image_sha256 is null
    and new.image_ahash is null and new.burst_hashes='[]'::jsonb
    and new.ocr_raw_text is null
    and (to_jsonb(new)-purge_fields)=(to_jsonb(old)-purge_fields)
    and exists(select 1 from public.report_evidence e where e.report_id=old.id
      and not e.audit_hold and e.retention_until<=now() and e.purged_at is not null)
   then return new; end if;
  end if;
 end if;
 raise exception 'account_closed';
end $$;
revoke all on function private.reject_closed_account_write() from public,anon,authenticated;
