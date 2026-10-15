import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningPathVideo, User, Video, VideoNote
from app.services.notes import MAX_NOTE_BYTES
from tests.api.helpers import Actor, add_video, create

VIDEOS = "/api/v1/videos"


async def make_user(session: AsyncSession, who: Actor) -> None:
    if await session.get(User, who.id) is None:
        session.add(User(id=who.id, email=who.email))
        await session.flush()


async def video_for(client: httpx.AsyncClient, session: AsyncSession, who: Actor) -> Video:
    path = await create(client, who)
    return await add_video(session, path["id"], 1)


async def put(
    client: httpx.AsyncClient,
    who: Actor,
    video: Video,
    body: str,
    base: int | None | str = "omit",
) -> httpx.Response:
    payload: dict[str, Any] = {"body": body}
    if base != "omit":
        payload["base_revision"] = base
    return await client.put(f"{VIDEOS}/{video.id}/notes", json=payload, headers=who.h)


async def get(client: httpx.AsyncClient, who: Actor, video: Video) -> dict[str, Any]:
    resp = await client.get(f"{VIDEOS}/{video.id}/notes", headers=who.h)
    assert resp.status_code == 200, resp.text
    out: dict[str, Any] = resp.json()
    return out


async def note_rows(session: AsyncSession) -> int:
    return (await session.execute(select(func.count()).select_from(VideoNote))).scalar_one()


# --- Authentication and access ---------------------------------------------


@pytest.mark.parametrize("method", ["GET", "PUT"])
async def test_requires_authentication(auth_client: httpx.AsyncClient, method: str) -> None:
    resp = await auth_client.request(method, f"{VIDEOS}/{uuid.uuid4()}/notes", json={"body": "x"})
    assert resp.status_code == 401


async def test_a_video_the_user_has_no_link_to_looks_like_a_missing_one(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, bob)
    await make_user(session, alice)

    theirs = await auth_client.get(f"{VIDEOS}/{video.id}/notes", headers=alice.h)
    nothing = await auth_client.get(f"{VIDEOS}/{uuid.uuid4()}/notes", headers=alice.h)
    assert theirs.status_code == nothing.status_code == 404
    assert theirs.json() == nothing.json()

    attempt = await put(auth_client, alice, video, "<p>sneaky</p>", 0)
    assert attempt.status_code == 404
    assert await note_rows(session) == 0


async def test_two_users_keep_separate_notes_on_one_video(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await make_user(session, bob)
    bobs_path = await create(auth_client, bob)
    session.add(
        LearningPathVideo(
            learning_path_id=uuid.UUID(bobs_path["id"]), video_id=video.id, position=1
        )
    )
    await session.flush()

    await put(auth_client, alice, video, "<p>alice's</p>", 0)
    await put(auth_client, bob, video, "<p>bob's</p>", 0)

    assert (await get(auth_client, alice, video))["body"] == "<p>alice's</p>"
    assert (await get(auth_client, bob, video))["body"] == "<p>bob's</p>"
    assert await note_rows(session) == 2


async def test_malformed_ids_are_422(auth_client: httpx.AsyncClient, alice: Actor) -> None:
    assert (await auth_client.get(f"{VIDEOS}/nope/notes", headers=alice.h)).status_code == 422


# --- Reading ---------------------------------------------------------------


async def test_a_video_without_a_note_reads_as_empty_and_creates_nothing(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    body = await get(auth_client, alice, video)
    assert body == {"video_id": str(video.id), "body": "", "revision": 0, "updated_at": None}
    assert await note_rows(session) == 0


# --- Saving ----------------------------------------------------------------


async def test_first_save_creates_revision_one_and_it_round_trips(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await put(auth_client, alice, video, "<p>Binary search halves the range.</p>", 0)

    assert resp.status_code == 200
    body = resp.json()
    assert body["revision"] == 1
    assert body["body"] == "<p>Binary search halves the range.</p>"
    assert body["updated_at"] is not None
    assert await get(auth_client, alice, video) == body


async def test_each_save_bumps_the_revision(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    first = (await put(auth_client, alice, video, "<p>one</p>", 0)).json()
    second = (await put(auth_client, alice, video, "<p>two</p>", first["revision"])).json()
    third = (await put(auth_client, alice, video, "<p>three</p>", second["revision"])).json()
    assert [first["revision"], second["revision"], third["revision"]] == [1, 2, 3]
    assert (await get(auth_client, alice, video))["body"] == "<p>three</p>"
    assert await note_rows(session) == 1  # one primary note per user and video


async def test_unicode_survives(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    text = "<p>Café ☕ — 日本語 🙂</p>"
    await put(auth_client, alice, video, text, 0)
    assert (await get(auth_client, alice, video))["body"] == text


async def test_clearing_a_note_is_a_real_save_not_a_deletion(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    first = (await put(auth_client, alice, video, "<p>text</p>", 0)).json()
    cleared = (await put(auth_client, alice, video, "", first["revision"])).json()
    assert cleared["body"] == "" and cleared["revision"] == 2
    assert await note_rows(session) == 1


async def test_unconditional_saves_overwrite_and_still_bump_the_revision(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await put(auth_client, alice, video, "<p>one</p>")  # no base_revision at all
    again = (await put(auth_client, alice, video, "<p>two</p>", None)).json()
    assert (again["body"], again["revision"]) == ("<p>two</p>", 2)


# --- Conflicts: another tab or device saved in between ---------------------


async def test_a_stale_save_is_refused_and_nothing_is_overwritten(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await put(auth_client, alice, video, "<p>v1</p>", 0)
    # Another tab saves revision 2 ...
    await put(auth_client, alice, video, "<p>from the other tab</p>", 1)

    # ... then this tab, still on revision 1, tries to save.
    stale = await put(auth_client, alice, video, "<p>my older view</p>", 1)

    assert stale.status_code == 409
    error = stale.json()["error"]
    assert error["code"] == "NOTE_CONFLICT"
    current = error["details"][0]["current"]
    assert current["body"] == "<p>from the other tab</p>"
    assert current["revision"] == 2
    assert (await get(auth_client, alice, video))["body"] == "<p>from the other tab</p>"


async def test_creating_over_an_existing_note_is_a_conflict(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await put(auth_client, alice, video, "<p>already here</p>", 0)
    clash = await put(auth_client, alice, video, "<p>I thought it was empty</p>", 0)
    assert clash.status_code == 409
    assert clash.json()["error"]["details"][0]["current"]["body"] == "<p>already here</p>"


async def test_a_revision_from_the_future_is_a_conflict(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await put(auth_client, alice, video, "<p>x</p>", 7)
    assert resp.status_code == 409
    assert await note_rows(session) == 0


async def test_resolving_a_conflict_with_the_new_revision_works(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await put(auth_client, alice, video, "<p>v1</p>", 0)
    await put(auth_client, alice, video, "<p>other</p>", 1)
    stale = await put(auth_client, alice, video, "<p>mine</p>", 1)
    revision = stale.json()["error"]["details"][0]["current"]["revision"]

    keep_mine = await put(auth_client, alice, video, "<p>mine</p>", revision)
    assert keep_mine.status_code == 200
    assert keep_mine.json()["revision"] == 3


async def test_retrying_a_save_that_already_went_through_is_not_a_conflict(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    """The response to a save is lost; the client retries with the same base revision."""
    video = await video_for(auth_client, session, alice)
    first = await put(auth_client, alice, video, "<p>same text</p>", 0)
    retry = await put(auth_client, alice, video, "<p>same text</p>", 0)

    assert first.status_code == retry.status_code == 200
    assert retry.json() == first.json()
    assert retry.json()["revision"] == 1  # not bumped a second time


# --- Limits and sanitising -------------------------------------------------


async def test_a_note_at_the_size_limit_saves_and_one_byte_over_does_not(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    ok = await put(auth_client, alice, video, "a" * MAX_NOTE_BYTES, 0)
    assert ok.status_code == 200

    too_big = await put(auth_client, alice, video, "a" * (MAX_NOTE_BYTES + 1), 1)
    assert too_big.status_code == 422
    assert too_big.json()["error"]["code"] == "NOTE_TOO_LARGE"
    assert "100 KB" in too_big.json()["error"]["message"]
    assert (await get(auth_client, alice, video))["revision"] == 1  # the good one is intact


async def test_dangerous_markup_is_stripped_before_storing(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    dirty = (
        '<p onclick="x()">Hello</p><script>alert(1)</script>'
        '<a href="javascript:alert(1)">bad</a><a href="https://ok.test">good</a>'
    )
    saved = (await put(auth_client, alice, video, dirty, 0)).json()

    assert "<script" not in saved["body"] and "alert" not in saved["body"]
    assert "onclick" not in saved["body"] and "javascript:" not in saved["body"]
    assert 'href="https://ok.test"' in saved["body"]
    assert (await get(auth_client, alice, video))["body"] == saved["body"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"body": 5},
        {"body": None},
        {"body": "x", "base_revision": -1},
        {"body": "x", "base_revision": "one"},
    ],
)
async def test_invalid_requests_are_422_and_write_nothing(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    session: AsyncSession,
    payload: dict[str, Any],
) -> None:
    video = await video_for(auth_client, session, alice)
    resp = await auth_client.put(f"{VIDEOS}/{video.id}/notes", json=payload, headers=alice.h)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    assert await note_rows(session) == 0


# --- Durability and effects on other views ---------------------------------


async def test_a_note_outlives_its_video_leaving_every_path(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    path = await create(auth_client, alice)
    video = await add_video(session, path["id"], 1)
    await put(auth_client, alice, video, "<p>keep me</p>", 0)

    await auth_client.delete(
        f"/api/v1/learning-paths/{path['id']}/videos/{video.id}", headers=alice.h
    )

    # The video is no longer in a path, but the note keeps it reachable.
    assert (await get(auth_client, alice, video))["body"] == "<p>keep me</p>"


async def test_failures_are_counted_without_identifying_labels(
    auth_client: httpx.AsyncClient,
    alice: Actor,
    session: AsyncSession,
    client: httpx.AsyncClient,
) -> None:
    video = await video_for(auth_client, session, alice)
    await put(auth_client, alice, video, "<p>a</p>", 0)
    await put(auth_client, alice, video, "<p>b</p>", 0)  # conflict
    await put(auth_client, alice, video, "x" * (MAX_NOTE_BYTES + 1), 1)  # too large

    metrics = (await client.get("/metrics")).text
    assert 'app_note_save_failures_total{failure_type="conflict"}' in metrics
    assert 'app_note_save_failures_total{failure_type="too_large"}' in metrics
    assert str(video.id) not in metrics
