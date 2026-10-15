class YouTubeError(Exception):
    """Base class for everything that can go wrong talking to YouTube."""


class NotConfiguredError(YouTubeError):
    """No YOUTUBE_DATA_API_KEY is set."""


class VideoUnavailableError(YouTubeError):
    """The video is private, deleted, or otherwise cannot be read."""


class PlaylistUnavailableError(YouTubeError):
    """The playlist is private, deleted, or does not exist."""


class QuotaExceededError(YouTubeError):
    """The daily API quota is exhausted."""

    def __init__(self, retry_after_seconds: int = 3600) -> None:
        super().__init__("YouTube API quota exceeded")
        self.retry_after_seconds = retry_after_seconds


class YouTubeTimeoutError(YouTubeError):
    """YouTube did not answer within the time limit."""


class YouTubeUpstreamError(YouTubeError):
    """YouTube returned an unexpected error or the network failed."""
