import pytest

from app.services.youtube_urls import MAX_URL_LENGTH, parse_video_id

VID = "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VID}",
        f"http://www.youtube.com/watch?v={VID}",
        f"https://youtube.com/watch?v={VID}",
        f"https://m.youtube.com/watch?v={VID}",
        f"https://youtu.be/{VID}",
        f"https://youtu.be/{VID}?t=42",
        f"https://www.youtube.com/embed/{VID}",
        f"https://www.youtube.com/watch?v={VID}&t=30s",
        f"https://www.youtube.com/watch?feature=share&v={VID}",
        # A video opened from inside a playlist: we import just that video.
        f"https://www.youtube.com/watch?v={VID}&list=PLabc123&index=4",
        f"  https://youtu.be/{VID}  ",
        f"HTTPS://WWW.YOUTUBE.COM/watch?v={VID}",
    ],
)
def test_supported_urls_yield_the_video_id(url: str) -> None:
    assert parse_video_id(url) == VID


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "not a url",
        "dQw4w9WgXcQ",  # a bare ID is not a URL
        "https://www.youtube.com/",
        "https://www.youtube.com/watch",
        "https://www.youtube.com/watch?v=",
        f"https://www.youtube.com/watch?v={VID}&v={VID}",  # ambiguous
        "https://www.youtube.com/watch?v=tooShort",
        "https://www.youtube.com/watch?v=waaaaaaay_too_long",
        "https://www.youtube.com/watch?v=has space!!",
        "https://www.youtube.com/playlist?list=PLabc123",  # playlists belong to the other importer
        f"https://www.youtube.com/channel/{VID}",
        f"https://www.youtube.com/shorts/{VID}",
        f"https://vimeo.com/{VID}",
        f"ftp://www.youtube.com/watch?v={VID}",
        f"javascript:alert('{VID}')",
        # Look-alike and credential tricks must not pass as YouTube.
        f"https://youtube.com.evil.example/watch?v={VID}",
        f"https://evil.example/youtube.com/watch?v={VID}",
        f"https://www.youtube.com@evil.example/watch?v={VID}",
        f"https://user:pw@www.youtube.com/watch?v={VID}",
        f"https://notyoutu.be/{VID}",
        f"https://youtu.be.evil.example/{VID}",
    ],
)
def test_unsupported_or_malicious_urls_are_rejected(url: str) -> None:
    assert parse_video_id(url) is None


def test_overlong_urls_are_rejected() -> None:
    url = f"https://www.youtube.com/watch?v={VID}&x=" + "a" * MAX_URL_LENGTH
    assert parse_video_id(url) is None


def test_ids_may_contain_dash_and_underscore() -> None:
    assert parse_video_id("https://youtu.be/a-b_c-d_e-f") == "a-b_c-d_e-f"
