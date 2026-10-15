import uuid
from typing import Literal

from pydantic import BaseModel, Field

# YouTube page tokens are short opaque strings; this keeps junk and oversized input out.
PageToken = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,200}$")


class PlaylistImportRequest(BaseModel):
    youtube_url: str = Field(max_length=2048)
    learning_path_id: uuid.UUID
    page_token: str | None = PageToken


class PlaylistImportItem(BaseModel):
    youtube_video_id: str
    status: Literal["added", "skipped", "failed"]
    title: str | None
    position: int | None = None
    reason: str | None = None
    video_id: uuid.UUID | None = None
    availability_state: str | None = None


class PlaylistImportResponse(BaseModel):
    """Result for one page. Keep calling with `next_page_token` until it is null."""

    added: int
    skipped: int
    failed: int
    total_in_playlist: int | None
    next_page_token: str | None
    items: list[PlaylistImportItem]
