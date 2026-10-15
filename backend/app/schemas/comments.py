import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

MAX_COMMENT_CHARS = 2000


class CommentCreate(BaseModel):
    body: str = Field(max_length=MAX_COMMENT_CHARS)
    # Where in the video the comment applies. Checked against the duration when it is known.
    timestamp_seconds: int | None = Field(default=None, ge=0)

    @field_validator("body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("a comment can't be empty")
        return value


class CommentRead(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    body: str
    timestamp_seconds: int | None
    created_at: datetime
