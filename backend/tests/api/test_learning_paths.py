import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningPath, LearningPathVideo, User, Video, VideoNote, VideoProgress
from tests.api.conftest import TokenFactory

BASE = "/api/v1/learning-paths"


class Actor:
    """A signed-in test user: a stable id plus a way to build request headers."""

    def __init__(self, make_token: TokenFactory, name: str) -> None:
        self.id = uuid.uuid4()
        self.email = f"{name}-{self.id.hex[:6]}@example.test"
        self._token = make_token(sub=self.id, email=self.email)

    @property
    def h(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}


@pytest.fixture
def alice(make_token: TokenFactory) -> Actor:
    return Actor(make_token, "alice")


@pytest.fixture
def bob(make_token: TokenFactory) -> Actor:
    return Actor(make_token, "bob")


async def create(
    client: httpx.AsyncClient, who: Actor, title: str = "Path", **extra: Any
) -> dict[str, Any]:
    resp = await client.post(BASE, json={"title": title, **extra}, headers=who.h)
    assert resp.status_code == 201, resp.text
    body: dict[str, Any] = resp.json()
    return body


async def add_video(
    session: AsyncSession,
    path_id: str,
    position: int,
    *,
    duration: int | None = 600,
    title: str | None = None,
) -> Video:
    video = Video(
        youtube_video_id=uuid.uuid4().hex[:11],
        title=title or f"Video {position}",
        duration_seconds=duration,
    )
    session.add(video)
    await session.flush()
    session.add(
        LearningPathVideo(learning_path_id=uuid.UUID(path_id), video_id=video.id, position=position)
    )
    await session.flush()
    return video


async def set_progress(session: AsyncSession, who: Actor, video: Video, **fields: Any) -> None:
    # The user row normally appears on first authenticated request; create it for actors who
    # only ever act through the database in a given test.
    if await session.get(User, who.id) is None:
        session.add(User(id=who.id, email=who.email))
        await session.flush()
    session.add(VideoProgress(user_id=who.id, video_id=video.id, **fields))
    await session.flush()


# --- Authentication -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "suffix"),
    [
        ("GET", ""),
        ("POST", ""),
        ("GET", f"/{uuid.uuid4()}"),
        ("PATCH", f"/{uuid.uuid4()}"),
        ("DELETE", f"/{uuid.uuid4()}"),
        ("GET", f"/{uuid.uuid4()}/videos"),
    ],
)
async def test_every_endpoint_requires_authentication(
    auth_client: httpx.AsyncClient, method: str, suffix: str
) -> None:
    resp = await auth_client.request(method, BASE + suffix, json={"title": "x"})
    assert resp.status_code == 401


# --- Create ---------------------------------------------------------------------------------


async def test_create_returns_201_with_empty_stats(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    body = await create(
        auth_client, alice, "  Data Structures  ", description="DSA", target_date="2026-12-01"
    )
    assert body["title"] == "Data Structures"  # trimmed
    assert body["description"] == "DSA"
    assert body["target_date"] == "2026-12-01"
    assert body["total_videos"] == 0
    assert body["completion_pct"] == 0.0
    assert body["last_activity_at"] is None
    uuid.UUID(body["id"])


async def test_blank_description_is_stored_as_null(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    body = await create(auth_client, alice, "P", description="   ")
    assert body["description"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {"title": "ok", "description": "d" * 2001},
        {"title": "ok", "target_date": "not-a-date"},
    ],
)
async def test_create_validation_errors_use_the_standard_shape(
    auth_client: httpx.AsyncClient, alice: Actor, payload: dict[str, Any]
) -> None:
    resp = await auth_client.post(BASE, json=payload, headers=alice.h)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    assert resp.json()["error"]["details"]


async def test_user_id_in_body_is_ignored(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    resp = await auth_client.post(
        BASE, json={"title": "Mine", "user_id": str(bob.id)}, headers=alice.h
    )
    path = await session.get(LearningPath, uuid.UUID(resp.json()["id"]))
    assert path is not None and path.user_id == alice.id


# --- List -----------------------------------------------------------------------------------


async def test_list_returns_only_my_paths(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor
) -> None:
    await create(auth_client, alice, "A1")
    await create(auth_client, alice, "A2")
    await create(auth_client, bob, "B1")

    resp = await auth_client.get(BASE, headers=alice.h)
    body = resp.json()
    assert body["total"] == 2
    assert {i["title"] for i in body["items"]} == {"A1", "A2"}
    assert (body["limit"], body["offset"]) == (20, 0)


async def test_new_user_sees_an_empty_list(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    body = (await auth_client.get(BASE, headers=alice.h)).json()
    assert body == {"total": 0, "limit": 20, "offset": 0, "items": []}


async def test_pagination(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    for n in range(5):
        await create(auth_client, alice, f"P{n}")
    page = (
        await auth_client.get(
            BASE, params={"limit": 2, "offset": 2, "sort": "name"}, headers=alice.h
        )
    ).json()
    assert page["total"] == 5
    assert [i["title"] for i in page["items"]] == ["P2", "P3"]


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}, {"sort": "x"}])
async def test_list_rejects_bad_query_params(
    auth_client: httpx.AsyncClient, alice: Actor, params: dict[str, Any]
) -> None:
    assert (await auth_client.get(BASE, params=params, headers=alice.h)).status_code == 422


async def test_search_by_title_is_case_insensitive_and_literal(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    await create(auth_client, alice, "Operating Systems")
    await create(auth_client, alice, "100% Python")
    await create(auth_client, alice, "Python_Basics")

    def titles(resp: httpx.Response) -> set[str]:
        return {i["title"] for i in resp.json()["items"]}

    assert titles(await auth_client.get(BASE, params={"q": "SYSTEMS"}, headers=alice.h)) == {
        "Operating Systems"
    }
    # % and _ are matched literally, not as wildcards.
    assert titles(await auth_client.get(BASE, params={"q": "100%"}, headers=alice.h)) == {
        "100% Python"
    }
    assert titles(await auth_client.get(BASE, params={"q": "n_b"}, headers=alice.h)) == {
        "Python_Basics"
    }


async def test_sort_by_name_and_target_date(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    await create(auth_client, alice, "banana", target_date="2026-12-01")
    await create(auth_client, alice, "Apple")
    await create(auth_client, alice, "cherry", target_date="2026-11-01")

    async def order(sort: str) -> list[str]:
        resp = await auth_client.get(BASE, params={"sort": sort}, headers=alice.h)
        return [i["title"] for i in resp.json()["items"]]

    assert await order("name") == ["Apple", "banana", "cherry"]  # case-insensitive
    assert await order("target_date") == ["cherry", "banana", "Apple"]  # no date goes last


async def test_sort_by_progress_and_recent_activity(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    low = await create(auth_client, alice, "low")
    high = await create(auth_client, alice, "high")
    idle = await create(auth_client, alice, "idle")
    now = datetime.now(UTC)

    v1 = await add_video(session, low["id"], 1)
    v2 = await add_video(session, low["id"], 2)
    await set_progress(
        session, alice, v1, ever_completed_at=now, last_watched_at=now - timedelta(days=3)
    )
    v3 = await add_video(session, high["id"], 1)
    v4 = await add_video(session, high["id"], 2)
    await set_progress(session, alice, v3, ever_completed_at=now, last_watched_at=now)
    await set_progress(session, alice, v4, ever_completed_at=now, last_watched_at=now)
    await add_video(session, idle["id"], 1)
    del v2

    async def order(sort: str) -> list[str]:
        resp = await auth_client.get(BASE, params={"sort": sort}, headers=alice.h)
        return [i["title"] for i in resp.json()["items"]]

    assert await order("progress") == ["high", "low", "idle"]  # 100%, 50%, 0%
    # Recent = last watched, falling back to creation time, so a brand-new path ranks above one
    # that was last watched three days ago.
    assert await order("recent") == ["high", "idle", "low"]


# --- Detail and stats -----------------------------------------------------------------------


async def test_detail_includes_progress_summary(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice, "Stats")
    now = datetime.now(UTC)
    done = await add_video(session, path["id"], 1)
    revising = await add_video(session, path["id"], 2)
    watching = await add_video(session, path["id"], 3)
    await add_video(session, path["id"], 4)

    await set_progress(
        session,
        alice,
        done,
        learning_status="COMPLETED",
        ever_completed_at=now,
        last_watched_at=now,
    )
    # Needs revision but completed once: still counts toward completion (PRD 7.4).
    await set_progress(
        session,
        alice,
        revising,
        learning_status="NEEDS_REVISION",
        ever_completed_at=now,
        last_watched_at=now - timedelta(hours=1),
    )
    await set_progress(session, alice, watching, learning_status="IN_PROGRESS")

    body = (await auth_client.get(f"{BASE}/{path['id']}", headers=alice.h)).json()
    assert body["total_videos"] == 4
    assert body["completed_videos"] == 2
    assert body["in_progress_videos"] == 1
    assert body["needs_revision_videos"] == 1
    assert body["completion_pct"] == 50.0
    assert body["last_activity_at"] is not None


async def test_stats_ignore_other_users_progress(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    """Bob finishing a video must not change the numbers Alice sees for the same video."""
    path = await create(auth_client, alice, "Shared video")
    video = await add_video(session, path["id"], 1)
    await set_progress(
        session,
        bob,
        video,
        learning_status="COMPLETED",
        ever_completed_at=datetime.now(UTC),
        last_watched_at=datetime.now(UTC),
    )
    body = (await auth_client.get(f"{BASE}/{path['id']}", headers=alice.h)).json()
    assert body["completed_videos"] == 0
    assert body["completion_pct"] == 0.0
    assert body["last_activity_at"] is None


async def test_unknown_and_foreign_paths_look_identical(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor
) -> None:
    foreign = await create(auth_client, bob, "Bob's")
    for suffix in ("", "/videos"):
        mine = await auth_client.get(f"{BASE}/{uuid.uuid4()}{suffix}", headers=alice.h)
        theirs = await auth_client.get(f"{BASE}/{foreign['id']}{suffix}", headers=alice.h)
        assert mine.status_code == theirs.status_code == 404
        assert mine.json() == theirs.json()


async def test_malformed_id_is_422(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    assert (await auth_client.get(f"{BASE}/nope", headers=alice.h)).status_code == 422


# --- Update ---------------------------------------------------------------------------------


async def test_patch_updates_only_the_fields_sent(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    path = await create(auth_client, alice, "Old", description="keep", target_date="2026-12-01")
    resp = await auth_client.patch(f"{BASE}/{path['id']}", json={"title": " New "}, headers=alice.h)
    body = resp.json()
    assert resp.status_code == 200
    assert body["title"] == "New"
    assert body["description"] == "keep"
    assert body["target_date"] == "2026-12-01"
    assert body["updated_at"] >= path["updated_at"]


async def test_patch_null_clears_optional_fields(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    path = await create(auth_client, alice, "P", description="d", target_date="2026-12-01")
    resp = await auth_client.patch(
        f"{BASE}/{path['id']}", json={"description": None, "target_date": None}, headers=alice.h
    )
    assert resp.json()["description"] is None
    assert resp.json()["target_date"] is None


@pytest.mark.parametrize("payload", [{"title": None}, {"title": ""}, {"target_date": "bad"}])
async def test_patch_validation_errors(
    auth_client: httpx.AsyncClient, alice: Actor, payload: dict[str, Any]
) -> None:
    path = await create(auth_client, alice, "P")
    resp = await auth_client.patch(f"{BASE}/{path['id']}", json=payload, headers=alice.h)
    assert resp.status_code == 422


async def test_cannot_patch_someone_elses_path(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor
) -> None:
    path = await create(auth_client, bob, "Bob's")
    resp = await auth_client.patch(
        f"{BASE}/{path['id']}", json={"title": "Hacked"}, headers=alice.h
    )
    assert resp.status_code == 404
    still = (await auth_client.get(f"{BASE}/{path['id']}", headers=bob.h)).json()
    assert still["title"] == "Bob's"


# --- Delete ---------------------------------------------------------------------------------


async def test_delete_removes_the_path(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    path = await create(auth_client, alice)
    assert (await auth_client.delete(f"{BASE}/{path['id']}", headers=alice.h)).status_code == 204
    assert (await auth_client.get(f"{BASE}/{path['id']}", headers=alice.h)).status_code == 404
    assert (await auth_client.delete(f"{BASE}/{path['id']}", headers=alice.h)).status_code == 404


async def test_cannot_delete_someone_elses_path(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor
) -> None:
    path = await create(auth_client, bob, "Bob's")
    assert (await auth_client.delete(f"{BASE}/{path['id']}", headers=alice.h)).status_code == 404
    assert (await auth_client.get(f"{BASE}/{path['id']}", headers=bob.h)).status_code == 200


async def test_deleting_a_path_keeps_notes_progress_and_videos(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1)
    await set_progress(session, alice, video, learning_status="IN_PROGRESS")
    session.add(VideoNote(user_id=alice.id, video_id=video.id, body="my notes"))
    await session.flush()

    await auth_client.delete(f"{BASE}/{path['id']}", headers=alice.h)

    assert (await session.get(Video, video.id)) is not None
    progress = (
        await session.execute(select(VideoProgress).where(VideoProgress.video_id == video.id))
    ).scalar_one()
    assert progress.learning_status == "IN_PROGRESS"
    note = (
        await session.execute(select(VideoNote).where(VideoNote.video_id == video.id))
    ).scalar_one()
    assert note.body == "my notes"


# --- Path videos ----------------------------------------------------------------------------


async def test_path_videos_are_ordered_with_my_progress(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    third = await add_video(session, path["id"], 3, title="third")
    first = await add_video(session, path["id"], 1, title="first")
    await add_video(session, path["id"], 2, title="second", duration=None)
    await set_progress(
        session,
        alice,
        first,
        learning_status="IN_PROGRESS",
        last_position_seconds=150,
        last_watched_at=datetime.now(UTC),
    )
    del third

    resp = await auth_client.get(f"{BASE}/{path['id']}/videos", headers=alice.h)
    body = resp.json()
    assert body["total"] == 3
    assert [i["video"]["title"] for i in body["items"]] == ["first", "second", "third"]
    assert [i["position"] for i in body["items"]] == [1, 2, 3]

    first_item, second_item, _ = body["items"]
    assert first_item["learning_status"] == "IN_PROGRESS"
    assert first_item["playback_pct"] == 25.0  # 150 / 600
    # No progress row yet: defaults, and no percentage without a known duration.
    assert second_item["learning_status"] == "NOT_STARTED"
    assert second_item["playback_pct"] is None
    assert second_item["last_position_seconds"] == 0


async def test_path_videos_do_not_leak_other_users_progress(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1)
    await set_progress(session, bob, video, learning_status="COMPLETED", last_position_seconds=500)
    item = (await auth_client.get(f"{BASE}/{path['id']}/videos", headers=alice.h)).json()["items"][
        0
    ]
    assert item["learning_status"] == "NOT_STARTED"
    assert item["last_position_seconds"] == 0


async def test_path_videos_are_paginated(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    for n in range(1, 6):
        await add_video(session, path["id"], n)
    resp = await auth_client.get(
        f"{BASE}/{path['id']}/videos", params={"limit": 2, "offset": 3}, headers=alice.h
    )
    body = resp.json()
    assert body["total"] == 5
    assert [i["position"] for i in body["items"]] == [4, 5]


async def test_progress_percentages_never_exceed_100(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1, duration=100)
    await set_progress(session, alice, video, last_position_seconds=250)
    item = (await auth_client.get(f"{BASE}/{path['id']}/videos", headers=alice.h)).json()["items"][
        0
    ]
    assert item["playback_pct"] == 100.0


async def test_target_date_round_trips_as_a_date(
    auth_client: httpx.AsyncClient, alice: Actor
) -> None:
    path = await create(auth_client, alice, target_date=date(2027, 1, 31).isoformat())
    assert path["target_date"] == "2027-01-31"
