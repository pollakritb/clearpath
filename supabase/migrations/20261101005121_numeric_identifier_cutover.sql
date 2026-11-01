-- Numeric PK/FK cutover. Run only after the v1/v2 application bridge is READY.
-- Whole file must run in one transaction after a restored-backup rehearsal.
set local lock_timeout='5s';
set local statement_timeout='120s';
set local clearpath.identifier_migration='approved';
set constraints all immediate;
do $$ begin if not exists(select 1 from private.identifier_control where singleton and version=1 and maintenance) then raise exception 'identifier_cutover_requires_write_pause'; end if; end $$;
create temporary table identifier_cutover_triggers on commit drop as select n.nspname,c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgname not in ('identifiers_sync','identifiers_remember');
do $$ declare r record; begin for r in select distinct relname from identifier_cutover_triggers order by relname loop execute format('alter table public.%I disable trigger user',r.relname); end loop; end $$;
drop view review.activities;
drop view review.alert_events;
drop view review.announcements;
drop view review.audit_logs;
drop view review.cams_grid_active;
drop view review.cams_grid_chunks;
drop view review.cams_grid_definitions;
drop view review.cams_grid_frames;
drop view review.cams_grid_generations;
drop view review.cams_grid_jobs;
drop view review.capture_sessions;
drop view review.community_help_claims;
drop view review.community_reports;
drop view review.community_xp_accounts;
drop view review.community_xp_control;
drop view review.community_xp_events;
drop view review.community_xp_jobs;
drop view review.data_issue_reports;
drop view review.fire_feature_snapshots;
drop view review.forecast_data_quality_daily;
drop view review.forecast_provider_snapshots;
drop view review.forecast_provider_sync_runs;
drop view review.line_notification_links;
drop view review.line_webhook_events;
drop view review.measurement_delivery_leases;
drop view review.measurement_helper_presence;
drop view review.measurement_request_recipients;
drop view review.measurement_requests;
drop view review.notification_outbox;
drop view review.notification_preferences;
drop view review.pm25_readings;
drop view review.profiles;
drop view review.public_map_events;
drop view review.rate_limit_windows;
drop view review.report_comments;
drop view review.report_drafts;
drop view review.report_evidence;
drop view review.report_reactions;
drop view review.report_reviews;
drop view review.reputation_events;
drop view review.stations;
drop view review.sync_runs;
drop view review.user_notifications;
drop view review.weather_observations;
drop trigger identifiers_sync on public.announcements;
drop function private.identifiers_announcements();
drop trigger identifiers_sync on public.audit_logs;
drop function private.identifiers_audit_logs();
drop trigger identifiers_sync on public.cams_grid_active;
drop function private.identifiers_cams_grid_active();
drop trigger identifiers_sync on public.cams_grid_chunks;
drop function private.identifiers_cams_grid_chunks();
drop trigger identifiers_sync on public.cams_grid_frames;
drop function private.identifiers_cams_grid_frames();
drop trigger identifiers_sync on public.cams_grid_jobs;
drop function private.identifiers_cams_grid_jobs();
drop trigger identifiers_sync on public.capture_sessions;
drop function private.identifiers_capture_sessions();
drop trigger identifiers_sync on public.community_help_claims;
drop function private.identifiers_community_help_claims();
drop trigger identifiers_sync on public.community_reports;
drop function private.identifiers_community_reports();
drop trigger identifiers_sync on public.community_xp_accounts;
drop function private.identifiers_community_xp_accounts();
drop trigger identifiers_sync on public.community_xp_events;
drop function private.identifiers_community_xp_events();
drop trigger identifiers_sync on public.community_xp_jobs;
drop function private.identifiers_community_xp_jobs();
drop trigger identifiers_sync on public.data_issue_reports;
drop function private.identifiers_data_issue_reports();
drop trigger identifiers_sync on public.forecast_provider_snapshots;
drop function private.identifiers_forecast_provider_snapshots();
drop trigger identifiers_sync on public.line_notification_links;
drop function private.identifiers_line_notification_links();
drop trigger identifiers_sync on public.measurement_delivery_leases;
drop function private.identifiers_measurement_delivery_leases();
drop trigger identifiers_sync on public.measurement_helper_presence;
drop function private.identifiers_measurement_helper_presence();
drop trigger identifiers_sync on public.measurement_request_recipients;
drop function private.identifiers_measurement_request_recipients();
drop trigger identifiers_sync on public.measurement_requests;
drop function private.identifiers_measurement_requests();
drop trigger identifiers_sync on public.notification_outbox;
drop function private.identifiers_notification_outbox();
drop trigger identifiers_sync on public.notification_preferences;
drop function private.identifiers_notification_preferences();
drop trigger identifiers_sync on public.public_map_events;
drop function private.identifiers_public_map_events();
drop trigger identifiers_sync on public.report_comments;
drop function private.identifiers_report_comments();
drop trigger identifiers_sync on public.report_drafts;
drop function private.identifiers_report_drafts();
drop trigger identifiers_sync on public.report_evidence;
drop function private.identifiers_report_evidence();
drop trigger identifiers_sync on public.report_reactions;
drop function private.identifiers_report_reactions();
drop trigger identifiers_sync on public.report_reviews;
drop function private.identifiers_report_reviews();
drop trigger identifiers_sync on public.reputation_events;
drop function private.identifiers_reputation_events();
drop trigger identifiers_sync on public.user_notifications;
drop function private.identifiers_user_notifications();
drop trigger identifiers_remember on public.profiles;
drop trigger identifiers_remember on public.capture_sessions;
drop trigger identifiers_remember on public.report_drafts;
drop trigger identifiers_remember on public.community_reports;
drop trigger identifiers_remember on public.report_comments;
drop trigger identifiers_remember on public.measurement_requests;
drop trigger identifiers_remember on public.user_notifications;
drop trigger identifiers_remember on public.notification_outbox;
drop trigger identifiers_remember on public.alert_events;
drop trigger identifiers_remember on public.announcements;
drop trigger identifiers_remember on public.activities;
drop trigger identifiers_remember on public.data_issue_reports;
drop trigger identifiers_remember on public.public_map_events;
drop trigger identifiers_remember on public.sync_runs;
drop trigger identifiers_remember on public.forecast_provider_sync_runs;
drop trigger identifiers_remember on public.forecast_provider_snapshots;
drop trigger identifiers_remember on public.cams_grid_generations;
drop trigger identifiers_remember on public.cams_grid_jobs;
drop trigger identifiers_remember on public.community_xp_events;
drop trigger identifiers_remember on public.community_xp_accounts;
do $$ declare r record; begin for r in select c.conname,t.relname from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and c.contype='f' loop execute format('alter table public.%I drop constraint %I',r.relname,r.conname); end loop; end $$;
alter table public.stations drop constraint stations_pkey;
alter table public.pm25_readings drop constraint pm25_readings_pkey;
alter table public.pm25_readings drop constraint pm25_readings_station_id_recorded_at_key;
alter table public.profiles drop constraint profiles_pkey;
alter table public.capture_sessions drop constraint capture_sessions_pkey;
alter table public.community_reports drop constraint community_reports_pkey;
alter table public.community_reports drop constraint community_reports_capture_session_id_key;
alter table public.community_reports drop constraint community_reports_image_sha256_key;
alter table public.report_reviews drop constraint report_reviews_pkey;
alter table public.report_reviews drop constraint report_reviews_report_id_reviewer_id_key;
alter table public.reputation_events drop constraint reputation_events_pkey;
alter table public.reputation_events drop constraint reputation_events_idempotency_key_key;
alter table public.announcements drop constraint announcements_pkey;
alter table public.activities drop constraint activities_pkey;
alter table public.sync_runs drop constraint sync_runs_pkey;
alter table public.rate_limit_windows drop constraint rate_limit_windows_pkey;
alter table public.notification_preferences drop constraint notification_preferences_pkey;
alter table public.alert_events drop constraint alert_events_pkey;
alter table public.alert_events drop constraint alert_events_deduplication_key_key;
alter table public.weather_observations drop constraint weather_observations_pkey;
alter table public.fire_feature_snapshots drop constraint fire_feature_snapshots_pkey;
alter table public.audit_logs drop constraint audit_logs_pkey;
alter table public.report_drafts drop constraint report_drafts_pkey;
alter table public.report_drafts drop constraint report_drafts_capture_session_id_key;
alter table public.report_evidence drop constraint report_evidence_pkey;
alter table public.report_evidence drop constraint report_evidence_capture_session_id_key;
alter table public.user_notifications drop constraint user_notifications_pkey;
alter table public.user_notifications drop constraint user_notifications_user_id_deduplication_key_key;
alter table public.notification_outbox drop constraint notification_outbox_pkey;
alter table public.notification_outbox drop constraint notification_outbox_event_key_key;
alter table public.public_map_events drop constraint public_map_events_pkey;
alter table public.forecast_data_quality_daily drop constraint forecast_data_quality_daily_pkey;
alter table public.line_notification_links drop constraint line_notification_links_link_code_hash_key;
alter table public.community_xp_accounts drop constraint community_xp_accounts_pkey;
alter table public.community_xp_accounts drop constraint community_xp_accounts_member_id_key;
alter table public.forecast_provider_snapshots drop constraint forecast_provider_snapshots_station_id_provider_issued_at_f_key;
alter table public.forecast_provider_snapshots drop constraint forecast_provider_snapshots_pkey;
alter table public.data_issue_reports drop constraint data_issue_reports_pkey;
alter table public.forecast_provider_sync_runs drop constraint forecast_provider_sync_runs_pkey;
alter table public.line_notification_links drop constraint line_notification_links_pkey;
alter table public.line_notification_links drop constraint line_notification_links_line_user_id_key;
alter table public.line_webhook_events drop constraint line_webhook_events_pkey;
alter table public.measurement_helper_presence drop constraint measurement_helper_presence_pkey;
alter table public.report_reactions drop constraint report_reactions_pkey;
alter table public.report_comments drop constraint report_comments_pkey;
alter table public.measurement_requests drop constraint measurement_requests_pkey;
alter table public.measurement_requests drop constraint measurement_requests_user_id_idempotency_key_key;
alter table public.measurement_request_recipients drop constraint measurement_request_recipients_pkey;
alter table public.measurement_delivery_leases drop constraint measurement_delivery_leases_pkey;
alter table public.community_xp_events drop constraint community_xp_events_pkey;
alter table public.community_xp_events drop constraint community_xp_events_reverses_key;
alter table public.community_xp_events drop constraint community_xp_events_report_id_kind_key;
alter table public.community_help_claims drop constraint community_help_claims_pkey;
alter table public.community_xp_jobs drop constraint community_xp_jobs_pkey;
alter table public.community_xp_control drop constraint community_xp_control_pkey;
alter table public.cams_grid_definitions drop constraint cams_grid_definitions_pkey;
alter table public.cams_grid_generations drop constraint cams_grid_generations_pkey;
alter table public.cams_grid_frames drop constraint cams_grid_frames_pkey;
alter table public.cams_grid_active drop constraint cams_grid_active_pkey;
alter table public.cams_grid_jobs drop constraint cams_grid_jobs_pkey;
alter table public.cams_grid_jobs drop constraint cams_grid_jobs_slot_key;
alter table public.cams_grid_chunks drop constraint cams_grid_chunks_pkey;
alter table public.profiles drop constraint profiles_numeric_id_key;
alter table public.capture_sessions drop constraint capture_sessions_numeric_id_key;
alter table public.report_drafts drop constraint report_drafts_numeric_id_key;
alter table public.community_reports drop constraint community_reports_numeric_id_key;
alter table public.report_comments drop constraint report_comments_numeric_id_key;
alter table public.measurement_requests drop constraint measurement_requests_numeric_id_key;
alter table public.user_notifications drop constraint user_notifications_numeric_id_key;
alter table public.notification_outbox drop constraint notification_outbox_numeric_id_key;
alter table public.alert_events drop constraint alert_events_numeric_id_key;
alter table public.announcements drop constraint announcements_numeric_id_key;
alter table public.activities drop constraint activities_numeric_id_key;
alter table public.data_issue_reports drop constraint data_issue_reports_numeric_id_key;
alter table public.public_map_events drop constraint public_map_events_numeric_id_key;
alter table public.sync_runs drop constraint sync_runs_numeric_id_key;
alter table public.forecast_provider_sync_runs drop constraint forecast_provider_sync_runs_numeric_id_key;
alter table public.forecast_provider_snapshots drop constraint forecast_provider_snapshots_numeric_id_key;
alter table public.cams_grid_generations drop constraint cams_grid_generations_numeric_id_key;
alter table public.cams_grid_jobs drop constraint cams_grid_jobs_numeric_id_key;
alter table public.community_xp_events drop constraint community_xp_events_numeric_id_key;
alter table public.community_xp_accounts drop constraint community_xp_accounts_member_numeric_key;
drop index public.capture_sessions_user_expiry_idx;
drop index public.reputation_events_weekly_idx;
drop index public.cams_grid_generation_ready;
drop index public.sync_runs_source_started_idx;
drop index public.community_reports_status_time_idx;
drop index public.community_reports_location_idx;
drop index public.community_reports_user_time_idx;
drop index public.user_notifications_unread_idx;
drop index public.report_drafts_user_expiry_idx;
drop index public.public_map_events_time_idx;
drop index public.report_evidence_retention_idx;
drop index public.idx_readings_station_time;
drop index public.community_xp_help_once;
drop index public.community_xp_user_time;
drop index public.community_xp_pair_time;
drop index public.community_help_claims_user;
drop index public.community_xp_jobs_pending;
drop index public.community_xp_jobs_user;
drop index public.data_issue_reports_status_created_idx;
drop index public.idx_cams_snapshot_station_issue_forecast;
drop index public.idx_provider_snapshot_provider_issued;
drop index public.idx_provider_snapshot_station_forecast;
drop index public.line_notification_links_active_idx;
drop index public.line_webhook_events_expiry_idx;
drop index public.notification_outbox_pending_idx;
drop index public.measurement_presence_location_idx;
drop index public.measurement_requests_owner_idx;
drop index public.measurement_requests_work_idx;
drop index public.measurement_requests_terminal_idx;
drop index public.measurement_recipients_user_idx;
drop index public.report_reactions_report_idx;
drop index public.report_comments_report_time_idx;
alter table public.profiles rename column id to legacy_id;
alter table public.profiles rename column numeric_id to id;
alter table public.profiles alter column legacy_id set default gen_random_uuid();
alter table public.profiles add constraint profiles_legacy_id_key unique(legacy_id);
alter table public.capture_sessions rename column id to legacy_id;
alter table public.capture_sessions rename column numeric_id to id;
alter table public.capture_sessions alter column legacy_id set default gen_random_uuid();
alter table public.capture_sessions add constraint capture_sessions_legacy_id_key unique(legacy_id);
alter table public.report_drafts rename column id to legacy_id;
alter table public.report_drafts rename column numeric_id to id;
alter table public.report_drafts alter column legacy_id set default gen_random_uuid();
alter table public.report_drafts add constraint report_drafts_legacy_id_key unique(legacy_id);
alter table public.community_reports rename column id to legacy_id;
alter table public.community_reports rename column numeric_id to id;
alter table public.community_reports alter column legacy_id set default gen_random_uuid();
alter table public.community_reports add constraint community_reports_legacy_id_key unique(legacy_id);
alter table public.report_comments rename column id to legacy_id;
alter table public.report_comments rename column numeric_id to id;
alter table public.report_comments alter column legacy_id set default gen_random_uuid();
alter table public.report_comments add constraint report_comments_legacy_id_key unique(legacy_id);
alter table public.measurement_requests rename column id to legacy_id;
alter table public.measurement_requests rename column numeric_id to id;
alter table public.measurement_requests alter column legacy_id set default gen_random_uuid();
alter table public.measurement_requests add constraint measurement_requests_legacy_id_key unique(legacy_id);
alter table public.user_notifications rename column id to legacy_id;
alter table public.user_notifications rename column numeric_id to id;
alter table public.user_notifications alter column legacy_id set default gen_random_uuid();
alter table public.user_notifications add constraint user_notifications_legacy_id_key unique(legacy_id);
alter table public.notification_outbox rename column id to legacy_id;
alter table public.notification_outbox rename column numeric_id to id;
alter table public.notification_outbox alter column legacy_id set default gen_random_uuid();
alter table public.notification_outbox add constraint notification_outbox_legacy_id_key unique(legacy_id);
alter table public.alert_events rename column id to legacy_id;
alter table public.alert_events rename column numeric_id to id;
alter table public.alert_events alter column legacy_id set default gen_random_uuid();
alter table public.alert_events add constraint alert_events_legacy_id_key unique(legacy_id);
alter table public.announcements rename column id to legacy_id;
alter table public.announcements rename column numeric_id to id;
alter table public.announcements alter column legacy_id set default gen_random_uuid();
alter table public.announcements add constraint announcements_legacy_id_key unique(legacy_id);
alter table public.activities rename column id to legacy_id;
alter table public.activities rename column numeric_id to id;
alter table public.activities alter column legacy_id set default gen_random_uuid();
alter table public.activities add constraint activities_legacy_id_key unique(legacy_id);
alter table public.data_issue_reports rename column id to legacy_id;
alter table public.data_issue_reports rename column numeric_id to id;
alter table public.data_issue_reports alter column legacy_id set default gen_random_uuid();
alter table public.data_issue_reports add constraint data_issue_reports_legacy_id_key unique(legacy_id);
alter table public.public_map_events rename column id to legacy_id;
alter table public.public_map_events rename column numeric_id to id;
alter table public.public_map_events alter column legacy_id set default gen_random_uuid();
alter table public.public_map_events add constraint public_map_events_legacy_id_key unique(legacy_id);
alter table public.sync_runs rename column id to legacy_id;
alter table public.sync_runs rename column numeric_id to id;
alter table public.sync_runs alter column legacy_id set default gen_random_uuid();
alter table public.sync_runs add constraint sync_runs_legacy_id_key unique(legacy_id);
alter table public.forecast_provider_sync_runs rename column id to legacy_id;
alter table public.forecast_provider_sync_runs rename column numeric_id to id;
alter table public.forecast_provider_sync_runs alter column legacy_id set default gen_random_uuid();
alter table public.forecast_provider_sync_runs add constraint forecast_provider_sync_runs_legacy_id_key unique(legacy_id);
alter table public.forecast_provider_snapshots rename column id to legacy_id;
alter table public.forecast_provider_snapshots rename column numeric_id to id;
alter table public.forecast_provider_snapshots alter column legacy_id set default gen_random_uuid();
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_legacy_id_key unique(legacy_id);
alter table public.cams_grid_generations rename column id to legacy_id;
alter table public.cams_grid_generations rename column numeric_id to id;
alter table public.cams_grid_generations alter column legacy_id set default gen_random_uuid();
alter table public.cams_grid_generations add constraint cams_grid_generations_legacy_id_key unique(legacy_id);
alter table public.cams_grid_jobs rename column id to legacy_id;
alter table public.cams_grid_jobs rename column numeric_id to id;
alter table public.cams_grid_jobs alter column legacy_id set default gen_random_uuid();
alter table public.cams_grid_jobs add constraint cams_grid_jobs_legacy_id_key unique(legacy_id);
alter table public.community_xp_events rename column id to legacy_id;
alter table public.community_xp_events rename column numeric_id to id;
alter table public.community_xp_events alter column legacy_id set default gen_random_uuid();
alter table public.community_xp_events add constraint community_xp_events_legacy_id_key unique(legacy_id);
alter table public.announcements rename column created_by to legacy_created_by;
alter table public.announcements rename column created_by_numeric_id to created_by;
alter table public.announcements alter column legacy_created_by drop not null;
alter table public.announcements rename column updated_by to legacy_updated_by;
alter table public.announcements rename column updated_by_numeric_id to updated_by;
alter table public.announcements alter column legacy_updated_by drop not null;
alter table public.audit_logs rename column actor_id to legacy_actor_id;
alter table public.audit_logs rename column actor_numeric_id to actor_id;
alter table public.audit_logs alter column legacy_actor_id drop not null;
alter table public.cams_grid_active rename column generation_id to legacy_generation_id;
alter table public.cams_grid_active rename column generation_numeric_id to generation_id;
alter table public.cams_grid_active alter column legacy_generation_id drop not null;
alter table public.cams_grid_active alter column generation_id set not null;
alter table public.cams_grid_chunks rename column job_id to legacy_job_id;
alter table public.cams_grid_chunks rename column job_numeric_id to job_id;
alter table public.cams_grid_chunks alter column legacy_job_id drop not null;
alter table public.cams_grid_chunks alter column job_id set not null;
alter table public.cams_grid_frames rename column generation_id to legacy_generation_id;
alter table public.cams_grid_frames rename column generation_numeric_id to generation_id;
alter table public.cams_grid_frames alter column legacy_generation_id drop not null;
alter table public.cams_grid_frames alter column generation_id set not null;
alter table public.cams_grid_jobs rename column generation_id to legacy_generation_id;
alter table public.cams_grid_jobs rename column generation_numeric_id to generation_id;
alter table public.cams_grid_jobs alter column legacy_generation_id drop not null;
alter table public.capture_sessions rename column user_id to legacy_user_id;
alter table public.capture_sessions rename column user_numeric_id to user_id;
alter table public.capture_sessions alter column legacy_user_id drop not null;
alter table public.capture_sessions alter column user_id set not null;
alter table public.community_help_claims rename column request_id to legacy_request_id;
alter table public.community_help_claims rename column request_numeric_id to request_id;
alter table public.community_help_claims alter column legacy_request_id drop not null;
alter table public.community_help_claims alter column request_id set not null;
alter table public.community_help_claims rename column user_id to legacy_user_id;
alter table public.community_help_claims rename column user_numeric_id to user_id;
alter table public.community_help_claims alter column legacy_user_id drop not null;
alter table public.community_help_claims alter column user_id set not null;
alter table public.community_reports rename column capture_session_id to legacy_capture_session_id;
alter table public.community_reports rename column capture_session_numeric_id to capture_session_id;
alter table public.community_reports alter column legacy_capture_session_id drop not null;
alter table public.community_reports alter column capture_session_id set not null;
alter table public.community_reports rename column duplicate_of_report_id to legacy_duplicate_of_report_id;
alter table public.community_reports rename column duplicate_of_report_numeric_id to duplicate_of_report_id;
alter table public.community_reports alter column legacy_duplicate_of_report_id drop not null;
alter table public.community_reports rename column moderated_by to legacy_moderated_by;
alter table public.community_reports rename column moderated_by_numeric_id to moderated_by;
alter table public.community_reports alter column legacy_moderated_by drop not null;
alter table public.community_reports rename column user_id to legacy_user_id;
alter table public.community_reports rename column user_numeric_id to user_id;
alter table public.community_reports alter column legacy_user_id drop not null;
alter table public.community_reports alter column user_id set not null;
alter table public.community_xp_accounts rename column user_id to legacy_user_id;
alter table public.community_xp_accounts rename column user_numeric_id to user_id;
alter table public.community_xp_accounts alter column legacy_user_id drop not null;
alter table public.community_xp_accounts alter column user_id set not null;
alter table public.community_xp_events rename column report_id to legacy_report_id;
alter table public.community_xp_events rename column report_numeric_id to report_id;
alter table public.community_xp_events alter column legacy_report_id drop not null;
alter table public.community_xp_events rename column request_id to legacy_request_id;
alter table public.community_xp_events rename column request_numeric_id to request_id;
alter table public.community_xp_events alter column legacy_request_id drop not null;
alter table public.community_xp_events rename column requester_id to legacy_requester_id;
alter table public.community_xp_events rename column requester_numeric_id to requester_id;
alter table public.community_xp_events alter column legacy_requester_id drop not null;
alter table public.community_xp_events rename column reverses to legacy_reverses;
alter table public.community_xp_events rename column reverses_numeric_id to reverses;
alter table public.community_xp_events alter column legacy_reverses drop not null;
alter table public.community_xp_events rename column user_id to legacy_user_id;
alter table public.community_xp_events rename column user_numeric_id to user_id;
alter table public.community_xp_events alter column legacy_user_id drop not null;
alter table public.community_xp_events alter column user_id set not null;
alter table public.community_xp_jobs rename column report_id to legacy_report_id;
alter table public.community_xp_jobs rename column report_numeric_id to report_id;
alter table public.community_xp_jobs alter column legacy_report_id drop not null;
alter table public.community_xp_jobs alter column report_id set not null;
alter table public.community_xp_jobs rename column user_id to legacy_user_id;
alter table public.community_xp_jobs rename column user_numeric_id to user_id;
alter table public.community_xp_jobs alter column legacy_user_id drop not null;
alter table public.community_xp_jobs alter column user_id set not null;
alter table public.data_issue_reports rename column user_id to legacy_user_id;
alter table public.data_issue_reports rename column user_numeric_id to user_id;
alter table public.data_issue_reports alter column legacy_user_id drop not null;
alter table public.data_issue_reports alter column user_id set not null;
alter table public.forecast_provider_snapshots rename column sync_run_id to legacy_sync_run_id;
alter table public.forecast_provider_snapshots rename column sync_run_numeric_id to sync_run_id;
alter table public.forecast_provider_snapshots alter column legacy_sync_run_id drop not null;
alter table public.line_notification_links rename column user_id to legacy_user_id;
alter table public.line_notification_links rename column user_numeric_id to user_id;
alter table public.line_notification_links alter column legacy_user_id drop not null;
alter table public.line_notification_links alter column user_id set not null;
alter table public.measurement_delivery_leases rename column event_id to legacy_event_id;
alter table public.measurement_delivery_leases rename column event_numeric_id to event_id;
alter table public.measurement_delivery_leases alter column legacy_event_id drop not null;
alter table public.measurement_delivery_leases alter column event_id set not null;
alter table public.measurement_helper_presence rename column user_id to legacy_user_id;
alter table public.measurement_helper_presence rename column user_numeric_id to user_id;
alter table public.measurement_helper_presence alter column legacy_user_id drop not null;
alter table public.measurement_helper_presence alter column user_id set not null;
alter table public.measurement_request_recipients rename column request_id to legacy_request_id;
alter table public.measurement_request_recipients rename column request_numeric_id to request_id;
alter table public.measurement_request_recipients alter column legacy_request_id drop not null;
alter table public.measurement_request_recipients alter column request_id set not null;
alter table public.measurement_request_recipients rename column user_id to legacy_user_id;
alter table public.measurement_request_recipients rename column user_numeric_id to user_id;
alter table public.measurement_request_recipients alter column legacy_user_id drop not null;
alter table public.measurement_request_recipients alter column user_id set not null;
alter table public.measurement_requests rename column dispatch_cursor to legacy_dispatch_cursor;
alter table public.measurement_requests rename column dispatch_cursor_numeric_id to dispatch_cursor;
alter table public.measurement_requests alter column legacy_dispatch_cursor drop not null;
alter table public.measurement_requests rename column result_report_id to legacy_result_report_id;
alter table public.measurement_requests rename column result_report_numeric_id to result_report_id;
alter table public.measurement_requests alter column legacy_result_report_id drop not null;
alter table public.measurement_requests rename column user_id to legacy_user_id;
alter table public.measurement_requests rename column user_numeric_id to user_id;
alter table public.measurement_requests alter column legacy_user_id drop not null;
alter table public.measurement_requests alter column user_id set not null;
alter table public.notification_outbox rename column notification_id to legacy_notification_id;
alter table public.notification_outbox rename column notification_numeric_id to notification_id;
alter table public.notification_outbox alter column legacy_notification_id drop not null;
alter table public.notification_outbox rename column user_id to legacy_user_id;
alter table public.notification_outbox rename column user_numeric_id to user_id;
alter table public.notification_outbox alter column legacy_user_id drop not null;
alter table public.notification_outbox alter column user_id set not null;
alter table public.notification_preferences rename column user_id to legacy_user_id;
alter table public.notification_preferences rename column user_numeric_id to user_id;
alter table public.notification_preferences alter column legacy_user_id drop not null;
alter table public.notification_preferences alter column user_id set not null;
alter table public.public_map_events rename column entity_id to legacy_entity_id;
alter table public.public_map_events rename column entity_numeric_id to entity_id;
alter table public.public_map_events alter column legacy_entity_id drop not null;
alter table public.report_comments rename column report_id to legacy_report_id;
alter table public.report_comments rename column report_numeric_id to report_id;
alter table public.report_comments alter column legacy_report_id drop not null;
alter table public.report_comments alter column report_id set not null;
alter table public.report_comments rename column user_id to legacy_user_id;
alter table public.report_comments rename column user_numeric_id to user_id;
alter table public.report_comments alter column legacy_user_id drop not null;
alter table public.report_comments alter column user_id set not null;
alter table public.report_drafts rename column capture_session_id to legacy_capture_session_id;
alter table public.report_drafts rename column capture_session_numeric_id to capture_session_id;
alter table public.report_drafts alter column legacy_capture_session_id drop not null;
alter table public.report_drafts alter column capture_session_id set not null;
alter table public.report_drafts rename column duplicate_of_report_id to legacy_duplicate_of_report_id;
alter table public.report_drafts rename column duplicate_of_report_numeric_id to duplicate_of_report_id;
alter table public.report_drafts alter column legacy_duplicate_of_report_id drop not null;
alter table public.report_drafts rename column user_id to legacy_user_id;
alter table public.report_drafts rename column user_numeric_id to user_id;
alter table public.report_drafts alter column legacy_user_id drop not null;
alter table public.report_drafts alter column user_id set not null;
alter table public.report_evidence rename column capture_session_id to legacy_capture_session_id;
alter table public.report_evidence rename column capture_session_numeric_id to capture_session_id;
alter table public.report_evidence alter column legacy_capture_session_id drop not null;
alter table public.report_evidence rename column report_id to legacy_report_id;
alter table public.report_evidence rename column report_numeric_id to report_id;
alter table public.report_evidence alter column legacy_report_id drop not null;
alter table public.report_evidence alter column report_id set not null;
alter table public.report_reactions rename column report_id to legacy_report_id;
alter table public.report_reactions rename column report_numeric_id to report_id;
alter table public.report_reactions alter column legacy_report_id drop not null;
alter table public.report_reactions alter column report_id set not null;
alter table public.report_reactions rename column user_id to legacy_user_id;
alter table public.report_reactions rename column user_numeric_id to user_id;
alter table public.report_reactions alter column legacy_user_id drop not null;
alter table public.report_reactions alter column user_id set not null;
alter table public.report_reviews rename column report_id to legacy_report_id;
alter table public.report_reviews rename column report_numeric_id to report_id;
alter table public.report_reviews alter column legacy_report_id drop not null;
alter table public.report_reviews alter column report_id set not null;
alter table public.report_reviews rename column reviewer_id to legacy_reviewer_id;
alter table public.report_reviews rename column reviewer_numeric_id to reviewer_id;
alter table public.report_reviews alter column legacy_reviewer_id drop not null;
alter table public.report_reviews alter column reviewer_id set not null;
alter table public.reputation_events rename column report_id to legacy_report_id;
alter table public.reputation_events rename column report_numeric_id to report_id;
alter table public.reputation_events alter column legacy_report_id drop not null;
alter table public.reputation_events rename column user_id to legacy_user_id;
alter table public.reputation_events rename column user_numeric_id to user_id;
alter table public.reputation_events alter column legacy_user_id drop not null;
alter table public.reputation_events alter column user_id set not null;
alter table public.user_notifications rename column user_id to legacy_user_id;
alter table public.user_notifications rename column user_numeric_id to user_id;
alter table public.user_notifications alter column legacy_user_id drop not null;
alter table public.user_notifications alter column user_id set not null;
alter table public.profiles alter column auth_user_id drop expression;
alter table public.profiles alter column auth_user_id set not null;
alter table public.community_xp_accounts rename column member_id to legacy_member_id;
alter table public.community_xp_accounts rename column member_numeric_id to member_id;
alter table public.community_xp_accounts add constraint community_xp_accounts_legacy_member_id_key unique(legacy_member_id);
alter table public.stations add constraint stations_pkey PRIMARY KEY (id);
alter table public.pm25_readings add constraint pm25_readings_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.capture_sessions add constraint capture_sessions_pkey PRIMARY KEY (id);
alter table public.community_reports add constraint community_reports_pkey PRIMARY KEY (id);
alter table public.report_reviews add constraint report_reviews_pkey PRIMARY KEY (id);
alter table public.reputation_events add constraint reputation_events_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.activities add constraint activities_pkey PRIMARY KEY (id);
alter table public.sync_runs add constraint sync_runs_pkey PRIMARY KEY (id);
alter table public.rate_limit_windows add constraint rate_limit_windows_pkey PRIMARY KEY (actor_key, action, window_started_at);
alter table public.notification_preferences add constraint notification_preferences_pkey PRIMARY KEY (user_id);
alter table public.alert_events add constraint alert_events_pkey PRIMARY KEY (id);
alter table public.weather_observations add constraint weather_observations_pkey PRIMARY KEY (station_id, recorded_at);
alter table public.fire_feature_snapshots add constraint fire_feature_snapshots_pkey PRIMARY KEY (station_id, recorded_at);
alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
alter table public.report_drafts add constraint report_drafts_pkey PRIMARY KEY (id);
alter table public.report_evidence add constraint report_evidence_pkey PRIMARY KEY (report_id);
alter table public.user_notifications add constraint user_notifications_pkey PRIMARY KEY (id);
alter table public.notification_outbox add constraint notification_outbox_pkey PRIMARY KEY (id);
alter table public.public_map_events add constraint public_map_events_pkey PRIMARY KEY (id);
alter table public.forecast_data_quality_daily add constraint forecast_data_quality_daily_pkey PRIMARY KEY (quality_date, source_name, station_id);
alter table public.community_xp_accounts add constraint community_xp_accounts_pkey PRIMARY KEY (user_id);
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_pkey PRIMARY KEY (id);
alter table public.data_issue_reports add constraint data_issue_reports_pkey PRIMARY KEY (id);
alter table public.forecast_provider_sync_runs add constraint forecast_provider_sync_runs_pkey PRIMARY KEY (id);
alter table public.line_notification_links add constraint line_notification_links_pkey PRIMARY KEY (user_id);
alter table public.line_webhook_events add constraint line_webhook_events_pkey PRIMARY KEY (event_id);
alter table public.measurement_helper_presence add constraint measurement_helper_presence_pkey PRIMARY KEY (user_id);
alter table public.report_reactions add constraint report_reactions_pkey PRIMARY KEY (report_id, user_id);
alter table public.report_comments add constraint report_comments_pkey PRIMARY KEY (id);
alter table public.measurement_requests add constraint measurement_requests_pkey PRIMARY KEY (id);
alter table public.measurement_request_recipients add constraint measurement_request_recipients_pkey PRIMARY KEY (request_id, user_id);
alter table public.measurement_delivery_leases add constraint measurement_delivery_leases_pkey PRIMARY KEY (event_id);
alter table public.community_xp_events add constraint community_xp_events_pkey PRIMARY KEY (id);
alter table public.community_help_claims add constraint community_help_claims_pkey PRIMARY KEY (request_id, user_id);
alter table public.community_xp_jobs add constraint community_xp_jobs_pkey PRIMARY KEY (report_id);
alter table public.community_xp_control add constraint community_xp_control_pkey PRIMARY KEY (singleton);
alter table public.cams_grid_definitions add constraint cams_grid_definitions_pkey PRIMARY KEY (id);
alter table public.cams_grid_generations add constraint cams_grid_generations_pkey PRIMARY KEY (id);
alter table public.cams_grid_frames add constraint cams_grid_frames_pkey PRIMARY KEY (generation_id, valid_at);
alter table public.cams_grid_active add constraint cams_grid_active_pkey PRIMARY KEY (id);
alter table public.cams_grid_jobs add constraint cams_grid_jobs_pkey PRIMARY KEY (id);
alter table public.cams_grid_chunks add constraint cams_grid_chunks_pkey PRIMARY KEY (job_id, batch_index);
alter table public.pm25_readings add constraint pm25_readings_station_id_recorded_at_key UNIQUE (station_id, recorded_at);
alter table public.community_reports add constraint community_reports_capture_session_id_key UNIQUE (capture_session_id);
alter table public.community_reports add constraint community_reports_image_sha256_key UNIQUE (image_sha256);
alter table public.report_reviews add constraint report_reviews_report_id_reviewer_id_key UNIQUE (report_id, reviewer_id);
alter table public.reputation_events add constraint reputation_events_idempotency_key_key UNIQUE (idempotency_key);
alter table public.alert_events add constraint alert_events_deduplication_key_key UNIQUE (deduplication_key);
alter table public.report_drafts add constraint report_drafts_capture_session_id_key UNIQUE (capture_session_id);
alter table public.report_evidence add constraint report_evidence_capture_session_id_key UNIQUE (capture_session_id);
alter table public.user_notifications add constraint user_notifications_user_id_deduplication_key_key UNIQUE (user_id, deduplication_key);
alter table public.notification_outbox add constraint notification_outbox_event_key_key UNIQUE (event_key);
alter table public.line_notification_links add constraint line_notification_links_link_code_hash_key UNIQUE (link_code_hash);
alter table public.community_xp_accounts add constraint community_xp_accounts_member_id_key UNIQUE (member_id);
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_station_id_provider_issued_at_f_key UNIQUE (station_id, provider, issued_at, forecast_at);
alter table public.line_notification_links add constraint line_notification_links_line_user_id_key UNIQUE (line_user_id);
alter table public.measurement_requests add constraint measurement_requests_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
alter table public.community_xp_events add constraint community_xp_events_reverses_key UNIQUE (reverses);
alter table public.community_xp_events add constraint community_xp_events_report_id_kind_key UNIQUE (report_id, kind);
alter table public.cams_grid_jobs add constraint cams_grid_jobs_slot_key UNIQUE (slot);
alter table public.pm25_readings add constraint pm25_readings_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.capture_sessions add constraint capture_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.community_reports add constraint community_reports_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.community_reports add constraint community_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.community_reports add constraint community_reports_capture_session_id_fkey FOREIGN KEY (capture_session_id) REFERENCES capture_sessions(id);
alter table public.community_reports add constraint community_reports_duplicate_of_report_id_fkey FOREIGN KEY (duplicate_of_report_id) REFERENCES community_reports(id) ON DELETE SET NULL;
alter table public.report_reviews add constraint report_reviews_report_id_fkey FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE;
alter table public.report_reviews add constraint report_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reputation_events add constraint reputation_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reputation_events add constraint reputation_events_report_id_fkey FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE SET NULL;
alter table public.announcements add constraint announcements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.notification_preferences add constraint notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.weather_observations add constraint weather_observations_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
alter table public.fire_feature_snapshots add constraint fire_feature_snapshots_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
alter table public.audit_logs add constraint audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.report_drafts add constraint report_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.report_drafts add constraint report_drafts_capture_session_id_fkey FOREIGN KEY (capture_session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE;
alter table public.report_drafts add constraint report_drafts_duplicate_of_report_id_fkey FOREIGN KEY (duplicate_of_report_id) REFERENCES community_reports(id) ON DELETE SET NULL;
alter table public.report_evidence add constraint report_evidence_report_id_fkey FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE;
alter table public.report_evidence add constraint report_evidence_capture_session_id_fkey FOREIGN KEY (capture_session_id) REFERENCES capture_sessions(id) ON DELETE SET NULL;
alter table public.user_notifications add constraint user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notification_outbox add constraint notification_outbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notification_outbox add constraint notification_outbox_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES user_notifications(id) ON DELETE CASCADE;
alter table public.announcements add constraint announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.forecast_data_quality_daily add constraint forecast_data_quality_daily_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
alter table public.line_notification_links add constraint line_notification_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.community_xp_accounts add constraint community_xp_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES forecast_provider_sync_runs(id) ON DELETE SET NULL;
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
alter table public.data_issue_reports add constraint data_issue_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.measurement_helper_presence add constraint measurement_helper_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.report_reactions add constraint report_reactions_report_id_fkey FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE;
alter table public.report_reactions add constraint report_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.report_comments add constraint report_comments_report_id_fkey FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE;
alter table public.report_comments add constraint report_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.measurement_requests add constraint measurement_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.measurement_requests add constraint measurement_requests_result_report_id_fkey FOREIGN KEY (result_report_id) REFERENCES community_reports(id) ON DELETE SET NULL;
alter table public.measurement_request_recipients add constraint measurement_request_recipients_request_id_fkey FOREIGN KEY (request_id) REFERENCES measurement_requests(id) ON DELETE CASCADE;
alter table public.measurement_request_recipients add constraint measurement_request_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.measurement_delivery_leases add constraint measurement_delivery_leases_event_id_fkey FOREIGN KEY (event_id) REFERENCES notification_outbox(id) ON DELETE CASCADE;
alter table public.community_xp_events add constraint community_xp_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.community_xp_events add constraint community_xp_events_reverses_fkey FOREIGN KEY (reverses) REFERENCES community_xp_events(id);
alter table public.community_help_claims add constraint community_help_claims_request_id_fkey FOREIGN KEY (request_id) REFERENCES measurement_requests(id) ON DELETE CASCADE;
alter table public.community_help_claims add constraint community_help_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.community_xp_jobs add constraint community_xp_jobs_report_id_fkey FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE;
alter table public.community_xp_jobs add constraint community_xp_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.cams_grid_generations add constraint cams_grid_generations_grid_id_fkey FOREIGN KEY (grid_id) REFERENCES cams_grid_definitions(id);
alter table public.cams_grid_frames add constraint cams_grid_frames_generation_id_fkey FOREIGN KEY (generation_id) REFERENCES cams_grid_generations(id) ON DELETE CASCADE;
alter table public.cams_grid_active add constraint cams_grid_active_generation_id_fkey FOREIGN KEY (generation_id) REFERENCES cams_grid_generations(id);
alter table public.cams_grid_jobs add constraint cams_grid_jobs_generation_id_fkey FOREIGN KEY (generation_id) REFERENCES cams_grid_generations(id) ON DELETE SET NULL;
alter table public.cams_grid_chunks add constraint cams_grid_chunks_job_id_fkey FOREIGN KEY (job_id) REFERENCES cams_grid_jobs(id) ON DELETE CASCADE;
CREATE INDEX capture_sessions_user_expiry_idx ON public.capture_sessions USING btree (user_id, expires_at DESC);
CREATE INDEX reputation_events_weekly_idx ON public.reputation_events USING btree (created_at DESC, user_id);
CREATE INDEX cams_grid_generation_ready ON public.cams_grid_generations USING btree (retrieved_at DESC) WHERE (status = 'ready'::text);
CREATE INDEX sync_runs_source_started_idx ON public.sync_runs USING btree (source, started_at DESC);
CREATE INDEX community_reports_status_time_idx ON public.community_reports USING btree (status, created_at DESC);
CREATE INDEX community_reports_location_idx ON public.community_reports USING btree (lat, lon);
CREATE INDEX community_reports_user_time_idx ON public.community_reports USING btree (user_id, created_at DESC);
CREATE INDEX user_notifications_unread_idx ON public.user_notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);
CREATE INDEX report_drafts_user_expiry_idx ON public.report_drafts USING btree (user_id, expires_at DESC);
CREATE INDEX public_map_events_time_idx ON public.public_map_events USING btree (created_at DESC);
CREATE INDEX report_evidence_retention_idx ON public.report_evidence USING btree (retention_until) WHERE ((purged_at IS NULL) AND (audit_hold = false));
CREATE INDEX idx_readings_station_time ON public.pm25_readings USING btree (station_id, recorded_at DESC);
CREATE UNIQUE INDEX community_xp_help_once ON public.community_xp_events USING btree (user_id, request_id) WHERE ((kind = 'help'::text) AND (points > 0));
CREATE INDEX community_xp_user_time ON public.community_xp_events USING btree (user_id, occurred_at DESC);
CREATE INDEX community_xp_pair_time ON public.community_xp_events USING btree (user_id, requester_id, occurred_at DESC) WHERE ((kind = 'help'::text) AND (points > 0));
CREATE INDEX community_help_claims_user ON public.community_help_claims USING btree (user_id);
CREATE INDEX community_xp_jobs_pending ON public.community_xp_jobs USING btree (occurred_at) WHERE (state = 'pending'::text);
CREATE INDEX community_xp_jobs_user ON public.community_xp_jobs USING btree (user_id);
CREATE INDEX data_issue_reports_status_created_idx ON public.data_issue_reports USING btree (status, created_at DESC);
CREATE INDEX idx_cams_snapshot_station_issue_forecast ON public.forecast_provider_snapshots USING btree (station_id, issued_at DESC, forecast_at) WHERE (provider = 'openmeteo_cams'::text);
CREATE INDEX idx_provider_snapshot_provider_issued ON public.forecast_provider_snapshots USING btree (provider, issued_at DESC);
CREATE INDEX idx_provider_snapshot_station_forecast ON public.forecast_provider_snapshots USING btree (station_id, forecast_at DESC, issued_at DESC);
CREATE INDEX line_notification_links_active_idx ON public.line_notification_links USING btree (user_id) WHERE (active = true);
CREATE INDEX line_webhook_events_expiry_idx ON public.line_webhook_events USING btree (expires_at);
CREATE INDEX notification_outbox_pending_idx ON public.notification_outbox USING btree (next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));
CREATE INDEX measurement_presence_location_idx ON public.measurement_helper_presence USING btree (lat, lon) WHERE (enabled AND (lat IS NOT NULL));
CREATE INDEX measurement_requests_owner_idx ON public.measurement_requests USING btree (user_id, created_at DESC);
CREATE INDEX measurement_requests_work_idx ON public.measurement_requests USING btree (last_processed_at, id) WHERE (status = ANY (ARRAY['scheduled'::text, 'active'::text]));
CREATE INDEX measurement_requests_terminal_idx ON public.measurement_requests USING btree (updated_at, id) WHERE (status = ANY (ARRAY['fulfilled'::text, 'expired'::text, 'cancelled'::text]));
CREATE INDEX measurement_recipients_user_idx ON public.measurement_request_recipients USING btree (user_id, created_at DESC);
CREATE INDEX report_reactions_report_idx ON public.report_reactions USING btree (report_id, reaction);
CREATE INDEX report_comments_report_time_idx ON public.report_comments USING btree (report_id, created_at DESC) WHERE (status = 'published'::text);
create function private.identifier_number(p_entity text,p_value text) returns bigint language sql stable security invoker set search_path='' as $$ select case when p_value ~ '^[0-9]{1,19}$' then p_value::bigint else (select numeric_id from private.identifier_aliases where entity=p_entity and (legacy_id::text=lower(p_value) or code=p_value)) end $$;
revoke all on function private.identifier_number(text,text) from public,anon,authenticated;
grant execute on function private.identifier_number(text,text) to service_role;
create function public.identifier_resolve(p_entity text,p_value text) returns jsonb language sql stable security invoker set search_path='' as $$ select to_jsonb(a)-'entity' from private.identifier_aliases a where entity=p_entity and (legacy_id::text=lower(p_value) or code=p_value or numeric_id::text=p_value) $$;
revoke all on function public.identifier_resolve(text,text) from public,anon,authenticated;
grant execute on function public.identifier_resolve(text,text) to service_role;
create function private.numeric_identifiers_activities() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_activities() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.activities for each row execute function private.numeric_identifiers_activities();
create function private.numeric_identifiers_alert_events() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_alert_events() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.alert_events for each row execute function private.numeric_identifiers_alert_events();
create function private.numeric_identifiers_announcements() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.created_by is not null then new.legacy_created_by:=(select legacy_id from public.profiles where id=new.created_by);
 elsif tg_op='INSERT' or new.created_by is distinct from old.created_by then new.legacy_created_by:=null; end if;
 if new.updated_by is not null then new.legacy_updated_by:=(select legacy_id from public.profiles where id=new.updated_by);
 elsif tg_op='INSERT' or new.updated_by is distinct from old.updated_by then new.legacy_updated_by:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_announcements() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.announcements for each row execute function private.numeric_identifiers_announcements();
create function private.numeric_identifiers_audit_logs() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.actor_id is not null then new.legacy_actor_id:=(select legacy_id from public.profiles where id=new.actor_id);
 elsif tg_op='INSERT' or new.actor_id is distinct from old.actor_id then new.legacy_actor_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_audit_logs() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.audit_logs for each row execute function private.numeric_identifiers_audit_logs();
create function private.numeric_identifiers_cams_grid_active() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.generation_id is not null then new.legacy_generation_id:=(select legacy_id from public.cams_grid_generations where id=new.generation_id);
 elsif tg_op='INSERT' or new.generation_id is distinct from old.generation_id then new.legacy_generation_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_cams_grid_active() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.cams_grid_active for each row execute function private.numeric_identifiers_cams_grid_active();
create function private.numeric_identifiers_cams_grid_chunks() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.job_id is not null then new.legacy_job_id:=(select legacy_id from public.cams_grid_jobs where id=new.job_id);
 elsif tg_op='INSERT' or new.job_id is distinct from old.job_id then new.legacy_job_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_cams_grid_chunks() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.cams_grid_chunks for each row execute function private.numeric_identifiers_cams_grid_chunks();
create function private.numeric_identifiers_cams_grid_frames() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.generation_id is not null then new.legacy_generation_id:=(select legacy_id from public.cams_grid_generations where id=new.generation_id);
 elsif tg_op='INSERT' or new.generation_id is distinct from old.generation_id then new.legacy_generation_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_cams_grid_frames() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.cams_grid_frames for each row execute function private.numeric_identifiers_cams_grid_frames();
create function private.numeric_identifiers_cams_grid_generations() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_cams_grid_generations() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.cams_grid_generations for each row execute function private.numeric_identifiers_cams_grid_generations();
create function private.numeric_identifiers_cams_grid_jobs() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.generation_id is not null then new.legacy_generation_id:=(select legacy_id from public.cams_grid_generations where id=new.generation_id);
 elsif tg_op='INSERT' or new.generation_id is distinct from old.generation_id then new.legacy_generation_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_cams_grid_jobs() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.cams_grid_jobs for each row execute function private.numeric_identifiers_cams_grid_jobs();
create function private.numeric_identifiers_capture_sessions() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_capture_sessions() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.capture_sessions for each row execute function private.numeric_identifiers_capture_sessions();
create function private.numeric_identifiers_community_help_claims() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.request_id is not null then new.legacy_request_id:=(select legacy_id from public.measurement_requests where id=new.request_id);
 elsif tg_op='INSERT' or new.request_id is distinct from old.request_id then new.legacy_request_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_community_help_claims() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.community_help_claims for each row execute function private.numeric_identifiers_community_help_claims();
create function private.numeric_identifiers_community_reports() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.capture_session_id is not null then new.legacy_capture_session_id:=(select legacy_id from public.capture_sessions where id=new.capture_session_id);
 elsif tg_op='INSERT' or new.capture_session_id is distinct from old.capture_session_id then new.legacy_capture_session_id:=null; end if;
 if new.duplicate_of_report_id is not null then new.legacy_duplicate_of_report_id:=(select legacy_id from public.community_reports where id=new.duplicate_of_report_id);
 elsif tg_op='INSERT' or new.duplicate_of_report_id is distinct from old.duplicate_of_report_id then new.legacy_duplicate_of_report_id:=null; end if;
 if new.moderated_by is not null then new.legacy_moderated_by:=(select legacy_id from public.profiles where id=new.moderated_by);
 elsif tg_op='INSERT' or new.moderated_by is distinct from old.moderated_by then new.legacy_moderated_by:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_community_reports() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.community_reports for each row execute function private.numeric_identifiers_community_reports();
create function private.numeric_identifiers_community_xp_accounts() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.member_id:=old.member_id; new.legacy_member_id:=old.legacy_member_id; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_community_xp_accounts() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.community_xp_accounts for each row execute function private.numeric_identifiers_community_xp_accounts();
create function private.numeric_identifiers_community_xp_events() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.report_id is not null then new.legacy_report_id:=(select legacy_id from public.community_reports where id=new.report_id);
 elsif tg_op='INSERT' or new.report_id is distinct from old.report_id then new.legacy_report_id:=null; end if;
 if new.request_id is not null then new.legacy_request_id:=(select legacy_id from public.measurement_requests where id=new.request_id);
 elsif tg_op='INSERT' or new.request_id is distinct from old.request_id then new.legacy_request_id:=null; end if;
 if new.requester_id is not null then new.legacy_requester_id:=(select legacy_id from public.profiles where id=new.requester_id);
 elsif tg_op='INSERT' or new.requester_id is distinct from old.requester_id then new.legacy_requester_id:=null; end if;
 if new.reverses is not null then new.legacy_reverses:=(select legacy_id from public.community_xp_events where id=new.reverses);
 elsif tg_op='INSERT' or new.reverses is distinct from old.reverses then new.legacy_reverses:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_community_xp_events() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.community_xp_events for each row execute function private.numeric_identifiers_community_xp_events();
create function private.numeric_identifiers_community_xp_jobs() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.report_id is not null then new.legacy_report_id:=(select legacy_id from public.community_reports where id=new.report_id);
 elsif tg_op='INSERT' or new.report_id is distinct from old.report_id then new.legacy_report_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_community_xp_jobs() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.community_xp_jobs for each row execute function private.numeric_identifiers_community_xp_jobs();
create function private.numeric_identifiers_data_issue_reports() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_data_issue_reports() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.data_issue_reports for each row execute function private.numeric_identifiers_data_issue_reports();
create function private.numeric_identifiers_forecast_provider_snapshots() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.sync_run_id is not null then new.legacy_sync_run_id:=(select legacy_id from public.forecast_provider_sync_runs where id=new.sync_run_id);
 elsif tg_op='INSERT' or new.sync_run_id is distinct from old.sync_run_id then new.legacy_sync_run_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_forecast_provider_snapshots() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.forecast_provider_snapshots for each row execute function private.numeric_identifiers_forecast_provider_snapshots();
create function private.numeric_identifiers_forecast_provider_sync_runs() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_forecast_provider_sync_runs() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.forecast_provider_sync_runs for each row execute function private.numeric_identifiers_forecast_provider_sync_runs();
create function private.numeric_identifiers_line_notification_links() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_line_notification_links() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.line_notification_links for each row execute function private.numeric_identifiers_line_notification_links();
create function private.numeric_identifiers_measurement_delivery_leases() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.event_id is not null then new.legacy_event_id:=(select legacy_id from public.notification_outbox where id=new.event_id);
 elsif tg_op='INSERT' or new.event_id is distinct from old.event_id then new.legacy_event_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_measurement_delivery_leases() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.measurement_delivery_leases for each row execute function private.numeric_identifiers_measurement_delivery_leases();
create function private.numeric_identifiers_measurement_helper_presence() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_measurement_helper_presence() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.measurement_helper_presence for each row execute function private.numeric_identifiers_measurement_helper_presence();
create function private.numeric_identifiers_measurement_request_recipients() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.request_id is not null then new.legacy_request_id:=(select legacy_id from public.measurement_requests where id=new.request_id);
 elsif tg_op='INSERT' or new.request_id is distinct from old.request_id then new.legacy_request_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_measurement_request_recipients() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.measurement_request_recipients for each row execute function private.numeric_identifiers_measurement_request_recipients();
create function private.numeric_identifiers_measurement_requests() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.dispatch_cursor is not null then new.legacy_dispatch_cursor:=(select legacy_id from public.profiles where id=new.dispatch_cursor);
 elsif tg_op='INSERT' or new.dispatch_cursor is distinct from old.dispatch_cursor then new.legacy_dispatch_cursor:=null; end if;
 if new.result_report_id is not null then new.legacy_result_report_id:=(select legacy_id from public.community_reports where id=new.result_report_id);
 elsif tg_op='INSERT' or new.result_report_id is distinct from old.result_report_id then new.legacy_result_report_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_measurement_requests() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.measurement_requests for each row execute function private.numeric_identifiers_measurement_requests();
create function private.numeric_identifiers_notification_outbox() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.notification_id is not null then new.legacy_notification_id:=(select legacy_id from public.user_notifications where id=new.notification_id);
 elsif tg_op='INSERT' or new.notification_id is distinct from old.notification_id then new.legacy_notification_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_notification_outbox() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.notification_outbox for each row execute function private.numeric_identifiers_notification_outbox();
create function private.numeric_identifiers_notification_preferences() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_notification_preferences() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.notification_preferences for each row execute function private.numeric_identifiers_notification_preferences();
create function private.numeric_identifiers_profiles() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.auth_user_id is distinct from new.legacy_id then raise exception 'profile_auth_link_invalid'; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_profiles() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.profiles for each row execute function private.numeric_identifiers_profiles();
create function private.numeric_identifiers_public_map_events() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.entity_id is not null then new.legacy_entity_id:=(select legacy_id from public.community_reports where id=new.entity_id);
 elsif tg_op='INSERT' or new.entity_id is distinct from old.entity_id then new.legacy_entity_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_public_map_events() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.public_map_events for each row execute function private.numeric_identifiers_public_map_events();
create function private.numeric_identifiers_report_comments() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.report_id is not null then new.legacy_report_id:=(select legacy_id from public.community_reports where id=new.report_id);
 elsif tg_op='INSERT' or new.report_id is distinct from old.report_id then new.legacy_report_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_report_comments() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.report_comments for each row execute function private.numeric_identifiers_report_comments();
create function private.numeric_identifiers_report_drafts() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.capture_session_id is not null then new.legacy_capture_session_id:=(select legacy_id from public.capture_sessions where id=new.capture_session_id);
 elsif tg_op='INSERT' or new.capture_session_id is distinct from old.capture_session_id then new.legacy_capture_session_id:=null; end if;
 if new.duplicate_of_report_id is not null then new.legacy_duplicate_of_report_id:=(select legacy_id from public.community_reports where id=new.duplicate_of_report_id);
 elsif tg_op='INSERT' or new.duplicate_of_report_id is distinct from old.duplicate_of_report_id then new.legacy_duplicate_of_report_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_report_drafts() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.report_drafts for each row execute function private.numeric_identifiers_report_drafts();
create function private.numeric_identifiers_report_evidence() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.capture_session_id is not null then new.legacy_capture_session_id:=(select legacy_id from public.capture_sessions where id=new.capture_session_id);
 elsif tg_op='INSERT' or new.capture_session_id is distinct from old.capture_session_id then new.legacy_capture_session_id:=null; end if;
 if new.report_id is not null then new.legacy_report_id:=(select legacy_id from public.community_reports where id=new.report_id);
 elsif tg_op='INSERT' or new.report_id is distinct from old.report_id then new.legacy_report_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_report_evidence() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.report_evidence for each row execute function private.numeric_identifiers_report_evidence();
create function private.numeric_identifiers_report_reactions() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.report_id is not null then new.legacy_report_id:=(select legacy_id from public.community_reports where id=new.report_id);
 elsif tg_op='INSERT' or new.report_id is distinct from old.report_id then new.legacy_report_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_report_reactions() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.report_reactions for each row execute function private.numeric_identifiers_report_reactions();
create function private.numeric_identifiers_report_reviews() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.report_id is not null then new.legacy_report_id:=(select legacy_id from public.community_reports where id=new.report_id);
 elsif tg_op='INSERT' or new.report_id is distinct from old.report_id then new.legacy_report_id:=null; end if;
 if new.reviewer_id is not null then new.legacy_reviewer_id:=(select legacy_id from public.profiles where id=new.reviewer_id);
 elsif tg_op='INSERT' or new.reviewer_id is distinct from old.reviewer_id then new.legacy_reviewer_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_report_reviews() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.report_reviews for each row execute function private.numeric_identifiers_report_reviews();
create function private.numeric_identifiers_reputation_events() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.report_id is not null then new.legacy_report_id:=(select legacy_id from public.community_reports where id=new.report_id);
 elsif tg_op='INSERT' or new.report_id is distinct from old.report_id then new.legacy_report_id:=null; end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_reputation_events() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.reputation_events for each row execute function private.numeric_identifiers_reputation_events();
create function private.numeric_identifiers_sync_runs() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_sync_runs() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.sync_runs for each row execute function private.numeric_identifiers_sync_runs();
create function private.numeric_identifiers_user_notifications() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' then new.id:=old.id; new.legacy_id:=old.legacy_id;
 else new.id:=coalesce((select numeric_id from private.identifier_aliases where entity=tg_table_name and legacy_id=new.legacy_id),new.id); end if;
 if new.user_id is not null then new.legacy_user_id:=(select legacy_id from public.profiles where id=new.user_id);
 elsif tg_op='INSERT' or new.user_id is distinct from old.user_id then new.legacy_user_id:=null; end if;
 return new; end $$;
revoke all on function private.numeric_identifiers_user_notifications() from public,anon,authenticated;
create trigger identifiers_sync before insert or update on public.user_notifications for each row execute function private.numeric_identifiers_user_notifications();
create or replace function private.remember_identifier() returns trigger language plpgsql security definer set search_path='' as $$ declare v_legacy uuid; v_number bigint; v_code text; v_entity text; begin
if tg_table_name='community_xp_accounts' then v_legacy:=new.legacy_member_id; v_number:=new.member_id; v_code:=new.member_code; v_entity:='community_members'; else v_legacy:=new.legacy_id; v_number:=new.id; v_code:=new.code; v_entity:=tg_table_name; end if;
insert into private.identifier_aliases(entity,legacy_id,numeric_id,code) values(v_entity,v_legacy,v_number,v_code) on conflict(entity,legacy_id) do nothing;
if not exists(select 1 from private.identifier_aliases where entity=v_entity and legacy_id=v_legacy and numeric_id=v_number and code=v_code) then raise exception 'identifier_alias_mismatch'; end if; return new; end $$;
revoke all on function private.remember_identifier() from public,anon,authenticated;
create trigger identifiers_remember after insert or update on public.profiles for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.capture_sessions for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.report_drafts for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.community_reports for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.report_comments for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.measurement_requests for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.user_notifications for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.notification_outbox for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.alert_events for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.announcements for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.activities for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.data_issue_reports for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.public_map_events for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.sync_runs for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.forecast_provider_sync_runs for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.forecast_provider_snapshots for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.cams_grid_generations for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.cams_grid_jobs for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.community_xp_events for each row execute function private.remember_identifier();
create trigger identifiers_remember after insert or update on public.community_xp_accounts for each row execute function private.remember_identifier();
CREATE OR REPLACE FUNCTION public.enqueue_community_xp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.status in ('approved','rejected') and old.status='pending'
 and exists(select 1 from public.community_xp_control where enabled and not maintenance) then
  insert into public.community_xp_jobs(report_id,user_id,occurred_at,report_snapshot,evidence_snapshot)
  values(new.id,new.user_id,coalesce(new.moderated_at,now()),to_jsonb(new),
   coalesce((select to_jsonb(e) from public.report_evidence e where e.report_id=new.id),'{}'))
  on conflict do nothing;
 end if;
 return new;
end $function$
;
drop function public.claim_community_help(p_user uuid, p_request uuid);
CREATE OR REPLACE FUNCTION public.claim_community_help(p_user bigint, p_request bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.measurement_requests; c public.community_help_claims;
begin
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then raise exception 'xp_disabled'; end if;
 select * into r from public.measurement_requests where id=p_request for update;
 if not found or r.user_id=p_user or not exists(select 1 from public.measurement_request_recipients where request_id=p_request and user_id=p_user and not declined) then raise exception 'not_invited'; end if;
 select * into c from public.community_help_claims where request_id=p_request and user_id=p_user;
 if c.user_id is null then
  if r.status<>'active' or r.starts_at>now() or r.expires_at<=now() then raise exception 'request_closed'; end if;
  insert into public.community_help_claims(request_id,user_id) values(p_request,p_user) returning * into c;
 end if;
 if r.status in ('cancelled','expired') or r.expires_at<=now() then raise exception 'request_closed'; end if;
 if r.status='fulfilled' and r.updated_at+interval '15 minutes'<=now() then raise exception 'request_closed'; end if;
 return jsonb_build_object('request_id',p_request,'started_at',c.started_at,'deadline',
 case when r.status='fulfilled' then least(r.expires_at,r.updated_at+interval '15 minutes') else r.expires_at end,'potential_xp',5);
end $function$
;
revoke all on function public.claim_community_help(p_user bigint, p_request bigint) from public,anon,authenticated;
grant execute on function public.claim_community_help(p_user bigint, p_request bigint) to service_role;
CREATE OR REPLACE FUNCTION public.process_community_xp(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.community_xp_jobs; r jsonb; e jsonb; m jsonb; req public.measurement_requests; c public.community_help_claims;
 t timestamptz; submitted timestamptz; captured timestamptz; day_start timestamptz; last_xp timestamptz;
 v_request bigint; base_reason text; bonus_reason text; base integer; bonus integer; n integer:=0;
 gps_lat float8; gps_lon float8; accuracy float8; deadline timestamptz;
begin
 if not exists(select 1 from public.community_xp_control where enabled and not maintenance) then return jsonb_build_object('processed',0); end if;
 -- One short transaction worker lease; per-user caps cannot race across workers.
 if not pg_try_advisory_xact_lock(hashtextextended('community-xp-worker',0)) then return jsonb_build_object('processed',0,'busy',true); end if;
 for j in select * from public.community_xp_jobs where state='pending' order by occurred_at,report_id limit least(greatest(p_limit,1),100) for update skip locked loop
  r:=j.report_snapshot; e:=j.evidence_snapshot; m:=coalesce(e->'image_metadata','{}'); t:=j.occurred_at;
  submitted:=(r->>'created_at')::timestamptz; captured:=(r->>'captured_at')::timestamptz;
  day_start:=date_trunc('day',t at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  insert into public.community_xp_accounts(user_id) values(j.user_id) on conflict do nothing;
  perform pg_advisory_xact_lock(hashtextextended('xp:'||j.user_id::text,0));
  base:=0; bonus:=0; base_reason:='granted'; bonus_reason:='no_claim'; v_request:=null;
  select max(occurred_at) into last_xp from public.community_xp_events where user_id=j.user_id and points>0 and occurred_at<=t;
  if r->>'status'<>'approved' then base_reason:='not_approved';
  elsif r->>'duplicate_of_report_id' is not null then base_reason:='duplicate';
  elsif captured>submitted or captured<submitted-interval '3 hours' then base_reason:='stale';
  elsif last_xp>t-interval '30 minutes' then base_reason:='cooldown';
  elsif (select count(*) from public.community_xp_events where user_id=j.user_id and kind='report' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')>=5 then base_reason:='report_limit';
  else base:=10; end if;
  -- Metadata has been validated by the upload service and is never client-authored JSON.
  v_request:=private.identifier_number('measurement_requests',m->>'measurement_request_id');
  if v_request is not null then
   select * into req from public.measurement_requests where id=v_request for update;
   select * into c from public.community_help_claims where request_id=v_request and user_id=j.user_id;
   deadline:=req.expires_at;
   if req.status='fulfilled' then deadline:=least(deadline,req.updated_at+interval '15 minutes'); end if;
   gps_lat:=(m->'bonus_gps_at_submission'->>'lat')::float8; gps_lon:=(m->'bonus_gps_at_submission'->>'lon')::float8; accuracy:=(m->'bonus_gps_at_submission'->>'accuracy_m')::float8;
   if c.user_id is null then bonus_reason:='no_claim';
   elsif (req.status='cancelled' and t>=req.updated_at) or submitted>deadline then bonus_reason:='request_closed';
   elsif base_reason in ('not_approved','duplicate','stale','cooldown') then bonus_reason:=base_reason;
   elsif req.user_id=j.user_id or c.started_at>captured or captured<req.starts_at or captured>submitted or submitted-captured>interval '15 minutes'
    or accuracy is null or accuracy<0 or accuracy>200 or gps_lat is null or gps_lon is null
    or not (coalesce(r->>'capture_source','camera')='camera' or (m->>'exif_captured_at' is not null and m->'exif_gps' is not null))
    or 6371*2*asin(sqrt(least(1.0,power(sin(radians(gps_lat-(r->>'lat')::float8)/2),2)+cos(radians(gps_lat))*cos(radians((r->>'lat')::float8))*power(sin(radians(gps_lon-(r->>'lon')::float8)/2),2))))>.2
    or 6371*2*asin(sqrt(least(1.0,power(sin(radians(req.lat-(r->>'lat')::float8)/2),2)+cos(radians(req.lat))*cos(radians((r->>'lat')::float8))*power(sin(radians(req.lon-(r->>'lon')::float8)/2),2))))>req.radius_km then bonus_reason:='invalid_evidence';
   elsif exists(select 1 from public.community_xp_events where user_id=j.user_id and request_id=v_request and kind='help' and points>0) then bonus_reason:='already_rewarded';
   elsif (select count(*) from public.community_xp_events where user_id=j.user_id and kind='help' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')>=3 then bonus_reason:='help_limit';
   elsif exists(select 1 from public.community_xp_events where user_id=j.user_id and requester_id=req.user_id and kind='help' and points>0 and occurred_at>=day_start and occurred_at<day_start+interval '1 day')
    or (select count(*) from public.community_xp_events where user_id=j.user_id and requester_id=req.user_id and kind='help' and points>0 and occurred_at>t-interval '7 days' and occurred_at<=t)>=3 then bonus_reason:='pair_limit';
   else bonus:=5; bonus_reason:='granted'; end if;
  end if;
  insert into public.community_xp_events(user_id,report_id,kind,points,reason,occurred_at) values(j.user_id,j.report_id,'report',base,base_reason,t) on conflict do nothing;
  if v_request is not null then
   insert into public.community_xp_events(user_id,report_id,request_id,requester_id,kind,points,reason,occurred_at)
   values(j.user_id,j.report_id,v_request,req.user_id,'help',bonus,bonus_reason,t) on conflict do nothing;
  end if;
  update public.community_xp_jobs set state='done',processed_at=now(),report_snapshot='{}',evidence_snapshot='{}' where report_id=j.report_id;
  n:=n+1;
 end loop;
 return jsonb_build_object('processed',n,'pending',(select count(*) from public.community_xp_jobs where state='pending'));
end $function$
;
revoke all on function public.process_community_xp(p_limit integer) from public,anon,authenticated;
grant execute on function public.process_community_xp(p_limit integer) to service_role;
drop function public.community_xp_totals(p_user uuid);
CREATE OR REPLACE FUNCTION public.community_xp_totals(p_user bigint DEFAULT NULL::bigint)
 RETURNS TABLE(user_id bigint, lifetime_xp bigint, days bigint, reports bigint, helped bigint, today_reports bigint, today_help bigint, xp7 bigint, xp30 bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with live as (select e.* from public.community_xp_events e where (p_user is null or e.user_id=p_user) and e.points>0 and not exists(select 1 from public.community_xp_events rev where rev.reverses=e.id))
 select a.user_id,coalesce(sum(l.points),0),count(distinct (l.occurred_at at time zone 'Asia/Bangkok')::date),
 count(*) filter(where l.kind='report'),count(*) filter(where l.kind='help'),
 (select count(*) from public.community_xp_events q where q.user_id=a.user_id and q.points>0 and q.kind='report' and (q.occurred_at at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),
 (select count(*) from public.community_xp_events q where q.user_id=a.user_id and q.points>0 and q.kind='help' and (q.occurred_at at time zone 'Asia/Bangkok')::date=(now() at time zone 'Asia/Bangkok')::date),
 coalesce(sum(l.points) filter(where l.occurred_at>now()-interval '168 hours'),0),
 coalesce(sum(l.points) filter(where l.occurred_at>now()-interval '720 hours'),0)
 from public.community_xp_accounts a left join live l on l.user_id=a.user_id where p_user is null or a.user_id=p_user group by a.user_id;
$function$
;
revoke all on function public.community_xp_totals(p_user bigint) from public,anon,authenticated;
grant execute on function public.community_xp_totals(p_user bigint) to service_role;
drop function public.community_xp_board(p_period text, p_offset integer, p_user uuid);
CREATE OR REPLACE FUNCTION public.community_xp_board(p_period text DEFAULT 'all'::text, p_offset integer DEFAULT 0, p_user bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with scored as (
 select a.member_id,a.alias,a.user_id,t.lifetime_xp,t.days,
 case p_period when '7d' then t.xp7 when '30d' then t.xp30 else t.lifetime_xp end xp
 from public.community_xp_accounts a join public.community_xp_totals() t using(user_id) where not a.hidden
 ), ranked as (select *,rank() over(order by xp desc) rank from scored where xp>0),
 page as (select * from ranked order by xp desc,member_id offset greatest(p_offset,0) limit 51)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'user_id') from page p),'[]'),
 'me',(select to_jsonb(r)-'user_id' from ranked r where r.user_id=p_user));
$function$
;
revoke all on function public.community_xp_board(p_period text, p_offset integer, p_user bigint) from public,anon,authenticated;
grant execute on function public.community_xp_board(p_period text, p_offset integer, p_user bigint) to service_role;
drop function public.reverse_community_xp(p_event uuid, p_reason text);
CREATE OR REPLACE FUNCTION public.reverse_community_xp(p_event bigint, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e public.community_xp_events;
begin
 if char_length(trim(p_reason))<10 then raise exception 'reason_required'; end if;
 select * into e from public.community_xp_events where id=p_event and points>0 for update;
 if not found then raise exception 'event_not_found'; end if;
 insert into public.community_xp_events(user_id,kind,points,reason,occurred_at,reverses)
 values(e.user_id,'reversal',-e.points,p_reason,e.occurred_at,e.id) on conflict(reverses) do nothing;
end $function$
;
revoke all on function public.reverse_community_xp(p_event bigint, p_reason text) from public,anon,authenticated;
grant execute on function public.reverse_community_xp(p_event bigint, p_reason text) to service_role;
CREATE OR REPLACE FUNCTION public.guard_community_xp_maintenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if coalesce(current_setting('clearpath.community_reset',true),'')<>'approved'
 and exists(select 1 from public.community_xp_control where maintenance) then
  raise exception 'community_maintenance';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.community_xp_admin_overview()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'pending_jobs',(select count(*) from public.community_xp_jobs where state='pending'),
 'accounts',(select count(*) from public.community_xp_accounts),
 'zero_reasons',(select coalesce(jsonb_object_agg(reason,n),'{}') from (select reason,count(*) n from public.community_xp_events where points=0 and recorded_at>now()-interval '7 days' group by reason) x),
 'repeated_pairs',(select count(*) from (select user_id,requester_id from public.community_xp_events where kind='help' and points>0 and occurred_at>now()-interval '7 days' group by user_id,requester_id having count(*)>=3) x)
 );
$function$
;
revoke all on function public.community_xp_admin_overview() from public,anon,authenticated;
grant execute on function public.community_xp_admin_overview() to service_role;
CREATE OR REPLACE FUNCTION public.take_rate_limit(p_actor_key text, p_action text, p_window_seconds integer, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  bucket TIMESTAMPTZ;
  current_count INTEGER;
BEGIN
  bucket := to_timestamp(
    floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds
  );
  INSERT INTO rate_limit_windows(actor_key, action, window_started_at, request_count)
  VALUES (p_actor_key, p_action, bucket, 1)
  ON CONFLICT (actor_key, action, window_started_at)
  DO UPDATE SET request_count = rate_limit_windows.request_count + 1
  RETURNING request_count INTO current_count;
  RETURN current_count <= p_limit;
END;
$function$
;
revoke all on function public.take_rate_limit(p_actor_key text, p_action text, p_window_seconds integer, p_limit integer) from public,anon,authenticated;
grant execute on function public.take_rate_limit(p_actor_key text, p_action text, p_window_seconds integer, p_limit integer) to service_role;
drop function public.apply_reputation_event(p_user_id uuid, p_points integer, p_reason text, p_report_id uuid, p_idempotency_key text);
CREATE OR REPLACE FUNCTION public.apply_reputation_event(p_user_id bigint, p_points integer, p_reason text, p_report_id bigint, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result profiles%ROWTYPE;
BEGIN
  INSERT INTO reputation_events(user_id, report_id, points, reason, idempotency_key)
  VALUES (p_user_id, p_report_id, p_points, p_reason, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO result FROM profiles WHERE id = p_user_id;
    RETURN to_jsonb(result);
  END IF;
  UPDATE profiles
  SET reputation_score = GREATEST(0, reputation_score + p_points),
      approved_reports = approved_reports + CASE WHEN p_reason = 'report_approved' THEN 1 ELSE 0 END,
      helpful_reviews = helpful_reviews + CASE WHEN p_reason = 'helpful_review' THEN 1 ELSE 0 END,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$function$
;
revoke all on function public.apply_reputation_event(p_user_id bigint, p_points integer, p_reason text, p_report_id bigint, p_idempotency_key text) from public,anon,authenticated;
grant execute on function public.apply_reputation_event(p_user_id bigint, p_points integer, p_reason text, p_report_id bigint, p_idempotency_key text) to service_role;
drop function public.consume_capture_session(p_session_id uuid, p_user_id uuid);
CREATE OR REPLACE FUNCTION public.consume_capture_session(p_session_id bigint, p_user_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE changed INTEGER;
BEGIN
  UPDATE capture_sessions
  SET consumed_at = NOW()
  WHERE id = p_session_id
    AND user_id = p_user_id
    AND consumed_at IS NULL
    AND expires_at >= NOW();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$function$
;
revoke all on function public.consume_capture_session(p_session_id bigint, p_user_id bigint) from public,anon,authenticated;
grant execute on function public.consume_capture_session(p_session_id bigint, p_user_id bigint) to service_role;
CREATE OR REPLACE FUNCTION public.claim_cams_grid(p_slot timestamp with time zone, p_token uuid, p_grid jsonb, p_batches integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j cams_grid_jobs; gid bigint;
BEGIN
 IF p_slot <> date_trunc('day',p_slot AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + make_interval(hours => (extract(hour from p_slot AT TIME ZONE 'UTC')::integer / 6)*6)
 OR p_batches NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'grid_slot_invalid'; END IF;
 -- Serialize job creation/claim across scheduled and manual invocations.
 IF NOT pg_try_advisory_xact_lock(71834012) THEN RETURN jsonb_build_object('status','in_progress'); END IF;
 -- A crashed older slot can be superseded only after its lease has expired.
 IF EXISTS(SELECT 1 FROM cams_grid_jobs WHERE status='running' AND lease_until>now()) THEN
   RETURN jsonb_build_object('status','in_progress');
 END IF;
 SELECT * INTO j FROM cams_grid_jobs WHERE slot=p_slot FOR UPDATE;
 IF FOUND AND j.status IN ('ready','failed') THEN
   RETURN jsonb_build_object('status',CASE WHEN j.status='ready' THEN 'not_due' ELSE 'failed' END);
 END IF;
 IF j.id IS NOT NULL AND j.created_at<now()-interval '20 minutes' THEN
   UPDATE cams_grid_jobs SET status='failed',completed_at=now() WHERE id=j.id;
   UPDATE cams_grid_generations SET status='failed' WHERE id=j.generation_id;
   RETURN jsonb_build_object('status','failed');
 END IF;
 IF j.id IS NULL THEN
   INSERT INTO cams_grid_definitions(id,latitudes,longitudes)
   VALUES(p_grid->>'id',ARRAY(SELECT jsonb_array_elements_text(p_grid->'latitudes')::float8),ARRAY(SELECT jsonb_array_elements_text(p_grid->'longitudes')::float8)) ON CONFLICT DO NOTHING;
   INSERT INTO cams_grid_generations(grid_id) VALUES(p_grid->>'id') RETURNING id INTO gid;
   INSERT INTO cams_grid_jobs(slot,generation_id,batch_count) VALUES(p_slot,gid,p_batches) RETURNING * INTO j;
 END IF;
 UPDATE cams_grid_jobs SET lease_token=p_token,lease_until=now()+interval '90 seconds' WHERE id=j.id RETURNING * INTO j;
 RETURN jsonb_build_object('status','claimed','id',j.id,'next_batch',j.next_batch,'generation_id',j.generation_id);
END $function$
;
revoke all on function public.claim_cams_grid(p_slot timestamp with time zone, p_token uuid, p_grid jsonb, p_batches integer) from public,anon,authenticated;
grant execute on function public.claim_cams_grid(p_slot timestamp with time zone, p_token uuid, p_grid jsonb, p_batches integer) to service_role;
drop function public.release_cams_grid(p_job uuid, p_token uuid, p_error boolean);
CREATE OR REPLACE FUNCTION public.release_cams_grid(p_job bigint, p_token uuid, p_error boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 UPDATE cams_grid_jobs SET lease_token=NULL,lease_until=NULL,last_error=p_error,
 attempts=CASE WHEN p_error THEN attempts+1 ELSE attempts END,
 status=CASE WHEN p_error AND attempts>=4 THEN 'failed' ELSE status END
 WHERE id=p_job AND lease_token=p_token;
 UPDATE cams_grid_generations SET status='failed' WHERE id=(SELECT generation_id FROM cams_grid_jobs WHERE id=p_job AND status='failed');
 RETURN jsonb_build_object('status','released');
END $function$
;
revoke all on function public.release_cams_grid(p_job bigint, p_token uuid, p_error boolean) from public,anon,authenticated;
grant execute on function public.release_cams_grid(p_job bigint, p_token uuid, p_error boolean) to service_role;
drop function public.moderate_community_report(p_report_id uuid, p_admin_id uuid, p_decision text, p_verified_pm25 double precision, p_note text, p_trust_score double precision, p_trust_reasons jsonb);
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
    'moderation:' || target.legacy_id::text
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
revoke all on function public.moderate_community_report(p_report_id bigint, p_admin_id bigint, p_decision text, p_verified_pm25 double precision, p_note text, p_trust_score double precision, p_trust_reasons jsonb) from public,anon,authenticated;
grant execute on function public.moderate_community_report(p_report_id bigint, p_admin_id bigint, p_decision text, p_verified_pm25 double precision, p_note text, p_trust_score double precision, p_trust_reasons jsonb) to service_role;
drop function public.moderate_community_report_v2(p_report_id uuid, p_admin_id uuid, p_decision text, p_verified_pm25 double precision, p_rejection_reason_code text, p_checks jsonb, p_note text, p_trust_score double precision, p_trust_reasons jsonb);
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
    'moderation:v2:' || target.legacy_id::text
  );

  IF COALESCE((
    SELECT report_status_alerts FROM notification_preferences
    WHERE user_id = target.user_id
  ), TRUE) THEN
    dedupe_key := 'report_status:' || target.legacy_id::text;
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
revoke all on function public.moderate_community_report_v2(p_report_id bigint, p_admin_id bigint, p_decision text, p_verified_pm25 double precision, p_rejection_reason_code text, p_checks jsonb, p_note text, p_trust_score double precision, p_trust_reasons jsonb) from public,anon,authenticated;
grant execute on function public.moderate_community_report_v2(p_report_id bigint, p_admin_id bigint, p_decision text, p_verified_pm25 double precision, p_rejection_reason_code text, p_checks jsonb, p_note text, p_trust_score double precision, p_trust_reasons jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.claim_line_webhook_event(p_event_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  IF p_event_id IS NULL OR length(trim(p_event_id)) < 8 OR length(p_event_id) > 200 THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.line_webhook_events WHERE expires_at < NOW();

  INSERT INTO public.line_webhook_events(event_id)
  VALUES (p_event_id)
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$function$
;
revoke all on function public.claim_line_webhook_event(p_event_id text) from public,anon,authenticated;
grant execute on function public.claim_line_webhook_event(p_event_id text) to service_role;
drop function public.checkpoint_cams_grid(p_job uuid, p_token uuid, p_batch integer, p_payload jsonb);
CREATE OR REPLACE FUNCTION public.checkpoint_cams_grid(p_job bigint, p_token uuid, p_batch integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j cams_grid_jobs;
BEGIN
 SELECT * INTO j FROM cams_grid_jobs WHERE id=p_job FOR UPDATE;
 IF j.status<>'running' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=now() OR j.next_batch<>p_batch THEN RAISE EXCEPTION 'grid_lease_lost'; END IF;
 INSERT INTO cams_grid_chunks(job_id,batch_index,payload) VALUES(p_job,p_batch,p_payload) ON CONFLICT(job_id,batch_index) DO UPDATE SET payload=excluded.payload;
 UPDATE cams_grid_jobs SET next_batch=next_batch+1,attempts=0,last_error=false WHERE id=p_job;
 RETURN jsonb_build_object('status','checkpointed');
END $function$
;
revoke all on function public.checkpoint_cams_grid(p_job bigint, p_token uuid, p_batch integer, p_payload jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_cams_grid(p_job bigint, p_token uuid, p_batch integer, p_payload jsonb) to service_role;
drop function public.publish_cams_grid(p_job uuid, p_token uuid, p_frames jsonb, p_fingerprint text);
CREATE OR REPLACE FUNCTION public.publish_cams_grid(p_job bigint, p_token uuid, p_frames jsonb, p_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j cams_grid_jobs; grid cams_grid_definitions; f jsonb; vals float8[]; ats timestamptz[]='{}'; previous_id bigint; gid bigint; last_at timestamptz;
BEGIN
 SELECT * INTO j FROM cams_grid_jobs WHERE id=p_job FOR UPDATE;
 IF j.status<>'running' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=now() OR j.created_at<now()-interval '20 minutes' OR j.next_batch<>j.batch_count
 OR (SELECT count(*) FROM cams_grid_chunks WHERE job_id=p_job)<>j.batch_count THEN RAISE EXCEPTION 'grid_incomplete_or_lease_lost'; END IF;
 IF jsonb_array_length(p_frames) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'grid_frame_count_invalid'; END IF;
 SELECT d.* INTO grid FROM cams_grid_definitions d JOIN cams_grid_generations g ON g.grid_id=d.id WHERE g.id=j.generation_id;
 IF grid.id IS NULL THEN RAISE EXCEPTION 'grid_definition_missing'; END IF;
 FOR f IN SELECT * FROM jsonb_array_elements(p_frames) LOOP
   vals=ARRAY(SELECT CASE WHEN v='null'::jsonb THEN NULL ELSE v::text::float8 END FROM jsonb_array_elements(f->'values') v);
   IF cardinality(vals)<>cardinality(grid.latitudes)*cardinality(grid.longitudes)
      OR EXISTS(SELECT 1 FROM unnest(vals) v WHERE v IS NOT NULL AND NOT(v>=0 AND v<=2000)) THEN RAISE EXCEPTION 'grid_frame_shape_invalid'; END IF;
   IF (f->>'valid_at')::timestamptz IS NULL OR (last_at IS NOT NULL AND (f->>'valid_at')::timestamptz<=last_at) THEN RAISE EXCEPTION 'grid_time_invalid'; END IF;
   last_at=(f->>'valid_at')::timestamptz;
   ats=array_append(ats,last_at);
   INSERT INTO cams_grid_frames(generation_id,valid_at,values) VALUES(j.generation_id,last_at,vals);
 END LOOP;
 IF last_at<=now() THEN RAISE EXCEPTION 'grid_forecast_expired'; END IF;
 SELECT a.generation_id INTO previous_id FROM cams_grid_active a WHERE a.id=1;
 gid=j.generation_id;
 IF EXISTS(SELECT 1 FROM cams_grid_generations WHERE id=previous_id AND fingerprint=p_fingerprint AND grid_id=grid.id) THEN
   -- Keep original retrieval time when payload is unchanged; do not pretend it is newer.
   gid=previous_id;
   UPDATE cams_grid_jobs SET generation_id=gid WHERE id=p_job;
   DELETE FROM cams_grid_generations WHERE id=j.generation_id;
 ELSE
   UPDATE cams_grid_generations SET status='ready',retrieved_at=now(),valid_times=ats,fingerprint=p_fingerprint WHERE id=gid;
   INSERT INTO cams_grid_active(id,generation_id) VALUES(1,gid) ON CONFLICT(id) DO UPDATE SET generation_id=excluded.generation_id;
 END IF;
 UPDATE cams_grid_jobs SET status='ready',completed_at=now(),lease_until=NULL,lease_token=NULL WHERE id=p_job;
 DELETE FROM cams_grid_chunks WHERE job_id=p_job;
 -- Retain active, previous ready generation and a one-hour reader grace period.
 DELETE FROM cams_grid_generations WHERE id NOT IN(SELECT generation_id FROM cams_grid_active)
 AND id NOT IN(SELECT id FROM cams_grid_generations WHERE status='ready' ORDER BY retrieved_at DESC LIMIT 2)
 AND started_at<now()-interval '1 hour';
 DELETE FROM cams_grid_jobs WHERE created_at<now()-interval '30 days';
 RETURN jsonb_build_object('status','ready','generation_id',gid,'frame_count',cardinality(ats));
END $function$
;
revoke all on function public.publish_cams_grid(p_job bigint, p_token uuid, p_frames jsonb, p_fingerprint text) from public,anon,authenticated;
grant execute on function public.publish_cams_grid(p_job bigint, p_token uuid, p_frames jsonb, p_fingerprint text) to service_role;
drop function public.refresh_report_engagement_counts(p_report_id uuid);
CREATE OR REPLACE FUNCTION public.refresh_report_engagement_counts(p_report_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE community_reports
  SET like_count = (SELECT COUNT(*) FROM report_reactions WHERE report_id = p_report_id AND reaction = 'like'),
      dislike_count = (SELECT COUNT(*) FROM report_reactions WHERE report_id = p_report_id AND reaction = 'dislike'),
      comment_count = (SELECT COUNT(*) FROM report_comments WHERE report_id = p_report_id AND status = 'published'),
      updated_at = NOW()
  WHERE id = p_report_id;
END;
$function$
;
revoke all on function public.refresh_report_engagement_counts(p_report_id bigint) from public,anon,authenticated;
grant execute on function public.refresh_report_engagement_counts(p_report_id bigint) to service_role;
CREATE OR REPLACE FUNCTION public.report_engagement_counts_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM refresh_report_engagement_counts(COALESCE(NEW.report_id, OLD.report_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.prune_expired_cams_history(p_snapshot_cutoff timestamp with time zone, p_run_cutoff timestamp with time zone, p_batch_size integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
      declare
        v_batch_size integer := least(greatest(coalesce(p_batch_size, 1000), 1), 1000);
          v_snapshots integer;
            v_runs integer;
            begin
              with doomed as (
                  select id
                      from public.forecast_provider_snapshots
                          where provider = 'openmeteo_cams' and issued_at < p_snapshot_cutoff
                              order by issued_at
                                  limit v_batch_size
                                      for update skip locked
                                        )
                                          delete from public.forecast_provider_snapshots as snapshots
                                            using doomed
                                              where snapshots.id = doomed.id;
                                                get diagnostics v_snapshots = row_count;

                                                  with doomed as (
                                                      select id
                                                          from public.forecast_provider_sync_runs
                                                              where provider = 'openmeteo_cams' and completed_at < p_run_cutoff
                                                                  order by completed_at
                                                                      limit v_batch_size
                                                                          for update skip locked
                                                                            )
                                                                              delete from public.forecast_provider_sync_runs as runs
                                                                                using doomed
                                                                                  where runs.id = doomed.id;
                                                                                    get diagnostics v_runs = row_count;

                                                                                      return jsonb_build_object('deleted_snapshots', v_snapshots, 'deleted_runs', v_runs);
                                                                                      end;
                                                                                      $function$
;
revoke all on function public.prune_expired_cams_history(p_snapshot_cutoff timestamp with time zone, p_run_cutoff timestamp with time zone, p_batch_size integer) from public,anon,authenticated;
grant execute on function public.prune_expired_cams_history(p_snapshot_cutoff timestamp with time zone, p_run_cutoff timestamp with time zone, p_batch_size integer) to service_role;
drop function public.claim_measurement_delivery(p_event uuid);
CREATE OR REPLACE FUNCTION public.claim_measurement_delivery(p_event bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare changed integer;
begin
 insert into public.measurement_delivery_leases(event_id,lease_until) values(p_event,now()+interval '2 minutes')
 on conflict(event_id) do update set lease_until=excluded.lease_until where measurement_delivery_leases.lease_until<now();
 get diagnostics changed = row_count;
 return changed>0;
end $function$
;
revoke all on function public.claim_measurement_delivery(p_event bigint) from public,anon,authenticated;
grant execute on function public.claim_measurement_delivery(p_event bigint) to service_role;
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
 insert into public.measurement_requests (legacy_id,user_id,idempotency_key,fingerprint,place_name,lat,lon,radius_km,starts_at,expires_at,dispatch_cursor,last_processed_at,status,result_report_id,created_at,updated_at) select legacy_id,user_id,idempotency_key,fingerprint,place_name,lat,lon,radius_km,starts_at,expires_at,dispatch_cursor,last_processed_at,status,result_report_id,created_at,updated_at from jsonb_populate_record(null::public.measurement_requests,p_row) returning * into r;
 return jsonb_build_object('row',to_jsonb(r));
end $function$
;
revoke all on function public.create_measurement_request(p_row jsonb) from public,anon,authenticated;
grant execute on function public.create_measurement_request(p_row jsonb) to service_role;
drop function public.set_measurement_presence(p_user uuid, p_values jsonb);
CREATE OR REPLACE FUNCTION public.set_measurement_presence(p_user bigint, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.measurement_helper_presence;
begin
 perform pg_advisory_xact_lock(hashtextextended('presence:'||p_user::text,0));
 select * into r from public.measurement_helper_presence where user_id=p_user for update;
 if p_values ? 'enabled' then
  insert into public.measurement_helper_presence(user_id,enabled) values(p_user,(p_values->>'enabled')::boolean)
  on conflict(user_id) do update set enabled=excluded.enabled,
   lat=case when excluded.enabled then measurement_helper_presence.lat else null end,
   lon=case when excluded.enabled then measurement_helper_presence.lon else null end,
   accuracy_m=case when excluded.enabled then measurement_helper_presence.accuracy_m else null end,
   observed_at=case when excluded.enabled then measurement_helper_presence.observed_at else null end,
   updated_at=now() returning * into r;
 elsif r.enabled and (r.updated_at <= now()-interval '5 minutes' or r.observed_at is null) then
  update public.measurement_helper_presence set lat=(p_values->>'lat')::float8,lon=(p_values->>'lon')::float8,
   accuracy_m=(p_values->>'accuracy_m')::float8,observed_at=(p_values->>'observed_at')::timestamptz,updated_at=now()
   where user_id=p_user returning * into r;
 end if;
 return coalesce(to_jsonb(r),'{}'::jsonb);
end $function$
;
revoke all on function public.set_measurement_presence(p_user bigint, p_values jsonb) from public,anon,authenticated;
grant execute on function public.set_measurement_presence(p_user bigint, p_values jsonb) to service_role;
drop function public.finish_measurement_request(p_id uuid, p_status text, p_report uuid);
CREATE OR REPLACE FUNCTION public.finish_measurement_request(p_id bigint, p_status text, p_report bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare changed integer;
begin
 if p_status not in ('fulfilled','expired','cancelled') then raise exception 'invalid terminal status'; end if;
 update public.measurement_requests set status=p_status,result_report_id=p_report,updated_at=now()
 where id=p_id and status in ('scheduled','active');
 get diagnostics changed = row_count;
 if changed>0 then
  update public.user_notifications set title=case p_status when 'fulfilled' then 'คำขอนี้ได้ค่าฝุ่นแล้ว' when 'cancelled' then 'คำขอนี้ถูกยกเลิก' else 'คำขอนี้หมดเวลาแล้ว' end,
   body='เปิดดูสถานะล่าสุดของคำขอ', payload=payload||jsonb_build_object('request_status',p_status)
   where entity_type='measurement_request' and private.identifier_number('measurement_requests',entity_id)=p_id and event_type='measurement_request';
 end if;
 return changed>0;
end $function$
;
revoke all on function public.finish_measurement_request(p_id bigint, p_status text, p_report bigint) from public,anon,authenticated;
grant execute on function public.finish_measurement_request(p_id bigint, p_status text, p_report bigint) to service_role;
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
 insert into public.user_notifications (legacy_id,user_id,event_type,title,body,url,entity_type,entity_id,payload,deduplication_key,read_at,created_at) select legacy_id,user_id,event_type,title,body,url,entity_type,entity_id,payload,deduplication_key,read_at,created_at from jsonb_populate_record(null::public.user_notifications,p_notification)
 on conflict(user_id,deduplication_key) do nothing;
 if p_outbox is not null then
  insert into public.notification_outbox (legacy_id,user_id,notification_id,event_key,payload,status,attempts,next_attempt_at,last_error,processed_at,created_at,updated_at) select legacy_id,user_id,notification_id,event_key,payload,status,attempts,next_attempt_at,last_error,processed_at,created_at,updated_at from jsonb_populate_record(null::public.notification_outbox,p_outbox || jsonb_build_object('notification_id',(select id from public.user_notifications where user_id=target and deduplication_key=p_notification->>'deduplication_key')))
  on conflict(event_key) do nothing;
 end if;
 return true;
end $function$
;
revoke all on function public.notify_measurement_request(p_notification jsonb, p_outbox jsonb) from public,anon,authenticated;
grant execute on function public.notify_measurement_request(p_notification jsonb, p_outbox jsonb) to service_role;
alter policy profiles_read_own on public.profiles using ((select auth.uid())=auth_user_id);
alter policy user_notifications_read_own on public.user_notifications using (exists(select 1 from public.profiles p where p.id=user_id and p.auth_user_id=(select auth.uid())));
update public.measurement_requests set dispatch_cursor=null where status in ('scheduled','active');
create view review.activities with (security_invoker=true) as select t.code, t.active, t.created_at from public.activities t ;
revoke all on review.activities from public, anon, authenticated;
grant select on review.activities to service_role;
create view review.alert_events with (security_invoker=true) as select t.code, t.source, t.kind, t.created_at from public.alert_events t ;
revoke all on review.alert_events from public, anon, authenticated;
grant select on review.alert_events to service_role;
create view review.announcements with (security_invoker=true) as select t.code, p0.code as created_by_code, p1.code as updated_by_code, t.kind, t.expires_at, t.status, t.created_at, t.updated_at from public.announcements t left join public.profiles p0 on p0.id=t.created_by left join public.profiles p1 on p1.id=t.updated_by;
revoke all on review.announcements from public, anon, authenticated;
grant select on review.announcements to service_role;
create view review.audit_logs with (security_invoker=true) as select t.code, p2.code as actor_code, t.action, t.created_at from public.audit_logs t left join public.profiles p2 on p2.id=t.actor_id;
revoke all on review.audit_logs from public, anon, authenticated;
grant select on review.audit_logs to service_role;
create view review.cams_grid_active with (security_invoker=true) as select p3.code as generation_code from public.cams_grid_active t left join public.cams_grid_generations p3 on p3.id=t.generation_id;
revoke all on review.cams_grid_active from public, anon, authenticated;
grant select on review.cams_grid_active to service_role;
create view review.cams_grid_chunks with (security_invoker=true) as select p4.code as job_code, t.batch_index from public.cams_grid_chunks t left join public.cams_grid_jobs p4 on p4.id=t.job_id;
revoke all on review.cams_grid_chunks from public, anon, authenticated;
grant select on review.cams_grid_chunks to service_role;
create view review.cams_grid_definitions with (security_invoker=true) as select t.id as grid_id from public.cams_grid_definitions t ;
revoke all on review.cams_grid_definitions from public, anon, authenticated;
grant select on review.cams_grid_definitions to service_role;
create view review.cams_grid_frames with (security_invoker=true) as select p5.code as generation_code, t.valid_at from public.cams_grid_frames t left join public.cams_grid_generations p5 on p5.id=t.generation_id;
revoke all on review.cams_grid_frames from public, anon, authenticated;
grant select on review.cams_grid_frames to service_role;
create view review.cams_grid_generations with (security_invoker=true) as select t.code, t.grid_id, t.status, t.started_at, t.retrieved_at from public.cams_grid_generations t ;
revoke all on review.cams_grid_generations from public, anon, authenticated;
grant select on review.cams_grid_generations to service_role;
create view review.cams_grid_jobs with (security_invoker=true) as select t.code, p6.code as generation_code, t.status, t.next_batch, t.batch_count, t.created_at, t.completed_at from public.cams_grid_jobs t left join public.cams_grid_generations p6 on p6.id=t.generation_id;
revoke all on review.cams_grid_jobs from public, anon, authenticated;
grant select on review.cams_grid_jobs to service_role;
create view review.capture_sessions with (security_invoker=true) as select t.code, p7.code as user_code, t.issued_at, t.expires_at, t.created_at from public.capture_sessions t left join public.profiles p7 on p7.id=t.user_id;
revoke all on review.capture_sessions from public, anon, authenticated;
grant select on review.capture_sessions to service_role;
create view review.community_help_claims with (security_invoker=true) as select p8.code as request_code, p9.code as user_code, t.started_at from public.community_help_claims t left join public.measurement_requests p8 on p8.id=t.request_id left join public.profiles p9 on p9.id=t.user_id;
revoke all on review.community_help_claims from public, anon, authenticated;
grant select on review.community_help_claims to service_role;
create view review.community_reports with (security_invoker=true) as select t.code, p10.code as capture_session_code, p11.code as duplicate_of_report_code, p12.code as moderated_by_code, p13.code as user_code, t.pm25, t.captured_at, t.status, t.base_trust_score, t.trust_score, t.moderated_at, t.created_at, t.updated_at, t.like_count, t.dislike_count, t.comment_count from public.community_reports t left join public.capture_sessions p10 on p10.id=t.capture_session_id left join public.community_reports p11 on p11.id=t.duplicate_of_report_id left join public.profiles p12 on p12.id=t.moderated_by left join public.profiles p13 on p13.id=t.user_id;
revoke all on review.community_reports from public, anon, authenticated;
grant select on review.community_reports to service_role;
create view review.community_xp_accounts with (security_invoker=true) as select t.member_code, t.created_at from public.community_xp_accounts t ;
revoke all on review.community_xp_accounts from public, anon, authenticated;
grant select on review.community_xp_accounts to service_role;
create view review.community_xp_control with (security_invoker=true) as select t.singleton, t.enabled, t.maintenance from public.community_xp_control t ;
revoke all on review.community_xp_control from public, anon, authenticated;
grant select on review.community_xp_control to service_role;
create view review.community_xp_events with (security_invoker=true) as select t.code, p15.code as report_code, p16.code as request_code, p17.code as requester_code, p18.code as reverses_code, p19.code as user_code, t.kind, t.points, t.reason, t.occurred_at, t.recorded_at from public.community_xp_events t left join public.community_reports p15 on p15.id=t.report_id left join public.measurement_requests p16 on p16.id=t.request_id left join public.profiles p17 on p17.id=t.requester_id left join public.community_xp_events p18 on p18.id=t.reverses left join public.profiles p19 on p19.id=t.user_id;
revoke all on review.community_xp_events from public, anon, authenticated;
grant select on review.community_xp_events to service_role;
create view review.community_xp_jobs with (security_invoker=true) as select p20.code as report_code, p21.code as user_code, t.occurred_at, t.state from public.community_xp_jobs t left join public.community_reports p20 on p20.id=t.report_id left join public.profiles p21 on p21.id=t.user_id;
revoke all on review.community_xp_jobs from public, anon, authenticated;
grant select on review.community_xp_jobs to service_role;
create view review.data_issue_reports with (security_invoker=true) as select t.code, p22.code as user_code, t.status, t.created_at, t.updated_at from public.data_issue_reports t left join public.profiles p22 on p22.id=t.user_id;
revoke all on review.data_issue_reports from public, anon, authenticated;
grant select on review.data_issue_reports to service_role;
create view review.fire_feature_snapshots with (security_invoker=true) as select t.station_id, t.recorded_at, t.source_status from public.fire_feature_snapshots t ;
revoke all on review.fire_feature_snapshots from public, anon, authenticated;
grant select on review.fire_feature_snapshots to service_role;
create view review.forecast_data_quality_daily with (security_invoker=true) as select t.quality_date, t.source_name, t.station_id from public.forecast_data_quality_daily t ;
revoke all on review.forecast_data_quality_daily from public, anon, authenticated;
grant select on review.forecast_data_quality_daily to service_role;
create view review.forecast_provider_snapshots with (security_invoker=true) as select t.code, p23.code as sync_run_code, t.station_id, t.provider, t.issued_at, t.forecast_at, t.pm25, t.created_at from public.forecast_provider_snapshots t left join public.forecast_provider_sync_runs p23 on p23.id=t.sync_run_id;
revoke all on review.forecast_provider_snapshots from public, anon, authenticated;
grant select on review.forecast_provider_snapshots to service_role;
create view review.forecast_provider_sync_runs with (security_invoker=true) as select t.code, t.provider, t.status, t.station_count, t.snapshot_count, t.error_count, t.started_at, t.completed_at from public.forecast_provider_sync_runs t ;
revoke all on review.forecast_provider_sync_runs from public, anon, authenticated;
grant select on review.forecast_provider_sync_runs to service_role;
create view review.line_notification_links with (security_invoker=true) as select p24.code as user_code, t.active, t.created_at, t.updated_at from public.line_notification_links t left join public.profiles p24 on p24.id=t.user_id;
revoke all on review.line_notification_links from public, anon, authenticated;
grant select on review.line_notification_links to service_role;
create view review.line_webhook_events with (security_invoker=true) as select t.expires_at from public.line_webhook_events t ;
revoke all on review.line_webhook_events from public, anon, authenticated;
grant select on review.line_webhook_events to service_role;
create view review.measurement_delivery_leases with (security_invoker=true) as select p25.code as event_code from public.measurement_delivery_leases t left join public.notification_outbox p25 on p25.id=t.event_id;
revoke all on review.measurement_delivery_leases from public, anon, authenticated;
grant select on review.measurement_delivery_leases to service_role;
create view review.measurement_helper_presence with (security_invoker=true) as select p26.code as user_code, t.enabled, t.updated_at from public.measurement_helper_presence t left join public.profiles p26 on p26.id=t.user_id;
revoke all on review.measurement_helper_presence from public, anon, authenticated;
grant select on review.measurement_helper_presence to service_role;
create view review.measurement_request_recipients with (security_invoker=true) as select p27.code as request_code, p28.code as user_code, t.created_at from public.measurement_request_recipients t left join public.measurement_requests p27 on p27.id=t.request_id left join public.profiles p28 on p28.id=t.user_id;
revoke all on review.measurement_request_recipients from public, anon, authenticated;
grant select on review.measurement_request_recipients to service_role;
create view review.measurement_requests with (security_invoker=true) as select t.code, p29.code as dispatch_cursor_code, p30.code as result_report_code, p31.code as user_code, t.expires_at, t.status, t.created_at, t.updated_at from public.measurement_requests t left join public.profiles p29 on p29.id=t.dispatch_cursor left join public.community_reports p30 on p30.id=t.result_report_id left join public.profiles p31 on p31.id=t.user_id;
revoke all on review.measurement_requests from public, anon, authenticated;
grant select on review.measurement_requests to service_role;
create view review.notification_outbox with (security_invoker=true) as select t.code, p32.code as notification_code, p33.code as user_code, t.status, t.created_at, t.updated_at from public.notification_outbox t left join public.user_notifications p32 on p32.id=t.notification_id left join public.profiles p33 on p33.id=t.user_id;
revoke all on review.notification_outbox from public, anon, authenticated;
grant select on review.notification_outbox to service_role;
create view review.notification_preferences with (security_invoker=true) as select p34.code as user_code, t.updated_at from public.notification_preferences t left join public.profiles p34 on p34.id=t.user_id;
revoke all on review.notification_preferences from public, anon, authenticated;
grant select on review.notification_preferences to service_role;
create view review.pm25_readings with (security_invoker=true) as select t.code, t.station_id, t.pm25, t.aqi, t.recorded_at, t.created_at, t.source_status from public.pm25_readings t ;
revoke all on review.pm25_readings from public, anon, authenticated;
grant select on review.pm25_readings to service_role;
create view review.profiles with (security_invoker=true) as select t.code, t.reputation_score, t.approved_reports, t.helpful_reviews, t.created_at, t.updated_at from public.profiles t ;
revoke all on review.profiles from public, anon, authenticated;
grant select on review.profiles to service_role;
create view review.public_map_events with (security_invoker=true) as select t.code, p35.code as entity_code, t.event_type, t.created_at from public.public_map_events t left join public.community_reports p35 on p35.id=t.entity_id;
revoke all on review.public_map_events from public, anon, authenticated;
grant select on review.public_map_events to service_role;
create view review.rate_limit_windows with (security_invoker=true) as select t.action, t.window_started_at, t.request_count from public.rate_limit_windows t ;
revoke all on review.rate_limit_windows from public, anon, authenticated;
grant select on review.rate_limit_windows to service_role;
create view review.report_comments with (security_invoker=true) as select t.code, p36.code as report_code, p37.code as user_code, t.status, t.created_at, t.updated_at from public.report_comments t left join public.community_reports p36 on p36.id=t.report_id left join public.profiles p37 on p37.id=t.user_id;
revoke all on review.report_comments from public, anon, authenticated;
grant select on review.report_comments to service_role;
create view review.report_drafts with (security_invoker=true) as select t.code, p38.code as capture_session_code, p39.code as duplicate_of_report_code, p40.code as user_code, t.expires_at, t.created_at from public.report_drafts t left join public.capture_sessions p38 on p38.id=t.capture_session_id left join public.community_reports p39 on p39.id=t.duplicate_of_report_id left join public.profiles p40 on p40.id=t.user_id;
revoke all on review.report_drafts from public, anon, authenticated;
grant select on review.report_drafts to service_role;
create view review.report_evidence with (security_invoker=true) as select p41.code as capture_session_code, p42.code as report_code, t.created_at from public.report_evidence t left join public.capture_sessions p41 on p41.id=t.capture_session_id left join public.community_reports p42 on p42.id=t.report_id;
revoke all on review.report_evidence from public, anon, authenticated;
grant select on review.report_evidence to service_role;
create view review.report_reactions with (security_invoker=true) as select p43.code as report_code, p44.code as user_code, t.reaction, t.created_at, t.updated_at from public.report_reactions t left join public.community_reports p43 on p43.id=t.report_id left join public.profiles p44 on p44.id=t.user_id;
revoke all on review.report_reactions from public, anon, authenticated;
grant select on review.report_reactions to service_role;
create view review.report_reviews with (security_invoker=true) as select t.code, p45.code as report_code, p46.code as reviewer_code, t.created_at from public.report_reviews t left join public.community_reports p45 on p45.id=t.report_id left join public.profiles p46 on p46.id=t.reviewer_id;
revoke all on review.report_reviews from public, anon, authenticated;
grant select on review.report_reviews to service_role;
create view review.reputation_events with (security_invoker=true) as select t.code, p47.code as report_code, p48.code as user_code, t.points, t.reason, t.created_at from public.reputation_events t left join public.community_reports p47 on p47.id=t.report_id left join public.profiles p48 on p48.id=t.user_id;
revoke all on review.reputation_events from public, anon, authenticated;
grant select on review.reputation_events to service_role;
create view review.stations with (security_invoker=true) as select t.id as station_id, t.pm25, t.aqi, t.recorded_at, t.updated_at from public.stations t ;
revoke all on review.stations from public, anon, authenticated;
grant select on review.stations to service_role;
create view review.sync_runs with (security_invoker=true) as select t.code, t.source, t.status, t.fetched_count, t.station_count, t.reading_count, t.started_at, t.completed_at from public.sync_runs t ;
revoke all on review.sync_runs from public, anon, authenticated;
grant select on review.sync_runs to service_role;
create view review.user_notifications with (security_invoker=true) as select t.code, p49.code as user_code, t.event_type, t.created_at from public.user_notifications t left join public.profiles p49 on p49.id=t.user_id;
revoke all on review.user_notifications from public, anon, authenticated;
grant select on review.user_notifications to service_role;
create view review.weather_observations with (security_invoker=true) as select t.station_id, t.recorded_at, t.source_status from public.weather_observations t ;
revoke all on review.weather_observations from public, anon, authenticated;
grant select on review.weather_observations to service_role;
do $$ declare r record; begin for r in select * from identifier_cutover_triggers loop execute format('alter table %I.%I %s trigger %I',r.nspname,r.relname,case r.tgenabled when 'D' then 'disable' when 'R' then 'enable replica' when 'A' then 'enable always' else 'enable' end,r.tgname); end loop; end $$;
update private.identifier_control set version=2 where singleton;
notify pgrst, 'reload schema';
