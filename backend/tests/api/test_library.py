import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    LearningPath,
    LearningPathVideo,
    SavedVideo,
    User,
    Video,
    VideoNote,
    VideoProgress,
)
from tests.api.helpers import Actor, add_video, create

NOTES = "/api/v1/notes"
SAVED = "/api/v1/saved-videos"
VIDEOS = "/api/v1/videos"


async def make_user(session: AsyncSession, who: Actor) -> None:
    if await session.get(User, who.id) is None:
        session.add(User(id=who.id, email=who.email))
        await session.flush()


async def put_note(
    client: httpx.AsyncClient, who: Actor, video: Video, html: str
) -> httpx.Response:
    return await client.put(f"{VIDEOS}/{video.id}/notes", json={"body": html}, headers=who.h)


async def notes(client: httpx.AsyncClient, who: Actor, **params: Any) -> dict[str, Any]:
    resp = await client.get(NOTES, params=params, headers=who.h)
    assert resp.status_code == 200, resp.text
    body: dict[str, Any] = resp.json()
    return body


async def saved(client: httpx.AsyncClient, who: Actor, **params: Any) -> dict[str, Any]:
    resp = await client.get(SAVED, params=params, headers=who.h)
    assert resp.status_code == 200, resp.text
    body: dict[str, Any] = resp.json()
    return body


def titles(body: dict[str, Any]) -> list[str]:
    return [i["video"]["title"] for i in body["items"]]


# --- Authentication -----------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("GET", NOTES),
        ("GET", SAVED),
        ("GET", f"{VIDEOS}/{uuid.uuid4()}/saved"),
        ("PUT", f"{VIDEOS}/{uuid.uuid4()}/saved"),
        ("DELETE", f"{VIDEOS}/{uuid.uuid4()}/saved"),
    ],
)
async def test_requires_authentication(
    auth_client: httpx.AsyncClient, method: str, url: str
) -> None:
    assert (await auth_client.request(method, url)).status_code == 401


# --- My Notes -----------------------------------------------------------------


async def test_lists_notes_with_a_title_snippet_video_and_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice, "Algorithms")
    video = await add_video(session, path["id"], 1, title="Binary Search")
    await put_note(auth_client, alice, video, "<h1>Halving</h1><p>Cut the range in half.</p>")

    body = await notes(auth_client, alice)
    assert body["total"] == 1
    (item,) = body["items"]
    assert item["title"] == "Halving"
    assert item["snippet"] == "Cut the range in half."
    assert item["video"]["title"] == "Binary Search"
    assert item["path"] == {"id": path["id"], "title": "Algorithms"}
    assert item["revision"] == 1


async def test_newest_edit_first(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    a = await add_video(session, path["id"], 1, title="A")
    b = await add_video(session, path["id"], 2, title="B")
    await put_note(auth_client, alice, a, "<p>first</p>")
    await put_note(auth_client, alice, b, "<p>second</p>")
    await put_note(auth_client, alice, a, "<p>first, edited</p>")  # A edited last
    assert titles(await notes(auth_client, alice)) == ["A", "B"]


async def test_notes_without_text_are_left_out(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    for i, html in enumerate(["", "<p></p>", "<p> <br> </p>", "<p>Real</p>"], start=1):
        v = await add_video(session, path["id"], i, title=f"V{i}")
        await put_note(auth_client, alice, v, html)
    body = await notes(auth_client, alice)
    assert titles(body) == ["V4"]
    assert body["total"] == 1


async def test_search_matches_the_text_not_the_markup_and_ignores_case(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    a = await add_video(session, path["id"], 1, title="Search")
    b = await add_video(session, path["id"], 2, title="Sorting")
    await put_note(auth_client, alice, a, "<p>Binary <strong>SEARCH</strong> halves it</p>")
    await put_note(auth_client, alice, b, "<p>Merge sort</p>")

    assert titles(await notes(auth_client, alice, q="search")) == ["Search"]
    assert titles(await notes(auth_client, alice, q="  MERGE ")) == ["Sorting"]
    # Words that only exist as tags never match.
    assert (await notes(auth_client, alice, q="strong"))["total"] == 0
    assert (await notes(auth_client, alice, q="<p>"))["total"] == 0


@pytest.mark.parametrize("term", ["100%", "a_b", "50\\50"])
async def test_search_treats_wildcards_as_plain_text(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession, term: str
) -> None:
    path = await create(auth_client, alice)
    exact = await add_video(session, path["id"], 1, title="Exact")
    other = await add_video(session, path["id"], 2, title="Other")
    await put_note(auth_client, alice, exact, f"<p>about {term} here</p>")
    await put_note(auth_client, alice, other, "<p>about 1000 axb here</p>")
    assert titles(await notes(auth_client, alice, q=term)) == ["Exact"]


async def test_filter_by_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    first = await create(auth_client, alice, "First")
    second = await create(auth_client, alice, "Second")
    a = await add_video(session, first["id"], 1, title="In first")
    b = await add_video(session, second["id"], 1, title="In second")
    await put_note(auth_client, alice, a, "<p>one</p>")
    await put_note(auth_client, alice, b, "<p>two</p>")

    assert titles(await notes(auth_client, alice, path_id=first["id"])) == ["In first"]
    assert titles(await notes(auth_client, alice, path_id=second["id"], q="two")) == ["In second"]
    assert (await notes(auth_client, alice, path_id=second["id"], q="one"))["total"] == 0


async def test_another_students_path_matches_nothing(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    mine = await create(auth_client, alice)
    video = await add_video(session, mine["id"], 1)
    await put_note(auth_client, alice, video, "<p>mine</p>")
    await make_user(session, bob)
    theirs = await create(auth_client, bob)
    assert (await notes(auth_client, bob, path_id=mine["id"]))["total"] == 0
    assert (await notes(auth_client, alice, path_id=theirs["id"]))["total"] == 0


async def test_a_note_stays_listed_after_its_video_leaves_every_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1, title="Orphan")
    await put_note(auth_client, alice, video, "<p>keep me</p>")
    video.availability_state = "unavailable"
    await session.execute(delete(LearningPathVideo).where(LearningPathVideo.video_id == video.id))
    await session.flush()
    (item,) = (await notes(auth_client, alice))["items"]
    assert item["path"] is None
    assert item["video"]["availability_state"] == "unavailable"


async def test_pagination(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    for i in range(1, 5):
        v = await add_video(session, path["id"], i, title=f"V{i}")
        await put_note(auth_client, alice, v, f"<p>note {i}</p>")
    page = await notes(auth_client, alice, limit=2, offset=2)
    assert (page["total"], page["limit"], page["offset"], len(page["items"])) == (4, 2, 2, 2)
    assert (await auth_client.get(NOTES, params={"limit": 101}, headers=alice.h)).status_code == 422


async def test_students_only_see_their_own_notes(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1, title="Shared")
    await put_note(auth_client, alice, video, "<p>alice's secret</p>")
    await make_user(session, bob)
    other = await create(auth_client, bob)
    session.add(
        LearningPathVideo(learning_path_id=uuid.UUID(other["id"]), video_id=video.id, position=1)
    )
    await session.flush()
    assert (await notes(auth_client, bob))["items"] == []
    assert (await notes(auth_client, bob, q="secret"))["total"] == 0
    assert len((await notes(auth_client, alice))["items"]) == 1


async def test_a_note_body_in_the_database_is_not_changed_by_listing(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1)
    await put_note(auth_client, alice, video, "<h1>T</h1><p>x</p>")
    await notes(auth_client, alice)
    body = (await session.execute(select(VideoNote.body))).scalar_one()
    assert body == "<h1>T</h1><p>x</p>"


# --- Saving videos ------------------------------------------------------------


async def video_in_path(
    client: httpx.AsyncClient, session: AsyncSession, who: Actor, title: str = "Video", **kw: Any
) -> tuple[dict[str, Any], Video]:
    path = await create(client, who, kw.pop("path_title", "Path"))
    return path, await add_video(session, path["id"], 1, title=title, **kw)


async def test_save_and_unsave(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    before = await auth_client.get(f"{VIDEOS}/{video.id}/saved", headers=alice.h)
    assert before.json()["saved"] is False

    done = await auth_client.put(f"{VIDEOS}/{video.id}/saved", headers=alice.h)
    assert done.status_code == 200
    assert done.json()["saved"] is True
    assert (await auth_client.get(f"{VIDEOS}/{video.id}/saved", headers=alice.h)).json()["saved"]

    gone = await auth_client.delete(f"{VIDEOS}/{video.id}/saved", headers=alice.h)
    assert gone.status_code == 204
    assert (await auth_client.get(f"{VIDEOS}/{video.id}/saved", headers=alice.h)).json()[
        "saved"
    ] is False


async def test_saving_twice_keeps_the_first_time_and_unsaving_twice_is_fine(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    first = (await auth_client.put(f"{VIDEOS}/{video.id}/saved", headers=alice.h)).json()
    second = (await auth_client.put(f"{VIDEOS}/{video.id}/saved", headers=alice.h)).json()
    assert first["saved_at"] == second["saved_at"]
    count = (await session.execute(select(func.count()).select_from(SavedVideo))).scalar_one()
    assert count == 1
    assert (
        await auth_client.delete(f"{VIDEOS}/{video.id}/saved", headers=alice.h)
    ).status_code == 204
    assert (
        await auth_client.delete(f"{VIDEOS}/{video.id}/saved", headers=alice.h)
    ).status_code == 204
    assert (
        await auth_client.delete(f"{VIDEOS}/{uuid.uuid4()}/saved", headers=alice.h)
    ).status_code == 204


async def test_a_video_the_user_cannot_open_cannot_be_saved(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    _, theirs = await video_in_path(auth_client, session, bob)
    await make_user(session, alice)
    mine = await auth_client.put(f"{VIDEOS}/{theirs.id}/saved", headers=alice.h)
    ghost = await auth_client.put(f"{VIDEOS}/{uuid.uuid4()}/saved", headers=alice.h)
    assert mine.status_code == ghost.status_code == 404
    assert mine.json() == ghost.json()
    assert (await saved(auth_client, alice))["total"] == 0


async def test_unsaving_changes_nothing_else(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path, video = await video_in_path(auth_client, session, alice)
    await put_note(auth_client, alice, video, "<p>keep</p>")
    await auth_client.put(
        f"{VIDEOS}/{video.id}/progress", json={"last_position_seconds": 90}, headers=alice.h
    )
    await auth_client.put(f"{VIDEOS}/{video.id}/saved", headers=alice.h)
    await auth_client.delete(f"{VIDEOS}/{video.id}/saved", headers=alice.h)

    assert (await notes(auth_client, alice))["total"] == 1
    progress = (await session.execute(select(VideoProgress))).scalar_one()
    assert progress.last_position_seconds == 90
    member = (
        await session.execute(select(func.count()).select_from(LearningPathVideo))
    ).scalar_one()
    assert member == 1


async def test_a_saved_video_stays_openable_after_it_leaves_its_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    _, video = await video_in_path(auth_client, session, alice)
    await auth_client.put(f"{VIDEOS}/{video.id}/saved", headers=alice.h)
    await session.execute(delete(LearningPathVideo).where(LearningPathVideo.video_id == video.id))
    await session.flush()
    assert (await auth_client.get(f"{VIDEOS}/{video.id}", headers=alice.h)).status_code == 200
    (item,) = (await saved(auth_client, alice))["items"]
    assert item["path"] is None


# --- The saved list -----------------------------------------------------------


async def seed_saved(
    client: httpx.AsyncClient, session: AsyncSession, who: Actor
) -> dict[str, Video]:
    path = await create(client, who, "DSA")
    out: dict[str, Video] = {}
    now = datetime.now(UTC)
    spec = [
        ("Fresh", None, None),
        ("Going", "IN_PROGRESS", now - timedelta(hours=1)),
        ("Done", "COMPLETED", now - timedelta(days=3)),
        ("Flagged", "NEEDS_REVISION", now - timedelta(days=1)),
    ]
    await make_user(session, who)
    for i, (title, status, watched) in enumerate(spec, start=1):
        out[title] = await add_video(session, path["id"], i, title=title, duration=600)
        if status:
            session.add(
                VideoProgress(
                    user_id=who.id,
                    video_id=out[title].id,
                    learning_status=status,
                    last_position_seconds=300.0,
                    last_watched_at=watched,
                )
            )
        await session.flush()
        await client.put(f"{VIDEOS}/{out[title].id}/saved", headers=who.h)
    return out


async def test_the_list_shows_progress_status_and_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    await seed_saved(auth_client, session, alice)
    body = await saved(auth_client, alice)
    by_title = {i["video"]["title"]: i for i in body["items"]}
    assert body["total"] == 4
    assert by_title["Fresh"]["learning_status"] == "NOT_STARTED"
    assert by_title["Fresh"]["last_watched_at"] is None
    assert by_title["Going"]["learning_status"] == "IN_PROGRESS"
    assert by_title["Going"]["playback_pct"] == 50.0
    assert by_title["Going"]["path"]["title"] == "DSA"
    assert by_title["Going"]["saved_at"]


async def test_default_order_is_the_newest_bookmark_first(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    await seed_saved(auth_client, session, alice)
    assert titles(await saved(auth_client, alice)) == ["Flagged", "Done", "Going", "Fresh"]


async def test_sort_by_recently_watched_puts_never_watched_last(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    await seed_saved(auth_client, session, alice)
    assert titles(await saved(auth_client, alice, sort="watched")) == [
        "Going",
        "Flagged",
        "Done",
        "Fresh",
    ]


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("IN_PROGRESS", ["Going"]),
        ("COMPLETED", ["Done"]),
        ("NEEDS_REVISION", ["Flagged"]),
        ("NOT_STARTED", ["Fresh"]),
    ],
)
async def test_filter_by_learning_status(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    session: AsyncSession,
    status: str,
    expected: list[str],
) -> None:
    await seed_saved(auth_client, session, alice)
    body = await saved(auth_client, alice, status=status)
    assert titles(body) == expected
    assert body["total"] == 1


async def test_invalid_filters_are_rejected(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    for params in ({"status": "DONE"}, {"sort": "random"}, {"limit": 0}, {"limit": 101}):
        assert (await auth_client.get(SAVED, params=params, headers=alice.h)).status_code == 422


async def test_students_only_see_their_own_bookmarks_and_progress(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    videos = await seed_saved(auth_client, session, alice)
    await make_user(session, bob)
    other = await create(auth_client, bob)
    session.add(
        LearningPathVideo(
            learning_path_id=uuid.UUID(other["id"]), video_id=videos["Going"].id, position=1
        )
    )
    await session.flush()
    await auth_client.put(f"{VIDEOS}/{videos['Going'].id}/saved", headers=bob.h)

    # Bob saved the same video but sees none of Alice's progress or other bookmarks.
    (item,) = (await saved(auth_client, bob))["items"]
    assert item["learning_status"] == "NOT_STARTED"
    assert item["last_position_seconds"] == 0
    assert (await saved(auth_client, alice))["total"] == 4


async def test_pagination_of_the_saved_list(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    await seed_saved(auth_client, session, alice)
    page = await saved(auth_client, alice, limit=2, offset=1)
    assert (page["total"], len(page["items"])) == (4, 2)
    assert titles(page) == ["Done", "Going"]


async def test_path_ref_exists_only_for_the_students_own_paths(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    videos = await seed_saved(auth_client, session, alice)
    path = await session.get(
        LearningPath, (await session.execute(select(LearningPath.id))).scalar_one()
    )
    assert path is not None
    assert all(i["path"]["id"] == str(path.id) for i in (await saved(auth_client, alice))["items"])
    assert videos
