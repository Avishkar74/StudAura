import json
from pathlib import Path
from typing import Any

import pytest

from app.integrations.youtube.errors import VideoUnavailableError
from app.integrations.youtube.fake import (
    DEFAULT_FIXTURES_DIR,
    EMBED_DISABLED_VIDEO_ID,
    NO_DURATION_VIDEO_ID,
    NORMAL_VIDEO_ID,
    PRIVATE_VIDEO_ID,
)
from app.integrations.youtube.parsing import parse_iso8601_duration, parse_video_response


def fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(Path(DEFAULT_FIXTURES_DIR, name).read_text("utf-8"))
    return data


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("PT52M10S", 3130),
        ("PT1H2M3S", 3723),
        ("PT45S", 45),
        ("PT2H", 7200),
        ("PT10M", 600),
        ("P1DT1H", 90000),
        ("P0D", None),  # live streams
        ("PT0S", None),
        ("", None),
        (None, None),
        ("garbage", None),
        ("1:02:03", None),
    ],
)
def test_iso8601_duration(value: str | None, expected: int | None) -> None:
    assert parse_iso8601_duration(value) == expected


def test_normal_video() -> None:
    meta = parse_video_response(NORMAL_VIDEO_ID, fixture("video_normal.json"))
    assert meta.youtube_video_id == NORMAL_VIDEO_ID
    assert meta.title == "Binary Search - Complete Tutorial"
    assert meta.channel_title == "Example Academy"
    assert meta.duration_seconds == 3130
    assert meta.availability_state == "available"
    assert meta.thumbnail_url == f"https://i.ytimg.com/vi/{NORMAL_VIDEO_ID}/hqdefault.jpg"


def test_embedding_disabled_video_is_kept_with_its_own_state() -> None:
    meta = parse_video_response(EMBED_DISABLED_VIDEO_ID, fixture("video_embed_disabled.json"))
    assert meta.availability_state == "embed_disabled"
    assert meta.title == "Restricted Lecture"


def test_private_or_deleted_video_has_no_items_and_is_unavailable() -> None:
    with pytest.raises(VideoUnavailableError):
        parse_video_response(PRIVATE_VIDEO_ID, fixture("video_private.json"))


def test_video_without_a_known_duration_has_none() -> None:
    meta = parse_video_response(NO_DURATION_VIDEO_ID, fixture("video_no_duration.json"))
    assert meta.duration_seconds is None


def test_response_for_a_different_id_is_not_trusted() -> None:
    with pytest.raises(VideoUnavailableError):
        parse_video_response("someOtherId1", fixture("video_normal.json"))


@pytest.mark.parametrize(
    "status",
    [
        {"privacyStatus": "private"},
        {"uploadStatus": "deleted"},
        {"uploadStatus": "rejected"},
        {"uploadStatus": "failed"},
    ],
)
def test_unusable_statuses_are_unavailable(status: dict[str, str]) -> None:
    payload = fixture("video_normal.json")
    payload["items"][0]["status"] = status
    with pytest.raises(VideoUnavailableError):
        parse_video_response(NORMAL_VIDEO_ID, payload)


def test_missing_title_is_unavailable() -> None:
    payload = fixture("video_normal.json")
    payload["items"][0]["snippet"]["title"] = "  "
    with pytest.raises(VideoUnavailableError):
        parse_video_response(NORMAL_VIDEO_ID, payload)


def test_missing_optional_fields_are_tolerated() -> None:
    payload = {
        "items": [{"id": "abcdefghijk", "snippet": {"title": "Bare"}, "status": {}}],
    }
    meta = parse_video_response("abcdefghijk", payload)
    assert (meta.channel_title, meta.thumbnail_url, meta.duration_seconds) == (None, None, None)
    assert meta.availability_state == "available"


def test_thumbnail_prefers_the_largest_available() -> None:
    payload = fixture("video_normal.json")
    payload["items"][0]["snippet"]["thumbnails"]["maxres"] = {"url": "https://i.test/max.jpg"}
    meta = parse_video_response(NORMAL_VIDEO_ID, payload)
    assert meta.thumbnail_url == "https://i.test/max.jpg"
