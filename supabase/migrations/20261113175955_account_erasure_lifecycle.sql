-- Owner-confirmed account closure. No Administrator mutation capability.
-- Published measurements and audit/XP ledgers retain their existing retention;
-- their profile becomes a tombstone, detached from Google/Auth identity.
set local lock_timeout = '5s';
create table if not exists public.account_privacy_requests (
 id uuid primary key default gen_random_uuid(),
 user_id bigint not null references public.profiles(id),
 status text not null default 'pending' check(status in ('pending','processing','completed','cancelled')),
 created_at timestamptz not null default now(), completed_at timestamptz,
 check((status='completed')=(completed_at is not null))
);
create unique index if not exists account_privacy_one_open on public.account_privacy_requests(user_id) where status in ('pending','processing');
create index if not exists account_privacy_owner on public.account_privacy_requests(user_id,created_at desc);
alter table public.account_privacy_requests enable row level security;
revoke all on public.account_privacy_requests from public,anon,authenticated,service_role;
grant select on public.account_privacy_requests to service_role;

alter table public.profiles add column deletion_started_at timestamptz;
alter table public.profiles alter column auth_user_id drop not null;
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles add constraint profiles_id_fkey foreign key(auth_user_id) references auth.users(id) on delete set null;
create table private.account_erasure_jobs (
 request_id uuid primary key references public.account_privacy_requests(id),
 user_id bigint not null unique references public.profiles(id),
 auth_user_id uuid, image_paths jsonb not null default '[]',
 completed_at timestamptz
);
alter table private.account_erasure_jobs enable row level security;
revoke all on private.account_erasure_jobs from public,anon,authenticated,service_role;

-- Preserve immutable numeric identity. Only a confirmed closure may unlink Auth.
create or replace function private.protect_numeric_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare context jsonb := nullif(current_setting('clearpath.identifier_retry',true),'')::jsonb;
 key uuid; remembered bigint;
begin
 if tg_table_name='community_xp_accounts' then
  if tg_op='UPDATE' then new.member_id:=old.member_id; end if;
 elsif tg_op='UPDATE' then
  new.id:=old.id;
  if tg_table_name='profiles' then
   if old.deletion_started_at is not null then
    new.display_name:='บัญชีที่ลบแล้ว'; new.avatar_url:=null;
    new.identity_provider:=null; new.role:='user'; new.deletion_started_at:=old.deletion_started_at;
   end if;
  end if;
  if tg_table_name='profiles' and new.auth_user_id is distinct from old.auth_user_id then
   if new.auth_user_id is not null or old.deletion_started_at is null or not exists(
    select 1 from private.account_erasure_jobs j where j.user_id=old.id and j.completed_at is null
   ) then raise exception 'profile_auth_link_immutable'; end if;
  end if;
 elsif context->>'entity'=tg_table_name then
  key:=(context->>'key')::uuid;
  select numeric_id into remembered from private.identifier_aliases where entity=tg_table_name and legacy_id=key;
  if remembered is not null then new.id:=remembered; end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_numeric_identity() from public,anon,authenticated;

create or replace function public.request_account_erasure(p_user bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.account_privacy_requests; subject public.profiles; paths jsonb;
begin
 perform set_config('clearpath.account_erasure','true',true);
 select * into strict subject from public.profiles where id=p_user for update;
 select * into result from public.account_privacy_requests where user_id=p_user and status in ('pending','processing');
 if found then return to_jsonb(result)-'user_id'; end if;
 if subject.auth_user_id is null or subject.deletion_started_at is not null then raise exception 'account_closed'; end if;
 insert into public.account_privacy_requests(user_id,status) values(p_user,'processing') returning * into result;
 select coalesce(jsonb_agg(distinct path),'[]') into paths from (
  select image_path path from public.report_drafts where user_id=p_user and submitted_at is null
  union select original_image_path from public.report_drafts where user_id=p_user and submitted_at is null
 ) files where path is not null and not exists(select 1 from public.community_reports r where r.image_path=files.path);
 insert into private.account_erasure_jobs(request_id,user_id,auth_user_id,image_paths)
 values(result.id,p_user,subject.auth_user_id,paths);
 update public.profiles set deletion_started_at=now(),display_name='บัญชีที่ลบแล้ว',avatar_url=null,identity_provider=null,role='user' where id=p_user;
 update public.community_reports set display_name='บัญชีที่ลบแล้ว',reporter_avatar_url=null,anonymous_alias=null,show_reporter_profile=false where user_id=p_user;
 update public.community_xp_accounts set alias='บัญชีที่ลบแล้ว',hidden=true,identity_mode='alias' where user_id=p_user;
 -- Stop queued delivery immediately; downstream workers cannot send new messages.
 delete from public.notification_outbox where user_id=p_user;
 delete from public.line_user_event_cursors where line_user_id in (select line_user_id from public.line_notification_links where user_id=p_user);
 delete from public.line_webhook_inbox where event->'source'->>'userId' in (select line_user_id from public.line_notification_links where user_id=p_user);
 delete from public.line_notification_links where user_id=p_user;
 delete from public.notification_preferences where user_id=p_user;
 delete from public.measurement_helper_locations where user_id=p_user;
 delete from public.measurement_helper_presence where user_id=p_user;
 return to_jsonb(result)-'user_id';
end $$;

create function public.pending_account_erasures(p_limit integer default 10, p_request uuid default null) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(j)),'[]') from (
  select * from private.account_erasure_jobs where completed_at is null and (p_request is null or request_id=p_request) order by request_id limit least(greatest(p_limit,1),50)
 ) j
$$;

create function public.complete_account_erasure(p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.account_erasure_jobs; result public.account_privacy_requests;
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
  delete from public.report_comments where user_id=job.user_id;
  update public.community_reports r set comment_count=(select count(*) from public.report_comments c where c.report_id=r.id and c.status='published')
   where r.comment_count<>(select count(*) from public.report_comments c where c.report_id=r.id and c.status='published');
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

revoke all on function public.request_account_erasure(bigint), public.pending_account_erasures(integer,uuid), public.complete_account_erasure(uuid) from public,anon,authenticated;
grant execute on function public.request_account_erasure(bigint), public.pending_account_erasures(integer,uuid), public.complete_account_erasure(uuid) to service_role;

-- Serialize in-flight writes with the profile lock taken by closure. Once marked,
-- neither stale API requests nor a refreshed JWT can recreate personal data.
create function private.reject_closed_account_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare closed timestamptz;
begin
 if current_setting('clearpath.account_erasure',true)='true' then return new; end if;
 select deletion_started_at into closed from public.profiles where id=new.user_id for share;
 if closed is not null then raise exception 'account_closed'; end if;
 return new;
end $$;
revoke all on function private.reject_closed_account_write() from public,anon,authenticated;
do $$ declare target text; begin
 foreach target in array array['community_reports','report_drafts','capture_sessions','report_comments',
 'report_reactions','measurement_requests','measurement_helper_locations','measurement_helper_presence',
 'notification_preferences','notification_outbox','user_notifications','line_notification_links',
 'air_alert_locations','air_alert_states','measurement_notification_batches','measurement_request_recipients'] loop
 execute format('create trigger reject_closed_account_write before insert or update on public.%I for each row execute function private.reject_closed_account_write()',target);
 end loop;
end $$;
