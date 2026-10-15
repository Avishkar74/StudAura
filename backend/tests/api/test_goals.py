import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningPathVideo, User, Video, ViewingSession
from app.services.goals import local_day_bounds, today_in
from tests.api.helpers import Actor, add_video, create

GOALS = "/api/v1/goals"
SESSIONS = "/api/v1/viewing-sessions"


async def make_user(session: AsyncSession, who: Actor) -> None:
    if await session.get(User, who.id) is None:
        session.add(User(id=who.id, email=who.email))
        await session.flush()


async def video_for(client: httpx.AsyncClient, session: AsyncSession, who: Actor) -> Video:
    path = await create(client, who)
    return await add_video(session, path["id"], 1)


async def ping(
    client: httpx.AsyncClient,
    who: Actor,
    video: Video,
    started_at: datetime,
    watched: int,
) -> httpx.Response:
    return await client.post(
        SESSIONS,
        json={
            "video_id": str(video.id),
            "started_at": started_at.isoformat(),
            "watched_seconds": watched,
        },
        headers=who.h,
    )


async def goal(client: httpx.AsyncClient, who: Actor, **params: str) -> dict[str, Any]:
    resp = await client.get(GOALS, params=params, headers=who.h)
    assert resp.status_code == 200, resp.text
    body: dict[str, Any] = resp.json()
    return body


async def session_rows(session: AsyncSession) -> list[ViewingSession]:
    return list((await session.execute(select(ViewingSession))).scalars())


# --- Authentication ---------------------------------------------------------


@pytest.mark.parametrize(("method", "url"), [("GET", GOALS), ("PUT", GOALS), ("POST", SESSIONS)])
async def test_requires_authentication(
    auth_client: httpx.AsyncClient, method: str, url: str
) -> None:
    assert (await auth_client.request(method, url, json={})).status_code == 401


# --- The goal ---------------------------------------------------------------


async def test_no_goal_yet(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    body = await goal(auth_client, alice)
    assert body["daily_target_minutes"] is None
    assert body["timezone"] == "UTC"
    assert body["today_watched_seconds"] == 0
    assert body["goal_achieved"] is False


async def test_set_and_change_the_goal(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    first = await auth_client.put(
        GOALS, json={"daily_target_minutes": 60, "timezone": "Asia/Kolkata"}, headers=alice.h
    )
    assert first.status_code == 200
    assert first.json()["daily_target_minutes"] == 60
    assert first.json()["timezone"] == "Asia/Kolkata"

    again = await auth_client.put(
        GOALS, json={"daily_target_minutes": 90, "timezone": "UTC"}, headers=alice.h
    )
    assert again.json()["daily_target_minutes"] == 90
    stored = await goal(auth_client, alice)
    assert (stored["daily_target_minutes"], stored["timezone"]) == (90, "UTC")


@pytest.mark.parametrize(
    "body",
    [
        {"daily_target_minutes": 0, "timezone": "UTC"},
        {"daily_target_minutes": -5, "timezone": "UTC"},
        {"daily_target_minutes": 1441, "timezone": "UTC"},
        {"daily_target_minutes": 60, "timezone": "Mars/Olympus"},
        {"daily_target_minutes": 60, "timezone": ""},
        {"timezone": "UTC"},
    ],
)
async def test_invalid_goals_are_rejected(
    auth_client: httpx.AsyncClient, alice: Actor, body: dict[str, Any]
) -> None:
    assert (await auth_client.put(GOALS, json=body, headers=alice.h)).status_code == 422
    assert (await goal(auth_client, alice))["daily_target_minutes"] is None


async def test_the_browser_timezone_is_used_until_a_goal_is_set(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    assert (await goal(auth_client, alice, timezone="Asia/Kolkata"))["timezone"] == "Asia/Kolkata"
    bad = await auth_client.get(GOALS, params={"timezone": "nope"}, headers=alice.h)
    assert bad.status_code == 422


async def test_users_have_separate_goals(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor
) -> None:
    await auth_client.put(
        GOALS, json={"daily_target_minutes": 45, "timezone": "UTC"}, headers=alice.h
    )
    assert (await goal(auth_client, bob))["daily_target_minutes"] is None


# --- Recording viewing time -------------------------------------------------


async def test_a_ping_creates_a_session(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    started = datetime.now(UTC) - timedelta(minutes=5)
    resp = await ping(auth_client, alice, video, started, 120)
    assert resp.status_code == 200
    assert resp.json() == {"watched_seconds": 120}
    rows = await session_rows(session)
    assert len(rows) == 1
    assert rows[0].watched_seconds == 120
    assert rows[0].user_id == alice.id


async def test_repeating_a_ping_does_not_double_count(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    started = datetime.now(UTC) - timedelta(minutes=5)
    for _ in range(4):
        assert (await ping(auth_client, alice, video, started, 120)).json() == {
            "watched_seconds": 120
        }
    assert len(await session_rows(session)) == 1
    assert (await goal(auth_client, alice))["today_watched_seconds"] == 120


async def test_a_later_ping_raises_the_total_and_an_older_one_cannot_lower_it(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    started = datetime.now(UTC) - timedelta(minutes=30)
    await ping(auth_client, alice, video, started, 120)
    assert (await ping(auth_client, alice, video, started, 600)).json()["watched_seconds"] == 600
    late = await ping(auth_client, alice, video, started, 300)  # arrives out of order
    assert late.json()["watched_seconds"] == 600
    assert (await goal(auth_client, alice))["today_watched_seconds"] == 600


async def test_pings_in_the_same_minute_share_a_session(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    base = (datetime.now(UTC) - timedelta(minutes=20)).replace(second=2, microsecond=0)
    await ping(auth_client, alice, video, base, 100)
    await ping(auth_client, alice, video, base + timedelta(seconds=40), 200)
    rows = await session_rows(session)
    assert len(rows) == 1
    assert rows[0].watched_seconds == 200


async def test_watched_time_cannot_exceed_the_time_since_the_session_began(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    started = datetime.now(UTC) - timedelta(seconds=30)
    credited = (await ping(auth_client, alice, video, started, 86400)).json()["watched_seconds"]
    assert 30 <= credited <= 40


@pytest.mark.parametrize(
    "offset", [timedelta(minutes=30), timedelta(days=-8)], ids=["future", "too_old"]
)
async def test_an_implausible_start_is_rejected(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    session: AsyncSession,
    offset: timedelta,
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await ping(auth_client, alice, video, datetime.now(UTC) + offset, 60)
    assert resp.status_code == 422
    assert await session_rows(session) == []


@pytest.mark.parametrize("watched", [-1, 86401])
async def test_out_of_range_watched_seconds_are_rejected(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession, watched: int
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await ping(auth_client, alice, video, datetime.now(UTC) - timedelta(hours=1), watched)
    assert resp.status_code == 422


async def test_a_start_without_a_timezone_is_rejected(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await auth_client.post(
        SESSIONS,
        json={"video_id": str(video.id), "started_at": "2026-10-15T09:00:00", "watched_seconds": 5},
        headers=alice.h,
    )
    assert resp.status_code == 422


async def test_a_video_the_user_has_no_link_to_looks_like_a_missing_one(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, bob)
    await make_user(session, alice)
    started = datetime.now(UTC) - timedelta(minutes=5)
    theirs = await ping(auth_client, alice, video, started, 60)
    ghost = await auth_client.post(
        SESSIONS,
        json={
            "video_id": str(uuid.uuid4()),
            "started_at": started.isoformat(),
            "watched_seconds": 60,
        },
        headers=alice.h,
    )
    assert theirs.status_code == ghost.status_code == 404
    assert theirs.json() == ghost.json()
    assert await session_rows(session) == []


# --- Today's total ----------------------------------------------------------


async def test_total_adds_up_sessions_across_videos_and_includes_rewatching(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    one = await video_for(auth_client, session, alice)
    two = await video_for(auth_client, session, alice)
    started = datetime.now(UTC) - timedelta(hours=2)
    await ping(auth_client, alice, one, started, 600)
    await ping(auth_client, alice, two, started, 900)
    await ping(auth_client, alice, one, started + timedelta(minutes=30), 300)  # a rewatch
    body = await goal(auth_client, alice)
    assert body["today_watched_seconds"] == 1800


async def test_goal_is_achieved_once_the_target_is_reached(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await auth_client.put(
        GOALS, json={"daily_target_minutes": 10, "timezone": "UTC"}, headers=alice.h
    )
    started = datetime.now(UTC) - timedelta(hours=2)
    await ping(auth_client, alice, video, started, 599)
    assert (await goal(auth_client, alice))["goal_achieved"] is False
    await ping(auth_client, alice, video, started, 650)  # the target can be exceeded
    body = await goal(auth_client, alice)
    assert body["goal_achieved"] is True
    assert body["today_watched_seconds"] == 650


async def test_only_sessions_that_started_today_in_the_users_timezone_count(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    tz = ZoneInfo("Asia/Kolkata")
    await auth_client.put(
        GOALS, json={"daily_target_minutes": 60, "timezone": "Asia/Kolkata"}, headers=alice.h
    )
    today = today_in(tz, datetime.now(UTC))
    start, _ = local_day_bounds(tz, today)

    def row(at: datetime, seconds: int) -> ViewingSession:
        return ViewingSession(
            user_id=alice.id,
            video_id=video.id,
            started_at=at,
            watched_seconds=seconds,
            idempotency_key=f"k-{uuid.uuid4()}",
        )

    session.add_all(
        [
            row(start - timedelta(minutes=1), 1000),  # 23:59 yesterday, local
            row(start, 200),  # 00:00 today, local
            row(start + timedelta(minutes=1), 30),
        ]
    )
    await session.flush()
    assert (await goal(auth_client, alice))["today_watched_seconds"] == 230


async def test_users_never_see_each_others_time(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await make_user(session, bob)
    started = datetime.now(UTC) - timedelta(hours=1)
    await ping(auth_client, alice, video, started, 500)
    assert (await goal(auth_client, bob))["today_watched_seconds"] == 0
    assert (await goal(auth_client, alice))["today_watched_seconds"] == 500


async def test_two_users_can_record_the_same_minute_on_one_video(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await make_user(session, bob)
    # Bob can open the video once it is in one of his paths too.
    other = await create(auth_client, bob)
    session.add(
        LearningPathVideo(learning_path_id=uuid.UUID(other["id"]), video_id=video.id, position=1)
    )
    await session.flush()
    started = datetime.now(UTC) - timedelta(minutes=10)
    assert (await ping(auth_client, alice, video, started, 100)).status_code == 200
    assert (await ping(auth_client, bob, video, started, 300)).json() == {"watched_seconds": 300}
    total = (await session.execute(select(func.count()).select_from(ViewingSession))).scalar_one()
    assert total == 2


async def test_the_week_total_covers_the_last_seven_days_including_today(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    tz = ZoneInfo("UTC")
    today = today_in(tz, datetime.now(UTC))
    start, _ = local_day_bounds(tz, today)

    def row(at: datetime, seconds: int) -> ViewingSession:
        return ViewingSession(
            user_id=alice.id,
            video_id=video.id,
            started_at=at,
            watched_seconds=seconds,
            idempotency_key=f"k-{uuid.uuid4()}",
        )

    session.add_all(
        [
            row(start + timedelta(minutes=1), 100),  # today
            row(start - timedelta(days=6) + timedelta(minutes=1), 20),  # six days ago: counted
            row(start - timedelta(days=7) + timedelta(minutes=1), 5000),  # a week ago: not
        ]
    )
    await session.flush()
    body = await goal(auth_client, alice)
    assert body["today_watched_seconds"] == 100
    assert body["week_watched_seconds"] == 120
