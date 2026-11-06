"""PostgREST boundary: numeric database keys, string codes in domain/API rows.

UUID inputs are legacy aliases or creation retry keys, never numeric PK values.
The bridge works before and after the atomic cutover; a v2 state is permanent.
Security material and arbitrary JSON/audit dictionaries are never rewritten.
"""

from __future__ import annotations

from copy import deepcopy
from threading import RLock
from time import monotonic

from ..core.identifiers import PREFIXES, UUID_ENTITIES, code, legacy_uuid, number

REFERENCES = {
    "community_reporter_review_requests": {"user_id": "profiles"},
    "community_reporter_audits": {
        "user_id": "profiles",
        "report_id": "community_reports",
    },
    "account_privacy_requests": {"user_id": "profiles"},
    "community_evidence_outcomes": {
        "user_id": "profiles",
        "report_id": "community_reports",
    },
    "community_coverage_missions": {"fulfilled_report_id": "community_reports"},
    "community_device_evaluations": {
        "report_id": "community_reports",
        "user_id": "profiles",
    },
    "announcements": {"created_by": "profiles", "updated_by": "profiles"},
    "audit_logs": {"actor_id": "profiles"},
    "cams_grid_active": {"generation_id": "cams_grid_generations"},
    "cams_grid_chunks": {"job_id": "cams_grid_jobs"},
    "cams_grid_frames": {"generation_id": "cams_grid_generations"},
    "cams_grid_jobs": {"generation_id": "cams_grid_generations"},
    "capture_sessions": {"user_id": "profiles"},
    "community_help_claims": {
        "request_id": "measurement_requests",
        "user_id": "profiles",
    },
    "community_reports": {
        "capture_session_id": "capture_sessions",
        "duplicate_of_report_id": "community_reports",
        "moderated_by": "profiles",
        "user_id": "profiles",
    },
    "community_xp_accounts": {"user_id": "profiles"},
    "community_xp_events": {
        "report_id": "community_reports",
        "request_id": "measurement_requests",
        "requester_id": "profiles",
        "reverses": "community_xp_events",
        "user_id": "profiles",
    },
    "community_xp_jobs": {"report_id": "community_reports", "user_id": "profiles"},
    "data_issue_reports": {"user_id": "profiles"},
    "forecast_provider_snapshots": {"sync_run_id": "forecast_provider_sync_runs"},
    "line_notification_links": {"user_id": "profiles"},
    "measurement_delivery_leases": {"event_id": "notification_outbox"},
    "measurement_helper_presence": {"user_id": "profiles"},
    "measurement_helper_locations": {"user_id": "profiles"},
    "measurement_report_jobs": {"report_id": "community_reports"},
    "measurement_report_matches": {
        "report_id": "community_reports",
        "request_id": "measurement_requests",
    },
    "measurement_notification_batches": {"user_id": "profiles"},
    "measurement_notification_batch_items": {
        "user_id": "profiles",
        "request_id": "measurement_requests",
    },
    "measurement_request_recipients": {
        "request_id": "measurement_requests",
        "user_id": "profiles",
    },
    "measurement_requests": {
        "dispatch_cursor": "profiles",
        "result_report_id": "community_reports",
        "user_id": "profiles",
    },
    "notification_outbox": {
        "notification_id": "user_notifications",
        "user_id": "profiles",
    },
    "notification_preferences": {"user_id": "profiles"},
    "public_map_events": {"entity_id": "community_reports"},
    "report_comments": {"report_id": "community_reports", "user_id": "profiles"},
    "report_drafts": {
        "capture_session_id": "capture_sessions",
        "duplicate_of_report_id": "community_reports",
        "user_id": "profiles",
    },
    "report_evidence": {
        "capture_session_id": "capture_sessions",
        "report_id": "community_reports",
    },
    "report_reactions": {"report_id": "community_reports", "user_id": "profiles"},
    "report_reviews": {"report_id": "community_reports", "reviewer_id": "profiles"},
    "reputation_events": {"report_id": "community_reports", "user_id": "profiles"},
    "user_notifications": {"user_id": "profiles"},
}

RPC_PARAMETERS = {
    "request_reporter_review": {"p_user": "profiles"},
    "request_account_erasure": {"p_user": "profiles"},
    "save_measurement_helper_location": {"p_user": "profiles"},
    "registered_measurement_helpers": {
        "p_request": "measurement_requests",
        "p_cursor": "profiles",
    },
    "queue_measurement_group": {
        "p_user": "profiles",
        "p_request": "measurement_requests",
    },
    "prepare_measurement_group": {"p_user": "profiles"},
    "apply_reputation_event": {
        "p_user_id": "profiles",
        "p_report_id": "community_reports",
    },
    "consume_capture_session": {
        "p_session_id": "capture_sessions",
        "p_user_id": "profiles",
    },
    "moderate_community_report": {
        "p_report_id": "community_reports",
        "p_admin_id": "profiles",
    },
    "moderate_community_report_v2": {
        "p_report_id": "community_reports",
        "p_admin_id": "profiles",
    },
    "refresh_report_engagement_counts": {"p_report_id": "community_reports"},
    "claim_community_help": {"p_user": "profiles", "p_request": "measurement_requests"},
    "community_xp_totals": {"p_user": "profiles"},
    "community_xp_board": {"p_user": "profiles"},
    "community_v2_month_board": {"p_user": "profiles"},
    "community_v2_counters": {"p_user": "profiles"},
    "community_v2_month_points": {"p_user": "profiles"},
    "reverse_community_xp": {"p_event": "community_xp_events"},
    "release_cams_grid": {"p_job": "cams_grid_jobs"},
    "checkpoint_cams_grid": {"p_job": "cams_grid_jobs"},
    "publish_cams_grid": {"p_job": "cams_grid_jobs"},
    "claim_measurement_delivery": {"p_event": "notification_outbox"},
    "set_measurement_presence": {"p_user": "profiles"},
    "finish_measurement_request": {
        "p_id": "measurement_requests",
        "p_report": "community_reports",
    },
}
RPC_RESULTS = {
    "registered_measurement_helpers": "measurement_helper_presence",
    "apply_reputation_event": "profiles",
    "moderate_community_report": "community_reports",
    "moderate_community_report_v2": "community_reports",
    "claim_cams_grid": "cams_grid_jobs",
    "claim_community_help": "community_help_claims",
    "community_xp_totals": "community_xp_accounts",
    "community_xp_board": "community_xp_accounts",
    "community_v2_month_board": "community_xp_accounts",
    "create_measurement_request": "measurement_requests",
    "set_measurement_presence": "measurement_helper_presence",
    "publish_cams_grid": "cams_grid_jobs",
}
POLYMORPHIC = {
    "community_report": "community_reports",
    "report": "community_reports",
    "measurement_request": "measurement_requests",
    "announcement": "announcements",
    "activity": "activities",
    "profile": "profiles",
    "community_xp_event": "community_xp_events",
    "report_draft": "report_drafts",
    "alert_event": "alert_events",
}
FILTERS = {"eq", "neq", "gt", "gte", "lt", "lte", "in_"}


class IdentifierClient:
    def __init__(self, raw):
        self.raw = raw
        self._numeric = False
        self._version = 1
        self._checked_at = 0.0
        self._aliases = {}
        self._lock = RLock()

    def __getattr__(self, name):
        return getattr(self.raw, name)

    def numeric(self, *, force: bool = False) -> bool:
        if force or not self._numeric or monotonic() - self._checked_at > 5:
            state = self.raw.rpc("identifier_schema_state", {}).execute().data
            self._version = int(state["version"])
            self._numeric = self._version >= 2
            self._checked_at = monotonic()
        return self._numeric

    def prime_private_aliases(self, table: str | None, data):
        """Fetch privacy/retry metadata in a batch, without public UUID columns."""
        if table not in {
            "profiles",
            "capture_sessions",
            "report_drafts",
            "community_reports",
            "report_comments",
            "measurement_requests",
        }:
            return
        rows = data if isinstance(data, list) else [data]
        rows = [r.get("row", r) for r in rows if isinstance(r, dict)]
        values = list(
            {
                str(r["id"])
                for r in rows
                if r.get("id") is not None
                and (table, str(r["id"])) not in self._aliases
            }
        )
        for start in range(0, len(values), 500):
            aliases = (
                self.raw.rpc(
                    "identifier_resolve_many",
                    {"p_entity": table, "p_values": values[start : start + 500]},
                )
                .execute()
                .data
                or []
            )
            with self._lock:
                for row in aliases:
                    for alias in (
                        str(row["numeric_id"]),
                        row["legacy_id"],
                        row["code"],
                    ):
                        if len(self._aliases) >= 8192:
                            self._aliases.clear()
                        self._aliases[(table, alias)] = row

    def resolve(self, entity: str, value):
        if value is None:
            return None
        if not legacy_uuid(value):
            return number(entity, value)
        return self.identity(entity, str(value))["numeric_id"]

    def identity(self, entity: str, value: str) -> dict:
        key = (entity, value)
        with self._lock:
            cached = self._aliases.get(key)
        if cached is not None:
            return cached
        result = (
            self.raw.rpc("identifier_resolve", {"p_entity": entity, "p_value": value})
            .execute()
            .data
        )
        if not result:
            raise ValueError("identifier_not_found")
        with self._lock:
            if len(self._aliases) >= 8192:
                self._aliases.clear()
            for alias in (
                str(result["legacy_id"]),
                str(result["numeric_id"]),
                result["code"],
            ):
                self._aliases[(entity, alias)] = result
        return result

    def table(self, table: str):
        return IdentifierQuery(self, table=table)

    def rpc(self, name: str, params: dict | None = None):
        return IdentifierQuery(self, rpc=name, params=params or {})

    def field_entity(self, table: str | None, field: str):
        if field == "id" and table in PREFIXES:
            return table
        if field == "member_id":
            return "community_members"
        return REFERENCES.get(table, {}).get(field)

    def encode_row(
        self,
        table: str,
        row: dict,
        *,
        creation: bool = False,
        pending_notice: bool = False,
    ):
        result = deepcopy(row)
        result.pop("code", None)
        result.pop("member_code", None)
        for field, value in list(result.items()):
            entity = self.field_entity(table, field)
            if entity is None or value is None:
                continue
            if field == "id" and entity in UUID_ENTITIES and legacy_uuid(value):
                result["legacy_id"] = result.pop("id")
                if table == "profiles":
                    result["auth_user_id"] = value
            elif (
                table == "notification_outbox"
                and field == "notification_id"
                and pending_notice
                and legacy_uuid(value)
            ):
                result["legacy_notification_id"] = result.pop(field)
            else:
                result[field] = self.resolve(entity, value)
        if creation and table in UUID_ENTITIES and "id" in result:
            # Creation owns only a retry key. A caller cannot allocate a numeric PK.
            raise ValueError("numeric_identity_is_database_generated")
        return result

    def decode(self, table: str | None, value):
        if isinstance(value, list):
            return [self.decode(table, row) for row in value]
        if not isinstance(value, dict):
            return value
        result = dict(value)
        if (
            self._version >= 3
            and table
            in {
                "profiles",
                "capture_sessions",
                "report_drafts",
                "community_reports",
                "report_comments",
                "measurement_requests",
            }
            and value.get("id") is not None
        ):
            alias = self._aliases.get((table, str(value["id"])))
            if alias:
                # Backend-only decoration. Public response models/presenters do
                # not serialize this compatibility metadata.
                result["legacy_id"] = alias["legacy_id"]
        for field, item in value.items():
            entity = self.field_entity(table, field)
            if entity and item is not None:
                result[field] = code(entity, item)
            elif (
                field == "entity_id"
                and value.get("entity_type") in POLYMORPHIC
                and item
            ):
                target = POLYMORPHIC[value["entity_type"]]
                if legacy_uuid(item):
                    try:
                        result[field] = self.identity(target, item)["code"]
                    except ValueError:
                        # A historical reference may predate a deleted entity.
                        # Keep that evidence; never invent a new record/number.
                        result[field] = item
                else:
                    result[field] = code(target, item)
            elif field in {"row", "rows", "me"}:
                result[field] = self.decode(table, item)
        if (
            table in UUID_ENTITIES
            and value.get("legacy_id")
            and value.get("id") is not None
        ):
            identity = {
                "numeric_id": value["id"],
                "legacy_id": value["legacy_id"],
                "code": result["id"],
            }
            with self._lock:
                for alias in (str(value["id"]), str(value["legacy_id"]), result["id"]):
                    if len(self._aliases) < 8192:
                        self._aliases[(table, alias)] = identity
        return result


class IdentifierQuery:
    def __init__(self, client, *, table=None, rpc=None, params=None):
        self.client, self.table_name, self.rpc_name = client, table, rpc
        self.params, self.calls = params, []

    @property
    def not_(self):
        self.calls.append(("not_", (), {}))
        return self

    def __getattr__(self, name):
        def record(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return self

        return record

    def execute(self):
        numeric = self.client.numeric()
        version = self.client._version
        clean = version >= 3
        table = self.table_name or RPC_RESULTS.get(self.rpc_name)
        if self.rpc_name:
            params = deepcopy(self.params)
            if numeric:
                for parameter, entity in RPC_PARAMETERS.get(self.rpc_name, {}).items():
                    if parameter in params:
                        params[parameter] = self.client.resolve(
                            entity, params[parameter]
                        )
                if self.rpc_name == "create_measurement_request":
                    params["p_row"] = self.client.encode_row(
                        "measurement_requests", params["p_row"], creation=True
                    )
                if self.rpc_name == "notify_measurement_request":
                    params["p_notification"] = self.client.encode_row(
                        "user_notifications", params["p_notification"], creation=True
                    )
                    if params.get("p_outbox"):
                        params["p_outbox"] = self.client.encode_row(
                            "notification_outbox",
                            params["p_outbox"],
                            creation=True,
                            pending_notice=True,
                        )
            query = self.client.raw.rpc(self.rpc_name, params)
        else:
            query = self.client.raw.table(table)
        for name, original, original_kwargs in self.calls:
            args, kwargs = list(original), dict(original_kwargs)
            if numeric and name in {"insert", "upsert", "update"}:
                rows = args[0]

                def encode(r, creation=name in {"insert", "upsert"}):
                    return self.client.encode_row(table, r, creation=creation)

                args[0] = (
                    [encode(r) for r in rows]
                    if isinstance(rows, list)
                    else encode(rows)
                )
                encoded_rows = args[0] if isinstance(args[0], list) else [args[0]]
                if (
                    clean
                    and name in {"insert", "upsert"}
                    and any(r.get("legacy_id") for r in encoded_rows)
                ):
                    query = self.client.raw.rpc(
                        "identifier_insert",
                        {
                            "p_table": table,
                            "p_rows": [
                                {k: v for k, v in r.items() if k != "legacy_id"}
                                for r in encoded_rows
                            ],
                            "p_keys": [r.get("legacy_id") for r in encoded_rows],
                            "p_conflict": kwargs.get("on_conflict") or "id",
                            "p_upsert": name == "upsert",
                            "p_ignore": kwargs.get("ignore_duplicates", False),
                        },
                    )
                    continue
                conflict = kwargs.get("on_conflict", "")
                # Existing UUID creation keys continue making retries idempotent.
                if (
                    not clean
                    and table in UUID_ENTITIES
                    and "id" in conflict.split(",")
                    and (
                        (isinstance(rows, dict) and legacy_uuid(rows.get("id")))
                        or (
                            isinstance(rows, list)
                            and rows
                            and legacy_uuid(rows[0].get("id"))
                        )
                    )
                ):
                    kwargs["on_conflict"] = ",".join(
                        "legacy_id" if f == "id" else f for f in conflict.split(",")
                    )
            if numeric and name in FILTERS:
                entity = self.client.field_entity(table, args[0])
                if entity:
                    if name != "in_" and legacy_uuid(args[1]):
                        if clean:
                            try:
                                args[1] = self.client.resolve(entity, args[1])
                            except ValueError as exc:
                                if str(exc) != "identifier_not_found":
                                    raise
                                args[
                                    1
                                ] = -1  # Read/update/delete a missing alias matches no positive PK.
                        else:
                            args[0] = "legacy_" + args[0]
                    elif name == "in_":
                        args[1] = [self.client.resolve(entity, v) for v in args[1]]
                    else:
                        args[1] = self.client.resolve(entity, args[1])
            query = (
                getattr(query, name)
                if name == "not_"
                else getattr(query, name)(*args, **kwargs)
            )
        read_only = not any(
            name in {"insert", "upsert", "update", "delete"}
            for name, _, _ in self.calls
        ) and (
            self.rpc_name is None
            or self.rpc_name
            in {
                "community_xp_totals",
                "community_xp_board",
                "community_v2_month_board",
                "community_v2_counters",
                "community_xp_admin_overview",
            }
        )
        try:
            response = query.execute()
        except Exception:
            # An in-flight read may have crossed the atomic schema commit.
            # Never replay a mutation on a transport/database exception.
            if (
                read_only
                and self.client.numeric(force=True)
                and version != self.client._version
            ):
                return self.execute()
            raise
        if read_only and not numeric and self.client.numeric():
            return self.execute()
        if numeric:
            if clean:
                self.client.prime_private_aliases(table, response.data)
            response.data = self.client.decode(table, response.data)
        return response
