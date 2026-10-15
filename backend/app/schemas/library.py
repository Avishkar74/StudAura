import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.learning_path import PathRef, PathVideoMeta


class NoteListItem(BaseModel):
    """One note in the notes list."""

    video_id: uuid.UUID
    video: PathVideoMeta
    path: PathRef | None
    # The first line of the note, and the text after it.
    title: str
    snippet: str
    updated_at: datetime
    revision: int


class SavedState(BaseModel):
    video_id: uuid.UUID
    saved: bool
    saved_at: datetime | None


class SavedItem(BaseModel):
    """A bookmarked video with the student's progress on it."""

    video_id: uuid.UUID
    video: PathVideoMeta
    path: PathRef | None
    learning_status: str
    last_position_seconds: float
    playback_pct: float | None
    last_watched_at: datetime | None
    saved_at: datetime
