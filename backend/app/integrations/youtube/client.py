"""Real YouTube Data API v3 adapter. Server-side only (CLAUDE.md rule 4)."""

import httpx

from app.integrations.youtube.errors import (
    NotConfiguredError,
    QuotaExceededError,
    VideoUnavailableError,
    YouTubeTimeoutError,
    YouTubeUpstreamError,
)
from app.integrations.youtube.models import VideoMetadata
from app.integrations.youtube.parsing import parse_video_response

API_BASE = "https://www.googleapis.com/youtube/v3"
REQUEST_TIMEOUT_SECONDS = 5.0
# Quota resets at midnight Pacific time; an hour is an honest, simple retry hint.
QUOTA_RETRY_AFTER_SECONDS = 3600

_QUOTA_REASONS = {
    "quotaExceeded",
    "dailyLimitExceeded",
    "rateLimitExceeded",
    "userRateLimitExceeded",
}


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

    async def get_video(self, video_id: str) -> VideoMetadata:
        if not self._api_key:
            raise NotConfiguredError
        try:
            async with httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT_SECONDS, transport=self._transport
            ) as client:
                response = await client.get(
                    f"{API_BASE}/videos",
                    params={"part": "snippet,contentDetails,status", "id": video_id},
                    # A header, not a query parameter, so the key never lands in a logged URL.
                    headers={"x-goog-api-key": self._api_key},
                )
        except httpx.TimeoutException:
            raise YouTubeTimeoutError from None
        except httpx.HTTPError:
            raise YouTubeUpstreamError from None

        if response.status_code == 404:
            raise VideoUnavailableError
        if response.status_code in (403, 429):
            if _error_reasons(response) & _QUOTA_REASONS or response.status_code == 429:
                raise QuotaExceededError(QUOTA_RETRY_AFTER_SECONDS)
            raise YouTubeUpstreamError  # bad key, API disabled, referrer restrictions...
        if response.status_code != 200:
            raise YouTubeUpstreamError

        try:
            payload = response.json()
        except ValueError:
            raise YouTubeUpstreamError from None
        return parse_video_response(video_id, payload)
