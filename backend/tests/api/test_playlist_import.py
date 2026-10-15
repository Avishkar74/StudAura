import uuid
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _fake_youtube_client, get_youtube_client
from app.integrations.youtube.errors import (
    QuotaExceededError,
    YouTubeError,
    YouTubeTimeoutError,
    YouTubeUpstreamError,
)
from app.integrations.youtube.fake import (
    ARRAY_VIDEO_ID,
    EMBED_DISABLED_VIDEO_ID,
    EMPTY_PLAYLIST_ID,
    MIXED_PLAYLIST_ID,
    NORMAL_VIDEO_ID,
    PRIVATE_VIDEO_ID,
    SORTING_VIDEO_ID,
    FakeYouTubeClient,
)
from app.integrations.youtube.models import AVAILABLE, PlaylistEntry, VideoMetadata
from app.main import app
from app.models import LearningPathVideo, Video
from tests.api.helpers import BASE, Actor, create

IMPORT = "/api/v1/playlists/import"


def playlist_url(playlist_id: str = MIXED_PLAYLIST_ID) -> str:
    return f"https://www.youtube.com/playlist?list={playlist_id}"


@pytest.fixture
def fake_youtube() -> Iterator[FakeYouTubeClient]:
    fake = _fake_youtube_client()
    fake.calls.clear()
    fake.playlist_calls.clear()
    fake.fail_with = None
    fake.fail_playlist_page_after = None
    fake._videos.clear()
    fake._playlists.clear()
    yield fake
    fake.calls.clear()
    fake.playlist_calls.clear()
    fake._videos.clear()
    fake._playlists.clear()


@pytest.fixture
def youtube_fails() -> Iterator[Callable[[YouTubeError], FakeYouTubeClient]]:
    def install(error: YouTubeError) -> FakeYouTubeClient:
        failing = FakeYouTubeClient(fail_with=error)
        app.dependency_overrides[get_youtube_client] = lambda: failing
        return failing

    yield install
    app.dependency_overrides.pop(get_youtube_client, None)


async def do_import(
    client: httpx.AsyncClient,
    who: Actor,
    path_id: str,
    url: str | None = None,
    page_token: str | None = None,
) -> httpx.Response:
    body: dict[str, Any] = {"youtube_url": url or playlist_url(), "learning_path_id": path_id}
    if page_token:
        body["page_token"] = page_token
    return await client.post(IMPORT, json=body, headers=who.h)


async def path_video_ids(client: httpx.AsyncClient, who: Actor, path_id: str) -> list[str]:
    resp = await client.get(f"{BASE}/{path_id}/videos", params={"limit": 500}, headers=who.h)
    return [i["video"]["youtube_video_id"] for i in resp.json()["items"]]


def make_video(video_id: str, title: str | None = None) -> VideoMetadata:
    return VideoMetadata(video_id, title or f"Video {video_id}", "Chan", None, 300, AVAILABLE)


def big_playlist(fake: FakeYouTubeClient, playlist_id: str, size: int) -> list[str]:
    ids = [f"vid{n:08d}" for n in range(size)]
    for vid in ids:
        fake.add_video(make_video(vid))
    fake.add_playlist(playlist_id, [PlaylistEntry(v, f"Video {v}") for v in ids])
    return ids


async def count(session: AsyncSession, model: type) -> int:
    return (await session.execute(select(func.count()).select_from(model))).scalar_one()


# --- Authentication and validation -----------------------------------------


async def test_requires_authentication(auth_client: httpx.AsyncClient) -> None:
    resp = await auth_client.post(
        IMPORT, json={"youtube_url": playlist_url(), "learning_path_id": str(uuid.uuid4())}
    )
    assert resp.status_code == 401


@pytest.mark.parametrize(
    "url",
    [
        "not a url",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",  # a video, not a playlist
        "https://www.youtube.com/playlist?list=WL",
        f"https://youtube.com.evil.example/playlist?list={MIXED_PLAYLIST_ID}",
    ],
)
async def test_invalid_url_is_422_with_formats_and_makes_no_api_call(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient, url: str
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], url)
    assert resp.status_code == 422
    error = resp.json()["error"]
    assert error["code"] == "INVALID_YOUTUBE_PLAYLIST_URL"
    assert "playlist?list=" in " ".join(error["details"][0]["supported_formats"])
    assert fake_youtube.playlist_calls == []


@pytest.mark.parametrize("token", ["", "has space", "x" * 201, "bad/token", "a;b"])
async def test_malformed_page_tokens_are_rejected_before_any_api_call(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient, token: str
) -> None:
    path = await create(auth_client, alice)
    resp = await auth_client.post(
        IMPORT,
        json={
            "youtube_url": playlist_url(),
            "learning_path_id": path["id"],
            "page_token": token,
        },
        headers=alice.h,
    )
    assert resp.status_code == 422
    assert fake_youtube.playlist_calls == []


async def test_missing_fields_are_422(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    resp = await auth_client.post(IMPORT, json={}, headers=alice.h)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


# --- The mixed playlist: partial failure -----------------------------------


async def test_mixed_playlist_imports_what_it_can_and_reports_the_rest(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice, "DSA")
    resp = await do_import(auth_client, alice, path["id"])

    assert resp.status_code == 200
    body = resp.json()
    # 3 available + 1 embed-disabled are added; the private video is reported, not fatal.
    assert (body["added"], body["skipped"], body["failed"]) == (4, 0, 1)
    assert body["total_in_playlist"] == 5
    assert body["next_page_token"] is None

    by_id = {i["youtube_video_id"]: i for i in body["items"]}
    assert [i["youtube_video_id"] for i in body["items"]] == [  # playlist order
        NORMAL_VIDEO_ID,
        PRIVATE_VIDEO_ID,
        ARRAY_VIDEO_ID,
        EMBED_DISABLED_VIDEO_ID,
        SORTING_VIDEO_ID,
    ]
    assert by_id[PRIVATE_VIDEO_ID]["status"] == "failed"
    assert by_id[PRIVATE_VIDEO_ID]["reason"] == "unavailable"
    assert by_id[PRIVATE_VIDEO_ID]["title"] == "Private video"  # YouTube's placeholder, for display
    assert by_id[PRIVATE_VIDEO_ID]["video_id"] is None
    assert by_id[EMBED_DISABLED_VIDEO_ID]["status"] == "added"
    assert by_id[EMBED_DISABLED_VIDEO_ID]["availability_state"] == "embed_disabled"
    assert by_id[NORMAL_VIDEO_ID]["title"] == "Binary Search - Complete Tutorial"


async def test_positions_are_contiguous_in_playlist_order_and_failures_leave_no_gap(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    body = (await do_import(auth_client, alice, path["id"])).json()

    positions = {i["youtube_video_id"]: i["position"] for i in body["items"]}
    assert positions[NORMAL_VIDEO_ID] == 1
    assert positions[ARRAY_VIDEO_ID] == 2
    assert positions[EMBED_DISABLED_VIDEO_ID] == 3
    assert positions[SORTING_VIDEO_ID] == 4
    assert positions[PRIVATE_VIDEO_ID] is None
    assert await path_video_ids(auth_client, alice, path["id"]) == [
        NORMAL_VIDEO_ID,
        ARRAY_VIDEO_ID,
        EMBED_DISABLED_VIDEO_ID,
        SORTING_VIDEO_ID,
    ]


async def test_failed_videos_are_not_stored(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    path = await create(auth_client, alice)
    await do_import(auth_client, alice, path["id"])
    stored = (await session.execute(select(Video.youtube_video_id))).scalars().all()
    assert PRIVATE_VIDEO_ID not in stored
    assert len(stored) == 4


async def test_imported_videos_show_up_in_path_stats(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    await do_import(auth_client, alice, path["id"])
    detail = (await auth_client.get(f"{BASE}/{path['id']}", headers=alice.h)).json()
    assert detail["total_videos"] == 4


# --- Re-running and duplicates ---------------------------------------------


async def test_running_it_again_skips_everything_already_there(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    await do_import(auth_client, alice, path["id"])
    again = (await do_import(auth_client, alice, path["id"])).json()

    assert (again["added"], again["skipped"], again["failed"]) == (0, 4, 1)
    skipped = [i for i in again["items"] if i["status"] == "skipped"]
    assert {i["reason"] for i in skipped} == {"already_in_path"}
    assert [i["position"] for i in skipped] == [1, 2, 3, 4]  # their existing positions
    assert len(await path_video_ids(auth_client, alice, path["id"])) == 4


async def test_new_videos_are_appended_after_existing_ones(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    await auth_client.post(
        "/api/v1/videos/import",
        json={
            "youtube_url": f"https://youtu.be/{SORTING_VIDEO_ID}",
            "learning_path_id": path["id"],
        },
        headers=alice.h,
    )
    body = (await do_import(auth_client, alice, path["id"])).json()

    assert (body["added"], body["skipped"]) == (3, 1)
    assert await path_video_ids(auth_client, alice, path["id"]) == [
        SORTING_VIDEO_ID,  # was there first
        NORMAL_VIDEO_ID,
        ARRAY_VIDEO_ID,
        EMBED_DISABLED_VIDEO_ID,
    ]


async def test_a_video_listed_twice_is_imported_once(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    pid = "PLduplicates0001"
    fake_youtube.add_video(make_video("dupVideo0001"))
    fake_youtube.add_playlist(
        pid,
        [PlaylistEntry("dupVideo0001", "A"), PlaylistEntry("dupVideo0001", "A again")],
    )
    path = await create(auth_client, alice)
    body = (await do_import(auth_client, alice, path["id"], playlist_url(pid))).json()
    assert (body["added"], body["skipped"], body["failed"]) == (1, 0, 0)
    assert len(body["items"]) == 1


async def test_empty_playlist_returns_zeros(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], playlist_url(EMPTY_PLAYLIST_ID))
    assert resp.status_code == 200
    assert resp.json() == {
        "added": 0,
        "skipped": 0,
        "failed": 0,
        "total_in_playlist": 0,
        "next_page_token": None,
        "items": [],
    }


# --- Long playlists: one page per request ----------------------------------


async def test_a_long_playlist_is_imported_in_pages_of_fifty(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    ids = big_playlist(fake_youtube, "PLbig000000000001", 120)
    path = await create(auth_client, alice)
    url = playlist_url("PLbig000000000001")

    first = (await do_import(auth_client, alice, path["id"], url)).json()
    assert (first["added"], first["total_in_playlist"]) == (50, 120)
    assert first["next_page_token"] == "tok50"

    second = (await do_import(auth_client, alice, path["id"], url, first["next_page_token"])).json()
    assert (second["added"], second["next_page_token"]) == (50, "tok100")

    third = (await do_import(auth_client, alice, path["id"], url, second["next_page_token"])).json()
    assert (third["added"], third["next_page_token"]) == (20, None)

    # Order across pages is the playlist's order, with contiguous positions.
    assert await path_video_ids(auth_client, alice, path["id"]) == ids
    listing = await auth_client.get(
        f"{BASE}/{path['id']}/videos", params={"limit": 500}, headers=alice.h
    )
    assert [i["position"] for i in listing.json()["items"]] == list(range(1, 121))


async def test_a_failure_part_way_keeps_the_pages_already_imported(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    ids = big_playlist(fake_youtube, "PLbig000000000002", 120)
    path = await create(auth_client, alice)
    url = playlist_url("PLbig000000000002")

    first = (await do_import(auth_client, alice, path["id"], url)).json()
    assert first["added"] == 50

    # The second page hits the quota.
    fake_youtube.fail_with = QuotaExceededError(900)
    broken = await do_import(auth_client, alice, path["id"], url, first["next_page_token"])
    assert broken.status_code == 429
    assert broken.headers["retry-after"] == "900"
    assert await count(session, LearningPathVideo) == 50  # page one is still there

    # Retrying later from the same token carries on without duplicating anything.
    fake_youtube.fail_with = None
    retry = (await do_import(auth_client, alice, path["id"], url, first["next_page_token"])).json()
    assert retry["added"] == 50
    assert await path_video_ids(auth_client, alice, path["id"]) == ids[:100]


async def test_unavailable_items_in_a_long_playlist_only_fail_themselves(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    pid = "PLsome000000hole"
    ids = [f"vid{n:08d}" for n in range(60)]
    gone = {ids[3], ids[55]}
    for vid in ids:
        if vid not in gone:
            fake_youtube.add_video(make_video(vid))
    fake_youtube.add_playlist(pid, [PlaylistEntry(v, f"Video {v}") for v in ids])
    path = await create(auth_client, alice)
    url = playlist_url(pid)

    first = (await do_import(auth_client, alice, path["id"], url)).json()
    second = (await do_import(auth_client, alice, path["id"], url, first["next_page_token"])).json()

    assert (first["added"], first["failed"]) == (49, 1)
    assert (second["added"], second["failed"]) == (9, 1)
    imported = await path_video_ids(auth_client, alice, path["id"])
    assert imported == [v for v in ids if v not in gone]


# --- Shared metadata and quota ---------------------------------------------


async def test_known_videos_are_not_looked_up_again(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    mine = await create(auth_client, alice, "Mine")
    theirs = await create(auth_client, bob, "Theirs")
    await do_import(auth_client, alice, mine["id"])
    first_lookups = list(fake_youtube.calls)
    assert sorted(first_lookups) == sorted(  # all five ids, one batch
        [
            NORMAL_VIDEO_ID,
            PRIVATE_VIDEO_ID,
            ARRAY_VIDEO_ID,
            EMBED_DISABLED_VIDEO_ID,
            SORTING_VIDEO_ID,
        ]
    )

    fake_youtube.calls.clear()
    await do_import(auth_client, bob, theirs["id"])
    # Only the private video (never stored) is asked about again.
    assert fake_youtube.calls == [PRIVATE_VIDEO_ID]


async def test_two_users_share_video_rows(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    bob: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    a = await create(auth_client, alice, "A")
    b = await create(auth_client, bob, "B")
    await do_import(auth_client, alice, a["id"])
    await do_import(auth_client, bob, b["id"])
    assert await count(session, Video) == 4
    assert await count(session, LearningPathVideo) == 8


# --- Ownership -------------------------------------------------------------


async def test_cannot_import_into_someone_elses_path_and_it_costs_no_quota(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    bob: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    bobs = await create(auth_client, bob, "Bob's")
    foreign = await do_import(auth_client, alice, bobs["id"])
    missing = await do_import(auth_client, alice, str(uuid.uuid4()))

    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()
    assert fake_youtube.playlist_calls == [] and fake_youtube.calls == []
    assert await count(session, LearningPathVideo) == 0


# --- YouTube failure modes -------------------------------------------------


async def test_private_or_missing_playlist_is_422(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], playlist_url("PLdoesnotexist001"))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "PLAYLIST_UNAVAILABLE"
    assert "Public or Unlisted" in resp.json()["error"]["message"]


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (QuotaExceededError(1800), 429, "YOUTUBE_QUOTA_EXCEEDED"),
        (YouTubeTimeoutError(), 504, "UPSTREAM_TIMEOUT"),
        (YouTubeUpstreamError(), 502, "UPSTREAM_ERROR"),
    ],
)
async def test_youtube_failures_map_to_actionable_errors_and_store_nothing(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    youtube_fails: Callable[[YouTubeError], FakeYouTubeClient],
    session: AsyncSession,
    error: YouTubeError,
    status: int,
    code: str,
) -> None:
    path = await create(auth_client, alice)
    youtube_fails(error)
    resp = await do_import(auth_client, alice, path["id"])
    assert resp.status_code == status
    assert resp.json()["error"]["code"] == code
    assert await count(session, LearningPathVideo) == 0
    assert await count(session, Video) == 0


async def test_a_failure_while_fetching_video_details_stores_nothing_from_that_page(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The playlist page loads, then the batch lookup fails: no partial page is committed."""
    path = await create(auth_client, alice)

    async def failing_get_videos(ids: list[str]) -> dict[str, VideoMetadata]:
        raise YouTubeTimeoutError

    monkeypatch.setattr(fake_youtube, "get_videos", failing_get_videos)
    resp = await do_import(auth_client, alice, path["id"])

    assert resp.status_code == 504
    assert await count(session, LearningPathVideo) == 0


# --- Observability ---------------------------------------------------------


async def test_import_results_are_counted_without_identifying_labels(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    client: httpx.AsyncClient,
) -> None:
    path = await create(auth_client, alice)
    await do_import(auth_client, alice, path["id"])  # has a private video -> "partial"
    metrics = (await client.get("/metrics")).text
    assert 'app_import_attempts_total{result="partial"}' in metrics
    assert MIXED_PLAYLIST_ID not in metrics
    assert NORMAL_VIDEO_ID not in metrics
