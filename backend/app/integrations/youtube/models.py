from dataclasses import dataclass, field
from typing import Protocol

AVAILABLE = "available"
EMBED_DISABLED = "embed_disabled"

# YouTube returns at most 50 items per playlistItems page and per videos.list call.
PAGE_SIZE = 50


@dataclass(frozen=True)
class VideoMetadata:
    youtube_video_id: str
    title: str
    channel_title: str | None
    thumbnail_url: str | None
    duration_seconds: int | None  # None when YouTube does not report one (e.g. live streams)
    availability_state: str  # AVAILABLE or EMBED_DISABLED


@dataclass(frozen=True)
class PlaylistEntry:
    """One slot in a playlist. The title is YouTube's, e.g. "Private video" for hidden items."""

    youtube_video_id: str
    title: str | None


@dataclass(frozen=True)
class PlaylistPage:
    entries: list[PlaylistEntry] = field(default_factory=list)
    next_page_token: str | None = None
    total_results: int | None = None


class YouTubeClient(Protocol):
    """What the rest of the app needs from YouTube. Real and fake adapters both implement it."""

    async def get_video(self, video_id: str) -> VideoMetadata:
        """Return metadata, or raise a `YouTubeError` subclass."""
        ...

    async def get_videos(self, video_ids: list[str]) -> dict[str, VideoMetadata]:
        """Batch lookup (at most PAGE_SIZE ids). Private/deleted videos are simply absent."""
        ...

    async def get_playlist_page(self, playlist_id: str, page_token: str | None) -> PlaylistPage:
        """One page (at most PAGE_SIZE entries) in playlist order, or a `YouTubeError`."""
        ...
