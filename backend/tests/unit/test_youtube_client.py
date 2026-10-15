"""The real adapter, driven through httpx's mock transport. No network is used."""

import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from app.integrations.youtube.client import QUOTA_RETRY_AFTER_SECONDS, HttpYouTubeClient
from app.integrations.youtube.errors import (
    NotConfiguredError,
    QuotaExceededError,
    VideoUnavailableError,
    YouTubeTimeoutError,
    YouTubeUpstreamError,
)
from app.integrations.youtube.fake import DEFAULT_FIXTURES_DIR, NORMAL_VIDEO_ID, PRIVATE_VIDEO_ID

KEY = "test-api-key-not-real"


def load(name: str) -> dict[str, object]:
    data: dict[str, object] = json.loads(Path(DEFAULT_FIXTURES_DIR, name).read_text("utf-8"))
    return data


def client_for(handler: httpx.MockTransport | None = None, *, key: str = KEY) -> HttpYouTubeClient:
    return HttpYouTubeClient(key, transport=handler)


def transport(fn: Callable[[httpx.Request], httpx.Response]) -> httpx.MockTransport:
    return httpx.MockTransport(fn)


async def test_sends_the_key_in_a_header_never_in_the_url() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=load("video_normal.json"))

    meta = await client_for(transport(handler)).get_video(NORMAL_VIDEO_ID)

    assert meta.title == "Binary Search - Complete Tutorial"
    request = seen[0]
    assert request.headers["x-goog-api-key"] == KEY
    assert KEY not in str(request.url)
    assert request.url.params["id"] == NORMAL_VIDEO_ID
    assert request.url.params["part"] == "snippet,contentDetails,status"


async def test_empty_items_means_unavailable() -> None:
    handler = transport(lambda r: httpx.Response(200, json=load("video_private.json")))
    with pytest.raises(VideoUnavailableError):
        await client_for(handler).get_video(PRIVATE_VIDEO_ID)


async def test_404_means_unavailable() -> None:
    handler = transport(lambda r: httpx.Response(404, json={}))
    with pytest.raises(VideoUnavailableError):
        await client_for(handler).get_video(NORMAL_VIDEO_ID)


@pytest.mark.parametrize("reason", ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"])
async def test_quota_errors_carry_a_retry_hint(reason: str) -> None:
    body = {"error": {"code": 403, "errors": [{"reason": reason}]}}
    handler = transport(lambda r: httpx.Response(403, json=body))
    with pytest.raises(QuotaExceededError) as exc:
        await client_for(handler).get_video(NORMAL_VIDEO_ID)
    assert exc.value.retry_after_seconds == QUOTA_RETRY_AFTER_SECONDS


async def test_http_429_is_also_quota() -> None:
    handler = transport(lambda r: httpx.Response(429, json={}))
    with pytest.raises(QuotaExceededError):
        await client_for(handler).get_video(NORMAL_VIDEO_ID)


async def test_other_403s_are_upstream_errors_not_quota() -> None:
    body = {"error": {"code": 403, "errors": [{"reason": "forbidden"}]}}
    handler = transport(lambda r: httpx.Response(403, json=body))
    with pytest.raises(YouTubeUpstreamError):
        await client_for(handler).get_video(NORMAL_VIDEO_ID)


@pytest.mark.parametrize("status", [400, 500, 503])
async def test_unexpected_statuses_are_upstream_errors(status: int) -> None:
    handler = transport(lambda r: httpx.Response(status, json={}))
    with pytest.raises(YouTubeUpstreamError):
        await client_for(handler).get_video(NORMAL_VIDEO_ID)


async def test_invalid_json_is_an_upstream_error() -> None:
    handler = transport(lambda r: httpx.Response(200, content=b"<html>oops</html>"))
    with pytest.raises(YouTubeUpstreamError):
        await client_for(handler).get_video(NORMAL_VIDEO_ID)


async def test_timeouts_are_reported_as_timeouts() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(YouTubeTimeoutError):
        await client_for(transport(handler)).get_video(NORMAL_VIDEO_ID)


async def test_network_failures_are_upstream_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    with pytest.raises(YouTubeUpstreamError):
        await client_for(transport(handler)).get_video(NORMAL_VIDEO_ID)


async def test_missing_api_key_fails_cleanly_without_calling_out() -> None:
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    with pytest.raises(NotConfiguredError):
        await client_for(transport(handler), key="").get_video(NORMAL_VIDEO_ID)
    assert not called
