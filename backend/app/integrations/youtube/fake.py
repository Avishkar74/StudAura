"""Fixture-backed fake YouTube adapter. Used by tests and CI; never calls the network.

Activated by APP_ENV=test (CLAUDE.md rule 10). Responses are recorded-style API payloads from
backend/tests/fixtures/youtube, parsed by the same code as production. Tests can also register
extra videos and playlists in memory (e.g. a 120-item playlist) without adding fixture files.
"""

import json
from pathlib import Path
from typing import Any

from app.integrations.youtube.errors import (
    PlaylistUnavailableError,
    VideoUnavailableError,
    YouTubeError,
)
from app.integrations.youtube.models import (
    PAGE_SIZE,
    PlaylistEntry,
    PlaylistPage,
    VideoMetadata,
)
from app.integrations.youtube.parsing import (
    parse_playlist_page,
    parse_video_response,
)

DEFAULT_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "youtube"

# Video ID -> fixture file.
VIDEO_FIXTURES = {
    "dQw4w9WgXcQ": "video_normal.json",
    "arrayVid001": "video_array.json",
    "sortingVid1": "video_sorting.json",
    "embedOff123": "video_embed_disabled.json",
    "privateVid1": "video_private.json",
    "noDuration1": "video_no_duration.json",
}
# Playlist ID -> fixture file (a single page). Unknown playlists behave like private ones.
PLAYLIST_FIXTURES = {
    "PLmixed00000001": "playlist_mixed.json",
    "PLempty00000001": "playlist_empty.json",
}

NORMAL_VIDEO_ID = "dQw4w9WgXcQ"
ARRAY_VIDEO_ID = "arrayVid001"
SORTING_VIDEO_ID = "sortingVid1"
EMBED_DISABLED_VIDEO_ID = "embedOff123"
PRIVATE_VIDEO_ID = "privateVid1"
NO_DURATION_VIDEO_ID = "noDuration1"
MIXED_PLAYLIST_ID = "PLmixed00000001"
EMPTY_PLAYLIST_ID = "PLempty00000001"


class FakeYouTubeClient:
    def __init__(
        self,
        fixtures_dir: Path = DEFAULT_FIXTURES_DIR,
        *,
        fail_with: YouTubeError | None = None,
    ) -> None:
        self._dir = fixtures_dir
        self.fail_with = fail_with  # raise this from every call (quota, timeout, ...)
        self.calls: list[str] = []  # every video id sent upstream (single or batch)
        self.playlist_calls: list[tuple[str, str | None]] = []  # (playlist id, page token)
        self.fail_playlist_page_after: int | None = None  # raise `fail_with` from this page on
        self._videos: dict[str, VideoMetadata] = {}
        self._playlists: dict[str, list[PlaylistEntry]] = {}

    # --- in-memory additions for tests -----------------------------------------------------

    def add_video(self, meta: VideoMetadata) -> None:
        self._videos[meta.youtube_video_id] = meta

    def add_playlist(self, playlist_id: str, entries: list[PlaylistEntry]) -> None:
        self._playlists[playlist_id] = entries

    # --- YouTubeClient ---------------------------------------------------------------------

    def _load(self, name: str) -> dict[str, Any]:
        data: dict[str, Any] = json.loads((self._dir / name).read_text("utf-8"))
        return data

    def _lookup(self, video_id: str) -> VideoMetadata:
        if video_id in self._videos:
            return self._videos[video_id]
        name = VIDEO_FIXTURES.get(video_id)
        if name is None:
            raise VideoUnavailableError  # unknown IDs behave like deleted videos
        return parse_video_response(video_id, self._load(name))

    async def get_video(self, video_id: str) -> VideoMetadata:
        self.calls.append(video_id)
        if self.fail_with is not None:
            raise self.fail_with
        return self._lookup(video_id)

    async def get_videos(self, video_ids: list[str]) -> dict[str, VideoMetadata]:
        if len(video_ids) > PAGE_SIZE:
            raise ValueError(f"at most {PAGE_SIZE} ids per call")
        self.calls.extend(video_ids)
        if self.fail_with is not None:
            raise self.fail_with
        found: dict[str, VideoMetadata] = {}
        for video_id in video_ids:
            try:
                found[video_id] = self._lookup(video_id)
            except VideoUnavailableError:
                continue
        return found

    async def get_playlist_page(self, playlist_id: str, page_token: str | None) -> PlaylistPage:
        self.playlist_calls.append((playlist_id, page_token))
        if self.fail_with is not None and (
            self.fail_playlist_page_after is None
            or len(self.playlist_calls) > self.fail_playlist_page_after
        ):
            raise self.fail_with

        if playlist_id in self._playlists:
            entries = self._playlists[playlist_id]
            start = int(page_token.removeprefix("tok")) if page_token else 0
            end = start + PAGE_SIZE
            return PlaylistPage(
                entries=entries[start:end],
                next_page_token=f"tok{end}" if end < len(entries) else None,
                total_results=len(entries),
            )

        name = PLAYLIST_FIXTURES.get(playlist_id)
        if name is None:
            raise PlaylistUnavailableError
        return parse_playlist_page(self._load(name))
