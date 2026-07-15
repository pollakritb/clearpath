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
    ors_api_key: str = ""
    openweather_api_key: str = ""
    firms_map_key: str = ""
    air4thai_url: str = "http://air4thai.pcd.go.th/services/getNewAQI_JSON.php"

    # Supabase (service_role — server only)
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Cron auth
    cron_secret: str = ""

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


settings = Settings()
