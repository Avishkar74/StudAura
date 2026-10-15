import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class NoteRead(BaseModel):
    """The caller's note for a video. `revision` is 0 and `body` empty until one is saved."""

    video_id: uuid.UUID
    body: str
    revision: int
    updated_at: datetime | None


class NoteUpdate(BaseModel):
    body: str
    # The revision the client last saw: 0 for "no note yet". Omit to overwrite unconditionally.
    base_revision: int | None = Field(default=None, ge=0)
