import logging
import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _fake_youtube_client, get_youtube_client
from app.integrations.youtube.errors import (
    NotConfiguredError,
    QuotaExceededError,
    YouTubeError,
    YouTubeTimeoutError,
    YouTubeUpstreamError,
)
from app.integrations.youtube.fake import (
    EMBED_DISABLED_VIDEO_ID,
    NO_DURATION_VIDEO_ID,
    NORMAL_VIDEO_ID,
    PRIVATE_VIDEO_ID,
    FakeYouTubeClient,
)
from app.main import app
from app.models import LearningPathVideo, Video, VideoNote, VideoProgress
from tests.api.helpers import BASE, Actor, create, set_progress

IMPORT = "/api/v1/videos/import"


def watch(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


@pytest.fixture
def fake_youtube() -> Iterator[FakeYouTubeClient]:
    """The shared fake that APP_ENV=test uses, with its call log reset."""
    fake = _fake_youtube_client()
    fake.calls.clear()
    fake.fail_with = None
    yield fake
    fake.calls.clear()


@pytest.fixture
def youtube_fails() -> Iterator[Callable[[YouTubeError], FakeYouTubeClient]]:
    def install(error: YouTubeError) -> FakeYouTubeClient:
        failing = FakeYouTubeClient(fail_with=error)
        app.dependency_overrides[get_youtube_client] = lambda: failing
        return failing

    yield install
    app.dependency_overrides.pop(get_youtube_client, None)


async def do_import(
    client: httpx.AsyncClient, who: Actor, path_id: str, url: str
) -> httpx.Response:
    return await client.post(
        IMPORT, json={"youtube_url": url, "learning_path_id": path_id}, headers=who.h
    )


async def count(session: AsyncSession, model: type, *where: Any) -> int:
    return (
        await session.execute(select(func.count()).select_from(model).where(*where))
    ).scalar_one()


# --- Authentication and validation -----------------------------------------


async def test_import_requires_authentication(auth_client: httpx.AsyncClient) -> None:
    resp = await auth_client.post(
        IMPORT, json={"youtube_url": watch(NORMAL_VIDEO_ID), "learning_path_id": str(uuid.uuid4())}
    )
    assert resp.status_code == 401


@pytest.mark.parametrize(
    "url",
    [
        "https://vimeo.com/123456",
        "not a url",
        f"https://youtube.com.evil.example/watch?v={NORMAL_VIDEO_ID}",
        "https://www.youtube.com/playlist?list=PLabc",
    ],
)
async def test_invalid_url_is_422_with_supported_formats_and_no_api_call(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient, url: str
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], url)
    assert resp.status_code == 422
    error = resp.json()["error"]
    assert error["code"] == "INVALID_YOUTUBE_URL"
    assert "youtu.be" in " ".join(error["details"][0]["supported_formats"])
    assert fake_youtube.calls == []


@pytest.mark.parametrize("payload", [{}, {"youtube_url": "x"}, {"learning_path_id": "nope"}])
async def test_missing_or_malformed_fields_are_422(
    auth_client: httpx.AsyncClient, alice: Actor, payload: dict[str, str]
) -> None:
    resp = await auth_client.post(IMPORT, json=payload, headers=alice.h)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


# --- Happy path ------------------------------------------------------------


async def test_import_adds_the_video_to_the_path(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice, "DSA")
    resp = await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))

    assert resp.status_code == 201
    body = resp.json()
    assert (body["status"], body["reason"], body["position"]) == ("added", None, 1)
    video = body["video"]
    assert video["youtube_video_id"] == NORMAL_VIDEO_ID
    assert video["title"] == "Binary Search - Complete Tutorial"
    assert video["channel_title"] == "Example Academy"
    assert video["duration_seconds"] == 3130
    assert video["availability_state"] == "available"
    assert video["thumbnail_url"].startswith("https://")
    uuid.UUID(video["id"])

    # It now shows up in the path's video list and statistics.
    listing = (await auth_client.get(f"{BASE}/{path['id']}/videos", headers=alice.h)).json()
    assert [i["video"]["youtube_video_id"] for i in listing["items"]] == [NORMAL_VIDEO_ID]
    assert listing["items"][0]["learning_status"] == "NOT_STARTED"
    detail = (await auth_client.get(f"{BASE}/{path['id']}", headers=alice.h)).json()
    assert detail["total_videos"] == 1


@pytest.mark.parametrize(
    "url",
    [
        f"https://youtu.be/{NORMAL_VIDEO_ID}",
        f"https://www.youtube.com/embed/{NORMAL_VIDEO_ID}",
        f"https://www.youtube.com/watch?v={NORMAL_VIDEO_ID}&list=PLxyz&index=2",
    ],
)
async def test_all_supported_url_shapes_import(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient, url: str
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], url)
    assert resp.status_code == 201
    assert resp.json()["video"]["youtube_video_id"] == NORMAL_VIDEO_ID


async def test_positions_follow_import_order(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    first = await do_import(auth_client, alice, path["id"], watch(EMBED_DISABLED_VIDEO_ID))
    second = await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))
    assert (first.json()["position"], second.json()["position"]) == (1, 2)

    listing = (await auth_client.get(f"{BASE}/{path['id']}/videos", headers=alice.h)).json()
    assert [i["video"]["youtube_video_id"] for i in listing["items"]] == [
        EMBED_DISABLED_VIDEO_ID,
        NORMAL_VIDEO_ID,
    ]


async def test_embedding_disabled_video_is_added_with_its_state(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], watch(EMBED_DISABLED_VIDEO_ID))
    assert resp.status_code == 201
    assert resp.json()["video"]["availability_state"] == "embed_disabled"


async def test_video_without_a_duration_still_imports(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], watch(NO_DURATION_VIDEO_ID))
    assert resp.status_code == 201
    assert resp.json()["video"]["duration_seconds"] is None


# --- Duplicates and shared metadata ----------------------------------------


async def test_duplicate_in_the_same_path_is_skipped(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    path = await create(auth_client, alice)
    await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))
    again = await do_import(auth_client, alice, path["id"], f"https://youtu.be/{NORMAL_VIDEO_ID}")

    assert again.status_code == 200
    body = again.json()
    assert (body["status"], body["reason"], body["position"]) == ("skipped", "already_in_path", 1)
    assert (
        await count(
            session, LearningPathVideo, LearningPathVideo.learning_path_id == uuid.UUID(path["id"])
        )
        == 1
    )


async def test_one_video_row_is_shared_and_metadata_is_not_refetched(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    bob: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    a1 = await create(auth_client, alice, "A1")
    a2 = await create(auth_client, alice, "A2")
    b1 = await create(auth_client, bob, "B1")
    for who, path in ((alice, a1), (alice, a2), (bob, b1)):
        assert (
            await do_import(auth_client, who, path["id"], watch(NORMAL_VIDEO_ID))
        ).status_code == 201

    assert await count(session, Video, Video.youtube_video_id == NORMAL_VIDEO_ID) == 1
    assert fake_youtube.calls == [NORMAL_VIDEO_ID]  # one API call served three imports


async def test_stale_metadata_is_refreshed(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    first = await create(auth_client, alice, "First")
    second = await create(auth_client, alice, "Second")
    await do_import(auth_client, alice, first["id"], watch(NORMAL_VIDEO_ID))

    video = (
        await session.execute(select(Video).where(Video.youtube_video_id == NORMAL_VIDEO_ID))
    ).scalar_one()
    video.title = "Out of date"
    video.metadata_fetched_at = datetime.now(UTC) - timedelta(days=30)
    await session.flush()

    resp = await do_import(auth_client, alice, second["id"], watch(NORMAL_VIDEO_ID))
    assert resp.json()["video"]["title"] == "Binary Search - Complete Tutorial"
    assert fake_youtube.calls == [NORMAL_VIDEO_ID, NORMAL_VIDEO_ID]


async def test_importing_does_not_touch_notes_or_progress(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    first = await create(auth_client, alice, "First")
    second = await create(auth_client, alice, "Second")
    imported = (await do_import(auth_client, alice, first["id"], watch(NORMAL_VIDEO_ID))).json()
    video = await session.get(Video, uuid.UUID(imported["video"]["id"]))
    assert video is not None
    await set_progress(session, alice, video, learning_status="IN_PROGRESS")
    session.add(VideoNote(user_id=alice.id, video_id=video.id, body="mine"))
    await session.flush()

    await do_import(auth_client, alice, second["id"], watch(NORMAL_VIDEO_ID))

    progress = (
        await session.execute(select(VideoProgress).where(VideoProgress.video_id == video.id))
    ).scalar_one()
    assert progress.learning_status == "IN_PROGRESS"


# --- Ownership -------------------------------------------------------------


async def test_cannot_import_into_someone_elses_path_and_it_costs_no_quota(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    bob: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    bobs = await create(auth_client, bob, "Bob's")
    foreign = await do_import(auth_client, alice, bobs["id"], watch(NORMAL_VIDEO_ID))
    missing = await do_import(auth_client, alice, str(uuid.uuid4()), watch(NORMAL_VIDEO_ID))

    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()  # existence is not revealed
    assert fake_youtube.calls == []
    assert await count(session, LearningPathVideo) == 0


async def test_extra_user_id_field_is_ignored(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    bob: Actor,
    fake_youtube: FakeYouTubeClient,
) -> None:
    bobs = await create(auth_client, bob, "Bob's")
    resp = await auth_client.post(
        IMPORT,
        json={
            "youtube_url": watch(NORMAL_VIDEO_ID),
            "learning_path_id": bobs["id"],
            "user_id": str(bob.id),
        },
        headers=alice.h,
    )
    assert resp.status_code == 404


# --- YouTube failure modes -------------------------------------------------


async def test_private_or_deleted_video_is_rejected_and_nothing_is_stored(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], watch(PRIVATE_VIDEO_ID))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VIDEO_UNAVAILABLE"
    assert "private" in resp.json()["error"]["message"]
    assert await count(session, Video) == 0
    assert await count(session, LearningPathVideo) == 0


async def test_unknown_video_behaves_like_a_deleted_one(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    resp = await do_import(auth_client, alice, path["id"], watch("zzzzzzzzzzz"))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VIDEO_UNAVAILABLE"


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (QuotaExceededError(1800), 429, "YOUTUBE_QUOTA_EXCEEDED"),
        (YouTubeTimeoutError(), 504, "UPSTREAM_TIMEOUT"),
        (YouTubeUpstreamError(), 502, "UPSTREAM_ERROR"),
        (NotConfiguredError(), 503, "YOUTUBE_NOT_CONFIGURED"),
    ],
)
async def test_youtube_failures_map_to_actionable_errors(
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
    resp = await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))

    assert resp.status_code == status
    assert resp.json()["error"]["code"] == code
    assert resp.json()["error"]["message"]
    assert await count(session, LearningPathVideo) == 0
    if isinstance(error, QuotaExceededError):
        assert resp.headers["retry-after"] == "1800"


async def test_import_still_works_after_a_failure(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    youtube_fails: Callable[[YouTubeError], FakeYouTubeClient],
    fake_youtube: FakeYouTubeClient,
) -> None:
    path = await create(auth_client, alice)
    youtube_fails(YouTubeTimeoutError())
    assert (
        await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))
    ).status_code == 504
    app.dependency_overrides.pop(get_youtube_client, None)
    assert (
        await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))
    ).status_code == 201


# --- Removing a video from a path ------------------------------------------


async def test_removing_a_video_only_removes_the_path_membership(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    session: AsyncSession,
) -> None:
    path = await create(auth_client, alice)
    other = await create(auth_client, alice, "Other")
    imported = (await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))).json()
    await do_import(auth_client, alice, other["id"], watch(NORMAL_VIDEO_ID))
    video_id = imported["video"]["id"]
    video = await session.get(Video, uuid.UUID(video_id))
    assert video is not None
    await set_progress(session, alice, video, learning_status="IN_PROGRESS")
    session.add(VideoNote(user_id=alice.id, video_id=video.id, body="keep"))
    await session.flush()

    resp = await auth_client.delete(f"{BASE}/{path['id']}/videos/{video_id}", headers=alice.h)
    assert resp.status_code == 204

    first = (await auth_client.get(f"{BASE}/{path['id']}/videos", headers=alice.h)).json()
    second = (await auth_client.get(f"{BASE}/{other['id']}/videos", headers=alice.h)).json()
    assert first["total"] == 0
    assert second["total"] == 1  # still in the other path
    assert second["items"][0]["learning_status"] == "IN_PROGRESS"
    assert await count(session, VideoNote, VideoNote.video_id == video.id) == 1
    assert await count(session, Video, Video.id == video.id) == 1


async def test_removed_video_can_be_added_again_at_the_end(
    auth_client: httpx.AsyncClient, alice: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    path = await create(auth_client, alice)
    first = (await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))).json()
    await do_import(auth_client, alice, path["id"], watch(EMBED_DISABLED_VIDEO_ID))
    await auth_client.delete(f"{BASE}/{path['id']}/videos/{first['video']['id']}", headers=alice.h)

    again = await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))
    assert again.status_code == 201
    assert again.json()["position"] == 3  # positions keep increasing; gaps are fine


async def test_cannot_remove_from_someone_elses_path(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, fake_youtube: FakeYouTubeClient
) -> None:
    bobs = await create(auth_client, bob, "Bob's")
    imported = (await do_import(auth_client, bob, bobs["id"], watch(NORMAL_VIDEO_ID))).json()
    video_id = imported["video"]["id"]

    resp = await auth_client.delete(f"{BASE}/{bobs['id']}/videos/{video_id}", headers=alice.h)
    assert resp.status_code == 404
    listing = (await auth_client.get(f"{BASE}/{bobs['id']}/videos", headers=bob.h)).json()
    assert listing["total"] == 1


async def test_removing_a_video_that_is_not_in_the_path_is_404(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    path = await create(auth_client, alice)
    resp = await auth_client.delete(f"{BASE}/{path['id']}/videos/{uuid.uuid4()}", headers=alice.h)
    assert resp.status_code == 404


# --- Observability and secrets ---------------------------------------------


async def test_import_attempts_are_counted_without_identifying_labels(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    fake_youtube: FakeYouTubeClient,
    client: httpx.AsyncClient,
) -> None:
    path = await create(auth_client, alice)
    await do_import(auth_client, alice, path["id"], watch(NORMAL_VIDEO_ID))
    metrics = (await client.get("/metrics")).text
    assert 'app_import_attempts_total{result="success"}' in metrics
    assert NORMAL_VIDEO_ID not in metrics
    assert str(alice.id) not in metrics


def test_http_client_logs_are_silenced_so_video_ids_stay_out_of_logs() -> None:
    from app.core.logging import configure_logging

    configure_logging()
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() >= logging.WARNING
