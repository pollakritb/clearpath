-- Resolve profile-only fields inside the table-specific branch.
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
  if tg_table_name='profiles' then
   if new.auth_user_id is distinct from old.auth_user_id then
   if new.auth_user_id is not null or old.deletion_started_at is null or not exists(
    select 1 from private.account_erasure_jobs j where j.user_id=old.id and j.completed_at is null
   ) then raise exception 'profile_auth_link_immutable'; end if;
   end if;
  end if;
 elsif context->>'entity'=tg_table_name then
  key:=(context->>'key')::uuid;
  select numeric_id into remembered from private.identifier_aliases where entity=tg_table_name and legacy_id=key;
  if remembered is not null then new.id:=remembered; end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_numeric_identity() from public,anon,authenticated;

