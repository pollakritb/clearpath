# Database inventory — current catalog

Generated from a read-only catalog audit. Estimates are not exact row counts. This is not a backup or proof of runtime authorization.

Catalog as of: `2026-11-13T19:27:54.909713+00:00`. Application tables: **77**. Latest recorded migration: `20261113181124`.

New CAMS reader and retention migration is local only. Retention descriptions preserve existing policy; KEEP means no additional deletion is authorized.

| Table                                         | Purpose                      | Estimated rows | MiB incl. indexes | RLS | Retention / safety                                                    |
| --------------------------------------------- | ---------------------------- | -------------: | ----------------: | --- | --------------------------------------------------------------------- |
| `community_trust_private.control`             | Community Trust              |              1 |              0.03 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.control_events`      | Community Trust              |              8 |              0.03 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.daily_aggregates`    | Community Trust              |              1 |              0.02 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.daily_slots`         | Community Trust              |              1 |              0.02 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.events`              | Community Trust              |              1 |              0.10 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.holds`               | Community Trust              |              0 |              0.01 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.pair_days`           | Community Trust              |              1 |              0.02 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.projections`         | Community Trust              |              5 |              0.06 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.reactions`           | Community Trust              |              1 |              0.03 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `community_trust_private.review_requests`     | Community Trust              |              0 |              0.03 | on  | 365d policy; preserve actionable reviews and scoring invariants       |
| `private.account_erasure_jobs`                | Account closure queue        |              2 |              0.05 | on  | Preserve unfinished jobs; no guessed TTL                              |
| `private.history_retention_state`             | Retention monitoring         |              1 |              0.03 | on  | Latest bounded-cleanup result                                         |
| `private.identifier_aliases`                  | Identifier compatibility     |         109634 |             64.63 | on  | Only remove verified retired telemetry aliases                        |
| `private.identifier_control`                  | Identifier control           |              1 |              0.02 | on  | Persistent configuration                                              |
| `public.account_privacy_requests`             | Account closure              |              2 |              0.06 | on  | Preserve erasure evidence and retry linkage                           |
| `public.activities`                           | Published activities         |              0 |              0.02 | on  | Persistent published content                                          |
| `public.air_alert_locations`                  | GPS alerts                   |              1 |              0.04 | on  | Locations 24h; preserve delivery state through retry window           |
| `public.air_alert_states`                     | GPS alerts                   |              1 |              0.08 | on  | Locations 24h; preserve delivery state through retry window           |
| `public.alert_events`                         | Alert idempotency            |              0 |              0.03 | on  | At least delivery retry window; do not blindly purge                  |
| `public.announcements`                        | Published announcements      |              0 |              0.04 | on  | Persistent published content                                          |
| `public.audit_logs`                           | Audit                        |             17 |              0.09 | on  | No new deletion policy authorized                                     |
| `public.cams_grid_active`                     | CAMS grid                    |              1 |              0.04 | on  | 72h; protect active + previous ready; new migration pending           |
| `public.cams_grid_chunks`                     | CAMS grid                    |              0 |              0.09 | on  | 72h; protect active + previous ready; new migration pending           |
| `public.cams_grid_definitions`                | CAMS grid                    |              1 |              0.03 | on  | 72h; protect active + previous ready; new migration pending           |
| `public.cams_grid_frames`                     | CAMS grid                    |            203 |              1.03 | on  | 72h; protect active + previous ready; new migration pending           |
| `public.cams_grid_generations`                | CAMS grid                    |              2 |              0.10 | on  | 72h; protect active + previous ready; new migration pending           |
| `public.cams_grid_jobs`                       | CAMS grid                    |              6 |              0.11 | on  | 72h; protect active + previous ready; new migration pending           |
| `public.capture_sessions`                     | Capture security             |             49 |              0.08 | on  | Keep evidence references; verify expiry cleanup                       |
| `public.community_coverage_missions`          | Community policy/audit       |            426 |              0.30 | on  | Preserve until runtime + ledger dependency review                     |
| `public.community_device_evaluations`         | Community policy/audit       |              0 |              0.03 | on  | Preserve until runtime + ledger dependency review                     |
| `public.community_evidence_outcomes`          | Community policy/audit       |              0 |              0.04 | on  | Preserve until runtime + ledger dependency review                     |
| `public.community_help_claims`                | Community policy/audit       |              4 |              0.07 | on  | Preserve until runtime + ledger dependency review                     |
| `public.community_policy_release`             | Community policy/audit       |              1 |              0.03 | on  | Preserve until runtime + ledger dependency review                     |
| `public.community_reports`                    | Community policy/audit       |             17 |              0.32 | on  | Preserve until runtime + ledger dependency review                     |
| `public.community_season_results`             | Community policy/audit       |              0 |              0.02 | on  | Preserve until runtime + ledger dependency review                     |
| `public.community_xp_accounts`                | XP ledger/control            |              6 |              0.08 | on  | Preserve existing totals, settlement and deduplication                |
| `public.community_xp_control`                 | XP ledger/control            |              1 |              0.03 | on  | Preserve existing totals, settlement and deduplication                |
| `public.community_xp_events`                  | XP ledger/control            |             23 |              0.26 | on  | Preserve existing totals, settlement and deduplication                |
| `public.community_xp_jobs`                    | XP ledger/control            |             17 |              0.20 | on  | Preserve existing totals, settlement and deduplication                |
| `public.contribution_v3_control`              | Contribution v3              |              1 |              0.03 | on  | Preserve release evidence and ledger dependencies                     |
| `public.contribution_v3_release_events`       | Contribution v3              |              1 |              0.03 | on  | Preserve release evidence and ledger dependencies                     |
| `public.data_issue_reports`                   | Historical issues/audit      |              0 |              0.04 | on  | Audit-only; do not drop based on retired UI                           |
| `public.external_feed_runs`                   | Scheduled external feeds     |            479 |              0.20 | on  | Existing feed cleanup; verify runtime execution                       |
| `public.external_feed_sources`                | Scheduled external feeds     |              2 |              0.23 | on  | Existing feed cleanup; verify runtime execution                       |
| `public.external_news_items`                  | Scheduled external feeds     |             94 |              0.27 | on  | Existing feed cleanup; verify runtime execution                       |
| `public.forecast_provider_snapshots`          | CAMS station compatibility   |         101824 |            115.74 | on  | Retire only after grid cutover + verified backup                      |
| `public.forecast_provider_sync_runs`          | CAMS station compatibility   |             36 |              0.11 | on  | Retire only after grid cutover + verified backup                      |
| `public.line_notification_links`              | LINE delivery                |              3 |              0.09 | on  | Existing policy; inbox terminal 30d; protect retries/budgets/cursors  |
| `public.line_provider_budget`                 | LINE delivery                |              0 |              0.02 | on  | Existing policy; inbox terminal 30d; protect retries/budgets/cursors  |
| `public.line_user_event_cursors`              | LINE delivery                |              0 |              0.02 | on  | Existing policy; inbox terminal 30d; protect retries/budgets/cursors  |
| `public.line_webhook_events`                  | LINE delivery                |              6 |              0.05 | on  | Existing policy; inbox terminal 30d; protect retries/budgets/cursors  |
| `public.line_webhook_inbox`                   | LINE delivery                |              1 |              0.05 | on  | Existing policy; inbox terminal 30d; protect retries/budgets/cursors  |
| `public.measurement_delivery_leases`          | Measurement requests/queues  |              7 |              0.04 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_helper_locations`         | Measurement requests/queues  |              2 |              0.05 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_helper_presence`          | Measurement requests/queues  |              3 |              0.05 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_notification_batch_items` | Measurement requests/queues  |              4 |              0.04 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_notification_batches`     | Measurement requests/queues  |              4 |              0.04 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_report_jobs`              | Measurement requests/queues  |             10 |              0.05 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_report_matches`           | Measurement requests/queues  |              2 |              0.04 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_request_control`          | Measurement requests/queues  |              1 |              0.02 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_request_recipients`       | Measurement requests/queues  |              4 |              0.08 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.measurement_requests`                 | Measurement requests/queues  |             16 |              0.20 | on  | Existing policy; preserve leased/retryable jobs and deduplication     |
| `public.notification_outbox`                  | Delivery queue               |             28 |              0.16 | on  | Protect pending, retries and idempotency                              |
| `public.notification_preferences`             | User consent                 |              2 |              0.05 | on  | Preserve until owner update/closure                                   |
| `public.pm25_readings`                        | Official observations        |          10990 |              3.64 | on  | 72h existing retention                                                |
| `public.profiles`                             | Accounts                     |              8 |              0.06 | on  | Owner-confirmed erasure lifecycle; retain anonymous report references |
| `public.public_map_events`                    | Map refresh events           |             17 |              0.08 | on  | Existing policy; verify consumers before pruning                      |
| `public.rate_limit_windows`                   | Abuse protection             |              4 |              0.06 | on  | 72h existing retention                                                |
| `public.report_comments`                      | Community evidence/social    |              0 |              0.05 | on  | Existing evidence/audit retention; no blanket telemetry purge         |
| `public.report_drafts`                        | Community evidence/social    |              0 |              0.22 | on  | Existing evidence/audit retention; no blanket telemetry purge         |
| `public.report_evidence`                      | Community evidence/social    |             17 |              0.15 | on  | Existing evidence/audit retention; no blanket telemetry purge         |
| `public.report_reactions`                     | Community evidence/social    |              1 |              0.08 | on  | Existing evidence/audit retention; no blanket telemetry purge         |
| `public.report_reviews`                       | Community evidence/social    |              0 |              0.05 | on  | Existing evidence/audit retention; no blanket telemetry purge         |
| `public.reputation_events`                    | Historical reputation ledger |             17 |              0.11 | on  | Preserve settlement and aggregate invariants                          |
| `public.stations`                             | Official station catalog     |            182 |              0.18 | on  | Persistent source catalog                                             |
| `public.sync_runs`                            | Official ingestion telemetry |            144 |              0.21 | on  | 72h existing retention                                                |
| `public.user_notifications`                   | User notification history    |             42 |              0.13 | on  | Existing policy; no new deletion TTL                                  |

## Columns and integrity

### `community_trust_private.control`

| Column                  | Type                     | Nullable | Identity / generated |
| ----------------------- | ------------------------ | -------- | -------------------- |
| `singleton`             | boolean                  | NO       | NO / NEVER           |
| `policy_version`        | text                     | NO       | NO / NEVER           |
| `collecting_enabled`    | boolean                  | NO       | NO / NEVER           |
| `public_enabled`        | boolean                  | NO       | NO / NEVER           |
| `notice_ref`            | text                     | YES      | NO / NEVER           |
| `review_owner`          | text                     | YES      | NO / NEVER           |
| `review_channel`        | text                     | YES      | NO / NEVER           |
| `retention_days`        | integer                  | YES      | NO / NEVER           |
| `retention_ref`         | text                     | YES      | NO / NEVER           |
| `experiment_ref`        | text                     | YES      | NO / NEVER           |
| `privacy_ref`           | text                     | YES      | NO / NEVER           |
| `concurrency_ref`       | text                     | YES      | NO / NEVER           |
| `retention_last_ran_at` | timestamp with time zone | YES      | NO / NEVER           |
| `reconcile_cursor`      | bigint                   | NO       | NO / NEVER           |

Constraints:

- `control_check`: `CHECK (((NOT collecting_enabled) OR COALESCE((length(notice_ref) > 10), false)))`; validated=True
- `control_check1`: `CHECK (((NOT public_enabled) OR COALESCE((collecting_enabled AND (length(review_owner) > 2) AND (length(review_channel) > 5) AND (retention_days >= 90) AND (length(retention_ref) > 10) AND (length(experiment_ref) > 10) AND (length(privacy_ref) > 10) AND (length(concurrency_ref) > 10)), false)))`; validated=True
- `control_pkey`: `PRIMARY KEY (singleton)`; validated=True
- `control_policy_version_check`: `CHECK ((policy_version = 'community-trust-v1'::text))`; validated=True
- `control_retention_days_check`: `CHECK (((retention_days IS NULL) OR (retention_days >= 90)))`; validated=True
- `control_singleton_check`: `CHECK (singleton)`; validated=True

### `community_trust_private.control_events`

| Column         | Type                     | Nullable | Identity / generated |
| -------------- | ------------------------ | -------- | -------------------- |
| `id`           | bigint                   | NO       | YES / NEVER          |
| `created_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `operation`    | text                     | NO       | NO / NEVER           |
| `operator_ref` | text                     | NO       | NO / NEVER           |
| `payload`      | jsonb                    | NO       | NO / NEVER           |

Constraints:

- `control_events_pkey`: `PRIMARY KEY (id)`; validated=True

### `community_trust_private.daily_aggregates`

| Column        | Type             | Nullable | Identity / generated |
| ------------- | ---------------- | -------- | -------------------- |
| `reporter_id` | bigint           | NO       | NO / NEVER           |
| `vote_day`    | date             | NO       | NO / NEVER           |
| `positive`    | integer          | NO       | NO / NEVER           |
| `negative`    | integer          | NO       | NO / NEVER           |
| `value`       | double precision | NO       | NO / NEVER           |
| `weight`      | integer          | NO       | NO / NEVER           |

Constraints:

- `daily_aggregates_pkey`: `PRIMARY KEY (reporter_id, vote_day)`; validated=True
- `daily_aggregates_weight_check`: `CHECK (((weight >= 1) AND (weight <= 3)))`; validated=True

### `community_trust_private.daily_slots`

| Column        | Type   | Nullable | Identity / generated |
| ------------- | ------ | -------- | -------------------- |
| `voter_id`    | bigint | NO       | NO / NEVER           |
| `reporter_id` | bigint | NO       | NO / NEVER           |
| `vote_day`    | date   | NO       | NO / NEVER           |
| `event_seq`   | bigint | YES      | NO / NEVER           |
| `report_id`   | bigint | YES      | NO / NEVER           |

Constraints:

- `daily_slots_event_seq_fkey`: `FOREIGN KEY (event_seq) REFERENCES community_trust_private.events(seq)`; validated=True
- `daily_slots_pkey`: `PRIMARY KEY (voter_id, reporter_id, vote_day)`; validated=True

### `community_trust_private.events`

| Column             | Type                     | Nullable | Identity / generated |
| ------------------ | ------------------------ | -------- | -------------------- |
| `seq`              | bigint                   | NO       | YES / NEVER          |
| `request_key`      | uuid                     | NO       | NO / NEVER           |
| `voter_id`         | bigint                   | YES      | NO / NEVER           |
| `reporter_id`      | bigint                   | NO       | NO / NEVER           |
| `report_id`        | bigint                   | YES      | NO / NEVER           |
| `vote_day`         | date                     | YES      | NO / NEVER           |
| `action`           | text                     | NO       | NO / NEVER           |
| `reaction`         | text                     | YES      | NO / NEVER           |
| `reason_code`      | text                     | YES      | NO / NEVER           |
| `eligible`         | boolean                  | NO       | NO / NEVER           |
| `exclusion_reason` | text                     | YES      | NO / NEVER           |
| `payload`          | jsonb                    | NO       | NO / NEVER           |
| `created_at`       | timestamp with time zone | NO       | NO / NEVER           |
| `policy_version`   | text                     | NO       | NO / NEVER           |

Constraints:

- `events_action_check`: `CHECK ((action = ANY (ARRAY['set'::text, 'withdraw'::text, 'hold'::text, 'finding'::text])))`; validated=True
- `events_pkey`: `PRIMARY KEY (seq)`; validated=True
- `events_policy_version_check`: `CHECK ((policy_version = 'community-trust-v1'::text))`; validated=True
- `events_reaction_check`: `CHECK ((reaction = ANY (ARRAY['like'::text, 'dislike'::text])))`; validated=True
- `events_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id)`; validated=True
- `events_reporter_id_fkey`: `FOREIGN KEY (reporter_id) REFERENCES profiles(id)`; validated=True
- `events_voter_id_fkey`: `FOREIGN KEY (voter_id) REFERENCES profiles(id)`; validated=True
- `events_voter_id_request_key_key`: `UNIQUE (voter_id, request_key)`; validated=True

### `community_trust_private.holds`

| Column        | Type                     | Nullable | Identity / generated |
| ------------- | ------------------------ | -------- | -------------------- |
| `id`          | bigint                   | NO       | YES / NEVER          |
| `reporter_id` | bigint                   | NO       | NO / NEVER           |
| `started_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `expires_at`  | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `holds_check`: `CHECK ((expires_at = (started_at + '00:30:00'::interval)))`; validated=True
- `holds_pkey`: `PRIMARY KEY (id)`; validated=True

### `community_trust_private.pair_days`

| Column              | Type                     | Nullable | Identity / generated |
| ------------------- | ------------------------ | -------- | -------------------- |
| `voter_id`          | bigint                   | NO       | NO / NEVER           |
| `reporter_id`       | bigint                   | NO       | NO / NEVER           |
| `vote_day`          | date                     | NO       | NO / NEVER           |
| `admitted`          | boolean                  | NO       | NO / NEVER           |
| `first_accepted_at` | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `pair_days_pkey`: `PRIMARY KEY (voter_id, reporter_id, vote_day)`; validated=True
- `pair_days_reporter_id_fkey`: `FOREIGN KEY (reporter_id) REFERENCES profiles(id)`; validated=True
- `pair_days_voter_id_fkey`: `FOREIGN KEY (voter_id) REFERENCES profiles(id)`; validated=True

### `community_trust_private.projections`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `reporter_id`   | bigint                   | NO       | NO / NEVER           |
| `ledger_seq`    | bigint                   | NO       | NO / NEVER           |
| `payload`       | jsonb                    | NO       | NO / NEVER           |
| `calculated_at` | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `projections_pkey`: `PRIMARY KEY (reporter_id)`; validated=True
- `projections_reporter_id_fkey`: `FOREIGN KEY (reporter_id) REFERENCES profiles(id)`; validated=True

### `community_trust_private.reactions`

| Column              | Type                     | Nullable | Identity / generated |
| ------------------- | ------------------------ | -------- | -------------------- |
| `voter_id`          | bigint                   | NO       | NO / NEVER           |
| `report_id`         | bigint                   | NO       | NO / NEVER           |
| `reporter_id`       | bigint                   | NO       | NO / NEVER           |
| `vote_day`          | date                     | NO       | NO / NEVER           |
| `reaction`          | text                     | YES      | NO / NEVER           |
| `reason_code`       | text                     | YES      | NO / NEVER           |
| `active`            | boolean                  | NO       | NO / NEVER           |
| `first_accepted_at` | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`        | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `reactions_pkey`: `PRIMARY KEY (voter_id, report_id)`; validated=True
- `reactions_reaction_check`: `CHECK ((reaction = ANY (ARRAY['like'::text, 'dislike'::text])))`; validated=True
- `reactions_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id)`; validated=True
- `reactions_reporter_id_fkey`: `FOREIGN KEY (reporter_id) REFERENCES profiles(id)`; validated=True
- `reactions_voter_id_fkey`: `FOREIGN KEY (voter_id) REFERENCES profiles(id)`; validated=True

### `community_trust_private.review_requests`

| Column        | Type                     | Nullable | Identity / generated |
| ------------- | ------------------------ | -------- | -------------------- |
| `id`          | uuid                     | NO       | NO / NEVER           |
| `reporter_id` | bigint                   | NO       | NO / NEVER           |
| `report_id`   | bigint                   | YES      | NO / NEVER           |
| `from_day`    | date                     | YES      | NO / NEVER           |
| `to_day`      | date                     | YES      | NO / NEVER           |
| `message`     | text                     | NO       | NO / NEVER           |
| `created_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `status`      | text                     | NO       | NO / NEVER           |

Constraints:

- `review_requests_message_check`: `CHECK (((length(btrim(message)) >= 10) AND (length(btrim(message)) <= 1000)))`; validated=True
- `review_requests_pkey`: `PRIMARY KEY (id)`; validated=True
- `review_requests_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id)`; validated=True
- `review_requests_reporter_id_fkey`: `FOREIGN KEY (reporter_id) REFERENCES profiles(id)`; validated=True
- `review_requests_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text])))`; validated=True

### `private.account_erasure_jobs`

| Column         | Type                     | Nullable | Identity / generated |
| -------------- | ------------------------ | -------- | -------------------- |
| `request_id`   | uuid                     | NO       | NO / NEVER           |
| `user_id`      | bigint                   | NO       | NO / NEVER           |
| `auth_user_id` | uuid                     | YES      | NO / NEVER           |
| `image_paths`  | jsonb                    | NO       | NO / NEVER           |
| `completed_at` | timestamp with time zone | YES      | NO / NEVER           |

Constraints:

- `account_erasure_jobs_pkey`: `PRIMARY KEY (request_id)`; validated=True
- `account_erasure_jobs_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES account_privacy_requests(id)`; validated=True
- `account_erasure_jobs_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id)`; validated=True
- `account_erasure_jobs_user_id_key`: `UNIQUE (user_id)`; validated=True

### `private.history_retention_state`

| Column              | Type                     | Nullable | Identity / generated |
| ------------------- | ------------------------ | -------- | -------------------- |
| `singleton`         | boolean                  | NO       | NO / NEVER           |
| `last_completed_at` | timestamp with time zone | YES      | NO / NEVER           |
| `result`            | jsonb                    | NO       | NO / NEVER           |

Constraints:

- `history_retention_state_pkey`: `PRIMARY KEY (singleton)`; validated=True
- `history_retention_state_singleton_check`: `CHECK (singleton)`; validated=True

### `private.identifier_aliases`

| Column       | Type   | Nullable | Identity / generated |
| ------------ | ------ | -------- | -------------------- |
| `entity`     | text   | NO       | NO / NEVER           |
| `legacy_id`  | uuid   | NO       | NO / NEVER           |
| `numeric_id` | bigint | NO       | NO / NEVER           |
| `code`       | text   | NO       | NO / NEVER           |

Constraints:

- `identifier_aliases_code_key`: `UNIQUE (code)`; validated=True
- `identifier_aliases_entity_numeric_id_key`: `UNIQUE (entity, numeric_id)`; validated=True
- `identifier_aliases_pkey`: `PRIMARY KEY (entity, legacy_id)`; validated=True

### `private.identifier_control`

| Column        | Type    | Nullable | Identity / generated |
| ------------- | ------- | -------- | -------------------- |
| `singleton`   | boolean | NO       | NO / NEVER           |
| `version`     | integer | NO       | NO / NEVER           |
| `maintenance` | boolean | NO       | NO / NEVER           |

Constraints:

- `identifier_control_pkey`: `PRIMARY KEY (singleton)`; validated=True
- `identifier_control_singleton_check`: `CHECK (singleton)`; validated=True
- `identifier_control_version_check`: `CHECK ((version = ANY (ARRAY[1, 2, 3])))`; validated=True

### `public.account_privacy_requests`

| Column         | Type                     | Nullable | Identity / generated |
| -------------- | ------------------------ | -------- | -------------------- |
| `id`           | uuid                     | NO       | NO / NEVER           |
| `user_id`      | bigint                   | NO       | NO / NEVER           |
| `status`       | text                     | NO       | NO / NEVER           |
| `created_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `completed_at` | timestamp with time zone | YES      | NO / NEVER           |

Constraints:

- `account_privacy_requests_check`: `CHECK (((status = 'completed'::text) = (completed_at IS NOT NULL)))`; validated=True
- `account_privacy_requests_pkey`: `PRIMARY KEY (id)`; validated=True
- `account_privacy_requests_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'cancelled'::text])))`; validated=True
- `account_privacy_requests_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id)`; validated=True

### `public.activities`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `title`         | text                     | NO       | NO / NEVER           |
| `description`   | text                     | NO       | NO / NEVER           |
| `rule_code`     | text                     | YES      | NO / NEVER           |
| `target_count`  | integer                  | YES      | NO / NEVER           |
| `reward_points` | integer                  | NO       | NO / NEVER           |
| `starts_at`     | timestamp with time zone | YES      | NO / NEVER           |
| `ends_at`       | timestamp with time zone | YES      | NO / NEVER           |
| `active`        | boolean                  | NO       | NO / NEVER           |
| `created_at`    | timestamp with time zone | NO       | NO / NEVER           |
| `id`            | bigint                   | NO       | YES / NEVER          |
| `code`          | text                     | YES      | NO / ALWAYS          |

Constraints:

- `activities_code_key`: `UNIQUE (code)`; validated=True
- `activities_pkey`: `PRIMARY KEY (id)`; validated=True
- `activities_reward_points_check`: `CHECK ((reward_points >= 0))`; validated=True
- `activities_target_count_check`: `CHECK (((target_count IS NULL) OR (target_count > 0)))`; validated=True

### `public.air_alert_locations`

| Column        | Type                     | Nullable | Identity / generated |
| ------------- | ------------------------ | -------- | -------------------- |
| `user_id`     | bigint                   | NO       | NO / NEVER           |
| `lat`         | double precision         | NO       | NO / NEVER           |
| `lon`         | double precision         | NO       | NO / NEVER           |
| `accuracy_m`  | double precision         | NO       | NO / NEVER           |
| `observed_at` | timestamp with time zone | NO       | NO / NEVER           |
| `received_at` | timestamp with time zone | NO       | NO / NEVER           |
| `version`     | uuid                     | NO       | NO / NEVER           |

Constraints:

- `air_alert_locations_accuracy_m_check`: `CHECK (((accuracy_m >= (0)::double precision) AND (accuracy_m <= (200)::double precision)))`; validated=True
- `air_alert_locations_lat_check`: `CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)))`; validated=True
- `air_alert_locations_lon_check`: `CHECK (((lon >= ('-180'::integer)::double precision) AND (lon <= (180)::double precision)))`; validated=True
- `air_alert_locations_pkey`: `PRIMARY KEY (user_id)`; validated=True
- `air_alert_locations_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.air_alert_states`

| Column                   | Type                     | Nullable | Identity / generated |
| ------------------------ | ------------------------ | -------- | -------------------- |
| `user_id`                | bigint                   | NO       | NO / NEVER           |
| `revision`               | bigint                   | NO       | NO / NEVER           |
| `state`                  | jsonb                    | NO       | NO / NEVER           |
| `evaluated_at`           | timestamp with time zone | NO       | NO / NEVER           |
| `evaluation_lease_until` | timestamp with time zone | YES      | NO / NEVER           |

Constraints:

- `air_alert_states_pkey`: `PRIMARY KEY (user_id)`; validated=True
- `air_alert_states_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.alert_events`

| Column              | Type                     | Nullable | Identity / generated |
| ------------------- | ------------------------ | -------- | -------------------- |
| `deduplication_key` | text                     | NO       | NO / NEVER           |
| `source`            | text                     | NO       | NO / NEVER           |
| `kind`              | text                     | NO       | NO / NEVER           |
| `severity`          | text                     | NO       | NO / NEVER           |
| `title`             | text                     | NO       | NO / NEVER           |
| `body`              | text                     | NO       | NO / NEVER           |
| `district`          | text                     | YES      | NO / NEVER           |
| `subdistrict`       | text                     | YES      | NO / NEVER           |
| `lat`               | double precision         | YES      | NO / NEVER           |
| `lon`               | double precision         | YES      | NO / NEVER           |
| `detected_at`       | timestamp with time zone | NO       | NO / NEVER           |
| `sent_at`           | timestamp with time zone | YES      | NO / NEVER           |
| `recipient_count`   | integer                  | NO       | NO / NEVER           |
| `payload`           | jsonb                    | NO       | NO / NEVER           |
| `created_at`        | timestamp with time zone | NO       | NO / NEVER           |
| `id`                | bigint                   | NO       | YES / NEVER          |
| `code`              | text                     | YES      | NO / ALWAYS          |

Constraints:

- `alert_events_code_key`: `UNIQUE (code)`; validated=True
- `alert_events_deduplication_key_key`: `UNIQUE (deduplication_key)`; validated=True
- `alert_events_pkey`: `PRIMARY KEY (id)`; validated=True

### `public.announcements`

| Column         | Type                     | Nullable | Identity / generated |
| -------------- | ------------------------ | -------- | -------------------- |
| `title`        | text                     | NO       | NO / NEVER           |
| `body`         | text                     | NO       | NO / NEVER           |
| `kind`         | text                     | NO       | NO / NEVER           |
| `severity`     | text                     | NO       | NO / NEVER           |
| `area`         | text                     | YES      | NO / NEVER           |
| `district`     | text                     | YES      | NO / NEVER           |
| `subdistrict`  | text                     | YES      | NO / NEVER           |
| `published`    | boolean                  | NO       | NO / NEVER           |
| `published_at` | timestamp with time zone | NO       | NO / NEVER           |
| `expires_at`   | timestamp with time zone | YES      | NO / NEVER           |
| `status`       | text                     | NO       | NO / NEVER           |
| `image_path`   | text                     | YES      | NO / NEVER           |
| `created_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `id`           | bigint                   | NO       | YES / NEVER          |
| `code`         | text                     | YES      | NO / ALWAYS          |
| `created_by`   | bigint                   | YES      | NO / NEVER           |
| `updated_by`   | bigint                   | YES      | NO / NEVER           |

Constraints:

- `announcements_code_key`: `UNIQUE (code)`; validated=True
- `announcements_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL`; validated=True
- `announcements_kind_check`: `CHECK ((kind = ANY (ARRAY['news'::text, 'alert'::text, 'community'::text])))`; validated=True
- `announcements_pkey`: `PRIMARY KEY (id)`; validated=True
- `announcements_severity_check`: `CHECK ((severity = ANY (ARRAY['info'::text, 'watch'::text, 'warning'::text])))`; validated=True
- `announcements_status_check`: `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text, 'expired'::text])))`; validated=True
- `announcements_updated_by_fkey`: `FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL`; validated=True

### `public.audit_logs`

| Column        | Type                     | Nullable | Identity / generated |
| ------------- | ------------------------ | -------- | -------------------- |
| `id`          | bigint                   | NO       | NO / NEVER           |
| `action`      | text                     | NO       | NO / NEVER           |
| `entity_type` | text                     | NO       | NO / NEVER           |
| `entity_id`   | text                     | YES      | NO / NEVER           |
| `details`     | jsonb                    | NO       | NO / NEVER           |
| `created_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `code`        | text                     | YES      | NO / ALWAYS          |
| `actor_id`    | bigint                   | YES      | NO / NEVER           |

Constraints:

- `audit_logs_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL`; validated=True
- `audit_logs_code_key`: `UNIQUE (code)`; validated=True
- `audit_logs_pkey`: `PRIMARY KEY (id)`; validated=True

### `public.cams_grid_active`

| Column          | Type    | Nullable | Identity / generated |
| --------------- | ------- | -------- | -------------------- |
| `id`            | integer | NO       | NO / NEVER           |
| `generation_id` | bigint  | NO       | NO / NEVER           |

Constraints:

- `cams_grid_active_generation_id_fkey`: `FOREIGN KEY (generation_id) REFERENCES cams_grid_generations(id)`; validated=True
- `cams_grid_active_id_check`: `CHECK ((id = 1))`; validated=True
- `cams_grid_active_pkey`: `PRIMARY KEY (id)`; validated=True

### `public.cams_grid_chunks`

| Column        | Type    | Nullable | Identity / generated |
| ------------- | ------- | -------- | -------------------- |
| `batch_index` | integer | NO       | NO / NEVER           |
| `payload`     | jsonb   | NO       | NO / NEVER           |
| `job_id`      | bigint  | NO       | NO / NEVER           |

Constraints:

- `cams_grid_chunks_job_id_fkey`: `FOREIGN KEY (job_id) REFERENCES cams_grid_jobs(id) ON DELETE CASCADE`; validated=True
- `cams_grid_chunks_pkey`: `PRIMARY KEY (job_id, batch_index)`; validated=True

### `public.cams_grid_definitions`

| Column       | Type  | Nullable | Identity / generated |
| ------------ | ----- | -------- | -------------------- |
| `id`         | text  | NO       | NO / NEVER           |
| `latitudes`  | ARRAY | NO       | NO / NEVER           |
| `longitudes` | ARRAY | NO       | NO / NEVER           |

Constraints:

- `cams_grid_definitions_latitudes_check`: `CHECK (((cardinality(latitudes) >= 2) AND (cardinality(latitudes) <= 100)))`; validated=True
- `cams_grid_definitions_longitudes_check`: `CHECK (((cardinality(longitudes) >= 2) AND (cardinality(longitudes) <= 100)))`; validated=True
- `cams_grid_definitions_pkey`: `PRIMARY KEY (id)`; validated=True

### `public.cams_grid_frames`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `valid_at`      | timestamp with time zone | NO       | NO / NEVER           |
| `values`        | ARRAY                    | NO       | NO / NEVER           |
| `generation_id` | bigint                   | NO       | NO / NEVER           |

Constraints:

- `cams_grid_frames_generation_id_fkey`: `FOREIGN KEY (generation_id) REFERENCES cams_grid_generations(id) ON DELETE CASCADE`; validated=True
- `cams_grid_frames_pkey`: `PRIMARY KEY (generation_id, valid_at)`; validated=True

### `public.cams_grid_generations`

| Column            | Type                     | Nullable | Identity / generated |
| ----------------- | ------------------------ | -------- | -------------------- |
| `grid_id`         | text                     | NO       | NO / NEVER           |
| `status`          | text                     | NO       | NO / NEVER           |
| `started_at`      | timestamp with time zone | NO       | NO / NEVER           |
| `retrieved_at`    | timestamp with time zone | YES      | NO / NEVER           |
| `model_issued_at` | timestamp with time zone | YES      | NO / NEVER           |
| `valid_times`     | ARRAY                    | NO       | NO / NEVER           |
| `fingerprint`     | text                     | YES      | NO / NEVER           |
| `id`              | bigint                   | NO       | YES / NEVER          |
| `code`            | text                     | YES      | NO / ALWAYS          |

Constraints:

- `cams_grid_generations_code_key`: `UNIQUE (code)`; validated=True
- `cams_grid_generations_grid_id_fkey`: `FOREIGN KEY (grid_id) REFERENCES cams_grid_definitions(id)`; validated=True
- `cams_grid_generations_pkey`: `PRIMARY KEY (id)`; validated=True
- `cams_grid_generations_status_check`: `CHECK ((status = ANY (ARRAY['staging'::text, 'ready'::text, 'failed'::text])))`; validated=True

### `public.cams_grid_jobs`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `slot`          | timestamp with time zone | NO       | NO / NEVER           |
| `status`        | text                     | NO       | NO / NEVER           |
| `next_batch`    | integer                  | NO       | NO / NEVER           |
| `batch_count`   | integer                  | NO       | NO / NEVER           |
| `lease_token`   | uuid                     | YES      | NO / NEVER           |
| `lease_until`   | timestamp with time zone | YES      | NO / NEVER           |
| `attempts`      | integer                  | NO       | NO / NEVER           |
| `created_at`    | timestamp with time zone | NO       | NO / NEVER           |
| `completed_at`  | timestamp with time zone | YES      | NO / NEVER           |
| `last_error`    | boolean                  | NO       | NO / NEVER           |
| `id`            | bigint                   | NO       | YES / NEVER          |
| `code`          | text                     | YES      | NO / ALWAYS          |
| `generation_id` | bigint                   | YES      | NO / NEVER           |

Constraints:

- `cams_grid_jobs_code_key`: `UNIQUE (code)`; validated=True
- `cams_grid_jobs_generation_id_fkey`: `FOREIGN KEY (generation_id) REFERENCES cams_grid_generations(id) ON DELETE SET NULL`; validated=True
- `cams_grid_jobs_pkey`: `PRIMARY KEY (id)`; validated=True
- `cams_grid_jobs_slot_key`: `UNIQUE (slot)`; validated=True
- `cams_grid_jobs_status_check`: `CHECK ((status = ANY (ARRAY['running'::text, 'ready'::text, 'failed'::text])))`; validated=True

### `public.capture_sessions`

| Column        | Type                     | Nullable | Identity / generated |
| ------------- | ------------------------ | -------- | -------------------- |
| `issued_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `expires_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `consumed_at` | timestamp with time zone | YES      | NO / NEVER           |
| `created_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `id`          | bigint                   | NO       | YES / NEVER          |
| `code`        | text                     | YES      | NO / ALWAYS          |
| `user_id`     | bigint                   | NO       | NO / NEVER           |

Constraints:

- `capture_sessions_check`: `CHECK ((expires_at > issued_at))`; validated=True
- `capture_sessions_code_key`: `UNIQUE (code)`; validated=True
- `capture_sessions_pkey`: `PRIMARY KEY (id)`; validated=True
- `capture_sessions_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.community_coverage_missions`

| Column                | Type                     | Nullable | Identity / generated |
| --------------------- | ------------------------ | -------- | -------------------- |
| `id`                  | uuid                     | NO       | NO / NEVER           |
| `area_key`            | text                     | NO       | NO / NEVER           |
| `place_name`          | text                     | NO       | NO / NEVER           |
| `lat`                 | double precision         | NO       | NO / NEVER           |
| `lon`                 | double precision         | NO       | NO / NEVER           |
| `radius_km`           | double precision         | NO       | NO / NEVER           |
| `starts_at`           | timestamp with time zone | NO       | NO / NEVER           |
| `expires_at`          | timestamp with time zone | NO       | NO / NEVER           |
| `inputs`              | jsonb                    | NO       | NO / NEVER           |
| `fulfilled_report_id` | bigint                   | YES      | NO / NEVER           |
| `state`               | text                     | NO       | NO / NEVER           |
| `policy_version`      | text                     | NO       | NO / NEVER           |

Constraints:

- `community_coverage_missions_area_key_starts_at_key`: `UNIQUE (area_key, starts_at)`; validated=True
- `community_coverage_missions_check`: `CHECK ((expires_at > starts_at))`; validated=True
- `community_coverage_missions_fulfilled_report_id_fkey`: `FOREIGN KEY (fulfilled_report_id) REFERENCES community_reports(id)`; validated=True
- `community_coverage_missions_lat_check`: `CHECK (((lat >= (5)::double precision) AND (lat <= (21)::double precision)))`; validated=True
- `community_coverage_missions_lon_check`: `CHECK (((lon >= (97)::double precision) AND (lon <= (106)::double precision)))`; validated=True
- `community_coverage_missions_pkey`: `PRIMARY KEY (id)`; validated=True
- `community_coverage_missions_radius_km_check`: `CHECK ((radius_km = (2)::double precision))`; validated=True
- `community_coverage_missions_state_check`: `CHECK ((state = ANY (ARRAY['open'::text, 'fulfilled'::text, 'expired'::text])))`; validated=True

### `public.community_device_evaluations`

| Column                 | Type                     | Nullable | Identity / generated |
| ---------------------- | ------------------------ | -------- | -------------------- |
| `id`                   | uuid                     | NO       | NO / NEVER           |
| `user_id`              | bigint                   | NO       | NO / NEVER           |
| `report_id`            | bigint                   | NO       | NO / NEVER           |
| `source_key`           | text                     | NO       | NO / NEVER           |
| `method`               | text                     | NO       | NO / NEVER           |
| `reference_instrument` | text                     | NO       | NO / NEVER           |
| `evaluated_at`         | timestamp with time zone | NO       | NO / NEVER           |
| `valid_until`          | timestamp with time zone | NO       | NO / NEVER           |
| `conditions`           | jsonb                    | NO       | NO / NEVER           |
| `provenance`           | text                     | NO       | NO / NEVER           |
| `evaluation_key`       | text                     | NO       | NO / NEVER           |

Constraints:

- `community_device_evaluations_check`: `CHECK ((valid_until > evaluated_at))`; validated=True
- `community_device_evaluations_evaluation_key_key`: `UNIQUE (evaluation_key)`; validated=True
- `community_device_evaluations_pkey`: `PRIMARY KEY (id)`; validated=True
- `community_device_evaluations_provenance_check`: `CHECK ((length(btrim(provenance)) > 0))`; validated=True
- `community_device_evaluations_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id)`; validated=True
- `community_device_evaluations_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id)`; validated=True

### `public.community_evidence_outcomes`

| Column                     | Type                     | Nullable | Identity / generated |
| -------------------------- | ------------------------ | -------- | -------------------- |
| `id`                       | uuid                     | NO       | NO / NEVER           |
| `user_id`                  | bigint                   | NO       | NO / NEVER           |
| `report_id`                | bigint                   | YES      | NO / NEVER           |
| `scope`                    | text                     | NO       | NO / NEVER           |
| `outcome`                  | text                     | NO       | NO / NEVER           |
| `evaluation_key`           | text                     | NO       | NO / NEVER           |
| `provenance`               | text                     | NO       | NO / NEVER           |
| `policy_version`           | text                     | NO       | NO / NEVER           |
| `evaluated_at`             | timestamp with time zone | NO       | NO / NEVER           |
| `invalidates_contribution` | boolean                  | NO       | NO / NEVER           |
| `artifact_input`           | jsonb                    | NO       | NO / NEVER           |

Constraints:

- `community_evidence_outcomes_evaluation_key_key`: `UNIQUE (evaluation_key)`; validated=True
- `community_evidence_outcomes_outcome_check`: `CHECK ((outcome = ANY (ARRAY['pass'::text, 'problem'::text, 'unresolved'::text])))`; validated=True
- `community_evidence_outcomes_pkey`: `PRIMARY KEY (id)`; validated=True
- `community_evidence_outcomes_provenance_check`: `CHECK ((length(btrim(provenance)) > 0))`; validated=True
- `community_evidence_outcomes_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id)`; validated=True
- `community_evidence_outcomes_scope_check`: `CHECK ((scope = ANY (ARRAY['image'::text, 'metadata'::text, 'field_protocol'::text, 'instrument'::text])))`; validated=True
- `community_evidence_outcomes_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id)`; validated=True

### `public.community_help_claims`

| Column       | Type                     | Nullable | Identity / generated |
| ------------ | ------------------------ | -------- | -------------------- |
| `started_at` | timestamp with time zone | NO       | NO / NEVER           |
| `request_id` | bigint                   | NO       | NO / NEVER           |
| `user_id`    | bigint                   | NO       | NO / NEVER           |

Constraints:

- `community_help_claims_pkey`: `PRIMARY KEY (request_id, user_id)`; validated=True
- `community_help_claims_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES measurement_requests(id) ON DELETE CASCADE`; validated=True
- `community_help_claims_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.community_policy_release`

| Column                    | Type                     | Nullable | Identity / generated |
| ------------------------- | ------------------------ | -------- | -------------------- |
| `singleton`               | boolean                  | NO       | NO / NEVER           |
| `active_version`          | text                     | NO       | NO / NEVER           |
| `launched_at`             | timestamp with time zone | YES      | NO / NEVER           |
| `evidence_threshold`      | double precision         | YES      | NO / NEVER           |
| `evidence_validation_ref` | text                     | YES      | NO / NEVER           |
| `reaction_radius_m`       | double precision         | YES      | NO / NEVER           |
| `reaction_validation_ref` | text                     | YES      | NO / NEVER           |
| `missions_checked_at`     | timestamp with time zone | YES      | NO / NEVER           |

Constraints:

- `community_policy_release_active_version_check`: `CHECK ((active_version = ANY (ARRAY['v1'::text, 'v2'::text])))`; validated=True
- `community_policy_release_check`: `CHECK (((active_version = 'v1'::text) OR ((launched_at IS NOT NULL) AND (evidence_threshold IS NOT NULL) AND (COALESCE(length(btrim(evidence_validation_ref)), 0) > 0))))`; validated=True
- `community_policy_release_check1`: `CHECK (((reaction_radius_m IS NULL) OR (COALESCE(length(btrim(reaction_validation_ref)), 0) > 0)))`; validated=True
- `community_policy_release_evidence_threshold_check`: `CHECK (((evidence_threshold >= (0)::double precision) AND (evidence_threshold <= (100)::double precision)))`; validated=True
- `community_policy_release_pkey`: `PRIMARY KEY (singleton)`; validated=True
- `community_policy_release_reaction_radius_m_check`: `CHECK (((reaction_radius_m > (0)::double precision) AND (reaction_radius_m < (10000)::double precision)))`; validated=True
- `community_policy_release_singleton_check`: `CHECK (singleton)`; validated=True

### `public.community_reports`

| Column                          | Type                     | Nullable | Identity / generated |
| ------------------------------- | ------------------------ | -------- | -------------------- |
| `display_name`                  | text                     | YES      | NO / NEVER           |
| `lat`                           | double precision         | NO       | NO / NEVER           |
| `lon`                           | double precision         | NO       | NO / NEVER           |
| `province`                      | text                     | NO       | NO / NEVER           |
| `district`                      | text                     | YES      | NO / NEVER           |
| `subdistrict`                   | text                     | YES      | NO / NEVER           |
| `pm25`                          | double precision         | YES      | NO / NEVER           |
| `ocr_pm25`                      | double precision         | YES      | NO / NEVER           |
| `ocr_confidence`                | double precision         | NO       | NO / NEVER           |
| `ocr_raw_text`                  | text                     | YES      | NO / NEVER           |
| `device_detected`               | boolean                  | NO       | NO / NEVER           |
| `display_clear`                 | boolean                  | NO       | NO / NEVER           |
| `capture_source`                | text                     | NO       | NO / NEVER           |
| `image_path`                    | text                     | YES      | NO / NEVER           |
| `image_sha256`                  | text                     | YES      | NO / NEVER           |
| `image_ahash`                   | text                     | YES      | NO / NEVER           |
| `burst_hashes`                  | jsonb                    | NO       | NO / NEVER           |
| `device_model`                  | text                     | YES      | NO / NEVER           |
| `device_serial`                 | text                     | YES      | NO / NEVER           |
| `device_calibrated`             | boolean                  | NO       | NO / NEVER           |
| `calibration_evidence_path`     | text                     | YES      | NO / NEVER           |
| `calibrated_at`                 | date                     | YES      | NO / NEVER           |
| `averaging_period`              | text                     | NO       | NO / NEVER           |
| `measurement_duration_seconds`  | integer                  | NO       | NO / NEVER           |
| `measurement_environment`       | text                     | NO       | NO / NEVER           |
| `measurement_stable`            | boolean                  | NO       | NO / NEVER           |
| `near_emission_source`          | boolean                  | NO       | NO / NEVER           |
| `measurement_note`              | text                     | YES      | NO / NEVER           |
| `gps_accuracy_m`                | double precision         | YES      | NO / NEVER           |
| `captured_at`                   | timestamp with time zone | NO       | NO / NEVER           |
| `status`                        | text                     | NO       | NO / NEVER           |
| `base_trust_score`              | double precision         | NO       | NO / NEVER           |
| `trust_score`                   | double precision         | NO       | NO / NEVER           |
| `trust_reasons`                 | jsonb                    | NO       | NO / NEVER           |
| `peer_up`                       | integer                  | NO       | NO / NEVER           |
| `peer_down`                     | integer                  | NO       | NO / NEVER           |
| `moderation_note`               | text                     | YES      | NO / NEVER           |
| `moderated_at`                  | timestamp with time zone | YES      | NO / NEVER           |
| `retention_until`               | timestamp with time zone | YES      | NO / NEVER           |
| `audit_hold`                    | boolean                  | NO       | NO / NEVER           |
| `created_at`                    | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`                    | timestamp with time zone | NO       | NO / NEVER           |
| `user_claimed_pm25`             | double precision         | YES      | NO / NEVER           |
| `admin_verified_pm25`           | double precision         | YES      | NO / NEVER           |
| `public_lat`                    | double precision         | YES      | NO / NEVER           |
| `public_lon`                    | double precision         | YES      | NO / NEVER           |
| `camera_session_issued_at`      | timestamp with time zone | YES      | NO / NEVER           |
| `client_captured_at`            | timestamp with time zone | YES      | NO / NEVER           |
| `server_received_at`            | timestamp with time zone | NO       | NO / NEVER           |
| `clock_warning`                 | boolean                  | NO       | NO / NEVER           |
| `ocr_mismatch`                  | boolean                  | NO       | NO / NEVER           |
| `rejection_reason_code`         | text                     | YES      | NO / NEVER           |
| `moderation_checks`             | jsonb                    | NO       | NO / NEVER           |
| `evidence_purged_at`            | timestamp with time zone | YES      | NO / NEVER           |
| `rating_count`                  | integer                  | NO       | NO / NEVER           |
| `rating_average`                | double precision         | YES      | NO / NEVER           |
| `policy_version`                | text                     | NO       | NO / NEVER           |
| `source_type`                   | text                     | NO       | NO / NEVER           |
| `show_reporter_profile`         | boolean                  | NO       | NO / NEVER           |
| `reporter_avatar_url`           | text                     | YES      | NO / NEVER           |
| `like_count`                    | integer                  | NO       | NO / NEVER           |
| `dislike_count`                 | integer                  | NO       | NO / NEVER           |
| `comment_count`                 | integer                  | NO       | NO / NEVER           |
| `image_metadata`                | jsonb                    | NO       | NO / NEVER           |
| `id`                            | bigint                   | NO       | YES / NEVER          |
| `code`                          | text                     | YES      | NO / ALWAYS          |
| `capture_session_id`            | bigint                   | NO       | NO / NEVER           |
| `duplicate_of_report_id`        | bigint                   | YES      | NO / NEVER           |
| `moderated_by`                  | bigint                   | YES      | NO / NEVER           |
| `user_id`                       | bigint                   | NO       | NO / NEVER           |
| `anonymous_alias`               | text                     | YES      | NO / NEVER           |
| `evidence_v2`                   | jsonb                    | YES      | NO / NEVER           |
| `measurement_source_key`        | text                     | YES      | NO / NEVER           |
| `device_evaluation_valid_until` | timestamp with time zone | YES      | NO / NEVER           |
| `current_evidence_issues`       | ARRAY                    | NO       | NO / NEVER           |

Constraints:

- `approved_requires_pm25`: `CHECK (((status <> 'approved'::text) OR (pm25 IS NOT NULL)))`; validated=True
- `calibrated_requires_metadata`: `CHECK (((NOT device_calibrated) OR (calibrated_at IS NOT NULL)))`; validated=True
- `community_reports_admin_verified_pm25_check`: `CHECK (((admin_verified_pm25 >= (0)::double precision) AND (admin_verified_pm25 <= (1000)::double precision)))`; validated=True
- `community_reports_anonymous_alias_check`: `CHECK (((anonymous_alias IS NULL) OR ((char_length(anonymous_alias) >= 3) AND (char_length(anonymous_alias) <= 40))))`; validated=True
- `community_reports_base_trust_score_check`: `CHECK (((base_trust_score >= (0)::double precision) AND (base_trust_score <= (100)::double precision)))`; validated=True
- `community_reports_capture_session_id_fkey`: `FOREIGN KEY (capture_session_id) REFERENCES capture_sessions(id)`; validated=True
- `community_reports_capture_session_id_key`: `UNIQUE (capture_session_id)`; validated=True
- `community_reports_capture_source_check`: `CHECK ((capture_source = ANY (ARRAY['camera'::text, 'gallery'::text])))`; validated=True
- `community_reports_code_key`: `UNIQUE (code)`; validated=True
- `community_reports_comment_count_check`: `CHECK ((comment_count >= 0))`; validated=True
- `community_reports_dislike_count_check`: `CHECK ((dislike_count >= 0))`; validated=True
- `community_reports_duplicate_of_report_id_fkey`: `FOREIGN KEY (duplicate_of_report_id) REFERENCES community_reports(id) ON DELETE SET NULL`; validated=True
- `community_reports_gps_accuracy_m_check`: `CHECK ((gps_accuracy_m >= (0)::double precision))`; validated=True
- `community_reports_image_sha256_key`: `UNIQUE (image_sha256)`; validated=True
- `community_reports_lat_check`: `CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)))`; validated=True
- `community_reports_like_count_check`: `CHECK ((like_count >= 0))`; validated=True
- `community_reports_lon_check`: `CHECK (((lon >= ('-180'::integer)::double precision) AND (lon <= (180)::double precision)))`; validated=True
- `community_reports_measurement_duration_seconds_check`: `CHECK (((measurement_duration_seconds >= 0) AND (measurement_duration_seconds <= 600)))`; validated=True
- `community_reports_measurement_note_check`: `CHECK ((char_length(measurement_note) <= 300))`; validated=True
- `community_reports_moderated_by_fkey`: `FOREIGN KEY (moderated_by) REFERENCES profiles(id) ON DELETE SET NULL`; validated=True
- `community_reports_ocr_confidence_check`: `CHECK (((ocr_confidence >= (0)::double precision) AND (ocr_confidence <= (1)::double precision)))`; validated=True
- `community_reports_ocr_pm25_check`: `CHECK (((ocr_pm25 >= (0)::double precision) AND (ocr_pm25 <= (1000)::double precision)))`; validated=True
- `community_reports_pkey`: `PRIMARY KEY (id)`; validated=True
- `community_reports_pm25_check`: `CHECK (((pm25 >= (0)::double precision) AND (pm25 <= (1000)::double precision)))`; validated=True
- `community_reports_public_lat_check`: `CHECK (((public_lat >= ('-90'::integer)::double precision) AND (public_lat <= (90)::double precision)))`; validated=True
- `community_reports_public_lon_check`: `CHECK (((public_lon >= ('-180'::integer)::double precision) AND (public_lon <= (180)::double precision)))`; validated=True
- `community_reports_rating_average_check`: `CHECK (((rating_average >= (1)::double precision) AND (rating_average <= (5)::double precision)))`; validated=True
- `community_reports_rating_count_check`: `CHECK ((rating_count >= 0))`; validated=True
- `community_reports_source_type_check`: `CHECK ((source_type = ANY (ARRAY['individual'::text, 'community_sensor'::text])))`; validated=True
- `community_reports_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))`; validated=True
- `community_reports_trust_score_check`: `CHECK (((trust_score >= (0)::double precision) AND (trust_score <= (100)::double precision)))`; validated=True
- `community_reports_user_claimed_pm25_check`: `CHECK (((user_claimed_pm25 >= (0)::double precision) AND (user_claimed_pm25 <= (1000)::double precision)))`; validated=True
- `community_reports_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True
- `community_v2_averaging`: `CHECK ((averaging_period = ANY (ARRAY['instant'::text, '1_minute'::text, '5_minutes'::text, 'unknown'::text])))`; validated=True
- `community_v2_environment`: `CHECK ((measurement_environment = ANY (ARRAY['outdoor'::text, 'indoor'::text, 'unknown'::text])))`; validated=True
- `pending_has_no_verified_pm25`: `CHECK (((status <> 'pending'::text) OR (pm25 IS NULL)))`; validated=True

### `public.community_season_results`

| Column             | Type                     | Nullable | Identity / generated |
| ------------------ | ------------------------ | -------- | -------------------- |
| `month`            | date                     | NO       | NO / NEVER           |
| `revision`         | integer                  | NO       | NO / NEVER           |
| `results`          | jsonb                    | NO       | NO / NEVER           |
| `frozen_at`        | timestamp with time zone | NO       | NO / NEVER           |
| `previous_results` | jsonb                    | NO       | NO / NEVER           |

Constraints:

- `community_season_results_pkey`: `PRIMARY KEY (month)`; validated=True

### `public.community_xp_accounts`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `alias`         | text                     | NO       | NO / NEVER           |
| `hidden`        | boolean                  | NO       | NO / NEVER           |
| `created_at`    | timestamp with time zone | NO       | NO / NEVER           |
| `member_id`     | bigint                   | NO       | YES / NEVER          |
| `member_code`   | text                     | YES      | NO / ALWAYS          |
| `user_id`       | bigint                   | NO       | NO / NEVER           |
| `identity_mode` | text                     | NO       | NO / NEVER           |

Constraints:

- `community_xp_accounts_alias_check`: `CHECK (((char_length(alias) >= 3) AND (char_length(alias) <= 40)))`; validated=True
- `community_xp_accounts_identity_mode_check`: `CHECK ((identity_mode = ANY (ARRAY['google'::text, 'alias'::text])))`; validated=True
- `community_xp_accounts_member_code_key`: `UNIQUE (member_code)`; validated=True
- `community_xp_accounts_member_id_key`: `UNIQUE (member_id)`; validated=True
- `community_xp_accounts_pkey`: `PRIMARY KEY (user_id)`; validated=True
- `community_xp_accounts_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.community_xp_control`

| Column           | Type    | Nullable | Identity / generated |
| ---------------- | ------- | -------- | -------------------- |
| `singleton`      | boolean | NO       | NO / NEVER           |
| `enabled`        | boolean | NO       | NO / NEVER           |
| `maintenance`    | boolean | NO       | NO / NEVER           |
| `reset_version`  | uuid    | NO       | NO / NEVER           |
| `reset_manifest` | text    | YES      | NO / NEVER           |

Constraints:

- `community_xp_control_pkey`: `PRIMARY KEY (singleton)`; validated=True
- `community_xp_control_singleton_check`: `CHECK (singleton)`; validated=True

### `public.community_xp_events`

| Column            | Type                     | Nullable | Identity / generated |
| ----------------- | ------------------------ | -------- | -------------------- |
| `kind`            | text                     | NO       | NO / NEVER           |
| `points`          | integer                  | NO       | NO / NEVER           |
| `reason`          | text                     | NO       | NO / NEVER           |
| `occurred_at`     | timestamp with time zone | NO       | NO / NEVER           |
| `recorded_at`     | timestamp with time zone | NO       | NO / NEVER           |
| `policy_version`  | text                     | NO       | NO / NEVER           |
| `id`              | bigint                   | NO       | YES / NEVER          |
| `code`            | text                     | YES      | NO / ALWAYS          |
| `report_id`       | bigint                   | YES      | NO / NEVER           |
| `request_id`      | bigint                   | YES      | NO / NEVER           |
| `requester_id`    | bigint                   | YES      | NO / NEVER           |
| `reverses`        | bigint                   | YES      | NO / NEVER           |
| `user_id`         | bigint                   | NO       | NO / NEVER           |
| `award_key`       | text                     | YES      | NO / NEVER           |
| `mission_id`      | uuid                     | YES      | NO / NEVER           |
| `idempotency_key` | text                     | YES      | NO / NEVER           |

Constraints:

- `community_xp_events_code_key`: `UNIQUE (code)`; validated=True
- `community_xp_events_mission_id_fkey`: `FOREIGN KEY (mission_id) REFERENCES community_coverage_missions(id)`; validated=True
- `community_xp_events_pkey`: `PRIMARY KEY (id)`; validated=True
- `community_xp_events_report_id_kind_key`: `UNIQUE (report_id, kind)`; validated=True
- `community_xp_events_reverses_fkey`: `FOREIGN KEY (reverses) REFERENCES community_xp_events(id)`; validated=True
- `community_xp_events_reverses_key`: `UNIQUE (reverses)`; validated=True
- `community_xp_events_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True
- `contribution_event_points`: `CHECK ((((kind = 'report'::text) AND (points = ANY (ARRAY[0, 10]))) OR ((kind = ANY (ARRAY['help'::text, 'first_day'::text])) AND (points = ANY (ARRAY[0, 5]))) OR ((kind = 'contribution_week'::text) AND (points = 20)) OR ((kind = 'reversal'::text) AND (points < 0))))`; validated=True

### `public.community_xp_jobs`

| Column              | Type                     | Nullable | Identity / generated |
| ------------------- | ------------------------ | -------- | -------------------- |
| `occurred_at`       | timestamp with time zone | NO       | NO / NEVER           |
| `report_snapshot`   | jsonb                    | NO       | NO / NEVER           |
| `evidence_snapshot` | jsonb                    | NO       | NO / NEVER           |
| `state`             | text                     | NO       | NO / NEVER           |
| `processed_at`      | timestamp with time zone | YES      | NO / NEVER           |
| `report_id`         | bigint                   | NO       | NO / NEVER           |
| `user_id`           | bigint                   | NO       | NO / NEVER           |
| `policy_version`    | text                     | NO       | NO / NEVER           |

Constraints:

- `community_xp_jobs_pkey`: `PRIMARY KEY (report_id)`; validated=True
- `community_xp_jobs_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE`; validated=True
- `community_xp_jobs_state_check`: `CHECK ((state = ANY (ARRAY['pending'::text, 'done'::text])))`; validated=True
- `community_xp_jobs_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.contribution_v3_control`

| Column                | Type                     | Nullable | Identity / generated |
| --------------------- | ------------------------ | -------- | -------------------- |
| `singleton`           | boolean                  | NO       | NO / NEVER           |
| `enabled`             | boolean                  | NO       | NO / NEVER           |
| `starts_at`           | timestamp with time zone | YES      | NO / NEVER           |
| `paused`              | boolean                  | NO       | NO / NEVER           |
| `missions_enabled`    | boolean                  | NO       | NO / NEVER           |
| `refs`                | jsonb                    | NO       | NO / NEVER           |
| `updated_at`          | timestamp with time zone | NO       | NO / NEVER           |
| `missions_checked_at` | timestamp with time zone | YES      | NO / NEVER           |

Constraints:

- `contribution_v3_control_check`: `CHECK (((NOT enabled) OR (starts_at IS NOT NULL)))`; validated=True
- `contribution_v3_control_check1`: `CHECK (((NOT missions_enabled) OR (COALESCE(length((refs ->> 'coverage_validation_ref'::text)), 0) > 10)))`; validated=True
- `contribution_v3_control_pkey`: `PRIMARY KEY (singleton)`; validated=True
- `contribution_v3_control_singleton_check`: `CHECK (singleton)`; validated=True

### `public.contribution_v3_release_events`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `id`            | bigint                   | NO       | YES / NEVER          |
| `occurred_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `operator_ref`  | text                     | NO       | NO / NEVER           |
| `configuration` | jsonb                    | NO       | NO / NEVER           |

Constraints:

- `contribution_v3_release_events_pkey`: `PRIMARY KEY (id)`; validated=True

### `public.data_issue_reports`

| Column         | Type                     | Nullable | Identity / generated |
| -------------- | ------------------------ | -------- | -------------------- |
| `category`     | text                     | NO       | NO / NEVER           |
| `reference_id` | text                     | YES      | NO / NEVER           |
| `message`      | text                     | NO       | NO / NEVER           |
| `status`       | text                     | NO       | NO / NEVER           |
| `created_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `id`           | bigint                   | NO       | YES / NEVER          |
| `code`         | text                     | YES      | NO / ALWAYS          |
| `user_id`      | bigint                   | NO       | NO / NEVER           |

Constraints:

- `data_issue_reports_category_check`: `CHECK ((category = ANY (ARRAY['station'::text, 'forecast'::text, 'map'::text, 'community'::text, 'other'::text])))`; validated=True
- `data_issue_reports_code_key`: `UNIQUE (code)`; validated=True
- `data_issue_reports_message_check`: `CHECK (((length(message) >= 10) AND (length(message) <= 1000)))`; validated=True
- `data_issue_reports_pkey`: `PRIMARY KEY (id)`; validated=True
- `data_issue_reports_reference_id_check`: `CHECK (((reference_id IS NULL) OR (length(reference_id) <= 100)))`; validated=True
- `data_issue_reports_status_check`: `CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])))`; validated=True
- `data_issue_reports_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.external_feed_runs`

| Column            | Type                     | Nullable | Identity / generated |
| ----------------- | ------------------------ | -------- | -------------------- |
| `id`              | bigint                   | NO       | YES / NEVER          |
| `source`          | text                     | NO       | NO / NEVER           |
| `token`           | uuid                     | NO       | NO / NEVER           |
| `started_at`      | timestamp with time zone | NO       | NO / NEVER           |
| `completed_at`    | timestamp with time zone | YES      | NO / NEVER           |
| `status`          | text                     | NO       | NO / NEVER           |
| `received_count`  | integer                  | NO       | NO / NEVER           |
| `filtered_count`  | integer                  | NO       | NO / NEVER           |
| `inserted_count`  | integer                  | NO       | NO / NEVER           |
| `updated_count`   | integer                  | NO       | NO / NEVER           |
| `duplicate_count` | integer                  | NO       | NO / NEVER           |
| `not_modified`    | boolean                  | NO       | NO / NEVER           |
| `error_code`      | text                     | YES      | NO / NEVER           |

Constraints:

- `external_feed_runs_pkey`: `PRIMARY KEY (id)`; validated=True
- `external_feed_runs_source_fkey`: `FOREIGN KEY (source) REFERENCES external_feed_sources(source)`; validated=True
- `external_feed_runs_status_check`: `CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text])))`; validated=True
- `external_feed_runs_token_key`: `UNIQUE (token)`; validated=True

### `public.external_feed_sources`

| Column             | Type                     | Nullable | Identity / generated |
| ------------------ | ------------------------ | -------- | -------------------- |
| `source`           | text                     | NO       | NO / NEVER           |
| `next_attempt_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `last_attempt_at`  | timestamp with time zone | YES      | NO / NEVER           |
| `first_attempt_at` | timestamp with time zone | YES      | NO / NEVER           |
| `last_success_at`  | timestamp with time zone | YES      | NO / NEVER           |
| `checked_at`       | timestamp with time zone | YES      | NO / NEVER           |
| `failures`         | integer                  | NO       | NO / NEVER           |
| `last_error`       | text                     | YES      | NO / NEVER           |
| `lease_token`      | uuid                     | YES      | NO / NEVER           |
| `lease_until`      | timestamp with time zone | YES      | NO / NEVER           |
| `validators`       | jsonb                    | NO       | NO / NEVER           |
| `snapshot`         | jsonb                    | NO       | NO / NEVER           |

Constraints:

- `external_feed_sources_failures_check`: `CHECK ((failures >= 0))`; validated=True
- `external_feed_sources_pkey`: `PRIMARY KEY (source)`; validated=True
- `external_feed_sources_source_check`: `CHECK ((source = ANY (ARRAY['google_news'::text, 'nasa_firms'::text])))`; validated=True

### `public.external_news_items`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `id`            | text                     | NO       | NO / NEVER           |
| `guid`          | text                     | NO       | NO / NEVER           |
| `source_url`    | text                     | NO       | NO / NEVER           |
| `title`         | text                     | NO       | NO / NEVER           |
| `source_name`   | text                     | NO       | NO / NEVER           |
| `published_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `first_seen_at` | timestamp with time zone | NO       | NO / NEVER           |
| `last_seen_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`    | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `external_news_items_guid_key`: `UNIQUE (guid)`; validated=True
- `external_news_items_pkey`: `PRIMARY KEY (id)`; validated=True
- `external_news_items_source_name_check`: `CHECK (((length(source_name) >= 1) AND (length(source_name) <= 500)))`; validated=True
- `external_news_items_source_url_check`: `CHECK ((source_url ~ '^https://'::text))`; validated=True
- `external_news_items_source_url_key`: `UNIQUE (source_url)`; validated=True
- `external_news_items_title_check`: `CHECK (((length(title) >= 1) AND (length(title) <= 2000)))`; validated=True

### `public.forecast_provider_snapshots`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `station_id`    | text                     | NO       | NO / NEVER           |
| `provider`      | text                     | NO       | NO / NEVER           |
| `issued_at`     | timestamp with time zone | NO       | NO / NEVER           |
| `forecast_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `horizon_hours` | integer                  | NO       | NO / NEVER           |
| `pm25`          | double precision         | NO       | NO / NEVER           |
| `unit`          | text                     | NO       | NO / NEVER           |
| `raw_metadata`  | jsonb                    | NO       | NO / NEVER           |
| `created_at`    | timestamp with time zone | NO       | NO / NEVER           |
| `id`            | bigint                   | NO       | YES / NEVER          |
| `code`          | text                     | YES      | NO / ALWAYS          |
| `sync_run_id`   | bigint                   | YES      | NO / NEVER           |

Constraints:

- `forecast_provider_snapshots_code_key`: `UNIQUE (code)`; validated=True
- `forecast_provider_snapshots_horizon_hours_check`: `CHECK (((horizon_hours >= 0) AND (horizon_hours <= 168)))`; validated=True
- `forecast_provider_snapshots_pkey`: `PRIMARY KEY (id)`; validated=True
- `forecast_provider_snapshots_pm25_check`: `CHECK ((pm25 >= (0)::double precision))`; validated=True
- `forecast_provider_snapshots_provider_check`: `CHECK ((provider = ANY (ARRAY['openweather'::text, 'openmeteo_cams'::text])))`; validated=True
- `forecast_provider_snapshots_station_id_fkey`: `FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE`; validated=True
- `forecast_provider_snapshots_station_id_provider_issued_at_f_key`: `UNIQUE (station_id, provider, issued_at, forecast_at)`; validated=True
- `forecast_provider_snapshots_sync_run_id_fkey`: `FOREIGN KEY (sync_run_id) REFERENCES forecast_provider_sync_runs(id) ON DELETE SET NULL`; validated=True
- `forecast_provider_snapshots_unit_check`: `CHECK ((unit = 'µg/m³'::text))`; validated=True

### `public.forecast_provider_sync_runs`

| Column           | Type                     | Nullable | Identity / generated |
| ---------------- | ------------------------ | -------- | -------------------- |
| `provider`       | text                     | NO       | NO / NEVER           |
| `status`         | text                     | NO       | NO / NEVER           |
| `station_count`  | integer                  | NO       | NO / NEVER           |
| `snapshot_count` | integer                  | NO       | NO / NEVER           |
| `error_count`    | integer                  | NO       | NO / NEVER           |
| `error_message`  | text                     | YES      | NO / NEVER           |
| `started_at`     | timestamp with time zone | NO       | NO / NEVER           |
| `completed_at`   | timestamp with time zone | YES      | NO / NEVER           |
| `metadata`       | jsonb                    | NO       | NO / NEVER           |
| `id`             | bigint                   | NO       | YES / NEVER          |
| `code`           | text                     | YES      | NO / ALWAYS          |

Constraints:

- `forecast_provider_sync_runs_code_key`: `UNIQUE (code)`; validated=True
- `forecast_provider_sync_runs_pkey`: `PRIMARY KEY (id)`; validated=True
- `forecast_provider_sync_runs_provider_check`: `CHECK ((provider = ANY (ARRAY['openweather'::text, 'openmeteo_cams'::text])))`; validated=True
- `forecast_provider_sync_runs_status_check`: `CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'failed'::text])))`; validated=True

### `public.line_notification_links`

| Column                 | Type                     | Nullable | Identity / generated |
| ---------------------- | ------------------------ | -------- | -------------------- |
| `line_user_id`         | text                     | YES      | NO / NEVER           |
| `link_code_hash`       | text                     | YES      | NO / NEVER           |
| `link_code_expires_at` | timestamp with time zone | YES      | NO / NEVER           |
| `active`               | boolean                  | NO       | NO / NEVER           |
| `linked_at`            | timestamp with time zone | YES      | NO / NEVER           |
| `created_at`           | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`           | timestamp with time zone | NO       | NO / NEVER           |
| `user_id`              | bigint                   | NO       | NO / NEVER           |

Constraints:

- `line_notification_links_line_user_id_key`: `UNIQUE (line_user_id)`; validated=True
- `line_notification_links_link_code_hash_key`: `UNIQUE (link_code_hash)`; validated=True
- `line_notification_links_pkey`: `PRIMARY KEY (user_id)`; validated=True
- `line_notification_links_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.line_provider_budget`

| Column       | Type                     | Nullable | Identity / generated |
| ------------ | ------------------------ | -------- | -------------------- |
| `bucket`     | text                     | NO       | NO / NEVER           |
| `used`       | bigint                   | NO       | NO / NEVER           |
| `expires_at` | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `line_provider_budget_pkey`: `PRIMARY KEY (bucket)`; validated=True

### `public.line_user_event_cursors`

| Column         | Type                     | Nullable | Identity / generated |
| -------------- | ------------------------ | -------- | -------------------- |
| `line_user_id` | text                     | NO       | NO / NEVER           |
| `event_at`     | timestamp with time zone | NO       | NO / NEVER           |
| `event_id`     | text                     | NO       | NO / NEVER           |

Constraints:

- `line_user_event_cursors_pkey`: `PRIMARY KEY (line_user_id)`; validated=True

### `public.line_webhook_events`

| Column         | Type                     | Nullable | Identity / generated |
| -------------- | ------------------------ | -------- | -------------------- |
| `event_id`     | text                     | NO       | NO / NEVER           |
| `processed_at` | timestamp with time zone | NO       | NO / NEVER           |
| `expires_at`   | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `line_webhook_events_pkey`: `PRIMARY KEY (event_id)`; validated=True

### `public.line_webhook_inbox`

| Column         | Type                     | Nullable | Identity / generated |
| -------------- | ------------------------ | -------- | -------------------- |
| `event_id`     | text                     | NO       | NO / NEVER           |
| `event`        | jsonb                    | NO       | NO / NEVER           |
| `event_at`     | timestamp with time zone | NO       | NO / NEVER           |
| `created_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `available_at` | timestamp with time zone | NO       | NO / NEVER           |
| `lease_token`  | uuid                     | YES      | NO / NEVER           |
| `lease_until`  | timestamp with time zone | YES      | NO / NEVER           |
| `attempts`     | integer                  | NO       | NO / NEVER           |
| `last_error`   | text                     | YES      | NO / NEVER           |
| `status`       | text                     | NO       | NO / NEVER           |
| `applied`      | boolean                  | NO       | NO / NEVER           |
| `reply_text`   | text                     | YES      | NO / NEVER           |

Constraints:

- `line_webhook_inbox_pkey`: `PRIMARY KEY (event_id)`; validated=True
- `line_webhook_inbox_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'dead'::text])))`; validated=True

### `public.measurement_delivery_leases`

| Column        | Type                     | Nullable | Identity / generated |
| ------------- | ------------------------ | -------- | -------------------- |
| `lease_until` | timestamp with time zone | NO       | NO / NEVER           |
| `event_id`    | bigint                   | NO       | NO / NEVER           |

Constraints:

- `measurement_delivery_leases_event_id_fkey`: `FOREIGN KEY (event_id) REFERENCES notification_outbox(id) ON DELETE CASCADE`; validated=True
- `measurement_delivery_leases_pkey`: `PRIMARY KEY (event_id)`; validated=True

### `public.measurement_helper_locations`

| Column       | Type                     | Nullable | Identity / generated |
| ------------ | ------------------------ | -------- | -------------------- |
| `user_id`    | bigint                   | NO       | NO / NEVER           |
| `slot`       | smallint                 | NO       | NO / NEVER           |
| `name`       | text                     | NO       | NO / NEVER           |
| `address`    | text                     | NO       | NO / NEVER           |
| `lat`        | double precision         | NO       | NO / NEVER           |
| `lon`        | double precision         | NO       | NO / NEVER           |
| `enabled`    | boolean                  | NO       | NO / NEVER           |
| `updated_at` | timestamp with time zone | NO       | NO / NEVER           |
| `emoji`      | text                     | NO       | NO / NEVER           |

Constraints:

- `measurement_helper_locations_address_check`: `CHECK ((length(address) <= 240))`; validated=True
- `measurement_helper_locations_emoji_check`: `CHECK ((emoji = ANY (ARRAY['🏠'::text, '🏢'::text, '🏫'::text, '🏥'::text, '🏡'::text, '🏪'::text, '🌳'::text, '📍'::text])))`; validated=True
- `measurement_helper_locations_lat_check`: `CHECK (((lat >= (5)::double precision) AND (lat <= (21)::double precision)))`; validated=True
- `measurement_helper_locations_lon_check`: `CHECK (((lon >= (97)::double precision) AND (lon <= (106)::double precision)))`; validated=True
- `measurement_helper_locations_name_check`: `CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))`; validated=True
- `measurement_helper_locations_pkey`: `PRIMARY KEY (user_id, slot)`; validated=True
- `measurement_helper_locations_slot_check`: `CHECK ((slot = ANY (ARRAY[1, 2])))`; validated=True
- `measurement_helper_locations_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.measurement_helper_presence`

| Column        | Type                     | Nullable | Identity / generated |
| ------------- | ------------------------ | -------- | -------------------- |
| `enabled`     | boolean                  | NO       | NO / NEVER           |
| `lat`         | double precision         | YES      | NO / NEVER           |
| `lon`         | double precision         | YES      | NO / NEVER           |
| `accuracy_m`  | double precision         | YES      | NO / NEVER           |
| `observed_at` | timestamp with time zone | YES      | NO / NEVER           |
| `updated_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `user_id`     | bigint                   | NO       | NO / NEVER           |

Constraints:

- `measurement_helper_presence_accuracy_m_check`: `CHECK (((accuracy_m >= (0)::double precision) AND (accuracy_m <= (200)::double precision)))`; validated=True
- `measurement_helper_presence_check`: `CHECK ((((lat IS NULL) AND (lon IS NULL) AND (accuracy_m IS NULL) AND (observed_at IS NULL)) OR (enabled AND (lat IS NOT NULL) AND (lon IS NOT NULL) AND (accuracy_m IS NOT NULL) AND (observed_at IS NOT NULL))))`; validated=True
- `measurement_helper_presence_lat_check`: `CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)))`; validated=True
- `measurement_helper_presence_lon_check`: `CHECK (((lon >= ('-180'::integer)::double precision) AND (lon <= (180)::double precision)))`; validated=True
- `measurement_helper_presence_pkey`: `PRIMARY KEY (user_id)`; validated=True
- `measurement_helper_presence_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.measurement_notification_batch_items`

| Column       | Type   | Nullable | Identity / generated |
| ------------ | ------ | -------- | -------------------- |
| `batch_id`   | uuid   | NO       | NO / NEVER           |
| `request_id` | bigint | NO       | NO / NEVER           |
| `user_id`    | bigint | NO       | NO / NEVER           |

Constraints:

- `measurement_notification_batch_items_batch_id_fkey`: `FOREIGN KEY (batch_id) REFERENCES measurement_notification_batches(id) ON DELETE CASCADE`; validated=True
- `measurement_notification_batch_items_pkey`: `PRIMARY KEY (batch_id, request_id)`; validated=True
- `measurement_notification_batch_items_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES measurement_requests(id) ON DELETE CASCADE`; validated=True
- `measurement_notification_batch_items_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True
- `measurement_notification_batch_items_user_id_request_id_key`: `UNIQUE (user_id, request_id)`; validated=True

### `public.measurement_notification_batches`

| Column       | Type                     | Nullable | Identity / generated |
| ------------ | ------------------------ | -------- | -------------------- |
| `id`         | uuid                     | NO       | NO / NEVER           |
| `user_id`    | bigint                   | NO       | NO / NEVER           |
| `closes_at`  | timestamp with time zone | NO       | NO / NEVER           |
| `created_at` | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `measurement_notification_batches_pkey`: `PRIMARY KEY (id)`; validated=True
- `measurement_notification_batches_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.measurement_report_jobs`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `report_id`     | bigint                   | NO       | NO / NEVER           |
| `state`         | text                     | NO       | NO / NEVER           |
| `matched_count` | integer                  | NO       | NO / NEVER           |
| `created_at`    | timestamp with time zone | NO       | NO / NEVER           |
| `processed_at`  | timestamp with time zone | YES      | NO / NEVER           |

Constraints:

- `measurement_report_jobs_pkey`: `PRIMARY KEY (report_id)`; validated=True
- `measurement_report_jobs_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE`; validated=True
- `measurement_report_jobs_state_check`: `CHECK ((state = ANY (ARRAY['pending'::text, 'done'::text])))`; validated=True

### `public.measurement_report_matches`

| Column       | Type                     | Nullable | Identity / generated |
| ------------ | ------------------------ | -------- | -------------------- |
| `report_id`  | bigint                   | NO       | NO / NEVER           |
| `request_id` | bigint                   | NO       | NO / NEVER           |
| `created_at` | timestamp with time zone | NO       | NO / NEVER           |

Constraints:

- `measurement_report_matches_pkey`: `PRIMARY KEY (report_id, request_id)`; validated=True
- `measurement_report_matches_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE`; validated=True
- `measurement_report_matches_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES measurement_requests(id) ON DELETE CASCADE`; validated=True
- `measurement_report_matches_request_id_key`: `UNIQUE (request_id)`; validated=True

### `public.measurement_request_control`

| Column               | Type                     | Nullable | Identity / generated |
| -------------------- | ------------------------ | -------- | -------------------- |
| `singleton`          | boolean                  | NO       | NO / NEVER           |
| `registered_enabled` | boolean                  | NO       | NO / NEVER           |
| `enabled_at`         | timestamp with time zone | YES      | NO / NEVER           |

Constraints:

- `measurement_request_control_pkey`: `PRIMARY KEY (singleton)`; validated=True
- `measurement_request_control_singleton_check`: `CHECK (singleton)`; validated=True

### `public.measurement_request_recipients`

| Column                | Type                     | Nullable | Identity / generated |
| --------------------- | ------------------------ | -------- | -------------------- |
| `matched_location_at` | timestamp with time zone | NO       | NO / NEVER           |
| `declined`            | boolean                  | NO       | NO / NEVER           |
| `created_at`          | timestamp with time zone | NO       | NO / NEVER           |
| `request_id`          | bigint                   | NO       | NO / NEVER           |
| `user_id`             | bigint                   | NO       | NO / NEVER           |
| `matched_source`      | text                     | NO       | NO / NEVER           |

Constraints:

- `measurement_request_recipients_matched_source_check`: `CHECK ((matched_source = ANY (ARRAY['gps'::text, 'registered'::text])))`; validated=True
- `measurement_request_recipients_pkey`: `PRIMARY KEY (request_id, user_id)`; validated=True
- `measurement_request_recipients_request_id_fkey`: `FOREIGN KEY (request_id) REFERENCES measurement_requests(id) ON DELETE CASCADE`; validated=True
- `measurement_request_recipients_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.measurement_requests`

| Column              | Type                     | Nullable | Identity / generated |
| ------------------- | ------------------------ | -------- | -------------------- |
| `idempotency_key`   | uuid                     | NO       | NO / NEVER           |
| `fingerprint`       | text                     | NO       | NO / NEVER           |
| `place_name`        | text                     | NO       | NO / NEVER           |
| `lat`               | double precision         | NO       | NO / NEVER           |
| `lon`               | double precision         | NO       | NO / NEVER           |
| `radius_km`         | integer                  | NO       | NO / NEVER           |
| `starts_at`         | timestamp with time zone | NO       | NO / NEVER           |
| `expires_at`        | timestamp with time zone | NO       | NO / NEVER           |
| `last_processed_at` | timestamp with time zone | YES      | NO / NEVER           |
| `status`            | text                     | NO       | NO / NEVER           |
| `created_at`        | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`        | timestamp with time zone | NO       | NO / NEVER           |
| `id`                | bigint                   | NO       | YES / NEVER          |
| `code`              | text                     | YES      | NO / ALWAYS          |
| `dispatch_cursor`   | bigint                   | YES      | NO / NEVER           |
| `result_report_id`  | bigint                   | YES      | NO / NEVER           |
| `user_id`           | bigint                   | NO       | NO / NEVER           |

Constraints:

- `measurement_requests_check`: `CHECK ((expires_at > starts_at))`; validated=True
- `measurement_requests_code_key`: `UNIQUE (code)`; validated=True
- `measurement_requests_lat_check`: `CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)))`; validated=True
- `measurement_requests_lon_check`: `CHECK (((lon >= ('-180'::integer)::double precision) AND (lon <= (180)::double precision)))`; validated=True
- `measurement_requests_pkey`: `PRIMARY KEY (id)`; validated=True
- `measurement_requests_place_name_check`: `CHECK (((char_length(place_name) >= 1) AND (char_length(place_name) <= 160)))`; validated=True
- `measurement_requests_radius_km_check`: `CHECK ((radius_km = ANY (ARRAY[1, 2, 3, 5])))`; validated=True
- `measurement_requests_result_report_id_fkey`: `FOREIGN KEY (result_report_id) REFERENCES community_reports(id) ON DELETE SET NULL`; validated=True
- `measurement_requests_status_check`: `CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'fulfilled'::text, 'expired'::text, 'cancelled'::text])))`; validated=True
- `measurement_requests_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True
- `measurement_requests_user_id_idempotency_key_key`: `UNIQUE (user_id, idempotency_key)`; validated=True

### `public.notification_outbox`

| Column                | Type                     | Nullable | Identity / generated |
| --------------------- | ------------------------ | -------- | -------------------- |
| `event_key`           | text                     | NO       | NO / NEVER           |
| `payload`             | jsonb                    | NO       | NO / NEVER           |
| `status`              | text                     | NO       | NO / NEVER           |
| `attempts`            | integer                  | NO       | NO / NEVER           |
| `next_attempt_at`     | timestamp with time zone | NO       | NO / NEVER           |
| `last_error`          | text                     | YES      | NO / NEVER           |
| `processed_at`        | timestamp with time zone | YES      | NO / NEVER           |
| `created_at`          | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`          | timestamp with time zone | NO       | NO / NEVER           |
| `id`                  | bigint                   | NO       | YES / NEVER          |
| `code`                | text                     | YES      | NO / ALWAYS          |
| `notification_id`     | bigint                   | YES      | NO / NEVER           |
| `user_id`             | bigint                   | NO       | NO / NEVER           |
| `lease_token`         | uuid                     | YES      | NO / NEVER           |
| `lease_until`         | timestamp with time zone | YES      | NO / NEVER           |
| `frozen_request`      | jsonb                    | YES      | NO / NEVER           |
| `first_attempt_at`    | timestamp with time zone | YES      | NO / NEVER           |
| `provider_request_id` | text                     | YES      | NO / NEVER           |

Constraints:

- `notification_outbox_attempts_check`: `CHECK ((attempts >= 0))`; validated=True
- `notification_outbox_code_key`: `UNIQUE (code)`; validated=True
- `notification_outbox_event_key_key`: `UNIQUE (event_key)`; validated=True
- `notification_outbox_notification_id_fkey`: `FOREIGN KEY (notification_id) REFERENCES user_notifications(id) ON DELETE CASCADE`; validated=True
- `notification_outbox_pkey`: `PRIMARY KEY (id)`; validated=True
- `notification_outbox_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'dead'::text])))`; validated=True
- `notification_outbox_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.notification_preferences`

| Column                 | Type                     | Nullable | Identity / generated |
| ---------------------- | ------------------------ | -------- | -------------------- |
| `district`             | text                     | YES      | NO / NEVER           |
| `subdistrict`          | text                     | YES      | NO / NEVER           |
| `radius_km`            | double precision         | YES      | NO / NEVER           |
| `center_lat`           | double precision         | YES      | NO / NEVER           |
| `center_lon`           | double precision         | YES      | NO / NEVER           |
| `pm25_threshold`       | double precision         | NO       | NO / NEVER           |
| `air_alerts`           | boolean                  | NO       | NO / NEVER           |
| `hotspot_alerts`       | boolean                  | NO       | NO / NEVER           |
| `community_alerts`     | boolean                  | NO       | NO / NEVER           |
| `updated_at`           | timestamp with time zone | NO       | NO / NEVER           |
| `report_status_alerts` | boolean                  | NO       | NO / NEVER           |
| `rating_alerts`        | boolean                  | NO       | NO / NEVER           |
| `reward_alerts`        | boolean                  | NO       | NO / NEVER           |
| `leaderboard_alerts`   | boolean                  | NO       | NO / NEVER           |
| `announcement_alerts`  | boolean                  | NO       | NO / NEVER           |
| `line_enabled`         | boolean                  | NO       | NO / NEVER           |
| `web_push_enabled`     | boolean                  | NO       | NO / NEVER           |
| `quiet_hours_start`    | text                     | YES      | NO / NEVER           |
| `quiet_hours_end`      | text                     | YES      | NO / NEVER           |
| `timezone`             | text                     | NO       | NO / NEVER           |
| `consent_granted`      | boolean                  | NO       | NO / NEVER           |
| `consent_granted_at`   | timestamp with time zone | YES      | NO / NEVER           |
| `user_id`              | bigint                   | NO       | NO / NEVER           |

Constraints:

- `notification_preferences_pkey`: `PRIMARY KEY (user_id)`; validated=True
- `notification_preferences_quiet_hours_end_check`: `CHECK (((quiet_hours_end IS NULL) OR (quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text)))`; validated=True
- `notification_preferences_quiet_hours_start_check`: `CHECK (((quiet_hours_start IS NULL) OR (quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text)))`; validated=True
- `notification_preferences_radius_km_check`: `CHECK (((radius_km IS NULL) OR ((radius_km >= (1)::double precision) AND (radius_km <= (50)::double precision))))`; validated=True
- `notification_preferences_timezone_check`: `CHECK ((timezone = 'Asia/Bangkok'::text))`; validated=True
- `notification_preferences_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.pm25_readings`

| Column          | Type                     | Nullable | Identity / generated |
| --------------- | ------------------------ | -------- | -------------------- |
| `id`            | bigint                   | NO       | NO / NEVER           |
| `station_id`    | text                     | YES      | NO / NEVER           |
| `pm25`          | double precision         | YES      | NO / NEVER           |
| `aqi`           | integer                  | YES      | NO / NEVER           |
| `recorded_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `created_at`    | timestamp with time zone | YES      | NO / NEVER           |
| `source_at`     | timestamp with time zone | NO       | NO / NEVER           |
| `ingested_at`   | timestamp with time zone | NO       | NO / NEVER           |
| `source_status` | text                     | NO       | NO / NEVER           |
| `code`          | text                     | YES      | NO / ALWAYS          |

Constraints:

- `pm25_readings_code_key`: `UNIQUE (code)`; validated=True
- `pm25_readings_pkey`: `PRIMARY KEY (id)`; validated=True
- `pm25_readings_source_status_check`: `CHECK ((source_status = ANY (ARRAY['observed'::text, 'missing'::text, 'unavailable'::text, 'not_applicable'::text, 'invalid'::text])))`; validated=True
- `pm25_readings_station_id_fkey`: `FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE`; validated=True
- `pm25_readings_station_id_recorded_at_key`: `UNIQUE (station_id, recorded_at)`; validated=True

### `public.profiles`

| Column                | Type                     | Nullable | Identity / generated |
| --------------------- | ------------------------ | -------- | -------------------- |
| `display_name`        | text                     | YES      | NO / NEVER           |
| `role`                | text                     | NO       | NO / NEVER           |
| `reputation_score`    | integer                  | NO       | NO / NEVER           |
| `approved_reports`    | integer                  | NO       | NO / NEVER           |
| `helpful_reviews`     | integer                  | NO       | NO / NEVER           |
| `created_at`          | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`          | timestamp with time zone | NO       | NO / NEVER           |
| `avatar_url`          | text                     | YES      | NO / NEVER           |
| `identity_provider`   | text                     | YES      | NO / NEVER           |
| `id`                  | bigint                   | NO       | YES / NEVER          |
| `code`                | text                     | YES      | NO / ALWAYS          |
| `auth_user_id`        | uuid                     | YES      | NO / NEVER           |
| `deletion_started_at` | timestamp with time zone | YES      | NO / NEVER           |

Constraints:

- `profiles_approved_reports_check`: `CHECK ((approved_reports >= 0))`; validated=True
- `profiles_auth_user_id_key`: `UNIQUE (auth_user_id)`; validated=True
- `profiles_code_key`: `UNIQUE (code)`; validated=True
- `profiles_display_name_check`: `CHECK ((char_length(display_name) <= 80))`; validated=True
- `profiles_helpful_reviews_check`: `CHECK ((helpful_reviews >= 0))`; validated=True
- `profiles_id_fkey`: `FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL`; validated=True
- `profiles_pkey`: `PRIMARY KEY (id)`; validated=True
- `profiles_reputation_score_check`: `CHECK ((reputation_score >= 0))`; validated=True
- `profiles_role_check`: `CHECK ((role = ANY (ARRAY['user'::text, 'moderator'::text, 'admin'::text])))`; validated=True

### `public.public_map_events`

| Column       | Type                     | Nullable | Identity / generated |
| ------------ | ------------------------ | -------- | -------------------- |
| `event_type` | text                     | NO       | NO / NEVER           |
| `created_at` | timestamp with time zone | NO       | NO / NEVER           |
| `id`         | bigint                   | NO       | YES / NEVER          |
| `code`       | text                     | YES      | NO / ALWAYS          |
| `entity_id`  | bigint                   | YES      | NO / NEVER           |

Constraints:

- `public_map_events_code_key`: `UNIQUE (code)`; validated=True
- `public_map_events_event_type_check`: `CHECK ((event_type = ANY (ARRAY['report_approved'::text, 'report_updated'::text, 'report_expired'::text])))`; validated=True
- `public_map_events_pkey`: `PRIMARY KEY (id)`; validated=True

### `public.rate_limit_windows`

| Column              | Type                     | Nullable | Identity / generated |
| ------------------- | ------------------------ | -------- | -------------------- |
| `actor_key`         | text                     | NO       | NO / NEVER           |
| `action`            | text                     | NO       | NO / NEVER           |
| `window_started_at` | timestamp with time zone | NO       | NO / NEVER           |
| `request_count`     | integer                  | NO       | NO / NEVER           |

Constraints:

- `rate_limit_windows_pkey`: `PRIMARY KEY (actor_key, action, window_started_at)`; validated=True

### `public.report_comments`

| Column       | Type                     | Nullable | Identity / generated |
| ------------ | ------------------------ | -------- | -------------------- |
| `body`       | text                     | NO       | NO / NEVER           |
| `status`     | text                     | NO       | NO / NEVER           |
| `created_at` | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at` | timestamp with time zone | NO       | NO / NEVER           |
| `id`         | bigint                   | NO       | YES / NEVER          |
| `code`       | text                     | YES      | NO / ALWAYS          |
| `report_id`  | bigint                   | NO       | NO / NEVER           |
| `user_id`    | bigint                   | NO       | NO / NEVER           |

Constraints:

- `report_comments_body_check`: `CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 500)))`; validated=True
- `report_comments_code_key`: `UNIQUE (code)`; validated=True
- `report_comments_pkey`: `PRIMARY KEY (id)`; validated=True
- `report_comments_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE`; validated=True
- `report_comments_status_check`: `CHECK ((status = ANY (ARRAY['published'::text, 'hidden'::text])))`; validated=True
- `report_comments_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.report_drafts`

| Column                     | Type                     | Nullable | Identity / generated |
| -------------------------- | ------------------------ | -------- | -------------------- |
| `exact_lat`                | double precision         | NO       | NO / NEVER           |
| `exact_lon`                | double precision         | NO       | NO / NEVER           |
| `gps_accuracy_m`           | double precision         | YES      | NO / NEVER           |
| `camera_session_issued_at` | timestamp with time zone | NO       | NO / NEVER           |
| `client_captured_at`       | timestamp with time zone | NO       | NO / NEVER           |
| `effective_captured_at`    | timestamp with time zone | NO       | NO / NEVER           |
| `server_received_at`       | timestamp with time zone | NO       | NO / NEVER           |
| `clock_warning`            | boolean                  | NO       | NO / NEVER           |
| `image_path`               | text                     | NO       | NO / NEVER           |
| `image_sha256`             | text                     | NO       | NO / NEVER           |
| `image_ahash`              | text                     | YES      | NO / NEVER           |
| `burst_hashes`             | jsonb                    | NO       | NO / NEVER           |
| `ocr_pm25`                 | double precision         | YES      | NO / NEVER           |
| `ocr_confidence`           | double precision         | NO       | NO / NEVER           |
| `ocr_raw_text`             | text                     | YES      | NO / NEVER           |
| `device_detected`          | boolean                  | NO       | NO / NEVER           |
| `display_clear`            | boolean                  | NO       | NO / NEVER           |
| `expires_at`               | timestamp with time zone | NO       | NO / NEVER           |
| `submitted_at`             | timestamp with time zone | YES      | NO / NEVER           |
| `created_at`               | timestamp with time zone | NO       | NO / NEVER           |
| `ocr_status`               | text                     | NO       | NO / NEVER           |
| `unexpected_exif`          | boolean                  | NO       | NO / NEVER           |
| `capture_source`           | text                     | NO       | NO / NEVER           |
| `image_metadata`           | jsonb                    | NO       | NO / NEVER           |
| `original_image_path`      | text                     | YES      | NO / NEVER           |
| `id`                       | bigint                   | NO       | YES / NEVER          |
| `code`                     | text                     | YES      | NO / ALWAYS          |
| `capture_session_id`       | bigint                   | NO       | NO / NEVER           |
| `duplicate_of_report_id`   | bigint                   | YES      | NO / NEVER           |
| `user_id`                  | bigint                   | NO       | NO / NEVER           |

Constraints:

- `report_drafts_capture_session_id_fkey`: `FOREIGN KEY (capture_session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE`; validated=True
- `report_drafts_capture_session_id_key`: `UNIQUE (capture_session_id)`; validated=True
- `report_drafts_capture_source_check`: `CHECK ((capture_source = ANY (ARRAY['camera'::text, 'gallery'::text])))`; validated=True
- `report_drafts_check`: `CHECK ((expires_at > created_at))`; validated=True
- `report_drafts_code_key`: `UNIQUE (code)`; validated=True
- `report_drafts_duplicate_of_report_id_fkey`: `FOREIGN KEY (duplicate_of_report_id) REFERENCES community_reports(id) ON DELETE SET NULL`; validated=True
- `report_drafts_exact_lat_check`: `CHECK (((exact_lat >= ('-90'::integer)::double precision) AND (exact_lat <= (90)::double precision)))`; validated=True
- `report_drafts_exact_lon_check`: `CHECK (((exact_lon >= ('-180'::integer)::double precision) AND (exact_lon <= (180)::double precision)))`; validated=True
- `report_drafts_gps_accuracy_m_check`: `CHECK (((gps_accuracy_m IS NULL) OR (gps_accuracy_m >= (0)::double precision)))`; validated=True
- `report_drafts_ocr_confidence_check`: `CHECK (((ocr_confidence >= (0)::double precision) AND (ocr_confidence <= (1)::double precision)))`; validated=True
- `report_drafts_ocr_pm25_check`: `CHECK (((ocr_pm25 >= (0)::double precision) AND (ocr_pm25 <= (1000)::double precision)))`; validated=True
- `report_drafts_ocr_status_check`: `CHECK ((ocr_status = ANY (ARRAY['unavailable'::text, 'service_error'::text, 'no_device'::text, 'unclear_display'::text, 'no_reading'::text, 'low_confidence'::text, 'ready'::text])))`; validated=True
- `report_drafts_pkey`: `PRIMARY KEY (id)`; validated=True
- `report_drafts_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.report_evidence`

| Column                     | Type                     | Nullable | Identity / generated |
| -------------------------- | ------------------------ | -------- | -------------------- |
| `exact_lat`                | double precision         | YES      | NO / NEVER           |
| `exact_lon`                | double precision         | YES      | NO / NEVER           |
| `gps_accuracy_m`           | double precision         | YES      | NO / NEVER           |
| `camera_session_issued_at` | timestamp with time zone | YES      | NO / NEVER           |
| `client_captured_at`       | timestamp with time zone | YES      | NO / NEVER           |
| `server_received_at`       | timestamp with time zone | NO       | NO / NEVER           |
| `image_path`               | text                     | YES      | NO / NEVER           |
| `image_sha256`             | text                     | YES      | NO / NEVER           |
| `image_ahash`              | text                     | YES      | NO / NEVER           |
| `burst_hashes`             | jsonb                    | NO       | NO / NEVER           |
| `ocr_raw_text`             | text                     | YES      | NO / NEVER           |
| `retention_until`          | timestamp with time zone | YES      | NO / NEVER           |
| `purged_at`                | timestamp with time zone | YES      | NO / NEVER           |
| `audit_hold`               | boolean                  | NO       | NO / NEVER           |
| `created_at`               | timestamp with time zone | NO       | NO / NEVER           |
| `ocr_status`               | text                     | NO       | NO / NEVER           |
| `unexpected_exif`          | boolean                  | NO       | NO / NEVER           |
| `image_metadata`           | jsonb                    | NO       | NO / NEVER           |
| `original_image_path`      | text                     | YES      | NO / NEVER           |
| `capture_session_id`       | bigint                   | YES      | NO / NEVER           |
| `report_id`                | bigint                   | NO       | NO / NEVER           |

Constraints:

- `report_evidence_capture_session_id_fkey`: `FOREIGN KEY (capture_session_id) REFERENCES capture_sessions(id) ON DELETE SET NULL`; validated=True
- `report_evidence_capture_session_id_key`: `UNIQUE (capture_session_id)`; validated=True
- `report_evidence_exact_lat_check`: `CHECK (((exact_lat >= ('-90'::integer)::double precision) AND (exact_lat <= (90)::double precision)))`; validated=True
- `report_evidence_exact_lon_check`: `CHECK (((exact_lon >= ('-180'::integer)::double precision) AND (exact_lon <= (180)::double precision)))`; validated=True
- `report_evidence_gps_accuracy_m_check`: `CHECK (((gps_accuracy_m IS NULL) OR (gps_accuracy_m >= (0)::double precision)))`; validated=True
- `report_evidence_ocr_status_check`: `CHECK ((ocr_status = ANY (ARRAY['unavailable'::text, 'service_error'::text, 'no_device'::text, 'unclear_display'::text, 'no_reading'::text, 'low_confidence'::text, 'ready'::text])))`; validated=True
- `report_evidence_pkey`: `PRIMARY KEY (report_id)`; validated=True
- `report_evidence_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE`; validated=True

### `public.report_reactions`

| Column            | Type                     | Nullable | Identity / generated |
| ----------------- | ------------------------ | -------- | -------------------- |
| `reaction`        | text                     | NO       | NO / NEVER           |
| `created_at`      | timestamp with time zone | NO       | NO / NEVER           |
| `updated_at`      | timestamp with time zone | NO       | NO / NEVER           |
| `report_id`       | bigint                   | NO       | NO / NEVER           |
| `user_id`         | bigint                   | NO       | NO / NEVER           |
| `reason_code`     | text                     | YES      | NO / NEVER           |
| `geofence_policy` | text                     | YES      | NO / NEVER           |

Constraints:

- `report_reactions_pkey`: `PRIMARY KEY (report_id, user_id)`; validated=True
- `report_reactions_reaction_check`: `CHECK ((reaction = ANY (ARRAY['like'::text, 'dislike'::text])))`; validated=True
- `report_reactions_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE`; validated=True
- `report_reactions_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.report_reviews`

| Column                 | Type                     | Nullable | Identity / generated |
| ---------------------- | ------------------------ | -------- | -------------------- |
| `id`                   | bigint                   | NO       | NO / NEVER           |
| `verdict`              | text                     | NO       | NO / NEVER           |
| `reason_code`          | text                     | NO       | NO / NEVER           |
| `reviewer_distance_km` | double precision         | NO       | NO / NEVER           |
| `gps_accuracy_m`       | double precision         | YES      | NO / NEVER           |
| `note`                 | text                     | YES      | NO / NEVER           |
| `weight`               | double precision         | NO       | NO / NEVER           |
| `rewarded_at`          | timestamp with time zone | YES      | NO / NEVER           |
| `created_at`           | timestamp with time zone | NO       | NO / NEVER           |
| `rating`               | smallint                 | YES      | NO / NEVER           |
| `rating_direction`     | text                     | YES      | NO / NEVER           |
| `consensus_matched`    | boolean                  | YES      | NO / NEVER           |
| `code`                 | text                     | YES      | NO / ALWAYS          |
| `report_id`            | bigint                   | NO       | NO / NEVER           |
| `reviewer_id`          | bigint                   | NO       | NO / NEVER           |

Constraints:

- `report_reviews_code_key`: `UNIQUE (code)`; validated=True
- `report_reviews_pkey`: `PRIMARY KEY (id)`; validated=True
- `report_reviews_rating_check`: `CHECK (((rating >= 1) AND (rating <= 5)))`; validated=True
- `report_reviews_rating_direction_check`: `CHECK ((rating_direction = ANY (ARRAY['negative'::text, 'neutral'::text, 'positive'::text])))`; validated=True
- `report_reviews_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE CASCADE`; validated=True
- `report_reviews_report_id_reviewer_id_key`: `UNIQUE (report_id, reviewer_id)`; validated=True
- `report_reviews_reviewer_distance_km_check`: `CHECK ((reviewer_distance_km >= (0)::double precision))`; validated=True
- `report_reviews_reviewer_id_fkey`: `FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True
- `report_reviews_verdict_check`: `CHECK ((verdict = ANY (ARRAY['confirm'::text, 'dispute'::text])))`; validated=True
- `report_reviews_weight_check`: `CHECK (((weight >= (1)::double precision) AND (weight <= (5)::double precision)))`; validated=True

### `public.reputation_events`

| Column            | Type                     | Nullable | Identity / generated |
| ----------------- | ------------------------ | -------- | -------------------- |
| `id`              | bigint                   | NO       | NO / NEVER           |
| `points`          | integer                  | NO       | NO / NEVER           |
| `reason`          | text                     | NO       | NO / NEVER           |
| `idempotency_key` | text                     | NO       | NO / NEVER           |
| `created_at`      | timestamp with time zone | NO       | NO / NEVER           |
| `code`            | text                     | YES      | NO / ALWAYS          |
| `report_id`       | bigint                   | YES      | NO / NEVER           |
| `user_id`         | bigint                   | NO       | NO / NEVER           |

Constraints:

- `reputation_events_code_key`: `UNIQUE (code)`; validated=True
- `reputation_events_idempotency_key_key`: `UNIQUE (idempotency_key)`; validated=True
- `reputation_events_pkey`: `PRIMARY KEY (id)`; validated=True
- `reputation_events_report_id_fkey`: `FOREIGN KEY (report_id) REFERENCES community_reports(id) ON DELETE SET NULL`; validated=True
- `reputation_events_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

### `public.stations`

| Column        | Type                     | Nullable | Identity / generated |
| ------------- | ------------------------ | -------- | -------------------- |
| `id`          | text                     | NO       | NO / NEVER           |
| `name_th`     | text                     | YES      | NO / NEVER           |
| `name_en`     | text                     | YES      | NO / NEVER           |
| `lat`         | double precision         | NO       | NO / NEVER           |
| `lon`         | double precision         | NO       | NO / NEVER           |
| `province`    | text                     | YES      | NO / NEVER           |
| `pm25`        | double precision         | YES      | NO / NEVER           |
| `aqi`         | integer                  | YES      | NO / NEVER           |
| `color`       | text                     | YES      | NO / NEVER           |
| `level`       | text                     | YES      | NO / NEVER           |
| `recorded_at` | timestamp with time zone | YES      | NO / NEVER           |
| `updated_at`  | timestamp with time zone | YES      | NO / NEVER           |
| `district`    | text                     | YES      | NO / NEVER           |

Constraints:

- `stations_pkey`: `PRIMARY KEY (id)`; validated=True

### `public.sync_runs`

| Column               | Type                     | Nullable | Identity / generated |
| -------------------- | ------------------------ | -------- | -------------------- |
| `source`             | text                     | NO       | NO / NEVER           |
| `status`             | text                     | NO       | NO / NEVER           |
| `fetched_count`      | integer                  | NO       | NO / NEVER           |
| `station_count`      | integer                  | NO       | NO / NEVER           |
| `reading_count`      | integer                  | NO       | NO / NEVER           |
| `source_recorded_at` | timestamp with time zone | YES      | NO / NEVER           |
| `error_message`      | text                     | YES      | NO / NEVER           |
| `started_at`         | timestamp with time zone | NO       | NO / NEVER           |
| `completed_at`       | timestamp with time zone | YES      | NO / NEVER           |
| `rejected_count`     | integer                  | NO       | NO / NEVER           |
| `rejection_summary`  | jsonb                    | NO       | NO / NEVER           |
| `id`                 | bigint                   | NO       | YES / NEVER          |
| `code`               | text                     | YES      | NO / ALWAYS          |

Constraints:

- `sync_runs_code_key`: `UNIQUE (code)`; validated=True
- `sync_runs_pkey`: `PRIMARY KEY (id)`; validated=True
- `sync_runs_status_check`: `CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text])))`; validated=True

### `public.user_notifications`

| Column              | Type                     | Nullable | Identity / generated |
| ------------------- | ------------------------ | -------- | -------------------- |
| `event_type`        | text                     | NO       | NO / NEVER           |
| `title`             | text                     | NO       | NO / NEVER           |
| `body`              | text                     | NO       | NO / NEVER           |
| `url`               | text                     | NO       | NO / NEVER           |
| `entity_type`       | text                     | YES      | NO / NEVER           |
| `entity_id`         | text                     | YES      | NO / NEVER           |
| `payload`           | jsonb                    | NO       | NO / NEVER           |
| `deduplication_key` | text                     | NO       | NO / NEVER           |
| `read_at`           | timestamp with time zone | YES      | NO / NEVER           |
| `created_at`        | timestamp with time zone | NO       | NO / NEVER           |
| `id`                | bigint                   | NO       | YES / NEVER          |
| `code`              | text                     | YES      | NO / ALWAYS          |
| `user_id`           | bigint                   | NO       | NO / NEVER           |

Constraints:

- `user_notifications_code_key`: `UNIQUE (code)`; validated=True
- `user_notifications_pkey`: `PRIMARY KEY (id)`; validated=True
- `user_notifications_user_id_deduplication_key_key`: `UNIQUE (user_id, deduplication_key)`; validated=True
- `user_notifications_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE`; validated=True

## Access boundary

Public table RLS status is a catalog check only. Backend service-role operations still require owner/admin checks. Private schemas must remain unexposed. Never infer that an empty table or retired UI is safe to delete.

Managed auth, storage, realtime, cron, net, vault and migration-history objects are excluded from application ownership. Preserve them with service-supported backup procedures; do not hand-delete their tables.
