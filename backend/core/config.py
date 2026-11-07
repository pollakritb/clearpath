"""Centralized settings (อ่านจาก env / .env.local)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    measurement_requests_enabled: bool = False
    measurement_registered_locations_enabled: bool = False
    community_xp_enabled: bool = False
    # Additive v2 schema and evaluated release policy are required before enabling.
    community_v2_enabled: bool = False
    account_privacy_enabled: bool = False
    reporter_trust_enabled: bool = False
    reporter_trust_validation_ref: str = ""
    community_v2_demo_launch: str = "2026-11-05T00:00:00+07:00"

    # External APIs
    geoapify_api_key: str = ""
    firms_map_key: str = ""
    air4thai_url: str = "http://air4thai.pcd.go.th/services/getNewAQI_JSON.php"
    openmeteo_air_enabled: bool = True
    # Public forecast mode serves stored raw CAMS values from Supabase.
    # It remains independent from the paused ClearPath model/generation pipeline.
    external_forecast_enabled: bool = True
    forecast_provider_max_batch_size: int = 50
    forecast_provider_snapshot_retention_days: int = 7
    forecast_provider_run_retention_days: int = 30
    # Compatibility setting only: retired routes always stay paused.
    forecast_system_paused: bool = True
    # Isolated forecast evidence collection. No production schedule is registered.
    forecast_validation_enabled: bool = False
    # Storage-only CAMS collection; independent of the paused model pipeline.
    cams_grid_collection_enabled: bool = False
    cams_snapshot_collection_enabled: bool = False
    cams_snapshot_expected_supabase_ref: str = ""
    # Exact, pre-reviewed station IDs from the private hourly-completeness scan.
    forecast_validation_cohort_ids: str = ""

    @property
    def validation_cohort_ids(self) -> list[str]:
        return [
            value.strip()
            for value in self.forecast_validation_cohort_ids.split(",")
            if value.strip()
        ]

    # Private evidence can be summarized publicly only after source/window review.
    forecast_validation_public_metrics_enabled: bool = False

    # OCR ภาพหน้าจอเครื่องวัด (OpenAI Responses API, server only)
    openai_api_key: str = ""
    openai_ocr_model: str = "gpt-5.4-mini"
    # Enable only after the external-feed migration and cron are installed.
    external_feed_storage_enabled: bool = False
    google_news_enabled: bool = True
    google_news_cache_seconds: int = 3600
    google_news_query: str = "(PM2.5 OR ฝุ่น OR คุณภาพอากาศ) ประเทศไทย when:7d"

    # Supabase (service_role — server only)
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    report_image_bucket: str = "report-images"

    # Runtime / operations
    app_environment: str = "development"
    release_sha: str = "local"
    vercel_git_commit_sha: str = ""
    log_level: str = "INFO"
    cors_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Signed camera session (server-issued timestamp; 5-minute freshness window)
    capture_session_secret: str = ""
    capture_session_ttl_seconds: int = 300
    local_demo_mode: bool = False

    # Cron auth
    cron_secret: str = ""
    # Independent token used by Supabase Cron. Keeping this separate lets the
    # GitHub Actions backup retain its own credential and rotation lifecycle.
    supabase_cron_secret: str = ""

    # LINE Messaging API (LINE Notify was discontinued). Secrets remain server-only.
    line_messaging_enabled: bool = False
    line_channel_secret: str = ""
    line_channel_access_token: str = ""
    line_official_account_url: str = ""
    app_public_url: str = "https://clearpath-gray.vercel.app"

    # Air-quality and hotspot notification jobs (legacy flag name).
    push_enabled: bool = False

    @property
    def effective_capture_secret(self) -> str:
        """Use a server-only secret already present in MVP environments as fallback."""
        return (
            self.capture_session_secret
            or self.cron_secret
            or self.supabase_service_role_key
        )

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def line_messaging_ready(self) -> bool:
        return bool(
            self.line_messaging_enabled
            and self.line_channel_secret
            and self.line_channel_access_token
        )

    @property
    def allowed_cors_origins(self) -> list[str]:
        """Explicit browser origins; production never falls back to a wildcard."""
        return [
            origin.strip().rstrip("/")
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]

    @property
    def is_production(self) -> bool:
        return self.app_environment.lower() == "production"

    @property
    def current_release(self) -> str:
        """Prefer the immutable Vercel deployment SHA over a stale manual value."""
        return self.vercel_git_commit_sha or self.release_sha


settings = Settings()
