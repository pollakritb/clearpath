begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Partial REST upserts must never reset an existing active link to column defaults.
create function public.issue_line_link_code(p_user bigint,p_hash text,p_expires timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('line-link-codes'));
 insert into public.line_notification_links(user_id,link_code_hash,link_code_expires_at)
 values(p_user,p_hash,p_expires)
 on conflict(user_id) do update set link_code_hash=excluded.link_code_hash,
  link_code_expires_at=excluded.link_code_expires_at,updated_at=now();
end $$;

create function public.reset_line_notification_link(p_user bigint) returns boolean
language plpgsql security invoker set search_path='' as $$
declare changed boolean;
begin
 perform pg_advisory_xact_lock(hashtext('line-link-codes'));
 delete from public.line_notification_links where user_id=p_user;
 changed:=found;
 update public.notification_preferences set line_enabled=false,updated_at=now() where user_id=p_user;
 update public.notification_outbox set status='dead',last_error='line_disconnected',processed_at=now(),lease_until=null,lease_token=null
 where user_id=p_user and status='pending' and payload->>'channel'='line';
 return changed;
end $$;

create function public.complete_line_link(p_code_hash text,p_line_user text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c public.line_notification_links;
begin
 if coalesce(p_line_user,'') !~ '^U[0-9a-fA-F]{32}$' then return false; end if;
 perform pg_advisory_xact_lock(hashtext('line-link-codes'));
 select * into c from public.line_notification_links where link_code_hash=p_code_hash and link_code_expires_at>now() for update;
 if not found or exists(select 1 from public.line_notification_links where line_user_id=p_line_user and active and user_id<>c.user_id) then return false; end if;
 -- An inactive historical binding must not hold the unique LINE user ID forever.
 update public.line_notification_links set line_user_id=null,linked_at=null,updated_at=now()
 where line_user_id=p_line_user and not active and user_id<>c.user_id;
 update public.line_notification_links set line_user_id=p_line_user,active=true,linked_at=now(),updated_at=now(),link_code_hash=null,link_code_expires_at=null where user_id=c.user_id;
 insert into public.notification_preferences(user_id,line_enabled,consent_granted,consent_granted_at)
 values(c.user_id,true,true,now()) on conflict(user_id) do update set line_enabled=true,consent_granted=true,consent_granted_at=now(),updated_at=now();
 update public.air_alert_states set revision=revision+1,evaluated_at='epoch',evaluation_lease_until=null where user_id=c.user_id;
 return true;
end $$;
create or replace function public.apply_line_webhook(p_event text,p_lease uuid,p_code_hash text) returns text
language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.line_webhook_inbox; c public.line_notification_links; target text; kind text; reply text;
begin
 select * into i from public.line_webhook_inbox where event_id=p_event and lease_token=p_lease and lease_until>now() for update;
 if not found then raise exception 'webhook_lease_lost'; end if;
 if i.applied then return i.reply_text; end if;
 target:=i.event->'source'->>'userId'; kind:=i.event->>'type';
 if coalesce(i.event->'source'->>'type','')<>'user' or coalesce(target,'') !~ '^U[0-9a-fA-F]{32}$' then
  update public.line_webhook_inbox set applied=true where event_id=p_event; return null;
 end if;
 perform pg_advisory_xact_lock(hashtext('line-user:'||target));
 if exists(select 1 from public.line_user_event_cursors where line_user_id=target and (event_at,event_id)>(i.event_at,i.event_id)) then
  update public.line_webhook_inbox set applied=true where event_id=p_event; return null;
 end if;
 insert into public.line_user_event_cursors values(target,i.event_at,i.event_id)
 on conflict(line_user_id) do update set event_at=excluded.event_at,event_id=excluded.event_id;
 if kind='unfollow' then
  update public.line_notification_links set active=false,updated_at=now() where line_user_id=target;
 elsif kind='follow' then
  reply:='เพิ่มเพื่อน ClearPath สำเร็จแล้ว กลับไปสร้างรหัสเชื่อมบัญชีจากหน้าแจ้งเตือนบนเว็บ';
 elsif kind='message' and i.event->'message'->>'type'='text' then
  if p_code_hash is null then
   reply:='กรุณาสร้างรหัสเชื่อม LINE จากหน้าแจ้งเตือนใน ClearPath แล้วส่งรหัส CP-XXXXXXXX ที่นี่';
  else
   perform pg_advisory_xact_lock(hashtext('line-link-codes'));
   if public.complete_line_link(p_code_hash,target) then
    reply:='เชื่อม LINE กับ ClearPath สำเร็จแล้ว';
   else reply:='รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่จาก ClearPath'; end if;
  end if;
 end if;
 update public.line_webhook_inbox set applied=true,reply_text=reply where event_id=p_event;
 return reply;
end $$;
revoke all on function public.apply_line_webhook(text,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_line_webhook(text,uuid,text) to service_role;


revoke all on function public.issue_line_link_code(bigint,text,timestamptz),public.reset_line_notification_link(bigint),public.complete_line_link(text,text) from public,anon,authenticated;
grant execute on function public.issue_line_link_code(bigint,text,timestamptz),public.reset_line_notification_link(bigint),public.complete_line_link(text,text) to service_role;
notify pgrst,'reload schema';
commit;
