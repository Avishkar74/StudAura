import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.learning_path import PathRef, PathVideoMeta
from app.services.revisions import DueState


class RevisionUpdate(BaseModel):
    """Flag a video for revision, or reschedule it. Idempotent."""

    # Omit to use the next calendar day.
    due_at: date | None = None
    # Only used to find "tomorrow" when the student has no daily goal (which stores a timezone).
    timezone: str | None = Field(default=None, max_length=64)


class RevisionRead(BaseModel):
    """A video's revision state. `active` is false when it is not in the queue."""

    video_id: uuid.UUID
    learning_status: str
    active: bool
    due_at: date | None
    flagged_at: datetime | None
    # When it was last marked revised, if ever.
    revised_at: datetime | None
    due_state: DueState | None
    today: date


class RevisionItemRead(BaseModel):
    video_id: uuid.UUID
    video: PathVideoMeta
    # One of the student's paths that contains the video, so "Review now" can open it in context.
    path: PathRef | None
    due_at: date
    flagged_at: datetime
    due_state: DueState


class RevisionQueue(BaseModel):
    today: date
    timezone: str
    total: int
    # Items due today or overdue.
    due_count: int
    items: list[RevisionItemRead]
