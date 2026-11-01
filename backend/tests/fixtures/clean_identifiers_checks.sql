-- Synthetic integration checks; no production data or credentials.
do $$
declare original jsonb; replay jsonb; cap jsonb; report jsonb; req jsonb; notice jsonb; outbox jsonb;
 key uuid:='90000000-0000-4000-8000-000000000001';
 report_key uuid:='90000000-0000-4000-8000-000000000003';
 owner_id bigint:=(select min(id) from public.profiles);
begin
 original:=public.identifier_insert('sync_runs','[{"source":"retry_test","status":"success"}]',jsonb_build_array(key))->0;
 replay:=public.identifier_insert('sync_runs','[{"source":"retry_test","status":"success"}]',jsonb_build_array(key),'id',true,false)->0;
 if original->>'id'<>replay->>'id' then raise exception 'retry_id_changed'; end if;
 delete from public.sync_runs where id=(original->>'id')::bigint;
 replay:=public.identifier_insert('sync_runs','[{"source":"retry_test","status":"success"}]',jsonb_build_array(key))->0;
 if original->>'id'<>replay->>'id' or original->>'code'<>replay->>'code' then raise exception 'resurrection_id_changed'; end if;
 if exists(select 1 from public.sync_runs where code is null) then raise exception 'generated_code_missing'; end if;
 cap:=private.insert_identified_row('capture_sessions',jsonb_build_object('user_id',owner_id,'issued_at',now(),'expires_at',now()+interval '5 minutes'),'90000000-0000-4000-8000-000000000002');
 report:=private.insert_identified_row('community_reports',jsonb_build_object('user_id',owner_id,'capture_session_id',cap->'id','lat',14,'lon',100,'captured_at',now(),'status','pending'),report_key);
 perform public.moderate_community_report_v2((report->>'id')::bigint,null,'approve',25,null,'{"image_clear":true,"value_matches_display":true,"location_plausible":true,"no_screen_recapture_signs":true}','test',65,'[]');
 if not exists(select 1 from public.reputation_events where report_id=(report->>'id')::bigint and idempotency_key='moderation:v2:'||report_key::text) then raise exception 'moderation_dedupe_changed'; end if;
 req:=public.create_measurement_request(jsonb_build_object('legacy_id','90000000-0000-4000-8000-000000000004','user_id',owner_id,'idempotency_key','90000000-0000-4000-8000-000000000005','fingerprint','request_test','place_name','test','lat',14,'lon',100,'radius_km',3,'starts_at',now(),'expires_at',now()+interval '1 hour','status','active'));
 req:=req->'row';
 perform public.finish_measurement_request((req->>'id')::bigint,'expired');
 notice:=jsonb_build_object('legacy_id','90000000-0000-4000-8000-000000000006','user_id',owner_id,'event_type','measurement_expired','title','test','body','test','entity_type','measurement_request','entity_id',req->>'code','deduplication_key','request_test_notice');
 outbox:=jsonb_build_object('legacy_id','90000000-0000-4000-8000-000000000007','user_id',owner_id,'event_key','request_test_notice','payload',jsonb_build_object('retry_key',key));
 perform public.notify_measurement_request(notice,outbox);
 perform public.notify_measurement_request(notice,outbox);
 if (select count(*) from public.notification_outbox where event_key='request_test_notice')<>1 then raise exception 'duplicate_outbox'; end if;
 if (select count(*) from public.user_notifications where deduplication_key='request_test_notice')<>1 then raise exception 'duplicate_notice'; end if;
 if not exists(select 1 from public.notification_outbox where event_key='request_test_notice' and payload->>'retry_key'=key::text) then raise exception 'opaque_retry_token_changed'; end if;
end $$;
