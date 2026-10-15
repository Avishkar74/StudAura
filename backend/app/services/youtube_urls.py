"""Validate and parse YouTube video URLs (TRD 10.2). Pure functions; no network."""

import re
from urllib.parse import parse_qs, urlsplit

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
# Playlist IDs are 13-64 chars (PL..., UU..., OLAK5uy_...). Short auto-lists like WL and LL are
# private to the viewer and cannot be read with an API key, so they are rejected up front.
PLAYLIST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{13,64}$")
MAX_URL_LENGTH = 2048

_WATCH_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com"}
_SHORT_HOST = "youtu.be"

SUPPORTED_PLAYLIST_URL_EXAMPLES = (
    "https://www.youtube.com/playlist?list=PLAYLIST_ID",
    "https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID",
)

SUPPORTED_VIDEO_URL_EXAMPLES = (
    "https://www.youtube.com/watch?v=VIDEO_ID",
    "https://youtu.be/VIDEO_ID",
    "https://www.youtube.com/embed/VIDEO_ID",
)


def parse_video_id(url: str) -> str | None:
    """Return the 11-character video ID from a supported YouTube URL, else None.

    The host must match exactly, so look-alikes such as `youtube.com.evil.example` are rejected.
    A `list=` parameter alongside `v=` is fine: it identifies the video, not the playlist.
    """
    url = url.strip()
    if not url or len(url) > MAX_URL_LENGTH:
        return None
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or parts.username or parts.password:
        return None

    host = (parts.hostname or "").lower()
    candidate: str | None = None
    if host in _WATCH_HOSTS:
        if parts.path == "/watch":
            values = parse_qs(parts.query).get("v", [])
            candidate = values[0] if len(values) == 1 else None
        elif parts.path.startswith("/embed/"):
            candidate = parts.path[len("/embed/") :].split("/")[0]
    elif host == _SHORT_HOST:
        candidate = parts.path.lstrip("/").split("/")[0]

    if candidate and VIDEO_ID_RE.fullmatch(candidate):
        return candidate
    return None


def parse_playlist_id(url: str) -> str | None:
    """Return the playlist ID from `/playlist?list=` or `/watch?...&list=` URLs, else None."""
    url = url.strip()
    if not url or len(url) > MAX_URL_LENGTH:
        return None
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or parts.username or parts.password:
        return None
    if (parts.hostname or "").lower() not in _WATCH_HOSTS:
        return None
    if parts.path not in ("/playlist", "/watch"):
        return None

    values = parse_qs(parts.query).get("list", [])
    if len(values) != 1:
        return None
    return values[0] if PLAYLIST_ID_RE.fullmatch(values[0]) else None
