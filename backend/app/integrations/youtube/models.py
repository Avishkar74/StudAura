from dataclasses import dataclass
from typing import Protocol

AVAILABLE = "available"
EMBED_DISABLED = "embed_disabled"


@dataclass(frozen=True)
class VideoMetadata:
    youtube_video_id: str
    title: str
    channel_title: str | None
    thumbnail_url: str | None
    duration_seconds: int | None  # None when YouTube does not report one (e.g. live streams)
    availability_state: str  # AVAILABLE or EMBED_DISABLED


class YouTubeClient(Protocol):
    """What the rest of the app needs from YouTube. Real and fake adapters both implement it."""

    async def get_video(self, video_id: str) -> VideoMetadata:
        """Return metadata, or raise a `YouTubeError` subclass."""
        ...
