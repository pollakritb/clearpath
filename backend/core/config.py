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

    # OCR ภาพหน้าจอเครื่องวัด (OpenAI Responses API, server only)
    openai_api_key: str = ""
    openai_ocr_model: str = "gpt-5.4-mini"

    # Supabase (service_role — server only)
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    report_image_bucket: str = "report-images"

    # Signed camera session (server-issued timestamp; 5-minute freshness window)
    capture_session_secret: str = ""
    capture_session_ttl_seconds: int = 300
    local_demo_mode: bool = False

    # Cron auth
    cron_secret: str = ""

    # PWA Web Push (VAPID). The public key is intentionally exposed through a
    # read-only API; the private key never leaves the backend.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    # Production feature gates. A model must also pass its quality gate in the
    # model registry before ML forecasts are served.
    push_enabled: bool = False
    ml_forecast_enabled: bool = False

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


settings = Settings()
