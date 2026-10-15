"""Turn YouTube Data API `videos.list` payloads into our own metadata. Pure functions.

Shared by the real client and the fixture-backed fake, so the fixtures exercise the real parser.
"""

import re
from typing import Any

from app.integrations.youtube.errors import VideoUnavailableError
from app.integrations.youtube.models import AVAILABLE, EMBED_DISABLED, VideoMetadata

_DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)
_THUMBNAIL_PREFERENCE = ("maxres", "standard", "high", "medium", "default")
_UNUSABLE_UPLOAD_STATES = {"deleted", "failed", "rejected"}


def parse_iso8601_duration(value: str | None) -> int | None:
    """`PT1H2M3S` -> 3723. Returns None for missing, malformed or zero durations (live streams
    report `P0D`), because a zero would wrongly suggest a known, empty video."""
    if not value:
        return None
    match = _DURATION_RE.match(value)
    if not match:
        return None
    parts = {k: int(v) for k, v in match.groupdict().items() if v}
    total = (
        parts.get("days", 0) * 86400
        + parts.get("hours", 0) * 3600
        + parts.get("minutes", 0) * 60
        + parts.get("seconds", 0)
    )
    return total or None


def _best_thumbnail(thumbnails: dict[str, Any]) -> str | None:
    for key in _THUMBNAIL_PREFERENCE:
        url = (thumbnails.get(key) or {}).get("url")
        if isinstance(url, str) and url:
            return url
    return None


def parse_video_response(video_id: str, payload: dict[str, Any]) -> VideoMetadata:
    """Parse a `videos.list` response for one ID.

    Private and deleted videos come back with no items; that, a private status or a deleted/
    rejected upload all mean "unavailable". Embedding disabled is *not* unavailable: the video is
    kept so its notes and progress work, and the player shows a fallback (PRD 6.10).
    """
    items = payload.get("items") or []
    item = next((i for i in items if i.get("id") == video_id), None)
    if item is None:
        raise VideoUnavailableError

    status = item.get("status") or {}
    if status.get("privacyStatus") == "private" or (
        status.get("uploadStatus") in _UNUSABLE_UPLOAD_STATES
    ):
        raise VideoUnavailableError

    snippet = item.get("snippet") or {}
    title = snippet.get("title")
    if not isinstance(title, str) or not title.strip():
        raise VideoUnavailableError  # nothing useful to show or store

    embeddable = status.get("embeddable", True)
    return VideoMetadata(
        youtube_video_id=video_id,
        title=title.strip(),
        channel_title=snippet.get("channelTitle") or None,
        thumbnail_url=_best_thumbnail(snippet.get("thumbnails") or {}),
        duration_seconds=parse_iso8601_duration((item.get("contentDetails") or {}).get("duration")),
        availability_state=AVAILABLE if embeddable else EMBED_DISABLED,
    )
