-- Remove compatibility columns from public tables; retain retry/privacy mappings privately.
-- Metadata-only cutover. Requires a verified v2 backup and paused application writes.
set local lock_timeout='5s';
set local statement_timeout='90s';
set local clearpath.identifier_migration='approved';
do $$ begin
 if not exists(select 1 from private.identifier_control where version=2 and maintenance) then
  raise exception 'clean_identifiers_requires_v2_maintenance'; end if;
end $$;
alter table private.identifier_control drop constraint identifier_control_version_check;
alter table private.identifier_control add constraint identifier_control_version_check check(version in (1,2,3));

create or replace function private.protect_numeric_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare context jsonb := nullif(current_setting('clearpath.identifier_retry',true),'')::jsonb;
 key uuid;
 remembered bigint;
begin
 if tg_table_name='community_xp_accounts' then
  if tg_op='UPDATE' then new.member_id:=old.member_id; end if;
 elsif tg_op='UPDATE' then
  new.id:=old.id;
  if tg_table_name='profiles' then
   if new.auth_user_id is distinct from old.auth_user_id then raise exception 'profile_auth_link_immutable'; end if;
  end if;
 elsif context->>'entity'=tg_table_name then
  key:=(context->>'key')::uuid;
  select numeric_id into remembered from private.identifier_aliases where entity=tg_table_name and legacy_id=key;
  if remembered is not null then new.id:=remembered; end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_numeric_identity() from public,anon,authenticated;

create or replace function private.remember_identifier() returns trigger
language plpgsql security definer set search_path='' as $$
declare context jsonb := nullif(current_setting('clearpath.identifier_retry',true),'')::jsonb;
 entity_name text:=tg_table_name; value bigint; label text; key uuid;
begin
 if tg_table_name='community_xp_accounts' then
  entity_name:='community_members'; value:=new.member_id; label:=new.member_code;
 else value:=new.id; label:=new.code; end if;
 if exists(select 1 from private.identifier_aliases where entity=entity_name and numeric_id=value) then return new; end if;
 if tg_table_name='profiles' then key:=new.auth_user_id;
 elsif context->>'entity'=entity_name then key:=(context->>'key')::uuid;
 else key:=gen_random_uuid(); end if;
 insert into private.identifier_aliases(entity,legacy_id,numeric_id,code)
 values(entity_name,key,value,label);
 return new;
end $$;
revoke all on function private.remember_identifier() from public,anon,authenticated;

create function private.insert_identified_row(p_table text,p_row jsonb,p_key uuid default null,
 p_conflict text[] default array['id'],p_mode text default 'insert') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cols text; assignments text; conflict_cols text; predicates text; target regclass;
 result jsonb; previous_context text:=coalesce(current_setting('clearpath.identifier_retry',true),'');
 remembered bigint; body jsonb:=p_row-'legacy_id'-'legacy_notification_id'-'code'-'member_code';
 allowed constant text[]:=array['profiles','capture_sessions','report_drafts','community_reports',
 'report_comments','measurement_requests','user_notifications','notification_outbox','alert_events',
 'announcements','activities','data_issue_reports','public_map_events','sync_runs',
 'forecast_provider_sync_runs','forecast_provider_snapshots','cams_grid_generations','cams_grid_jobs','community_xp_events'];
 statement text;
begin
 if not p_table=any(allowed) or p_mode not in ('insert','upsert','ignore') or jsonb_typeof(body)<>'object' then
  raise exception 'invalid_identifier_insert'; end if;
 if body->>'id' is not null then raise exception 'numeric_identity_is_database_generated'; end if;
 body:=body-'id'; target:=to_regclass(format('public.%I',p_table));
 if p_table='profiles' then
  if p_key is not null and p_key<>(body->>'auth_user_id')::uuid then raise exception 'profile_auth_link_invalid'; end if;
  p_key:=(body->>'auth_user_id')::uuid;
 end if;
 if p_key is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_table||':'||p_key::text,0));
  select numeric_id into remembered from private.identifier_aliases where entity=p_table and legacy_id=p_key;
 end if;
 if p_table='profiles' and remembered is not null and p_mode='insert' then
  select to_jsonb(t) into result from public.profiles t where id=remembered and auth_user_id=p_key;
  if result is not null then return result; end if;
 end if;
 if exists(select 1 from jsonb_object_keys(body) k where not exists(select 1 from pg_attribute a where
  a.attrelid=target and a.attname=k and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity='')) then
  raise exception 'invalid_identifier_insert_column'; end if;
 select string_agg(format('%I',k),',' order by k),
 string_agg(format('%I=excluded.%I',k,k),',' order by k) into cols,assignments from jsonb_object_keys(body) k;
 if cols is null then raise exception 'empty_identifier_insert'; end if;
 if p_mode<>'insert' then
  if coalesce(cardinality(p_conflict),0)=0 or exists(select 1 from unnest(p_conflict) k
    where not exists(select 1 from pg_attribute a where a.attrelid=target and a.attname=k and not a.attisdropped)) then
   raise exception 'invalid_identifier_conflict'; end if;
  select string_agg(format('%I',k),','),string_agg(format('t.%I is not distinct from s.%I',k,k),' and ')
   into conflict_cols,predicates from unnest(p_conflict) k;
 end if;
 perform set_config('clearpath.identifier_retry',case when p_key is null then '{}' else
  jsonb_build_object('entity',p_table,'key',p_key)::text end,true);
 statement:=format('insert into public.%I as inserted(%s) select %s from jsonb_populate_record(null::public.%I,$1)',p_table,cols,cols,p_table);
 if p_mode='ignore' then statement:=statement||format(' on conflict(%s) do nothing',conflict_cols);
 elsif p_mode='upsert' then statement:=statement||format(' on conflict(%s) do update set %s',conflict_cols,assignments); end if;
 begin
  execute statement||' returning to_jsonb(inserted)' into result using body;
  if result is null and p_mode='ignore' then
   if remembered is not null and p_conflict=array['id'] then
    execute format('select to_jsonb(t) from public.%I t where id=$1',p_table) into result using remembered;
   else
    execute format('select to_jsonb(t) from public.%I t cross join jsonb_populate_record(null::public.%I,$1) s where %s limit 1',p_table,p_table,predicates) into result using body;
   end if;
  end if;
 exception when others then perform set_config('clearpath.identifier_retry',previous_context,true); raise;
 end;
 perform set_config('clearpath.identifier_retry',previous_context,true);
 return result;
end $$;
revoke all on function private.insert_identified_row(text,jsonb,uuid,text[],text) from public,anon,authenticated;
grant execute on function private.insert_identified_row(text,jsonb,uuid,text[],text) to service_role;

create function public.identifier_insert(p_table text,p_rows jsonb,p_keys jsonb,
 p_conflict text default null,p_upsert boolean default false,p_ignore boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb:='[]'; row_value jsonb; key_value text; saved jsonb; i integer:=0;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_typeof(p_keys)<>'array' or jsonb_array_length(p_rows)<>jsonb_array_length(p_keys)
 or jsonb_array_length(p_rows)>200 then raise exception 'invalid_identifier_batch'; end if;
 for row_value in select value from jsonb_array_elements(p_rows) loop
  key_value:=p_keys->>i;
  saved:=private.insert_identified_row(p_table,row_value,nullif(key_value,'')::uuid,
   string_to_array(coalesce(p_conflict,'id'),','),case when p_ignore then 'ignore' when p_upsert then 'upsert' else 'insert' end);
  if saved is not null then result:=result||jsonb_build_array(saved); end if;
  i:=i+1;
 end loop;
 return result;
end $$;
revoke all on function public.identifier_insert(text,jsonb,jsonb,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.identifier_insert(text,jsonb,jsonb,text,boolean,boolean) to service_role;

create function public.identifier_resolve_many(p_entity text,p_values text[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(a)-'entity'),'[]'::jsonb) from private.identifier_aliases a
 where cardinality(p_values)<=500 and entity=p_entity and
 (numeric_id::text=any(p_values) or code=any(p_values) or legacy_id::text=any(p_values))
$$;
revoke all on function public.identifier_resolve_many(text,text[]) from public,anon,authenticated;
grant execute on function public.identifier_resolve_many(text,text[]) to service_role;

create function private.identifier_alias(p_entity text,p_number bigint) returns uuid
language sql stable security invoker set search_path='' as $$
 select legacy_id from private.identifier_aliases where entity=p_entity and numeric_id=p_number
$$;
revoke all on function private.identifier_alias(text,bigint) from public,anon,authenticated;
grant execute on function private.identifier_alias(text,bigint) to service_role;

CREATE OR REPLACE FUNCTION public.moderate_community_report_v2(p_report_id bigint, p_admin_id bigint, p_decision text, p_verified_pm25 double precision, p_rejection_reason_code text, p_checks jsonb, p_note text, p_trust_score double precision, p_trust_reasons jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target community_reports%ROWTYPE;
  updated community_reports%ROWTYPE;
  next_status TEXT;
  event_points INTEGER := 0;
  invalid_rejects INTEGER := 0;
  event_reason TEXT;
  notification_id bigint;
  dedupe_key TEXT;
BEGIN
  SELECT * INTO target FROM community_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
  IF target.status <> 'pending' THEN RAISE EXCEPTION 'report_already_moderated'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  next_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  IF next_status = 'approved' THEN
    IF p_verified_pm25 IS NULL THEN RAISE EXCEPTION 'verified_pm25_required'; END IF;
    IF NOT COALESCE((p_checks->>'image_clear')::BOOLEAN, FALSE)
       OR NOT COALESCE((p_checks->>'value_matches_display')::BOOLEAN, FALSE)
       OR NOT COALESCE((p_checks->>'location_plausible')::BOOLEAN, FALSE)
       OR NOT COALESCE((p_checks->>'no_screen_recapture_signs')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'moderation_checklist_incomplete';
    END IF;
  ELSIF p_rejection_reason_code IS NULL THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE community_reports
  SET status = next_status,
      pm25 = CASE WHEN next_status = 'approved' THEN p_verified_pm25 ELSE NULL END,
      admin_verified_pm25 = CASE WHEN next_status = 'approved' THEN p_verified_pm25 ELSE NULL END,
      base_trust_score = CASE WHEN next_status = 'approved' THEN p_trust_score ELSE base_trust_score END,
      trust_score = CASE WHEN next_status = 'approved' THEN p_trust_score ELSE trust_score END,
      trust_reasons = CASE WHEN next_status = 'approved' THEN p_trust_reasons ELSE trust_reasons END,
      moderated_by = p_admin_id,
      moderation_note = p_note,
      rejection_reason_code = CASE WHEN next_status = 'rejected' THEN p_rejection_reason_code ELSE NULL END,
      moderation_checks = COALESCE(p_checks, '{}'::jsonb),
      moderated_at = NOW(),
      updated_at = NOW(),
      retention_until = NOW() + CASE WHEN next_status = 'approved' THEN INTERVAL '180 days' ELSE INTERVAL '30 days' END,
      policy_version = 'trust-v2'
  WHERE id = p_report_id
  RETURNING * INTO updated;

  UPDATE report_evidence
  SET retention_until = updated.retention_until
  WHERE report_id = p_report_id;

  IF next_status = 'approved' THEN
    event_points := 10;
    event_reason := 'report_approved';
    INSERT INTO public_map_events(event_type, entity_id)
    VALUES ( 'report_approved', p_report_id);
  ELSIF p_rejection_reason_code IN (
    'value_mismatch', 'suspected_screen_recapture', 'invalid_location', 'duplicate'
  ) THEN
    SELECT COUNT(*) INTO invalid_rejects
    FROM reputation_events
    WHERE user_id = target.user_id AND reason = 'report_rejected_invalid';
    event_points := -5 - LEAST(invalid_rejects * 2, 10);
    event_reason := 'report_rejected_invalid';
  ELSE
    event_points := 0;
    event_reason := 'report_rejected_technical';
  END IF;
  PERFORM apply_reputation_event(
    target.user_id, event_points, event_reason, target.id,
    'moderation:v2:' || private.identifier_alias('community_reports',target.id)::text
  );

  IF COALESCE((
    SELECT report_status_alerts FROM notification_preferences
    WHERE user_id = target.user_id
  ), TRUE) THEN
    dedupe_key := 'report_status:' || private.identifier_alias('community_reports',target.id)::text;
    INSERT INTO user_notifications(
    user_id, event_type, title, body, url, entity_type, entity_id,
    payload, deduplication_key
  ) VALUES (
    target.user_id, 'report_status',
    CASE WHEN next_status = 'approved' THEN 'รายงานได้รับการอนุมัติ' ELSE 'รายงานไม่ผ่านการตรวจ' END,
    CASE WHEN next_status = 'approved'
      THEN 'ข้อมูล PM2.5 ของคุณเผยแพร่บนแผนที่แล้ว'
      ELSE 'เปิดดูเหตุผลและคำแนะนำก่อนส่งรายงานครั้งถัดไป' END,
    '/', 'community_report', target.id::text,
    jsonb_build_object('status', next_status, 'reason_code', p_rejection_reason_code),
    dedupe_key
    ) ON CONFLICT (user_id, deduplication_key) DO NOTHING;
    SELECT id INTO notification_id FROM user_notifications
    WHERE user_id = target.user_id AND deduplication_key = dedupe_key;
    INSERT INTO notification_outbox(user_id, notification_id, event_key, payload)
    VALUES (
      target.user_id, notification_id, dedupe_key,
      jsonb_build_object('title', CASE WHEN next_status = 'approved' THEN 'รายงานได้รับการอนุมัติ' ELSE 'รายงานไม่ผ่านการตรวจ' END, 'url', '/')
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;

  INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES (
    p_admin_id, 'report_' || next_status, 'community_report', target.id::text,
    jsonb_build_object(
      'note', p_note,
      'verified_pm25', p_verified_pm25,
      'rejection_reason_code', p_rejection_reason_code,
      'checks', p_checks,
      'policy_version', 'trust-v2'
    )
  );
  RETURN to_jsonb(updated);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.moderate_community_report(p_report_id bigint, p_admin_id bigint, p_decision text, p_verified_pm25 double precision, p_note text, p_trust_score double precision, p_trust_reasons jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target community_reports%ROWTYPE;
  updated community_reports%ROWTYPE;
  next_status TEXT;
  event_points INTEGER;
BEGIN
  SELECT * INTO target FROM community_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;
  IF target.status <> 'pending' THEN RAISE EXCEPTION 'report_already_moderated'; END IF;
  next_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  IF next_status = 'approved' AND p_verified_pm25 IS NULL THEN
    RAISE EXCEPTION 'verified_pm25_required';
  END IF;
  UPDATE community_reports
  SET status = next_status,
      pm25 = CASE WHEN next_status = 'approved' THEN p_verified_pm25 ELSE NULL END,
      base_trust_score = CASE WHEN next_status = 'approved' THEN p_trust_score ELSE base_trust_score END,
      trust_score = CASE WHEN next_status = 'approved' THEN p_trust_score ELSE trust_score END,
      trust_reasons = CASE WHEN next_status = 'approved' THEN p_trust_reasons ELSE trust_reasons END,
      moderated_by = p_admin_id,
      moderation_note = p_note,
      moderated_at = NOW(),
      updated_at = NOW(),
      retention_until = NOW() + CASE WHEN next_status = 'approved' THEN INTERVAL '180 days' ELSE INTERVAL '30 days' END
  WHERE id = p_report_id
  RETURNING * INTO updated;
  event_points := CASE WHEN next_status = 'approved' THEN 10 ELSE -5 END;
  PERFORM apply_reputation_event(
    target.user_id, event_points, 'report_' || next_status, target.id,
    'moderation:' || private.identifier_alias('community_reports',target.id)::text
  );
  INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES (
    p_admin_id, 'report_' || next_status, 'community_report', target.id::text,
    jsonb_build_object('note', p_note, 'verified_pm25', p_verified_pm25)
  );
  RETURN to_jsonb(updated);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_measurement_request(p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.measurement_requests; owner bigint := (p_row->>'user_id')::bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('measurement:'||owner::text, 0));
 select * into r from public.measurement_requests where user_id=owner and
 (idempotency_key=(p_row->>'idempotency_key')::uuid or
 (fingerprint=p_row->>'fingerprint' and status in ('scheduled','active') and expires_at>now()))
 order by created_at limit 1;
 if found then return jsonb_build_object('row',to_jsonb(r)); end if;
 if (select count(*) from public.measurement_requests where user_id=owner and
 created_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')) >= 3 then
 return jsonb_build_object('error','daily_limit'); end if;
 if (select count(*) from public.measurement_requests where user_id=owner and status in ('scheduled','active') and expires_at>now()) >= 2 then
 return jsonb_build_object('error','active_limit'); end if;
 r:=jsonb_populate_record(null::public.measurement_requests,private.insert_identified_row('measurement_requests',p_row,(p_row->>'legacy_id')::uuid));
 return jsonb_build_object('row',to_jsonb(r));
end $function$;

CREATE OR REPLACE FUNCTION public.notify_measurement_request(p_notification jsonb, p_outbox jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare req public.measurement_requests; target bigint := (p_notification->>'user_id')::bigint;
begin
 select * into req from public.measurement_requests where id=private.identifier_number('measurement_requests',p_notification->>'entity_id') for update;
 if not found then return false; end if;
 if p_notification->>'event_type'='measurement_request' then
  if req.status <> 'active' or req.starts_at>now() or req.expires_at<=now() or target=req.user_id then return false; end if;
  if not exists(select 1 from public.measurement_helper_presence where user_id=target and enabled) then return false; end if;
  if exists(select 1 from public.measurement_request_recipients where request_id=req.id and user_id=target and declined) then return false; end if;
  insert into public.measurement_request_recipients(request_id,user_id,matched_location_at)
  values(req.id,target,(p_notification->'payload'->>'matched_location_at')::timestamptz) on conflict do nothing;
 else
  if target<>req.user_id or req.status not in ('fulfilled','expired') then return false; end if;
 end if;
 perform private.insert_identified_row('user_notifications',p_notification,(p_notification->>'legacy_id')::uuid,array['user_id','deduplication_key'],'ignore');
 if p_outbox is not null then
 perform private.insert_identified_row('notification_outbox',p_outbox || jsonb_build_object('notification_id',(select id from public.user_notifications where user_id=target and deduplication_key=p_notification->>'deduplication_key')),(p_outbox->>'legacy_id')::uuid,array['event_key'],'ignore');
 end if;
 return true;
end $function$;

do $$ declare r record; begin
 for r in select n.nspname,c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
 join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgname='identifiers_sync' loop
  execute format('drop trigger %I on %I.%I',r.tgname,r.nspname,r.relname);
 end loop;
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and (p.proname like 'numeric_identifiers_%' or p.proname like 'identifiers_%') loop
  execute 'drop function '||r.signature;
 end loop;
 for r in select table_name,column_name from information_schema.columns where table_schema='public'
 and left(column_name,7)='legacy_' order by table_name,column_name loop
  execute format('alter table public.%I drop column %I',r.table_name,r.column_name);
 end loop;
 for r in select distinct c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid
 join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgname='identifiers_remember' loop
  execute format('create trigger identifiers_sync before insert or update on public.%I for each row execute function private.protect_numeric_identity()',r.relname);
 end loop;
end $$;
update private.identifier_control set version=3 where singleton;
notify pgrst,'reload schema';
