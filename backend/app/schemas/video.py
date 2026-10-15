import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.learning_path import PathVideoMeta


class VideoImportRequest(BaseModel):
    youtube_url: str = Field(max_length=2048)
    learning_path_id: uuid.UUID


class VideoImportResponse(BaseModel):
    status: Literal["added", "skipped"]
    reason: str | None
    position: int
    video: PathVideoMeta
