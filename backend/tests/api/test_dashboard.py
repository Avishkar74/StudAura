import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningPath, User, Video, VideoProgress
from tests.api.helpers import Actor, add_video, create

DASH = "/api/v1/dashboard"


async def get(client: httpx.AsyncClient, who: Actor, **params: Any) -> dict[str, Any]:
    resp = await client.get(DASH, params=params, headers=who.h)
    assert resp.status_code == 200, resp.text
    body: dict[str, Any] = resp.json()
    return body


async def watch(
    session: AsyncSession,
    who: Actor,
    video: Video,
    *,
    status: str = "IN_PROGRESS",
    position: float = 60.0,
    ago: timedelta = timedelta(minutes=5),
) -> None:
    if await session.get(User, who.id) is None:
        session.add(User(id=who.id, email=who.email))
        await session.flush()
    session.add(
        VideoProgress(
            user_id=who.id,
            video_id=video.id,
            learning_status=status,
            last_position_seconds=position,
            last_watched_at=datetime.now(UTC) - ago,
        )
    )
    await session.flush()


async def test_requires_authentication(auth_client: httpx.AsyncClient) -> None:
    assert (await auth_client.get(DASH)).status_code == 401


async def test_a_new_student_has_nothing_to_continue(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    body = await get(auth_client, alice)
    assert body == {"continue_learning": None, "recently_watched": []}


async def test_unwatched_videos_do_not_appear(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    await add_video(session, path["id"], 1)
    assert (await get(auth_client, alice))["recently_watched"] == []


async def test_continue_is_the_latest_unfinished_video_with_its_progress_and_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice, "Algorithms")
    old = await add_video(session, path["id"], 1, title="Old", duration=600)
    new = await add_video(session, path["id"], 2, title="New", duration=600)
    await watch(session, alice, old, ago=timedelta(days=2), position=100)
    await watch(session, alice, new, ago=timedelta(minutes=3), position=150)

    body = await get(auth_client, alice)
    cont = body["continue_learning"]
    assert cont["video"]["title"] == "New"
    assert cont["last_position_seconds"] == 150
    assert cont["playback_pct"] == 25.0
    assert cont["path"] == {"id": path["id"], "title": "Algorithms"}
    assert cont["learning_status"] == "IN_PROGRESS"


async def test_recently_watched_is_newest_first_and_limited(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    for i in range(1, 6):
        v = await add_video(session, path["id"], i, title=f"V{i}")
        await watch(session, alice, v, ago=timedelta(hours=i))
    titles = [
        i["video"]["title"] for i in (await get(auth_client, alice, limit=3))["recently_watched"]
    ]
    assert titles == ["V1", "V2", "V3"]
    assert (await auth_client.get(DASH, params={"limit": 0}, headers=alice.h)).status_code == 422
    assert (await auth_client.get(DASH, params={"limit": 21}, headers=alice.h)).status_code == 422


async def test_finished_flagged_and_unplayable_videos_are_not_continued(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    done = await add_video(session, path["id"], 1, title="Done")
    flagged = await add_video(session, path["id"], 2, title="Flagged")
    blocked = await add_video(session, path["id"], 3, title="Blocked")
    blocked.availability_state = "embed_disabled"
    await watch(session, alice, done, status="COMPLETED", ago=timedelta(minutes=1))
    await watch(session, alice, flagged, status="NEEDS_REVISION", ago=timedelta(minutes=2))
    await watch(session, alice, blocked, ago=timedelta(minutes=3))
    body = await get(auth_client, alice)
    assert body["continue_learning"] is None
    # They are still recent history.
    assert [i["video"]["title"] for i in body["recently_watched"]] == ["Done", "Flagged", "Blocked"]

    older = await add_video(session, path["id"], 4, title="Older but unfinished")
    await watch(session, alice, older, ago=timedelta(days=3))
    assert (await get(auth_client, alice))["continue_learning"]["video"]["title"] == (
        "Older but unfinished"
    )


async def test_a_video_outside_every_path_has_no_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1)
    await watch(session, alice, video)
    from sqlalchemy import delete

    from app.models import LearningPathVideo

    await session.execute(delete(LearningPathVideo).where(LearningPathVideo.video_id == video.id))
    await session.flush()
    assert (await get(auth_client, alice))["continue_learning"]["path"] is None


async def test_the_path_is_the_oldest_one_that_contains_the_video(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    from app.models import LearningPathVideo

    first = await create(auth_client, alice, "First")
    second = await create(auth_client, alice, "Second")
    video = await add_video(session, first["id"], 1)
    session.add(
        LearningPathVideo(learning_path_id=uuid.UUID(second["id"]), video_id=video.id, position=1)
    )
    older = await session.get(LearningPath, uuid.UUID(first["id"]))
    assert older is not None
    older.created_at = datetime.now(UTC) - timedelta(days=1)
    await watch(session, alice, video)
    assert (await get(auth_client, alice))["continue_learning"]["path"]["title"] == "First"


async def test_students_only_see_their_own_history(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1)
    await watch(session, alice, video)
    mine = await create(auth_client, bob)
    other = await add_video(session, mine["id"], 1, title="Bob's")
    await watch(session, bob, other)

    assert [i["video"]["title"] for i in (await get(auth_client, bob))["recently_watched"]] == [
        "Bob's"
    ]
    assert len((await get(auth_client, alice))["recently_watched"]) == 1
