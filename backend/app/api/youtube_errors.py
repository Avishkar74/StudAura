"""Map YouTube adapter failures to API errors with actionable messages."""

from app.core.errors import ApiError
from app.integrations.youtube.errors import (
    NotConfiguredError,
    PlaylistUnavailableError,
    QuotaExceededError,
    VideoUnavailableError,
    YouTubeError,
    YouTubeTimeoutError,
)


def to_api_error(exc: YouTubeError) -> ApiError:
    if isinstance(exc, VideoUnavailableError):
        return ApiError(
            422,
            "VIDEO_UNAVAILABLE",
            "This video is private, removed or unavailable, so it can't be added.",
        )
    if isinstance(exc, PlaylistUnavailableError):
        return ApiError(
            422,
            "PLAYLIST_UNAVAILABLE",
            "This playlist is private or doesn't exist, so it can't be imported. "
            "Make sure it is set to Public or Unlisted.",
        )
    if isinstance(exc, QuotaExceededError):
        return ApiError(
            429,
            "YOUTUBE_QUOTA_EXCEEDED",
            "YouTube's daily request limit has been reached. Please try again later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        )
    if isinstance(exc, YouTubeTimeoutError):
        return ApiError(
            504, "UPSTREAM_TIMEOUT", "YouTube took too long to respond. Please try again."
        )
    if isinstance(exc, NotConfiguredError):
        return ApiError(
            503,
            "YOUTUBE_NOT_CONFIGURED",
            "Video import is not available because the YouTube integration is not configured.",
        )
    return ApiError(502, "UPSTREAM_ERROR", "Couldn't reach YouTube. Please try again.")
