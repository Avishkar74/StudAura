import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    LearningPathVideo,
    SavedVideo,
    User,
    Video,
    VideoComment,
    VideoNote,
    VideoProgress,
)
from tests.api.helpers import Actor, add_video, create

VIDEOS = "/api/v1/videos"


async def make_user(session: AsyncSession, who: Actor) -> None:
    if await session.get(User, who.id) is None:
        session.add(User(id=who.id, email=who.email))
        await session.flush()


async def video_in_path(
    client: httpx.AsyncClient, session: AsyncSession, who: Actor, *, duration: int | None = 600
) -> tuple[str, Video]:
    """A path owned by `who` containing one video. Returns (path id, video)."""
    path = await create(client, who)
    video = await add_video(session, path["id"], 1, duration=duration)
    return path["id"], video


async def put(
    client: httpx.AsyncClient, who: Actor, video: Video, body: dict[str, Any]
) -> httpx.Response:
    return await client.put(f"{VIDEOS}/{video.id}/progress", json=body, headers=who.h)


async def get_progress(client: httpx.AsyncClient, who: Actor, video: Video) -> dict[str, Any]:
    resp = await client.get(f"{VIDEOS}/{video.id}/progress", headers=who.h)
    assert resp.status_code == 200, resp.text
    body: dict[str, Any] = resp.json()
    return body


async def rows(session: AsyncSession) -> int:
    return (await session.execute(select(func.count()).select_from(VideoProgress))).scalar_one()


# --- Authentication --------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "suffix"), [("GET", ""), ("GET", "/progress"), ("PUT", "/progress")]
)
async def test_endpoints_require_authentication(
    auth_client: httpx.AsyncClient, method: str, suffix: str
) -> None:
    resp = await auth_client.request(
        method, f"{VIDEOS}/{uuid.uuid4()}{suffix}", json={"last_position_seconds": 1}
    )
    assert resp.status_code == 401


# --- Access control --------------------------------------------------------


async def test_a_video_outside_my_paths_looks_like_a_missing_one(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, bob)
    await make_user(session, alice)
    missing = uuid.uuid4()

    for suffix in ("", "/progress"):
        theirs = await auth_client.get(f"{VIDEOS}/{video.id}{suffix}", headers=alice.h)
        nothing = await auth_client.get(f"{VIDEOS}/{missing}{suffix}", headers=alice.h)
        assert theirs.status_code == nothing.status_code == 404
        assert theirs.json() == nothing.json()

    # ...and she cannot write progress for it either, so no row appears.
    attempt = await put(auth_client, alice, video, {"last_position_seconds": 10})
    assert attempt.status_code == 404
    assert await rows(session) == 0


async def test_malformed_video_id_is_422(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    resp = await auth_client.get(f"{VIDEOS}/not-a-uuid/progress", headers=alice.h)
    assert resp.status_code == 422


@pytest.mark.parametrize("via", ["path", "saved", "note", "comment", "progress"])
async def test_any_real_relationship_grants_access(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession, via: str
) -> None:
    """A video stays reachable while the user has any relationship with it."""
    await make_user(session, alice)
    video = Video(youtube_video_id=uuid.uuid4().hex[:11], title="Standalone", duration_seconds=600)
    session.add(video)
    await session.flush()

    assert (await auth_client.get(f"{VIDEOS}/{video.id}", headers=alice.h)).status_code == 404
    if via == "path":
        path = await create(auth_client, alice)
        await add_video(session, path["id"], 1)  # a different video; link ours directly

        session.add(
            LearningPathVideo(learning_path_id=uuid.UUID(path["id"]), video_id=video.id, position=2)
        )
    elif via == "saved":
        session.add(SavedVideo(user_id=alice.id, video_id=video.id))
    elif via == "note":
        session.add(VideoNote(user_id=alice.id, video_id=video.id, body="x"))
    elif via == "comment":
        session.add(VideoComment(user_id=alice.id, video_id=video.id, body="x"))
    else:
        session.add(VideoProgress(user_id=alice.id, video_id=video.id))
    await session.flush()

    assert (await auth_client.get(f"{VIDEOS}/{video.id}", headers=alice.h)).status_code == 200


# --- Video detail ----------------------------------------------------------


async def test_video_detail_has_metadata_and_my_progress(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    await put(auth_client, alice, video, {"last_position_seconds": 150})

    body = (await auth_client.get(f"{VIDEOS}/{video.id}", headers=alice.h)).json()
    assert body["video"]["id"] == str(video.id)
    assert body["video"]["youtube_video_id"] == video.youtube_video_id
    assert body["video"]["duration_seconds"] == 600
    assert body["last_position_seconds"] == 150
    assert body["playback_pct"] == 25.0
    assert body["learning_status"] == "IN_PROGRESS"


async def test_video_detail_never_shows_someone_elses_progress(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    path_id, video = await video_in_path(auth_client, session, alice)
    bobs_path = await create(auth_client, bob)

    await make_user(session, bob)
    session.add(
        LearningPathVideo(
            learning_path_id=uuid.UUID(bobs_path["id"]), video_id=video.id, position=1
        )
    )
    await session.flush()
    await put(auth_client, alice, video, {"last_position_seconds": 500})

    bobs_view = (await auth_client.get(f"{VIDEOS}/{video.id}", headers=bob.h)).json()
    assert bobs_view["last_position_seconds"] == 0
    assert bobs_view["learning_status"] == "NOT_STARTED"
    assert path_id  # alice's path is unaffected


# --- Reading progress ------------------------------------------------------


async def test_progress_defaults_before_anything_is_saved(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    body = await get_progress(auth_client, alice, video)
    assert body == {
        "video_id": str(video.id),
        "learning_status": "NOT_STARTED",
        "last_position_seconds": 0,
        "playback_pct": 0.0,
        "ever_completed_at": None,
        "last_watched_at": None,
    }
    assert await rows(session) == 0  # reading never creates a row


async def test_playback_pct_is_null_without_a_known_duration(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice, duration=None)
    await put(auth_client, alice, video, {"last_position_seconds": 42})
    body = await get_progress(auth_client, alice, video)
    assert body["last_position_seconds"] == 42
    assert body["playback_pct"] is None


# --- Saving position -------------------------------------------------------


async def test_saving_a_position_starts_the_video_and_stamps_last_watched(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    resp = await put(auth_client, alice, video, {"last_position_seconds": 342.5})

    assert resp.status_code == 200
    body = resp.json()
    assert body["last_position_seconds"] == 342.5
    assert body["learning_status"] == "IN_PROGRESS"
    assert body["last_watched_at"] is not None
    assert body["ever_completed_at"] is None
    assert await get_progress(auth_client, alice, video) == body  # it really persisted


async def test_position_zero_does_not_start_the_video(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    body = (await put(auth_client, alice, video, {"last_position_seconds": 0})).json()
    assert body["learning_status"] == "NOT_STARTED"


async def test_saving_is_idempotent_and_keeps_one_row(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    first = (await put(auth_client, alice, video, {"last_position_seconds": 100})).json()
    for _ in range(3):
        again = await put(auth_client, alice, video, {"last_position_seconds": 100})
        assert again.status_code == 200
        assert again.json()["last_position_seconds"] == first["last_position_seconds"]
    assert await rows(session) == 1


async def test_later_saves_overwrite_earlier_ones_including_going_backwards(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    """The saved position is where the student *is*; rewinding must be remembered too."""
    _, video = await video_in_path(auth_client, session, alice)
    await put(auth_client, alice, video, {"last_position_seconds": 400})
    await put(auth_client, alice, video, {"last_position_seconds": 90})
    assert (await get_progress(auth_client, alice, video))["last_position_seconds"] == 90


async def test_position_is_clamped_to_the_duration(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice, duration=600)
    body = (await put(auth_client, alice, video, {"last_position_seconds": 99999})).json()
    assert body["last_position_seconds"] == 600
    assert body["playback_pct"] == 100.0


async def test_position_is_not_clamped_when_duration_is_unknown(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice, duration=None)
    body = (await put(auth_client, alice, video, {"last_position_seconds": 99999})).json()
    assert body["last_position_seconds"] == 99999


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"last_position_seconds": -1},
        {"last_position_seconds": "soon"},
        {"last_position_seconds": None},
        {"learning_status": "DONE"},
        {"learning_status": ""},
        {"last_position_seconds": 5, "learning_status": "finished"},
    ],
)
async def test_invalid_updates_are_422_and_write_nothing(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    session: AsyncSession,
    body: dict[str, Any],
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    resp = await put(auth_client, alice, video, body)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    assert await rows(session) == 0


async def test_non_finite_numbers_are_rejected(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    for raw in ("NaN", "Infinity", "-Infinity"):
        resp = await auth_client.put(
            f"{VIDEOS}/{video.id}/progress",
            content=f'{{"last_position_seconds": {raw}}}',
            headers={**alice.h, "Content-Type": "application/json"},
        )
        assert resp.status_code == 422
    assert await rows(session) == 0


# --- Status rules ----------------------------------------------------------


async def test_playback_never_completes_a_video_or_changes_a_revision_flag(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    await put(auth_client, alice, video, {"learning_status": "NEEDS_REVISION"})

    # Watching to the very end is just a position update (PRD 7.3: seeking is not completion).
    body = (await put(auth_client, alice, video, {"last_position_seconds": 600})).json()
    assert body["learning_status"] == "NEEDS_REVISION"
    assert body["ever_completed_at"] is None
    assert body["last_position_seconds"] == 600


async def test_marking_completed_records_history_that_needs_revision_keeps(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    done = (await put(auth_client, alice, video, {"learning_status": "COMPLETED"})).json()
    assert done["learning_status"] == "COMPLETED"
    stamp = done["ever_completed_at"]
    assert stamp is not None

    revise = (await put(auth_client, alice, video, {"learning_status": "NEEDS_REVISION"})).json()
    assert revise["learning_status"] == "NEEDS_REVISION"
    assert revise["ever_completed_at"] == stamp  # completion history survives

    again = (await put(auth_client, alice, video, {"learning_status": "COMPLETED"})).json()
    assert again["ever_completed_at"] == stamp  # and is never reset


async def test_changing_status_preserves_the_saved_position(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    await put(auth_client, alice, video, {"last_position_seconds": 321})
    body = (await put(auth_client, alice, video, {"learning_status": "IN_PROGRESS"})).json()
    assert body["last_position_seconds"] == 321

    body = (await put(auth_client, alice, video, {"learning_status": "COMPLETED"})).json()
    assert body["last_position_seconds"] == 321  # position and status are separate fields


async def test_a_status_only_update_does_not_touch_last_watched(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    body = (await put(auth_client, alice, video, {"learning_status": "NEEDS_REVISION"})).json()
    assert body["last_watched_at"] is None


async def test_position_and_status_can_be_sent_together(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    body = (
        await put(
            auth_client,
            alice,
            video,
            {"last_position_seconds": 600, "learning_status": "COMPLETED"},
        )
    ).json()
    assert (body["last_position_seconds"], body["learning_status"]) == (600, "COMPLETED")
    assert body["ever_completed_at"] is not None


# --- Isolation and effects on other views ----------------------------------


async def test_two_users_keep_separate_progress_on_the_same_video(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:

    _, video = await video_in_path(auth_client, session, alice)
    bobs_path = await create(auth_client, bob)
    await make_user(session, bob)
    session.add(
        LearningPathVideo(
            learning_path_id=uuid.UUID(bobs_path["id"]), video_id=video.id, position=1
        )
    )
    await session.flush()

    await put(auth_client, alice, video, {"last_position_seconds": 500})
    await put(
        auth_client, bob, video, {"last_position_seconds": 20, "learning_status": "COMPLETED"}
    )

    a = await get_progress(auth_client, alice, video)
    b = await get_progress(auth_client, bob, video)
    assert (a["last_position_seconds"], a["learning_status"]) == (500, "IN_PROGRESS")
    assert (b["last_position_seconds"], b["learning_status"]) == (20, "COMPLETED")
    assert await rows(session) == 2


async def test_saved_progress_shows_up_in_the_path_listing_and_stats(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path_id, video = await video_in_path(auth_client, session, alice)
    await put(auth_client, alice, video, {"last_position_seconds": 300})

    listing = (
        await auth_client.get(f"/api/v1/learning-paths/{path_id}/videos", headers=alice.h)
    ).json()
    item = listing["items"][0]
    assert item["last_position_seconds"] == 300
    assert item["learning_status"] == "IN_PROGRESS"
    assert item["playback_pct"] == 50.0

    detail = (await auth_client.get(f"/api/v1/learning-paths/{path_id}", headers=alice.h)).json()
    assert detail["in_progress_videos"] == 1
    assert detail["last_activity_at"] is not None


async def test_progress_survives_removing_the_video_from_the_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path_id, video = await video_in_path(auth_client, session, alice)
    await put(auth_client, alice, video, {"last_position_seconds": 200})
    await auth_client.delete(f"/api/v1/learning-paths/{path_id}/videos/{video.id}", headers=alice.h)

    body = await get_progress(auth_client, alice, video)  # still reachable: it has progress
    assert body["last_position_seconds"] == 200


async def test_updates_are_counted_without_identifying_labels(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    session: AsyncSession,
    client: httpx.AsyncClient,
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    await put(auth_client, alice, video, {"last_position_seconds": 10})
    await put(auth_client, alice, video, {"last_position_seconds": 99999})  # clamped
    metrics = (await client.get("/metrics")).text
    assert 'app_progress_updates_total{outcome="updated"}' in metrics
    assert 'app_progress_updates_total{outcome="clamped"}' in metrics
    assert str(video.id) not in metrics
    assert video.youtube_video_id not in metrics


# --- Completion on ENDED ---------------------------------------------------


async def ended(
    client: httpx.AsyncClient, who: Actor, video: Video, *, seeked: bool, at: float = 600
) -> httpx.Response:
    return await put(
        client,
        who,
        video,
        {"last_position_seconds": at, "playback_ended": True, "session_seeked": seeked},
    )


async def test_a_clean_ending_completes_the_video(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    resp = await ended(auth_client, alice, video, seeked=False)
    assert resp.status_code == 200
    assert resp.json()["learning_status"] == "COMPLETED"
    assert resp.json()["ever_completed_at"] is not None


async def test_a_seeked_session_does_not_complete_the_video(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    resp = await ended(auth_client, alice, video, seeked=True)
    assert resp.status_code == 200
    assert resp.json()["learning_status"] == "IN_PROGRESS"  # it did play
    assert resp.json()["ever_completed_at"] is None
    assert resp.json()["last_position_seconds"] == 600  # the position is still saved


async def test_an_ended_report_far_from_the_end_does_not_complete(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    resp = await ended(auth_client, alice, video, seeked=False, at=30)
    assert resp.json()["learning_status"] == "IN_PROGRESS"
    assert resp.json()["ever_completed_at"] is None


async def test_a_video_in_revision_stays_in_revision_after_a_clean_ending(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    await put(auth_client, alice, video, {"learning_status": "COMPLETED"})
    await put(auth_client, alice, video, {"learning_status": "NEEDS_REVISION"})
    resp = await ended(auth_client, alice, video, seeked=False)
    assert resp.json()["learning_status"] == "NEEDS_REVISION"
    assert resp.json()["ever_completed_at"] is not None


async def test_ended_without_the_seek_flag_is_rejected(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    resp = await put(
        auth_client, alice, video, {"last_position_seconds": 600, "playback_ended": True}
    )
    assert resp.status_code == 422
