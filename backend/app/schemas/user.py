import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str | None
    created_at: datetime


class UserUpdate(BaseModel):
    """What the caller may change about themselves. The email belongs to Supabase Auth."""

    display_name: str | None = Field(default=None, max_length=100)

    @field_validator("display_name")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None
