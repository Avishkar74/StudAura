import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Video, VideoComment
from tests.api.helpers import Actor, add_video, create

VIDEOS = "/api/v1/videos"


async def make_user(session: AsyncSession, who: Actor) -> None:
    if await session.get(User, who.id) is None:
        session.add(User(id=who.id, email=who.email))
        await session.flush()


async def video_for(
    client: httpx.AsyncClient, session: AsyncSession, who: Actor, duration: int | None = 600
) -> Video:
    path = await create(client, who)
    return await add_video(session, path["id"], 1, duration=duration)


async def post(client: httpx.AsyncClient, who: Actor, video: Video, **body: Any) -> httpx.Response:
    return await client.post(f"{VIDEOS}/{video.id}/comments", json=body, headers=who.h)


async def count(session: AsyncSession) -> int:
    return (await session.execute(select(func.count()).select_from(VideoComment))).scalar_one()


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("GET", f"{VIDEOS}/{uuid.uuid4()}/comments"),
        ("POST", f"{VIDEOS}/{uuid.uuid4()}/comments"),
        ("DELETE", f"/api/v1/comments/{uuid.uuid4()}"),
    ],
)
async def test_requires_authentication(
    auth_client: httpx.AsyncClient, method: str, url: str
) -> None:
    assert (await auth_client.request(method, url, json={"body": "x"})).status_code == 401


async def test_add_list_and_delete(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)

    first = await post(auth_client, alice, video, body="  Key idea  ", timestamp_seconds=90)
    assert first.status_code == 201
    assert first.json()["body"] == "Key idea"
    assert first.json()["timestamp_seconds"] == 90
    second = await post(auth_client, alice, video, body="General thought")
    assert second.json()["timestamp_seconds"] is None

    listed = await auth_client.get(f"{VIDEOS}/{video.id}/comments", headers=alice.h)
    assert [c["body"] for c in listed.json()] == ["General thought", "Key idea"]  # newest first

    gone = await auth_client.delete(f"/api/v1/comments/{first.json()['id']}", headers=alice.h)
    assert gone.status_code == 204
    assert await count(session) == 1
    again = await auth_client.delete(f"/api/v1/comments/{first.json()['id']}", headers=alice.h)
    assert again.status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"body": ""},
        {"body": "   "},
        {"body": "x" * 2001},
        {"body": "ok", "timestamp_seconds": -1},
        {"body": "ok", "timestamp_seconds": 601},  # video is 600 s long
    ],
)
async def test_invalid_comments_are_rejected(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession, body: dict[str, Any]
) -> None:
    video = await video_for(auth_client, session, alice)
    assert (await post(auth_client, alice, video, **body)).status_code == 422
    assert await count(session) == 0


async def test_any_timestamp_is_accepted_when_the_duration_is_unknown(
    auth_client: httpx.AsyncClient, alice: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice, duration=None)
    assert (
        await post(auth_client, alice, video, body="x", timestamp_seconds=99999)
    ).status_code == 201


async def test_users_only_see_and_delete_their_own_comments(
    auth_client: httpx.AsyncClient, alice: Actor, bob: Actor, session: AsyncSession
) -> None:
    video = await video_for(auth_client, session, alice)
    await make_user(session, bob)
    mine = (await post(auth_client, alice, video, body="private")).json()

    # Bob has no link to the video: it looks like a missing one.
    assert (
        await auth_client.get(f"{VIDEOS}/{video.id}/comments", headers=bob.h)
    ).status_code == 404
    assert (await post(auth_client, bob, video, body="sneaky")).status_code == 404
    # ...and deleting someone else's comment looks like a missing comment.
    stolen = await auth_client.delete(f"/api/v1/comments/{mine['id']}", headers=bob.h)
    assert stolen.status_code == 404
    assert await count(session) == 1

    # Even with a link of his own, Bob sees only his comments.
    other = await video_for(auth_client, session, bob)
    assert (await auth_client.get(f"{VIDEOS}/{other.id}/comments", headers=bob.h)).json() == []
