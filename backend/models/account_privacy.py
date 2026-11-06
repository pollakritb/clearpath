"""Owner-only privacy requests and paginated structured activity export."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class DeletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation: Literal["ลบบัญชี"]
    acknowledges_retention: Literal[True]


class PrivacyRequest(BaseModel):
    id: str
    status: Literal["pending", "processing", "completed", "cancelled"]
    created_at: str
    completed_at: str | None = None


class AccountPrivacyStatus(BaseModel):
    enabled: bool
    requests: list[PrivacyRequest]
    export_sections: list[str]
    automatic_deletion: bool = False


class AccountExportPage(BaseModel):
    section: str
    items: list[dict]
    next_offset: int | None = None
    generated_at: str
    scope: str = "structured_activity_without_media_binaries_or_other_users"
