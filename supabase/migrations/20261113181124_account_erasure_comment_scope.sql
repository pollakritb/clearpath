-- Only update comment counts on reports where this owner removed comments.
create or replace function public.complete_account_erasure(p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.account_erasure_jobs; result public.account_privacy_requests; comment_reports bigint[];
begin
 perform set_config('clearpath.account_erasure','true',true);
 select * into strict job from private.account_erasure_jobs where request_id=p_request for update;
 if job.completed_at is null then
  if exists(select 1 from auth.users where id=job.auth_user_id) then raise exception 'auth_deletion_not_completed'; end if;
  -- No Auth identity remains. Clear private settings and free-form owner content.
  delete from public.notification_outbox where user_id=job.user_id;
  delete from public.user_notifications where user_id=job.user_id;
  delete from public.line_notification_links where user_id=job.user_id;
  delete from public.notification_preferences where user_id=job.user_id;
  delete from public.air_alert_locations where user_id=job.user_id;
  delete from public.air_alert_states where user_id=job.user_id;
  delete from public.measurement_helper_locations where user_id=job.user_id;
  delete from public.measurement_helper_presence where user_id=job.user_id;
  delete from public.measurement_notification_batches where user_id=job.user_id;
  delete from public.measurement_request_recipients where user_id=job.user_id;
  delete from public.report_drafts where user_id=job.user_id;
  select array_agg(distinct report_id) into comment_reports from public.report_comments where user_id=job.user_id;
  delete from public.report_comments where user_id=job.user_id;
  update public.community_reports r set comment_count=(select count(*) from public.report_comments c where c.report_id=r.id and c.status='published')
   where r.id=any(coalesce(comment_reports,array[]::bigint[])) and r.comment_count<>(select count(*) from public.report_comments c where c.report_id=r.id and c.status='published');
  update public.measurement_requests set place_name='พื้นที่ของบัญชีที่ลบแล้ว',lat=round(lat::numeric,2),lon=round(lon::numeric,2),fingerprint='',status=case when status in ('active','scheduled') then 'cancelled' else status end where user_id=job.user_id;
  update public.data_issue_reports set message='ลบข้อความตามคำขอเจ้าของบัญชี' where user_id=job.user_id;
  update public.profiles set display_name='บัญชีที่ลบแล้ว',avatar_url=null,identity_provider=null,role='user',auth_user_id=null where id=job.user_id;
  update private.identifier_aliases set legacy_id=gen_random_uuid() where entity='profiles' and numeric_id=job.user_id;
  update private.account_erasure_jobs set completed_at=now(),auth_user_id=null,image_paths='[]' where request_id=p_request;
  update public.account_privacy_requests set status='completed',completed_at=now() where id=p_request;
 end if;
 select * into strict result from public.account_privacy_requests where id=p_request;
 return to_jsonb(result)-'user_id';
end $$;

revoke all on function public.complete_account_erasure(uuid) from public,anon,authenticated;
grant execute on function public.complete_account_erasure(uuid) to service_role;
