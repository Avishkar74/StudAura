import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.learning_path import PathRef, PathVideoMeta


class LearningItem(BaseModel):
    """A video the student has watched, with their own progress and where it lives."""

    video_id: uuid.UUID
    video: PathVideoMeta
    # One of the student's paths that contains it, so it can be opened in context.
    path: PathRef | None
    learning_status: str
    last_position_seconds: float
    playback_pct: float | None
    last_watched_at: datetime


class DashboardLearning(BaseModel):
    # The most recently watched video that is still In Progress, or None.
    continue_learning: LearningItem | None
    # The latest few, including the one above.
    recently_watched: list[LearningItem]
