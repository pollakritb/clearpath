-- Sanitized schema-only baseline: production 422013d, 44 tables; no user data.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create sequence audit_logs_id_seq;
create sequence pm25_readings_id_seq;
create sequence report_reviews_id_seq;
create sequence reputation_events_id_seq;
create table public.activities (id uuid not null,title text not null,description text not null,rule_code text,target_count int4,reward_points int4 default 0 not null,starts_at timestamptz,ends_at timestamptz,active bool default true not null,created_at timestamptz default now() not null);
create table public.alert_events (id uuid not null,deduplication_key text not null,source text not null,kind text not null,severity text not null,title text not null,body text not null,district text,subdistrict text,lat float8,lon float8,detected_at timestamptz not null,sent_at timestamptz,recipient_count int4 default 0 not null,payload jsonb default '{}'::jsonb not null,created_at timestamptz default now() not null);
create table public.announcements (id uuid not null,title text not null,body text not null,kind text default 'community'::text not null,severity text default 'info'::text not null,area text,district text,subdistrict text,published bool default false not null,published_at timestamptz default now() not null,expires_at timestamptz,status text default 'published'::text not null,image_path text,created_by uuid,updated_by uuid,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
create table public.audit_logs (id int8 default nextval('audit_logs_id_seq'::regclass) not null,actor_id uuid,action text not null,entity_type text not null,entity_id text,details jsonb default '{}'::jsonb not null,created_at timestamptz default now() not null);
create table public.cams_grid_active (id int4 not null,generation_id uuid not null);
create table public.cams_grid_chunks (job_id uuid not null,batch_index int4 not null,payload jsonb not null);
create table public.cams_grid_definitions (id text not null,latitudes float8[] not null,longitudes float8[] not null);
create table public.cams_grid_frames (generation_id uuid not null,valid_at timestamptz not null,values float8[] not null);
create table public.cams_grid_generations (id uuid default gen_random_uuid() not null,grid_id text not null,status text default 'staging'::text not null,started_at timestamptz default now() not null,retrieved_at timestamptz,model_issued_at timestamptz,valid_times timestamptz[] default '{}'::timestamp with time zone[] not null,fingerprint text);
create table public.cams_grid_jobs (id uuid default gen_random_uuid() not null,slot timestamptz not null,generation_id uuid,status text default 'running'::text not null,next_batch int4 default 0 not null,batch_count int4 not null,lease_token uuid,lease_until timestamptz,attempts int4 default 0 not null,created_at timestamptz default now() not null,completed_at timestamptz,last_error bool default false not null);
create table public.capture_sessions (id uuid not null,user_id uuid not null,issued_at timestamptz not null,expires_at timestamptz not null,consumed_at timestamptz,created_at timestamptz default now() not null);
create table public.community_help_claims (request_id uuid not null,user_id uuid not null,started_at timestamptz default now() not null);
create table public.community_reports (id uuid not null,user_id uuid not null,display_name text,lat float8 not null,lon float8 not null,province text default 'นครปฐม'::text not null,district text,subdistrict text,pm25 float8,ocr_pm25 float8,ocr_confidence float8 default 0 not null,ocr_raw_text text,device_detected bool default false not null,display_clear bool default false not null,capture_source text default 'camera'::text not null,capture_session_id uuid not null,image_path text,image_sha256 text,image_ahash text,burst_hashes jsonb default '[]'::jsonb not null,duplicate_of_report_id uuid,device_model text,device_serial text,device_calibrated bool default false not null,calibration_evidence_path text,calibrated_at date,averaging_period text default 'instant'::text not null,measurement_duration_seconds int4 default 0 not null,measurement_environment text default 'outdoor'::text not null,measurement_stable bool default true not null,near_emission_source bool default false not null,measurement_note text,gps_accuracy_m float8,captured_at timestamptz not null,status text default 'pending'::text not null,base_trust_score float8 default 0 not null,trust_score float8 default 0 not null,trust_reasons jsonb default '[]'::jsonb not null,peer_up int4 default 0 not null,peer_down int4 default 0 not null,moderated_by uuid,moderation_note text,moderated_at timestamptz,retention_until timestamptz,audit_hold bool default false not null,created_at timestamptz default now() not null,updated_at timestamptz default now() not null,user_claimed_pm25 float8,admin_verified_pm25 float8,public_lat float8,public_lon float8,camera_session_issued_at timestamptz,client_captured_at timestamptz,server_received_at timestamptz default now() not null,clock_warning bool default false not null,ocr_mismatch bool default false not null,rejection_reason_code text,moderation_checks jsonb default '{}'::jsonb not null,evidence_purged_at timestamptz,rating_count int4 default 0 not null,rating_average float8,policy_version text default 'trust-v1'::text not null,source_type text default 'individual'::text not null,show_reporter_profile bool default false not null,reporter_avatar_url text,like_count int4 default 0 not null,dislike_count int4 default 0 not null,comment_count int4 default 0 not null,image_metadata jsonb default '{}'::jsonb not null);
create table public.community_xp_accounts (user_id uuid not null,member_id uuid default gen_random_uuid() not null,alias text default ('สมาชิก CP-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) not null,hidden bool default false not null,created_at timestamptz default now() not null);
create table public.community_xp_control (singleton bool default true not null,enabled bool default false not null,maintenance bool default false not null,reset_version uuid default gen_random_uuid() not null,reset_manifest text);
create table public.community_xp_events (id uuid default gen_random_uuid() not null,user_id uuid not null,report_id uuid,request_id uuid,requester_id uuid,kind text not null,points int4 not null,reason text not null,occurred_at timestamptz not null,recorded_at timestamptz default now() not null,policy_version text default 'xp-v1'::text not null,reverses uuid);
create table public.community_xp_jobs (report_id uuid not null,user_id uuid not null,occurred_at timestamptz not null,report_snapshot jsonb not null,evidence_snapshot jsonb not null,state text default 'pending'::text not null,processed_at timestamptz);
create table public.data_issue_reports (id uuid not null,user_id uuid not null,category text not null,reference_id text,message text not null,status text default 'new'::text not null,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
create table public.fire_feature_snapshots (station_id text not null,recorded_at timestamptz not null,hotspot_count int4 default 0 not null,weighted_frp float8 default 0 not null,upwind_hotspot_count int4 default 0 not null,source_at timestamptz not null,ingested_at timestamptz default now() not null,source_status text default 'observed'::text not null);
create table public.forecast_data_quality_daily (quality_date date not null,source_name text not null,station_id text not null,expected_hours int4 not null,observed_hours int4 not null,missing_hours int4 not null,duplicate_hours int4 not null,invalid_rows int4 not null,newest_source_at timestamptz,details jsonb default '{}'::jsonb not null,reconciled_at timestamptz default now() not null);
create table public.forecast_provider_snapshots (id uuid default gen_random_uuid() not null,sync_run_id uuid,station_id text not null,provider text not null,issued_at timestamptz not null,forecast_at timestamptz not null,horizon_hours int4 not null,pm25 float8 not null,unit text default 'µg/m³'::text not null,raw_metadata jsonb default '{}'::jsonb not null,created_at timestamptz default now() not null);
create table public.forecast_provider_sync_runs (id uuid default gen_random_uuid() not null,provider text not null,status text not null,station_count int4 default 0 not null,snapshot_count int4 default 0 not null,error_count int4 default 0 not null,error_message text,started_at timestamptz default now() not null,completed_at timestamptz,metadata jsonb default '{}'::jsonb not null);
create table public.line_notification_links (user_id uuid not null,line_user_id text,link_code_hash text,link_code_expires_at timestamptz,active bool default false not null,linked_at timestamptz,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
create table public.line_webhook_events (event_id text not null,processed_at timestamptz default now() not null,expires_at timestamptz default (now() + '7 days'::interval) not null);
create table public.measurement_delivery_leases (event_id uuid not null,lease_until timestamptz not null);
create table public.measurement_helper_presence (user_id uuid not null,enabled bool default false not null,lat float8,lon float8,accuracy_m float8,observed_at timestamptz,updated_at timestamptz default now() not null);
create table public.measurement_request_recipients (request_id uuid not null,user_id uuid not null,matched_location_at timestamptz not null,declined bool default false not null,created_at timestamptz default now() not null);
create table public.measurement_requests (id uuid not null,user_id uuid not null,idempotency_key uuid not null,fingerprint text not null,place_name text not null,lat float8 not null,lon float8 not null,radius_km int4 not null,starts_at timestamptz not null,expires_at timestamptz not null,dispatch_cursor uuid,last_processed_at timestamptz,status text not null,result_report_id uuid,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
create table public.notification_outbox (id uuid not null,user_id uuid not null,notification_id uuid,event_key text not null,payload jsonb not null,status text default 'pending'::text not null,attempts int4 default 0 not null,next_attempt_at timestamptz default now() not null,last_error text,processed_at timestamptz,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
create table public.notification_preferences (user_id uuid not null,district text,subdistrict text,radius_km float8,center_lat float8,center_lon float8,pm25_threshold float8 default 37.5 not null,air_alerts bool default true not null,hotspot_alerts bool default true not null,community_alerts bool default false not null,updated_at timestamptz default now() not null,report_status_alerts bool default true not null,rating_alerts bool default true not null,reward_alerts bool default true not null,leaderboard_alerts bool default false not null,announcement_alerts bool default true not null,line_enabled bool default true not null,web_push_enabled bool default true not null,quiet_hours_start text default '22:00'::text,quiet_hours_end text default '07:00'::text,timezone text default 'Asia/Bangkok'::text not null,consent_granted bool default false not null,consent_granted_at timestamptz);
create table public.pm25_readings (id int8 default nextval('pm25_readings_id_seq'::regclass) not null,station_id text,pm25 float8,aqi int4,recorded_at timestamptz not null,created_at timestamptz default now(),source_at timestamptz not null,ingested_at timestamptz default now() not null,source_status text default 'observed'::text not null);
create table public.profiles (id uuid not null,display_name text,role text default 'user'::text not null,reputation_score int4 default 0 not null,approved_reports int4 default 0 not null,helpful_reviews int4 default 0 not null,created_at timestamptz default now() not null,updated_at timestamptz default now() not null,avatar_url text,identity_provider text);
create table public.public_map_events (id uuid not null,event_type text not null,entity_id uuid not null,created_at timestamptz default now() not null);
create table public.rate_limit_windows (actor_key text not null,action text not null,window_started_at timestamptz not null,request_count int4 default 0 not null);
create table public.report_comments (id uuid not null,report_id uuid not null,user_id uuid not null,body text not null,status text default 'published'::text not null,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
create table public.report_drafts (id uuid not null,user_id uuid not null,capture_session_id uuid not null,exact_lat float8 not null,exact_lon float8 not null,gps_accuracy_m float8,camera_session_issued_at timestamptz not null,client_captured_at timestamptz not null,effective_captured_at timestamptz not null,server_received_at timestamptz default now() not null,clock_warning bool default false not null,image_path text not null,image_sha256 text not null,image_ahash text,burst_hashes jsonb default '[]'::jsonb not null,duplicate_of_report_id uuid,ocr_pm25 float8,ocr_confidence float8 default 0 not null,ocr_raw_text text,device_detected bool default false not null,display_clear bool default false not null,expires_at timestamptz not null,submitted_at timestamptz,created_at timestamptz default now() not null,ocr_status text default 'unavailable'::text not null,unexpected_exif bool default false not null,capture_source text default 'camera'::text not null,image_metadata jsonb default '{}'::jsonb not null,original_image_path text);
create table public.report_evidence (report_id uuid not null,exact_lat float8,exact_lon float8,gps_accuracy_m float8,capture_session_id uuid,camera_session_issued_at timestamptz,client_captured_at timestamptz,server_received_at timestamptz default now() not null,image_path text,image_sha256 text,image_ahash text,burst_hashes jsonb default '[]'::jsonb not null,ocr_raw_text text,retention_until timestamptz,purged_at timestamptz,audit_hold bool default false not null,created_at timestamptz default now() not null,ocr_status text default 'unavailable'::text not null,unexpected_exif bool default false not null,image_metadata jsonb default '{}'::jsonb not null,original_image_path text);
create table public.report_reactions (report_id uuid not null,user_id uuid not null,reaction text not null,created_at timestamptz default now() not null,updated_at timestamptz default now() not null);
create table public.report_reviews (id int8 default nextval('report_reviews_id_seq'::regclass) not null,report_id uuid not null,reviewer_id uuid not null,verdict text not null,reason_code text not null,reviewer_distance_km float8 not null,gps_accuracy_m float8,note text,weight float8 default 1 not null,rewarded_at timestamptz,created_at timestamptz default now() not null,rating int2,rating_direction text,consensus_matched bool);
create table public.reputation_events (id int8 default nextval('reputation_events_id_seq'::regclass) not null,user_id uuid not null,report_id uuid,points int4 not null,reason text not null,idempotency_key text not null,created_at timestamptz default now() not null);
create table public.stations (id text not null,name_th text,name_en text,lat float8 not null,lon float8 not null,province text,pm25 float8,aqi int4,color text,level text,recorded_at timestamptz,updated_at timestamptz default now(),district text);
create table public.sync_runs (id uuid not null,source text not null,status text not null,fetched_count int4 default 0 not null,station_count int4 default 0 not null,reading_count int4 default 0 not null,source_recorded_at timestamptz,error_message text,started_at timestamptz default now() not null,completed_at timestamptz,rejected_count int4 default 0 not null,rejection_summary jsonb default '{}'::jsonb not null);
create table public.user_notifications (id uuid not null,user_id uuid not null,event_type text not null,title text not null,body text not null,url text default '/'::text not null,entity_type text,entity_id text,payload jsonb default '{}'::jsonb not null,deduplication_key text not null,read_at timestamptz,created_at timestamptz default now() not null);
create table public.weather_observations (station_id text not null,recorded_at timestamptz not null,temperature float8,humidity float8,wind_speed float8,wind_deg float8,rain_mm float8,source_at timestamptz not null,ingested_at timestamptz default now() not null,source_status text default 'observed'::text not null);
alter table public.stations add constraint stations_pkey PRIMARY KEY (id);
alter table public.pm25_readings add constraint pm25_readings_pkey PRIMARY KEY (id);
alter table public.pm25_readings add constraint pm25_readings_station_id_recorded_at_key UNIQUE (station_id, recorded_at);
alter table public.profiles add constraint profiles_display_name_check CHECK ((char_length(display_name) <= 80));
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'moderator'::text, 'admin'::text])));
alter table public.profiles add constraint profiles_reputation_score_check CHECK ((reputation_score >= 0));
alter table public.profiles add constraint profiles_approved_reports_check CHECK ((approved_reports >= 0));
alter table public.profiles add constraint profiles_helpful_reviews_check CHECK ((helpful_reviews >= 0));
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.capture_sessions add constraint capture_sessions_check CHECK ((expires_at > issued_at));
alter table public.capture_sessions add constraint capture_sessions_pkey PRIMARY KEY (id);
alter table public.community_reports add constraint community_reports_lat_check CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)));
alter table public.community_reports add constraint community_reports_lon_check CHECK (((lon >= ('-180'::integer)::double precision) AND (lon <= (180)::double precision)));
alter table public.community_reports add constraint community_reports_pm25_check CHECK (((pm25 >= (0)::double precision) AND (pm25 <= (1000)::double precision)));
alter table public.community_reports add constraint community_reports_ocr_pm25_check CHECK (((ocr_pm25 >= (0)::double precision) AND (ocr_pm25 <= (1000)::double precision)));
alter table public.community_reports add constraint community_reports_ocr_confidence_check CHECK (((ocr_confidence >= (0)::double precision) AND (ocr_confidence <= (1)::double precision)));
alter table public.community_reports add constraint community_reports_averaging_period_check CHECK ((averaging_period = ANY (ARRAY['instant'::text, '1_minute'::text, '5_minutes'::text])));
alter table public.community_reports add constraint community_reports_measurement_duration_seconds_check CHECK (((measurement_duration_seconds >= 0) AND (measurement_duration_seconds <= 600)));
alter table public.community_reports add constraint community_reports_measurement_environment_check CHECK ((measurement_environment = 'outdoor'::text));
alter table public.community_reports add constraint community_reports_measurement_note_check CHECK ((char_length(measurement_note) <= 300));
alter table public.community_reports add constraint community_reports_gps_accuracy_m_check CHECK ((gps_accuracy_m >= (0)::double precision));
alter table public.community_reports add constraint community_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.community_reports add constraint community_reports_base_trust_score_check CHECK (((base_trust_score >= (0)::double precision) AND (base_trust_score <= (100)::double precision)));
alter table public.community_reports add constraint community_reports_trust_score_check CHECK (((trust_score >= (0)::double precision) AND (trust_score <= (100)::double precision)));
alter table public.community_reports add constraint approved_requires_pm25 CHECK (((status <> 'approved'::text) OR (pm25 IS NOT NULL)));
alter table public.community_reports add constraint pending_has_no_verified_pm25 CHECK (((status <> 'pending'::text) OR (pm25 IS NULL)));
alter table public.community_reports add constraint calibrated_requires_metadata CHECK (((NOT device_calibrated) OR (calibrated_at IS NOT NULL)));
alter table public.community_reports add constraint community_reports_pkey PRIMARY KEY (id);
alter table public.community_reports add constraint community_reports_capture_session_id_key UNIQUE (capture_session_id);
alter table public.community_reports add constraint community_reports_image_sha256_key UNIQUE (image_sha256);
alter table public.report_reviews add constraint report_reviews_verdict_check CHECK ((verdict = ANY (ARRAY['confirm'::text, 'dispute'::text])));
alter table public.report_reviews add constraint report_reviews_reviewer_distance_km_check CHECK ((reviewer_distance_km >= (0)::double precision));
alter table public.report_reviews add constraint report_reviews_weight_check CHECK (((weight >= (1)::double precision) AND (weight <= (5)::double precision)));
alter table public.report_reviews add constraint report_reviews_pkey PRIMARY KEY (id);
alter table public.report_reviews add constraint report_reviews_report_id_reviewer_id_key UNIQUE (report_id, reviewer_id);
alter table public.reputation_events add constraint reputation_events_pkey PRIMARY KEY (id);
alter table public.reputation_events add constraint reputation_events_idempotency_key_key UNIQUE (idempotency_key);
alter table public.announcements add constraint announcements_kind_check CHECK ((kind = ANY (ARRAY['news'::text, 'alert'::text, 'community'::text])));
alter table public.announcements add constraint announcements_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'watch'::text, 'warning'::text])));
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.activities add constraint activities_target_count_check CHECK (((target_count IS NULL) OR (target_count > 0)));
alter table public.activities add constraint activities_reward_points_check CHECK ((reward_points >= 0));
alter table public.activities add constraint activities_pkey PRIMARY KEY (id);
alter table public.sync_runs add constraint sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text])));
alter table public.sync_runs add constraint sync_runs_pkey PRIMARY KEY (id);
alter table public.rate_limit_windows add constraint rate_limit_windows_pkey PRIMARY KEY (actor_key, action, window_started_at);
alter table public.notification_preferences add constraint notification_preferences_radius_km_check CHECK (((radius_km IS NULL) OR ((radius_km >= (1)::double precision) AND (radius_km <= (50)::double precision))));
alter table public.notification_preferences add constraint notification_preferences_pkey PRIMARY KEY (user_id);
alter table public.alert_events add constraint alert_events_pkey PRIMARY KEY (id);
alter table public.alert_events add constraint alert_events_deduplication_key_key UNIQUE (deduplication_key);
alter table public.weather_observations add constraint weather_observations_pkey PRIMARY KEY (station_id, recorded_at);
alter table public.fire_feature_snapshots add constraint fire_feature_snapshots_pkey PRIMARY KEY (station_id, recorded_at);
alter table public.community_reports add constraint community_reports_dislike_count_check CHECK ((dislike_count >= 0));
alter table public.report_drafts add constraint report_drafts_capture_source_check CHECK ((capture_source = ANY (ARRAY['camera'::text, 'gallery'::text])));
alter table public.community_reports add constraint community_reports_capture_source_check CHECK ((capture_source = ANY (ARRAY['camera'::text, 'gallery'::text])));
alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
alter table public.report_drafts add constraint report_drafts_exact_lat_check CHECK (((exact_lat >= ('-90'::integer)::double precision) AND (exact_lat <= (90)::double precision)));
alter table public.report_drafts add constraint report_drafts_exact_lon_check CHECK (((exact_lon >= ('-180'::integer)::double precision) AND (exact_lon <= (180)::double precision)));
alter table public.report_drafts add constraint report_drafts_gps_accuracy_m_check CHECK (((gps_accuracy_m IS NULL) OR (gps_accuracy_m >= (0)::double precision)));
alter table public.report_drafts add constraint report_drafts_ocr_pm25_check CHECK (((ocr_pm25 >= (0)::double precision) AND (ocr_pm25 <= (1000)::double precision)));
alter table public.report_drafts add constraint report_drafts_ocr_confidence_check CHECK (((ocr_confidence >= (0)::double precision) AND (ocr_confidence <= (1)::double precision)));
alter table public.report_drafts add constraint report_drafts_check CHECK ((expires_at > created_at));
alter table public.report_drafts add constraint report_drafts_pkey PRIMARY KEY (id);
alter table public.report_drafts add constraint report_drafts_capture_session_id_key UNIQUE (capture_session_id);
alter table public.report_evidence add constraint report_evidence_exact_lat_check CHECK (((exact_lat >= ('-90'::integer)::double precision) AND (exact_lat <= (90)::double precision)));
alter table public.report_evidence add constraint report_evidence_exact_lon_check CHECK (((exact_lon >= ('-180'::integer)::double precision) AND (exact_lon <= (180)::double precision)));
alter table public.report_evidence add constraint report_evidence_gps_accuracy_m_check CHECK (((gps_accuracy_m IS NULL) OR (gps_accuracy_m >= (0)::double precision)));
alter table public.report_evidence add constraint report_evidence_pkey PRIMARY KEY (report_id);
alter table public.report_evidence add constraint report_evidence_capture_session_id_key UNIQUE (capture_session_id);
alter table public.community_reports add constraint community_reports_user_claimed_pm25_check CHECK (((user_claimed_pm25 >= (0)::double precision) AND (user_claimed_pm25 <= (1000)::double precision)));
alter table public.community_reports add constraint community_reports_admin_verified_pm25_check CHECK (((admin_verified_pm25 >= (0)::double precision) AND (admin_verified_pm25 <= (1000)::double precision)));
alter table public.community_reports add constraint community_reports_public_lat_check CHECK (((public_lat >= ('-90'::integer)::double precision) AND (public_lat <= (90)::double precision)));
alter table public.community_reports add constraint community_reports_public_lon_check CHECK (((public_lon >= ('-180'::integer)::double precision) AND (public_lon <= (180)::double precision)));
alter table public.community_reports add constraint community_reports_rating_count_check CHECK ((rating_count >= 0));
alter table public.community_reports add constraint community_reports_rating_average_check CHECK (((rating_average >= (1)::double precision) AND (rating_average <= (5)::double precision)));
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_provider_check CHECK ((provider = ANY (ARRAY['openweather'::text, 'openmeteo_cams'::text])));
alter table public.report_reviews add constraint report_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.report_reviews add constraint report_reviews_rating_direction_check CHECK ((rating_direction = ANY (ARRAY['negative'::text, 'neutral'::text, 'positive'::text])));
alter table public.user_notifications add constraint user_notifications_pkey PRIMARY KEY (id);
alter table public.user_notifications add constraint user_notifications_user_id_deduplication_key_key UNIQUE (user_id, deduplication_key);
alter table public.notification_outbox add constraint notification_outbox_attempts_check CHECK ((attempts >= 0));
alter table public.notification_outbox add constraint notification_outbox_pkey PRIMARY KEY (id);
alter table public.notification_outbox add constraint notification_outbox_event_key_key UNIQUE (event_key);
alter table public.public_map_events add constraint public_map_events_event_type_check CHECK ((event_type = ANY (ARRAY['report_approved'::text, 'report_updated'::text, 'report_expired'::text])));
alter table public.public_map_events add constraint public_map_events_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text, 'expired'::text])));
alter table public.pm25_readings add constraint pm25_readings_source_status_check CHECK ((source_status = ANY (ARRAY['observed'::text, 'missing'::text, 'unavailable'::text, 'not_applicable'::text, 'invalid'::text])));
alter table public.weather_observations add constraint weather_observations_source_status_check CHECK ((source_status = ANY (ARRAY['observed'::text, 'missing'::text, 'unavailable'::text, 'not_applicable'::text, 'invalid'::text])));
alter table public.fire_feature_snapshots add constraint fire_feature_snapshots_source_status_check CHECK ((source_status = ANY (ARRAY['observed'::text, 'missing'::text, 'unavailable'::text, 'not_applicable'::text, 'invalid'::text])));
alter table public.forecast_data_quality_daily add constraint forecast_data_quality_daily_expected_hours_check CHECK ((expected_hours >= 0));
alter table public.forecast_data_quality_daily add constraint forecast_data_quality_daily_observed_hours_check CHECK ((observed_hours >= 0));
alter table public.forecast_data_quality_daily add constraint forecast_data_quality_daily_missing_hours_check CHECK ((missing_hours >= 0));
alter table public.forecast_data_quality_daily add constraint forecast_data_quality_daily_duplicate_hours_check CHECK ((duplicate_hours >= 0));
alter table public.forecast_data_quality_daily add constraint forecast_data_quality_daily_invalid_rows_check CHECK ((invalid_rows >= 0));
alter table public.forecast_data_quality_daily add constraint forecast_data_quality_daily_pkey PRIMARY KEY (quality_date, source_name, station_id);
alter table public.line_notification_links add constraint line_notification_links_link_code_hash_key UNIQUE (link_code_hash);
alter table public.community_xp_accounts add constraint community_xp_accounts_alias_check CHECK (((char_length(alias) >= 3) AND (char_length(alias) <= 40)));
alter table public.community_xp_accounts add constraint community_xp_accounts_pkey PRIMARY KEY (user_id);
alter table public.community_xp_accounts add constraint community_xp_accounts_member_id_key UNIQUE (member_id);
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_horizon_hours_check CHECK (((horizon_hours >= 0) AND (horizon_hours <= 168)));
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_pm25_check CHECK ((pm25 >= (0)::double precision));
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_unit_check CHECK ((unit = 'µg/m³'::text));
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_station_id_provider_issued_at_f_key UNIQUE (station_id, provider, issued_at, forecast_at);
alter table public.forecast_provider_snapshots add constraint forecast_provider_snapshots_pkey PRIMARY KEY (id);
alter table public.data_issue_reports add constraint data_issue_reports_category_check CHECK ((category = ANY (ARRAY['station'::text, 'forecast'::text, 'map'::text, 'community'::text, 'other'::text])));
alter table public.data_issue_reports add constraint data_issue_reports_reference_id_check CHECK (((reference_id IS NULL) OR (length(reference_id) <= 100)));
alter table public.data_issue_reports add constraint data_issue_reports_message_check CHECK (((length(message) >= 10) AND (length(message) <= 1000)));
alter table public.data_issue_reports add constraint data_issue_reports_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])));
alter table public.data_issue_reports add constraint data_issue_reports_pkey PRIMARY KEY (id);
alter table public.forecast_provider_sync_runs add constraint forecast_provider_sync_runs_provider_check CHECK ((provider = ANY (ARRAY['openweather'::text, 'openmeteo_cams'::text])));
alter table public.forecast_provider_sync_runs add constraint forecast_provider_sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'failed'::text])));
alter table public.forecast_provider_sync_runs add constraint forecast_provider_sync_runs_pkey PRIMARY KEY (id);
alter table public.line_notification_links add constraint line_notification_links_pkey PRIMARY KEY (user_id);
alter table public.line_notification_links add constraint line_notification_links_line_user_id_key UNIQUE (line_user_id);
alter table public.measurement_helper_presence add constraint measurement_helper_presence_lat_check CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)));
alter table public.measurement_helper_presence add constraint measurement_helper_presence_lon_check CHECK (((lon >= ('-180'::integer)::double precision) AND (lon <= (180)::double precision)));
alter table public.measurement_helper_presence add constraint measurement_helper_presence_accuracy_m_check CHECK (((accuracy_m >= (0)::double precision) AND (accuracy_m <= (200)::double precision)));
alter table public.community_reports add constraint community_reports_source_type_check CHECK ((source_type = ANY (ARRAY['individual'::text, 'community_sensor'::text])));
alter table public.line_webhook_events add constraint line_webhook_events_pkey PRIMARY KEY (event_id);
alter table public.measurement_helper_presence add constraint measurement_helper_presence_check CHECK ((((lat IS NULL) AND (lon IS NULL) AND (accuracy_m IS NULL) AND (observed_at IS NULL)) OR (enabled AND (lat IS NOT NULL) AND (lon IS NOT NULL) AND (accuracy_m IS NOT NULL) AND (observed_at IS NOT NULL))));
alter table public.measurement_helper_presence add constraint measurement_helper_presence_pkey PRIMARY KEY (user_id);
alter table public.community_xp_events add constraint community_xp_events_kind_check CHECK ((kind = ANY (ARRAY['report'::text, 'help'::text, 'reversal'::text])));
alter table public.community_reports add constraint community_reports_comment_count_check CHECK ((comment_count >= 0));
alter table public.report_reactions add constraint report_reactions_reaction_check CHECK ((reaction = ANY (ARRAY['like'::text, 'dislike'::text])));
alter table public.report_reactions add constraint report_reactions_pkey PRIMARY KEY (report_id, user_id);
alter table public.measurement_requests add constraint measurement_requests_place_name_check CHECK (((char_length(place_name) >= 1) AND (char_length(place_name) <= 160)));
alter table public.measurement_requests add constraint measurement_requests_lat_check CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)));
alter table public.measurement_requests add constraint measurement_requests_lon_check CHECK (((lon >= ('-180'::integer)::double precision) AND (lon <= (180)::double precision)));
alter table public.report_drafts add constraint report_drafts_ocr_status_check CHECK ((ocr_status = ANY (ARRAY['unavailable'::text, 'service_error'::text, 'no_device'::text, 'unclear_display'::text, 'no_reading'::text, 'low_confidence'::text, 'ready'::text])));
alter table public.report_evidence add constraint report_evidence_ocr_status_check CHECK ((ocr_status = ANY (ARRAY['unavailable'::text, 'service_error'::text, 'no_device'::text, 'unclear_display'::text, 'no_reading'::text, 'low_confidence'::text, 'ready'::text])));
alter table public.notification_preferences add constraint notification_preferences_quiet_hours_start_check CHECK (((quiet_hours_start IS NULL) OR (quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text)));
alter table public.notification_preferences add constraint notification_preferences_quiet_hours_end_check CHECK (((quiet_hours_end IS NULL) OR (quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text)));
alter table public.notification_preferences add constraint notification_preferences_timezone_check CHECK ((timezone = 'Asia/Bangkok'::text));
alter table public.notification_outbox add constraint notification_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'dead'::text])));
alter table public.community_reports add constraint community_reports_like_count_check CHECK ((like_count >= 0));
alter table public.report_comments add constraint report_comments_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 500)));
alter table public.report_comments add constraint report_comments_status_check CHECK ((status = ANY (ARRAY['published'::text, 'hidden'::text])));
alter table public.report_comments add constraint report_comments_pkey PRIMARY KEY (id);
alter table public.measurement_requests add constraint measurement_requests_radius_km_check CHECK ((radius_km = ANY (ARRAY[1, 3, 5])));
alter table public.measurement_requests add constraint measurement_requests_check CHECK ((expires_at > starts_at));
alter table public.measurement_requests add constraint measurement_requests_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'fulfilled'::text, 'expired'::text, 'cancelled'::text])));
alter table public.measurement_requests add constraint measurement_requests_pkey PRIMARY KEY (id);
alter table public.measurement_requests add constraint measurement_requests_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
alter table public.measurement_request_recipients add constraint measurement_request_recipients_pkey PRIMARY KEY (request_id, user_id);
alter table public.measurement_delivery_leases add constraint measurement_delivery_leases_pkey PRIMARY KEY (event_id);
alter table public.community_xp_events add constraint community_xp_events_check CHECK ((((kind = 'report'::text) AND (points = ANY (ARRAY[0, 10]))) OR ((kind = 'help'::text) AND (points = ANY (ARRAY[0, 5]))) OR ((kind = 'reversal'::text) AND (points < 0))));
alter table public.community_xp_events add constraint community_xp_events_pkey PRIMARY KEY (id);
alter table public.community_xp_events add constraint community_xp_events_reverses_key UNIQUE (reverses);
alter table public.community_xp_events add constraint community_xp_events_report_id_kind_key UNIQUE (report_id, kind);
alter table public.community_help_claims add constraint community_help_claims_pkey PRIMARY KEY (request_id, user_id);
alter table public.community_xp_jobs add constraint community_xp_jobs_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'done'::text])));
alter table public.community_xp_jobs add constraint community_xp_jobs_pkey PRIMARY KEY (report_id);
alter table public.community_xp_control add constraint community_xp_control_singleton_check CHECK (singleton);
alter table public.community_xp_control add constraint community_xp_control_pkey PRIMARY KEY (singleton);
alter table public.cams_grid_definitions add constraint cams_grid_definitions_latitudes_check CHECK (((cardinality(latitudes) >= 2) AND (cardinality(latitudes) <= 100)));
alter table public.cams_grid_definitions add constraint cams_grid_definitions_longitudes_check CHECK (((cardinality(longitudes) >= 2) AND (cardinality(longitudes) <= 100)));
alter table public.cams_grid_definitions add constraint cams_grid_definitions_pkey PRIMARY KEY (id);
alter table public.cams_grid_generations add constraint cams_grid_generations_status_check CHECK ((status = ANY (ARRAY['staging'::text, 'ready'::text, 'failed'::text])));
alter table public.cams_grid_generations add constraint cams_grid_generations_pkey PRIMARY KEY (id);
alter table public.cams_grid_frames add constraint cams_grid_frames_pkey PRIMARY KEY (generation_id, valid_at);
alter table public.cams_grid_active add constraint cams_grid_active_id_check CHECK ((id = 1));
alter table public.cams_grid_active add constraint cams_grid_active_pkey PRIMARY KEY (id);
alter table public.cams_grid_jobs add constraint cams_grid_jobs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'ready'::text, 'failed'::text])));
alter table public.cams_grid_jobs add constraint cams_grid_jobs_pkey PRIMARY KEY (id);
alter table public.cams_grid_jobs add constraint cams_grid_jobs_slot_key UNIQUE (slot);
alter table public.cams_grid_chunks add constraint cams_grid_chunks_pkey PRIMARY KEY (job_id, batch_index);
alter table public.pm25_readings add constraint pm25_readings_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
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
CREATE OR REPLACE FUNCTION public.claim_community_help(p_user uuid, p_request uuid)
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
CREATE OR REPLACE FUNCTION public.process_community_xp(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.community_xp_jobs; r jsonb; e jsonb; m jsonb; req public.measurement_requests; c public.community_help_claims;
 t timestamptz; submitted timestamptz; captured timestamptz; day_start timestamptz; last_xp timestamptz;
 v_request uuid; base_reason text; bonus_reason text; base integer; bonus integer; n integer:=0;
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
  if coalesce(m->>'measurement_request_id','') ~ '^[0-9a-fA-F-]{36}$' then
   v_request:=(m->>'measurement_request_id')::uuid;
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
CREATE OR REPLACE FUNCTION public.community_xp_totals(p_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, lifetime_xp bigint, days bigint, reports bigint, helped bigint, today_reports bigint, today_help bigint, xp7 bigint, xp30 bigint)
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
CREATE OR REPLACE FUNCTION public.community_xp_board(p_period text DEFAULT 'all'::text, p_offset integer DEFAULT 0, p_user uuid DEFAULT NULL::uuid)
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
CREATE OR REPLACE FUNCTION public.reverse_community_xp(p_event uuid, p_reason text)
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
CREATE OR REPLACE FUNCTION public.apply_reputation_event(p_user_id uuid, p_points integer, p_reason text, p_report_id uuid, p_idempotency_key text)
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
CREATE OR REPLACE FUNCTION public.consume_capture_session(p_session_id uuid, p_user_id uuid)
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
CREATE OR REPLACE FUNCTION public.claim_cams_grid(p_slot timestamp with time zone, p_token uuid, p_grid jsonb, p_batches integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j cams_grid_jobs; gid uuid;
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
CREATE OR REPLACE FUNCTION public.release_cams_grid(p_job uuid, p_token uuid, p_error boolean)
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
CREATE OR REPLACE FUNCTION public.moderate_community_report(p_report_id uuid, p_admin_id uuid, p_decision text, p_verified_pm25 double precision, p_note text, p_trust_score double precision, p_trust_reasons jsonb)
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
    'moderation:' || target.id::text
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
CREATE OR REPLACE FUNCTION public.moderate_community_report_v2(p_report_id uuid, p_admin_id uuid, p_decision text, p_verified_pm25 double precision, p_rejection_reason_code text, p_checks jsonb, p_note text, p_trust_score double precision, p_trust_reasons jsonb)
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
  notification_id UUID := gen_random_uuid();
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
    INSERT INTO public_map_events(id, event_type, entity_id)
    VALUES (gen_random_uuid(), 'report_approved', p_report_id);
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
    'moderation:v2:' || target.id::text
  );

  IF COALESCE((
    SELECT report_status_alerts FROM notification_preferences
    WHERE user_id = target.user_id
  ), TRUE) THEN
    dedupe_key := 'report_status:' || target.id::text;
    INSERT INTO user_notifications(
    id, user_id, event_type, title, body, url, entity_type, entity_id,
    payload, deduplication_key
  ) VALUES (
    notification_id, target.user_id, 'report_status',
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
    INSERT INTO notification_outbox(id, user_id, notification_id, event_key, payload)
    VALUES (
      gen_random_uuid(), target.user_id, notification_id, dedupe_key,
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
CREATE OR REPLACE FUNCTION public.checkpoint_cams_grid(p_job uuid, p_token uuid, p_batch integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j cams_grid_jobs;
BEGIN
 SELECT * INTO j FROM cams_grid_jobs WHERE id=p_job FOR UPDATE;
 IF j.status<>'running' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=now() OR j.next_batch<>p_batch THEN RAISE EXCEPTION 'grid_lease_lost'; END IF;
 INSERT INTO cams_grid_chunks VALUES(p_job,p_batch,p_payload) ON CONFLICT(job_id,batch_index) DO UPDATE SET payload=excluded.payload;
 UPDATE cams_grid_jobs SET next_batch=next_batch+1,attempts=0,last_error=false WHERE id=p_job;
 RETURN jsonb_build_object('status','checkpointed');
END $function$
;
CREATE OR REPLACE FUNCTION public.publish_cams_grid(p_job uuid, p_token uuid, p_frames jsonb, p_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j cams_grid_jobs; grid cams_grid_definitions; f jsonb; vals float8[]; ats timestamptz[]='{}'; previous_id uuid; gid uuid; last_at timestamptz;
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
   INSERT INTO cams_grid_active VALUES(1,gid) ON CONFLICT(id) DO UPDATE SET generation_id=excluded.generation_id;
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
CREATE OR REPLACE FUNCTION public.refresh_report_engagement_counts(p_report_id uuid)
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
CREATE OR REPLACE FUNCTION public.block_forecast_writes_during_reset()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
      if tg_table_schema = 'public'
             and tg_table_name in ('forecast_provider_sync_runs', 'forecast_provider_snapshots')
                    and old.provider = 'openmeteo_cams' then
                          return old;
                              end if;
                                  return null;
                                    end if;

                                      if tg_table_schema = 'public'
                                           and tg_table_name in ('forecast_provider_sync_runs', 'forecast_provider_snapshots')
                                                and new.provider = 'openmeteo_cams' then
                                                    if tg_op = 'INSERT' then
                                                          return new;
                                                              elsif tg_op = 'UPDATE' and old.provider = 'openmeteo_cams' then
                                                                    return new;
                                                                        end if;
                                                                          end if;
                                                                            return null;
                                                                            end;
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
CREATE OR REPLACE FUNCTION public.claim_measurement_delivery(p_event uuid)
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
CREATE OR REPLACE FUNCTION public.create_measurement_request(p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.measurement_requests; owner uuid := (p_row->>'user_id')::uuid;
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
 insert into public.measurement_requests select * from jsonb_populate_record(null::public.measurement_requests,p_row) returning * into r;
 return jsonb_build_object('row',to_jsonb(r));
end $function$
;
CREATE OR REPLACE FUNCTION public.set_measurement_presence(p_user uuid, p_values jsonb)
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
CREATE OR REPLACE FUNCTION public.finish_measurement_request(p_id uuid, p_status text, p_report uuid DEFAULT NULL::uuid)
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
   where entity_type='measurement_request' and entity_id=p_id::text and event_type='measurement_request';
 end if;
 return changed>0;
end $function$
;
CREATE OR REPLACE FUNCTION public.notify_measurement_request(p_notification jsonb, p_outbox jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare req public.measurement_requests; target uuid := (p_notification->>'user_id')::uuid;
begin
 select * into req from public.measurement_requests where id=(p_notification->>'entity_id')::uuid for update;
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
 insert into public.user_notifications select * from jsonb_populate_record(null::public.user_notifications,p_notification)
 on conflict(user_id,deduplication_key) do nothing;
 if p_outbox is not null then
  insert into public.notification_outbox select * from jsonb_populate_record(null::public.notification_outbox,p_outbox)
  on conflict(event_key) do nothing;
 end if;
 return true;
end $function$
;
CREATE TRIGGER block_forecast_writes_during_reset BEFORE INSERT OR UPDATE ON public.forecast_provider_snapshots FOR EACH ROW EXECUTE FUNCTION block_forecast_writes_during_reset();
CREATE TRIGGER block_forecast_writes_during_reset BEFORE INSERT OR UPDATE ON public.forecast_provider_sync_runs FOR EACH ROW EXECUTE FUNCTION block_forecast_writes_during_reset();
CREATE TRIGGER report_reactions_refresh_counts AFTER INSERT OR DELETE OR UPDATE ON public.report_reactions FOR EACH ROW EXECUTE FUNCTION report_engagement_counts_trigger();
CREATE TRIGGER report_comments_refresh_counts AFTER INSERT OR DELETE OR UPDATE ON public.report_comments FOR EACH ROW EXECUTE FUNCTION report_engagement_counts_trigger();
CREATE TRIGGER community_xp_on_decision AFTER UPDATE OF status ON public.community_reports FOR EACH ROW EXECUTE FUNCTION enqueue_community_xp();
CREATE TRIGGER community_maintenance_reports BEFORE INSERT OR DELETE OR UPDATE ON public.community_reports FOR EACH ROW EXECUTE FUNCTION guard_community_xp_maintenance();
CREATE TRIGGER community_maintenance_requests BEFORE INSERT OR DELETE OR UPDATE ON public.measurement_requests FOR EACH ROW EXECUTE FUNCTION guard_community_xp_maintenance();
CREATE TRIGGER community_maintenance_drafts BEFORE INSERT OR DELETE OR UPDATE ON public.report_drafts FOR EACH ROW EXECUTE FUNCTION guard_community_xp_maintenance();
CREATE TRIGGER community_maintenance_capture BEFORE INSERT OR DELETE OR UPDATE ON public.capture_sessions FOR EACH ROW EXECUTE FUNCTION guard_community_xp_maintenance();
CREATE TRIGGER community_maintenance_xp_events BEFORE INSERT OR DELETE OR UPDATE ON public.community_xp_events FOR EACH ROW EXECUTE FUNCTION guard_community_xp_maintenance();
alter table public.activities enable row level security;
alter table public.alert_events enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.cams_grid_active enable row level security;
alter table public.cams_grid_chunks enable row level security;
alter table public.cams_grid_definitions enable row level security;
alter table public.cams_grid_frames enable row level security;
alter table public.cams_grid_generations enable row level security;
alter table public.cams_grid_jobs enable row level security;
alter table public.capture_sessions enable row level security;
alter table public.community_help_claims enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_xp_accounts enable row level security;
alter table public.community_xp_control enable row level security;
alter table public.community_xp_events enable row level security;
alter table public.community_xp_jobs enable row level security;
alter table public.data_issue_reports enable row level security;
alter table public.fire_feature_snapshots enable row level security;
alter table public.forecast_data_quality_daily enable row level security;
alter table public.forecast_provider_snapshots enable row level security;
alter table public.forecast_provider_sync_runs enable row level security;
alter table public.line_notification_links enable row level security;
alter table public.line_webhook_events enable row level security;
alter table public.measurement_delivery_leases enable row level security;
alter table public.measurement_helper_presence enable row level security;
alter table public.measurement_request_recipients enable row level security;
alter table public.measurement_requests enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.pm25_readings enable row level security;
alter table public.profiles enable row level security;
alter table public.public_map_events enable row level security;
alter table public.rate_limit_windows enable row level security;
alter table public.report_comments enable row level security;
alter table public.report_drafts enable row level security;
alter table public.report_evidence enable row level security;
alter table public.report_reactions enable row level security;
alter table public.report_reviews enable row level security;
alter table public.reputation_events enable row level security;
alter table public.stations enable row level security;
alter table public.sync_runs enable row level security;
alter table public.user_notifications enable row level security;
alter table public.weather_observations enable row level security;
create policy profiles_read_own on public.profiles for SELECT to authenticated using ((auth.uid() = id));
create policy user_notifications_read_own on public.user_notifications for SELECT to authenticated using ((auth.uid() = user_id));
create policy public_map_events_read on public.public_map_events for SELECT to anon,authenticated using (true);
grant usage on schema public,auth to anon,authenticated,service_role;
grant select on all tables in schema public to anon,authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Additional indexes and actual user-trigger modes from the baseline.
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
