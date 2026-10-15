import math
import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.schemas.learning_path import PathVideoMeta
from app.services.progress import LearningStatus


class VideoDetail(BaseModel):
    """A video the caller can open, with their own progress folded in."""

    video: PathVideoMeta
    learning_status: str
    last_position_seconds: float
    playback_pct: float | None
    ever_completed_at: datetime | None
    last_watched_at: datetime | None


class ProgressRead(BaseModel):
    video_id: uuid.UUID
    learning_status: str
    last_position_seconds: float
    playback_pct: float | None
    ever_completed_at: datetime | None
    last_watched_at: datetime | None


class ProgressUpdate(BaseModel):
    """Idempotent update: send the position, a manual status, or both."""

    last_position_seconds: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    learning_status: LearningStatus | None = None

    @model_validator(mode="after")
    def _something_to_update(self) -> Self:
        if self.last_position_seconds is None and self.learning_status is None:
            raise ValueError("send last_position_seconds, learning_status, or both")
        if self.last_position_seconds is not None and not math.isfinite(self.last_position_seconds):
            raise ValueError("last_position_seconds must be a finite number")
        return self
