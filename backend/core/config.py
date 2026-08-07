"""Centralized settings (อ่านจาก env / .env.local)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # External APIs
    openweather_api_key: str = ""
    firms_map_key: str = ""
    air4thai_url: str = "http://air4thai.pcd.go.th/services/getNewAQI_JSON.php"
    openweather_air_enabled: bool = True
    openmeteo_air_enabled: bool = True
    # Community forecast correction remains shadow-only until field/backtest gates pass.
    community_forecast_shadow_enabled: bool = False
    forecast_provider_max_batch_size: int = 50
    forecast_station_min_history_points: int = 24
    forecast_station_max_age_minutes: int = 90

    # OCR ภาพหน้าจอเครื่องวัด (OpenAI Responses API, server only)
    openai_api_key: str = ""
    openai_ocr_model: str = "gpt-5.4-mini"

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
    readiness_max_station_age_minutes: int = 90

    # Signed camera session (server-issued timestamp; 5-minute freshness window)
    capture_session_secret: str = ""
    capture_session_ttl_seconds: int = 300
    local_demo_mode: bool = False

    # Hybrid evidence review: high-confidence cases are approved automatically;
    # every uncertain case remains pending for the administrator exception queue.
    automatic_review_enabled: bool = True
    automatic_review_min_confidence: float = 0.92
    automatic_review_max_gps_accuracy_m: float = 100.0

    # Cron auth
    cron_secret: str = ""

    # PWA Web Push (VAPID). The public key is intentionally exposed through a
    # read-only API; the private key never leaves the backend.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    # LINE Messaging API (LINE Notify was discontinued). Secrets remain server-only.
    line_messaging_enabled: bool = False
    line_channel_secret: str = ""
    line_channel_access_token: str = ""
    line_official_account_url: str = ""

    # Production feature gates. A model must also pass its quality gate in the
    # model registry before ML forecasts are served.
    push_enabled: bool = False
    ml_forecast_enabled: bool = False
    ml_forecast_shadow_enabled: bool = False
    ml_forecast_canary_percentage: int = 0
    ml_forecast_canary_station_allowlist: str = ""
    forecast_prediction_retention_days: int = 400

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
    def web_push_ready(self) -> bool:
        """True only when both halves of the VAPID credential are usable."""
        return bool(
            self.push_enabled
            and self.vapid_public_key
            and self.vapid_private_key
            and self.vapid_subject
        )

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

    @property
    def canary_station_allowlist(self) -> list[str]:
        return [
            station.strip()
            for station in self.ml_forecast_canary_station_allowlist.split(",")
            if station.strip()
        ]


settings = Settings()
