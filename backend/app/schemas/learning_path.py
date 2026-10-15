import uuid
from datetime import date, datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator, model_validator

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
MAX_DESCRIPTION = 2000


def _clean_description(value: str | None) -> str | None:
    """Trim; blank becomes None; enforce the length limit."""
    if value is None:
        return None
    value = value.strip()
    if len(value) > MAX_DESCRIPTION:
        raise ValueError(f"must be at most {MAX_DESCRIPTION} characters")
    return value or None


class LearningPathCreate(BaseModel):
    title: Title
    description: str | None = None
    target_date: date | None = None

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return _clean_description(value)


class LearningPathUpdate(BaseModel):
    """Partial update. Omitted fields are untouched; `null` clears description/target_date."""

    title: Title | None = None
    description: str | None = None
    target_date: date | None = None

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return _clean_description(value)

    @model_validator(mode="after")
    def _title_cannot_be_cleared(self) -> Self:
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("title cannot be null")
        return self


class LearningPathRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    target_date: date | None
    created_at: datetime
    updated_at: datetime
    total_videos: int
    completed_videos: int
    in_progress_videos: int
    needs_revision_videos: int
    completion_pct: float
    last_activity_at: datetime | None


class PathVideoMeta(BaseModel):
    id: uuid.UUID
    youtube_video_id: str
    title: str
    channel_title: str | None
    thumbnail_url: str | None
    duration_seconds: int | None
    availability_state: str


class PathVideoRead(BaseModel):
    """One row of a path's ordered video list, with the caller's own progress."""

    position: int
    video: PathVideoMeta
    learning_status: str
    last_position_seconds: float
    playback_pct: float | None
    ever_completed_at: datetime | None
    last_watched_at: datetime | None
