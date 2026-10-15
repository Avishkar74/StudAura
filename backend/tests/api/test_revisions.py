import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    LearningGoal,
    LearningPathVideo,
    RevisionItem,
    User,
    Video,
    VideoProgress,
)
from app.services.goals import today_in
from tests.api.helpers import Actor, add_video, create

VIDEOS = "/api/v1/videos"
QUEUE = "/api/v1/revisions"


def utc_today() -> date:
    return today_in(ZoneInfo("UTC"), datetime.now(UTC))


async def make_user(session: AsyncSession, who: Actor) -> None:
    if await session.get(User, who.id) is None:
        session.add(User(id=who.id, email=who.email))
        await session.flush()


async def video_for(
    client: httpx.AsyncClient, session: AsyncSession, who: Actor, **kw: Any
) -> Video:
    path = await create(client, who)
    return await add_video(session, path["id"], 1, **kw)


async def flag(client: httpx.AsyncClient, who: Actor, video: Video, **body: Any) -> httpx.Response:
    return await client.put(f"{VIDEOS}/{video.id}/revision", json=body, headers=who.h)


async def complete(client: httpx.AsyncClient, who: Actor, video: Video) -> httpx.Response:
    return await client.post(f"{VIDEOS}/{video.id}/revision/complete", headers=who.h)


async def queue(client: httpx.AsyncClient, who: Actor, **params: str) -> dict[str, Any]:
    resp = await client.get(QUEUE, params=params, headers=who.h)
    assert resp.status_code == 200, resp.text
    body: dict[str, Any] = resp.json()
    return body


async def put_progress(
    client: httpx.AsyncClient, who: Actor, video: Video, body: dict[str, Any]
) -> httpx.Response:
    return await client.put(f"{VIDEOS}/{video.id}/progress", json=body, headers=who.h)


async def item_rows(session: AsyncSession, *, active: bool | None = None) -> list[RevisionItem]:
    query = select(RevisionItem)
    if active is not None:
        query = query.where(RevisionItem.active.is_(active))
    return list((await session.execute(query)).scalars())


# --- Authentication and access ------------------------------------------------


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("GET", QUEUE),
        ("GET", f"{VIDEOS}/{uuid.uuid4()}/revision"),
        ("PUT", f"{VIDEOS}/{uuid.uuid4()}/revision"),
        ("POST", f"{VIDEOS}/{uuid.uuid4()}/revision/complete"),
    ],
)
async def test_requires_authentication(
    auth_client: httpx.AsyncClient, method: str, url: str
) -> None:
    assert (await auth_client.request(method, url, json={})).status_code == 401


async def test_a_video_the_user_has_no_link_to_looks_like_a_missing_one(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, bob)
    await make_user(session, alice)
    ghost = uuid.uuid4()

    async def call(kind: str, video_id: uuid.UUID) -> httpx.Response:
        url = f"{VIDEOS}/{video_id}/revision"
        if kind == "get":
            return await auth_client.get(url, headers=alice.h)
        if kind == "put":
            return await auth_client.put(url, json={}, headers=alice.h)
        return await auth_client.post(f"{url}/complete", headers=alice.h)

    for kind in ("get", "put", "complete"):
        theirs, nothing = await call(kind, video.id), await call(kind, ghost)
        assert theirs.status_code == nothing.status_code == 404
        assert theirs.json() == nothing.json()
    assert await item_rows(session) == []


# --- Flagging -----------------------------------------------------------------


async def test_flagging_defaults_to_the_next_day_and_sets_the_status(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await flag(auth_client, alice, video)
    assert resp.status_code == 200
    body = resp.json()
    assert body["active"] is True
    assert body["learning_status"] == "NEEDS_REVISION"
    assert body["due_at"] == (utc_today() + timedelta(days=1)).isoformat()
    assert body["due_state"] == "upcoming"
    rows = await item_rows(session, active=True)
    assert len(rows) == 1
    assert rows[0].user_id == alice.id


async def test_flagging_keeps_the_completion_history(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    done = (await put_progress(auth_client, alice, video, {"learning_status": "COMPLETED"})).json()
    assert done["ever_completed_at"] is not None

    await flag(auth_client, alice, video)
    progress = (
        await session.execute(select(VideoProgress).where(VideoProgress.video_id == video.id))
    ).scalar_one()
    assert progress.learning_status == "NEEDS_REVISION"
    assert progress.ever_completed_at is not None


async def test_flagging_is_idempotent_and_keeps_the_due_date(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    due = (utc_today() + timedelta(days=5)).isoformat()
    first = await flag(auth_client, alice, video, due_at=due)
    again = await flag(auth_client, alice, video, due_at=due)
    bare = await flag(auth_client, alice, video)  # no date: must not reset the schedule
    assert first.json()["due_at"] == again.json()["due_at"] == bare.json()["due_at"] == due
    assert len(await item_rows(session)) == 1


async def test_rescheduling_moves_the_due_date(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await flag(auth_client, alice, video)
    later = (utc_today() + timedelta(days=9)).isoformat()
    resp = await flag(auth_client, alice, video, due_at=later)
    assert resp.json()["due_at"] == later
    assert len(await item_rows(session, active=True)) == 1


async def test_due_today_is_allowed_and_reports_due_today(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await flag(auth_client, alice, video, due_at=utc_today().isoformat())
    assert resp.status_code == 200
    assert resp.json()["due_state"] == "due_today"


@pytest.mark.parametrize("offset", [-1, 366], ids=["past", "too_far"])
async def test_invalid_due_dates_are_rejected(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession, offset: int
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await flag(
        auth_client, alice, video, due_at=(utc_today() + timedelta(days=offset)).isoformat()
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_DUE_DATE"
    assert await item_rows(session) == []


async def test_tomorrow_follows_the_students_timezone(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await make_user(session, alice)
    session.add(
        LearningGoal(user_id=alice.id, daily_target_minutes=30, timezone="Pacific/Kiritimati")
    )
    await session.flush()
    tz = ZoneInfo("Pacific/Kiritimati")  # UTC+14: often a day ahead of UTC
    expected = today_in(tz, datetime.now(UTC)) + timedelta(days=1)
    assert (await flag(auth_client, alice, video)).json()["due_at"] == expected.isoformat()


async def test_the_browser_timezone_is_used_when_there_is_no_goal(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    tz = ZoneInfo("Pacific/Kiritimati")
    expected = today_in(tz, datetime.now(UTC)) + timedelta(days=1)
    resp = await flag(auth_client, alice, video, timezone="Pacific/Kiritimati")
    assert resp.json()["due_at"] == expected.isoformat()
    bad = await flag(auth_client, alice, video, timezone="Mars/Olympus")
    assert bad.status_code == 422


# --- The status controls keep the queue in step --------------------------------


async def test_setting_the_status_needs_revision_queues_the_video(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await put_progress(auth_client, alice, video, {"learning_status": "NEEDS_REVISION"})
    rows = await item_rows(session, active=True)
    assert len(rows) == 1
    assert rows[0].due_at == utc_today() + timedelta(days=1)
    # Repeating it does not add a second item or move the date.
    await put_progress(auth_client, alice, video, {"learning_status": "NEEDS_REVISION"})
    assert len(await item_rows(session)) == 1


@pytest.mark.parametrize("status", ["COMPLETED", "IN_PROGRESS", "NOT_STARTED"])
async def test_choosing_another_status_takes_the_video_out_of_the_queue(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession, status: str
) -> None:
    video = await video_for(auth_client, session, alice)
    await flag(auth_client, alice, video)
    await put_progress(auth_client, alice, video, {"learning_status": status})
    assert await item_rows(session, active=True) == []
    history = await item_rows(session, active=False)
    assert len(history) == 1
    assert history[0].revised_at is not None
    assert (await queue(auth_client, alice))["items"] == []


async def test_playback_alone_does_not_touch_the_queue(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await flag(auth_client, alice, video)
    await put_progress(auth_client, alice, video, {"last_position_seconds": 120})
    await put_progress(
        auth_client,
        alice,
        video,
        {"last_position_seconds": 600, "playback_ended": True, "session_seeked": False},
    )
    assert len(await item_rows(session, active=True)) == 1


# --- Marking revised ----------------------------------------------------------


async def test_marking_revised_removes_it_and_restores_completed(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await put_progress(auth_client, alice, video, {"learning_status": "COMPLETED"})
    await flag(auth_client, alice, video)

    resp = await complete(auth_client, alice, video)
    assert resp.status_code == 200
    body = resp.json()
    assert body["active"] is False
    assert body["learning_status"] == "COMPLETED"
    assert body["revised_at"] is not None
    assert (await queue(auth_client, alice))["total"] == 0
    # The completion history survives the whole round trip.
    progress = (
        await session.execute(select(VideoProgress).where(VideoProgress.video_id == video.id))
    ).scalar_one()
    assert progress.ever_completed_at is not None


async def test_a_never_completed_video_becomes_in_progress_when_revised(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await flag(auth_client, alice, video)
    body = (await complete(auth_client, alice, video)).json()
    assert body["learning_status"] == "IN_PROGRESS"


async def test_marking_revised_twice_says_it_is_not_in_the_queue(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await flag(auth_client, alice, video)
    assert (await complete(auth_client, alice, video)).status_code == 200
    again = await complete(auth_client, alice, video)
    assert again.status_code == 404
    assert again.json()["error"]["code"] == "NO_ACTIVE_REVISION"
    never = await video_for(auth_client, session, alice)
    assert (await complete(auth_client, alice, never)).status_code == 404


async def test_a_revised_video_can_be_flagged_again_and_history_is_kept(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    for _ in range(3):
        await flag(auth_client, alice, video)
        await complete(auth_client, alice, video)
    await flag(auth_client, alice, video)
    assert len(await item_rows(session, active=True)) == 1
    assert len(await item_rows(session, active=False)) == 3


# --- Reading ------------------------------------------------------------------


async def test_a_video_state_before_and_after_flagging(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    before = (await auth_client.get(f"{VIDEOS}/{video.id}/revision", headers=alice.h)).json()
    assert (before["active"], before["due_at"], before["due_state"]) == (False, None, None)
    await flag(auth_client, alice, video)
    after = (await auth_client.get(f"{VIDEOS}/{video.id}/revision", headers=alice.h)).json()
    assert after["active"] is True
    assert after["learning_status"] == "NEEDS_REVISION"


async def test_the_queue_lists_the_most_urgent_first_with_counts(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    today = utc_today()
    path = await create(auth_client, alice, "DSA")
    a = await add_video(session, path["id"], 1, title="Later")
    b = await add_video(session, path["id"], 2, title="Due today, flagged first")
    c = await add_video(session, path["id"], 3, title="Due today, flagged last")
    d = await add_video(session, path["id"], 4, title="Overdue")
    await flag(auth_client, alice, a, due_at=(today + timedelta(days=3)).isoformat())
    await flag(auth_client, alice, b, due_at=today.isoformat())
    await flag(auth_client, alice, c, due_at=today.isoformat())
    # An overdue item exists only because time passed: write it as the clock would have.
    await flag(auth_client, alice, d)
    for row in await item_rows(session, active=True):
        if row.video_id == d.id:
            row.due_at = today - timedelta(days=2)
    await session.flush()

    body = await queue(auth_client, alice)
    assert [i["video"]["title"] for i in body["items"]] == [
        "Overdue",
        "Due today, flagged last",  # most recently flagged first among equals
        "Due today, flagged first",
        "Later",
    ]
    assert [i["due_state"] for i in body["items"]] == [
        "overdue",
        "due_today",
        "due_today",
        "upcoming",
    ]
    assert (body["total"], body["due_count"]) == (4, 3)
    assert body["items"][0]["path"] == {"id": path["id"], "title": "DSA"}


async def test_the_queue_is_empty_for_a_new_student(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    body = await queue(auth_client, alice)
    assert (body["items"], body["total"], body["due_count"]) == ([], 0, 0)


async def test_the_queue_follows_the_timezone_for_today(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    kiritimati = today_in(ZoneInfo("Pacific/Kiritimati"), datetime.now(UTC))
    body = await queue(auth_client, alice, timezone="Pacific/Kiritimati")
    assert body["today"] == kiritimati.isoformat()
    assert (
        await auth_client.get(QUEUE, params={"timezone": "nope"}, headers=alice.h)
    ).status_code == 422


async def test_a_video_in_two_paths_shows_the_oldest_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    first = await create(auth_client, alice, "First")
    second = await create(auth_client, alice, "Second")
    video = await add_video(session, first["id"], 1)
    session.add(
        LearningPathVideo(learning_path_id=uuid.UUID(second["id"]), video_id=video.id, position=1)
    )
    await session.flush()
    await flag(auth_client, alice, video)
    item = (await queue(auth_client, alice))["items"][0]
    assert item["path"]["title"] == "First"


async def test_a_video_outside_every_path_still_appears_without_a_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await flag(auth_client, alice, video)
    # Take it out of the path: the revision (like notes and progress) keeps it reachable.
    await session.execute(delete(LearningPathVideo).where(LearningPathVideo.video_id == video.id))
    await session.flush()
    item = (await queue(auth_client, alice))["items"][0]
    assert item["path"] is None


# --- Privacy ------------------------------------------------------------------


async def test_students_never_see_or_change_each_others_queue(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    theirs = await video_for(auth_client, session, alice, title="Alice's")
    mine = await video_for(auth_client, session, bob, title="Bob's")
    await flag(auth_client, alice, theirs)
    await flag(auth_client, bob, mine)

    assert [i["video"]["title"] for i in (await queue(auth_client, alice))["items"]] == ["Alice's"]
    assert [i["video"]["title"] for i in (await queue(auth_client, bob))["items"]] == ["Bob's"]
    assert (await complete(auth_client, bob, theirs)).status_code == 404
    assert (await flag(auth_client, bob, theirs)).status_code == 404
    assert len(await item_rows(session, active=True)) == 2


async def test_two_students_can_flag_the_same_video(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await make_user(session, bob)
    other = await create(auth_client, bob)
    session.add(
        LearningPathVideo(learning_path_id=uuid.UUID(other["id"]), video_id=video.id, position=1)
    )
    await session.flush()
    assert (await flag(auth_client, alice, video)).status_code == 200
    assert (await flag(auth_client, bob, video)).status_code == 200
    count = (await session.execute(select(func.count()).select_from(RevisionItem))).scalar_one()
    assert count == 2
