"""Fixture-backed fake YouTube adapter. Used by tests and CI; never calls the network.

Activated by APP_ENV=test (CLAUDE.md rule 10). Responses are recorded-style `videos.list`
payloads from backend/tests/fixtures/youtube, parsed by the same code as production.
"""

import json
from pathlib import Path

from app.integrations.youtube.errors import VideoUnavailableError, YouTubeError
from app.integrations.youtube.models import VideoMetadata
from app.integrations.youtube.parsing import parse_video_response

DEFAULT_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "youtube"

# Video ID -> fixture file.
VIDEO_FIXTURES = {
    "dQw4w9WgXcQ": "video_normal.json",
    "embedOff123": "video_embed_disabled.json",
    "privateVid1": "video_private.json",
    "noDuration1": "video_no_duration.json",
}

NORMAL_VIDEO_ID = "dQw4w9WgXcQ"
EMBED_DISABLED_VIDEO_ID = "embedOff123"
PRIVATE_VIDEO_ID = "privateVid1"
NO_DURATION_VIDEO_ID = "noDuration1"


class FakeYouTubeClient:
    def __init__(
        self,
        fixtures_dir: Path = DEFAULT_FIXTURES_DIR,
        *,
        fail_with: YouTubeError | None = None,
    ) -> None:
        self._dir = fixtures_dir
        self.fail_with = fail_with  # raise this from every call (quota, timeout, ...)
        self.calls: list[str] = []

    async def get_video(self, video_id: str) -> VideoMetadata:
        self.calls.append(video_id)
        if self.fail_with is not None:
            raise self.fail_with
        name = VIDEO_FIXTURES.get(video_id)
        if name is None:
            raise VideoUnavailableError  # unknown IDs behave like deleted videos
        return parse_video_response(video_id, json.loads((self._dir / name).read_text("utf-8")))
