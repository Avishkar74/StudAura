"""Playlist URL parsing, payload parsing, and the real client's playlist/batch calls."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.integrations.youtube.client import HttpYouTubeClient
from app.integrations.youtube.errors import (
    NotConfiguredError,
    PlaylistUnavailableError,
    QuotaExceededError,
    YouTubeTimeoutError,
    YouTubeUpstreamError,
)
from app.integrations.youtube.fake import (
    ARRAY_VIDEO_ID,
    DEFAULT_FIXTURES_DIR,
    EMBED_DISABLED_VIDEO_ID,
    NORMAL_VIDEO_ID,
    PRIVATE_VIDEO_ID,
    SORTING_VIDEO_ID,
)
from app.integrations.youtube.parsing import parse_playlist_page, parse_videos_response
from app.services.youtube_urls import parse_playlist_id

PL = "PLmixed00000001"


def load(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(Path(DEFAULT_FIXTURES_DIR, name).read_text("utf-8"))
    return data


# --- URL parsing --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/playlist?list={PL}",
        f"http://youtube.com/playlist?list={PL}",
        f"https://m.youtube.com/playlist?list={PL}",
        f"https://www.youtube.com/playlist?list={PL}&si=abc",
        f"https://www.youtube.com/watch?v=dQw4w9WgXcQ&list={PL}",
        f"https://www.youtube.com/watch?v=dQw4w9WgXcQ&list={PL}&index=3",
        f"https://www.youtube.com/watch?list={PL}",
        f"  https://www.youtube.com/playlist?list={PL}  ",
        "https://www.youtube.com/playlist?list=OLAK5uy_kAbCdEfGhIjKlMnOpQrStUvWxYz",
    ],
)
def test_supported_playlist_urls(url: str) -> None:
    assert parse_playlist_id(url) == url.split("list=")[1].split("&")[0].strip()


@pytest.mark.parametrize(
    "url",
    [
        "",
        "not a url",
        PL,  # a bare ID is not a URL
        "https://www.youtube.com/playlist",
        "https://www.youtube.com/playlist?list=",
        "https://www.youtube.com/playlist?list=short",
        "https://www.youtube.com/playlist?list=WL",  # Watch Later is private to the viewer
        "https://www.youtube.com/playlist?list=LL",
        f"https://www.youtube.com/playlist?list={PL}&list={PL}",  # ambiguous
        f"https://www.youtube.com/playlist?list={'a' * 65}",
        "https://www.youtube.com/playlist?list=has space!!!!!",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",  # a single video, no list
        f"https://www.youtube.com/embed/dQw4w9WgXcQ?list={PL}",
        f"https://youtu.be/dQw4w9WgXcQ?list={PL}",
        f"https://www.youtube.com/channel/{PL}",
        f"https://vimeo.com/playlist?list={PL}",
        f"ftp://www.youtube.com/playlist?list={PL}",
        f"https://youtube.com.evil.example/playlist?list={PL}",
        f"https://www.youtube.com@evil.example/playlist?list={PL}",
        f"https://user:pw@www.youtube.com/playlist?list={PL}",
    ],
)
def test_unsupported_playlist_urls_are_rejected(url: str) -> None:
    assert parse_playlist_id(url) is None


# --- Payload parsing ----------------------------------------------------------------------------


def test_playlist_fixture_keeps_order_and_titles() -> None:
    page = parse_playlist_page(load("playlist_mixed.json"))
    assert [e.youtube_video_id for e in page.entries] == [
        NORMAL_VIDEO_ID,
        PRIVATE_VIDEO_ID,
        ARRAY_VIDEO_ID,
        EMBED_DISABLED_VIDEO_ID,
        SORTING_VIDEO_ID,
    ]
    assert page.entries[1].title == "Private video"
    assert page.total_results == 5
    assert page.next_page_token is None


def test_next_page_token_and_total_are_read() -> None:
    payload = load("playlist_mixed.json")
    payload["nextPageToken"] = "CAUQAA"
    payload["pageInfo"]["totalResults"] = 230
    page = parse_playlist_page(payload)
    assert (page.next_page_token, page.total_results) == ("CAUQAA", 230)


def test_entries_without_a_video_id_are_skipped_and_resource_id_is_a_fallback() -> None:
    payload = {
        "items": [
            {"snippet": {"title": "No id"}},
            {"snippet": {"title": "Fallback", "resourceId": {"videoId": "abcdefghijk"}}},
            {"contentDetails": {"videoId": "bcdefghijkl"}, "snippet": {}},
        ]
    }
    page = parse_playlist_page(payload)
    assert [(e.youtube_video_id, e.title) for e in page.entries] == [
        ("abcdefghijk", "Fallback"),
        ("bcdefghijkl", None),
    ]


def test_empty_playlist_parses() -> None:
    page = parse_playlist_page(load("playlist_empty.json"))
    assert page.entries == [] and page.total_results == 0


def test_batch_parse_drops_unavailable_videos() -> None:
    payload = load("video_normal.json")
    payload["items"] += load("video_embed_disabled.json")["items"]
    payload["items"].append({"id": "hiddenVid01", "status": {"privacyStatus": "private"}})
    found = parse_videos_response(payload)
    assert set(found) == {NORMAL_VIDEO_ID, EMBED_DISABLED_VIDEO_ID}
    assert found[EMBED_DISABLED_VIDEO_ID].availability_state == "embed_disabled"


# --- Real client --------------------------------------------------------------------------------

KEY = "test-api-key-not-real"


def client_for(
    fn: Callable[[httpx.Request], httpx.Response], *, key: str = KEY
) -> HttpYouTubeClient:
    return HttpYouTubeClient(key, transport=httpx.MockTransport(fn))


async def test_playlist_page_request_and_parse() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={**load("playlist_mixed.json"), "nextPageToken": "NEXT"})

    page = await client_for(handler).get_playlist_page(PL, "TOKEN")

    assert len(page.entries) == 5 and page.next_page_token == "NEXT"
    request = seen[0]
    assert request.url.path.endswith("/playlistItems")
    assert request.url.params["playlistId"] == PL
    assert request.url.params["pageToken"] == "TOKEN"
    assert request.url.params["maxResults"] == "50"
    assert request.headers["x-goog-api-key"] == KEY
    assert KEY not in str(request.url)


async def test_first_page_sends_no_page_token() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=load("playlist_empty.json"))

    await client_for(handler).get_playlist_page(PL, None)
    assert "pageToken" not in seen[0].url.params


async def test_missing_playlist_is_unavailable() -> None:
    with pytest.raises(PlaylistUnavailableError):
        await client_for(lambda r: httpx.Response(404, json={})).get_playlist_page(PL, None)


async def test_unresolvable_playlist_id_400_is_unavailable() -> None:
    # Observed against the live API for a made-up playlist id.
    body = {"error": {"code": 400, "errors": [{"reason": "invalid"}]}}
    with pytest.raises(PlaylistUnavailableError):
        await client_for(lambda r: httpx.Response(400, json=body)).get_playlist_page(PL, None)


async def test_other_400s_are_upstream_errors() -> None:
    body = {"error": {"code": 400, "errors": [{"reason": "badRequest"}]}}
    with pytest.raises(YouTubeUpstreamError):
        await client_for(lambda r: httpx.Response(400, json=body)).get_playlist_page(PL, None)


async def test_private_playlist_403_is_unavailable_not_upstream() -> None:
    body = {"error": {"code": 403, "errors": [{"reason": "playlistItemsNotAccessible"}]}}
    with pytest.raises(PlaylistUnavailableError):
        await client_for(lambda r: httpx.Response(403, json=body)).get_playlist_page(PL, None)


async def test_playlist_quota_and_timeouts() -> None:
    quota = {"error": {"errors": [{"reason": "quotaExceeded"}]}}
    with pytest.raises(QuotaExceededError):
        await client_for(lambda r: httpx.Response(403, json=quota)).get_playlist_page(PL, None)

    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(YouTubeTimeoutError):
        await client_for(slow).get_playlist_page(PL, None)


async def test_playlist_without_a_key_does_not_call_out() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    with pytest.raises(NotConfiguredError):
        await client_for(handler, key="").get_playlist_page(PL, None)
    assert not called


async def test_batch_lookup_sends_one_request_and_omits_hidden_videos() -> None:
    seen: list[httpx.Request] = []
    payload = load("video_normal.json")
    payload["items"] += load("video_embed_disabled.json")["items"]

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=payload)

    ids = [NORMAL_VIDEO_ID, EMBED_DISABLED_VIDEO_ID, PRIVATE_VIDEO_ID]
    found = await client_for(handler).get_videos(ids)

    assert set(found) == {NORMAL_VIDEO_ID, EMBED_DISABLED_VIDEO_ID}  # the private one is absent
    assert len(seen) == 1
    assert seen[0].url.params["id"] == ",".join(ids)


async def test_batch_lookup_of_nothing_makes_no_request() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    assert await client_for(boom).get_videos([]) == {}


async def test_batch_lookup_rejects_oversized_batches() -> None:
    with pytest.raises(ValueError, match="at most 50"):
        await client_for(lambda r: httpx.Response(200, json={})).get_videos(
            [f"video{i:06d}" for i in range(51)]
        )


async def test_batch_lookup_errors_are_upstream_errors() -> None:
    # A 404 from videos.list is not "the videos are gone"; it means something is wrong upstream.
    with pytest.raises(YouTubeUpstreamError):
        await client_for(lambda r: httpx.Response(404, json={})).get_videos([NORMAL_VIDEO_ID])
