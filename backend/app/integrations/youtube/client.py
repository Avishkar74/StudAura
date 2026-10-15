"""Real YouTube Data API v3 adapter. Server-side only (CLAUDE.md rule 4)."""

from typing import Any

import httpx

from app.integrations.youtube.errors import (
    NotConfiguredError,
    PlaylistUnavailableError,
    QuotaExceededError,
    VideoUnavailableError,
    YouTubeError,
    YouTubeTimeoutError,
    YouTubeUpstreamError,
)
from app.integrations.youtube.models import PAGE_SIZE, PlaylistPage, VideoMetadata
from app.integrations.youtube.parsing import (
    parse_playlist_page,
    parse_video_response,
    parse_videos_response,
)

API_BASE = "https://www.googleapis.com/youtube/v3"
REQUEST_TIMEOUT_SECONDS = 5.0
# Quota resets at midnight Pacific time; an hour is an honest, simple retry hint.
QUOTA_RETRY_AFTER_SECONDS = 3600

_VIDEO_PARTS = "snippet,contentDetails,status"
_QUOTA_REASONS = {
    "quotaExceeded",
    "dailyLimitExceeded",
    "rateLimitExceeded",
    "userRateLimitExceeded",
}
# 403 reasons that mean "this playlist exists but you cannot read it".
_PLAYLIST_HIDDEN_REASONS = {"playlistItemsNotAccessible", "playlistForbidden"}
# YouTube answers 400 "invalid" for IDs it cannot resolve (e.g. a well-formed but made-up one).
_BAD_ID_REASONS = {"invalid", "playlistNotFound", "videoNotFound"}


def _error_reasons(response: httpx.Response) -> set[str]:
    try:
        errors = response.json().get("error", {}).get("errors", [])
    except ValueError:
        return set()
    return {e.get("reason", "") for e in errors if isinstance(e, dict)}


class HttpYouTubeClient:
    def __init__(self, api_key: str, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._api_key = api_key
        self._transport = transport

    async def _get(
        self, resource: str, params: dict[str, str], *, missing: type[YouTubeError]
    ) -> dict[str, Any]:
        """One API call. Maps every failure to a `YouTubeError`; `missing` is raised for 404s."""
        if not self._api_key:
            raise NotConfiguredError
        try:
            async with httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT_SECONDS, transport=self._transport
            ) as client:
                response = await client.get(
                    f"{API_BASE}/{resource}",
                    params=params,
                    # A header, not a query parameter, so the key never lands in a logged URL.
                    headers={"x-goog-api-key": self._api_key},
                )
        except httpx.TimeoutException:
            raise YouTubeTimeoutError from None
        except httpx.HTTPError:
            raise YouTubeUpstreamError from None

        if response.status_code == 404:
            raise missing
        if response.status_code == 400 and _error_reasons(response) & _BAD_ID_REASONS:
            raise missing
        if response.status_code in (403, 429):
            reasons = _error_reasons(response)
            if reasons & _QUOTA_REASONS or response.status_code == 429:
                raise QuotaExceededError(QUOTA_RETRY_AFTER_SECONDS)
            if reasons & _PLAYLIST_HIDDEN_REASONS:
                raise missing
            raise YouTubeUpstreamError  # bad key, API disabled, referrer restrictions...
        if response.status_code != 200:
            raise YouTubeUpstreamError

        try:
            payload = response.json()
        except ValueError:
            raise YouTubeUpstreamError from None
        if not isinstance(payload, dict):
            raise YouTubeUpstreamError
        return payload

    async def get_video(self, video_id: str) -> VideoMetadata:
        payload = await self._get(
            "videos", {"part": _VIDEO_PARTS, "id": video_id}, missing=VideoUnavailableError
        )
        return parse_video_response(video_id, payload)

    async def get_videos(self, video_ids: list[str]) -> dict[str, VideoMetadata]:
        if not video_ids:
            return {}
        if len(video_ids) > PAGE_SIZE:
            raise ValueError(f"at most {PAGE_SIZE} ids per call")
        payload = await self._get(
            "videos",
            {"part": _VIDEO_PARTS, "id": ",".join(video_ids), "maxResults": str(PAGE_SIZE)},
            missing=YouTubeUpstreamError,
        )
        return parse_videos_response(payload)

    async def get_playlist_page(self, playlist_id: str, page_token: str | None) -> PlaylistPage:
        params = {
            "part": "snippet,contentDetails",
            "playlistId": playlist_id,
            "maxResults": str(PAGE_SIZE),
        }
        if page_token:
            params["pageToken"] = page_token
        payload = await self._get("playlistItems", params, missing=PlaylistUnavailableError)
        return parse_playlist_page(payload)
