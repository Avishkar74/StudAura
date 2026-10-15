"""Shared helpers for API tests."""

import uuid
from collections.abc import Callable
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningPathVideo, User, Video, VideoProgress

BASE = "/api/v1/learning-paths"
TokenFactory = Callable[..., str]


class Actor:
    """A signed-in test user: a stable id plus a way to build request headers."""

    def __init__(self, make_token: TokenFactory, name: str) -> None:
        self.id = uuid.uuid4()
        self.email = f"{name}-{self.id.hex[:6]}@example.test"
        self._token = make_token(sub=self.id, email=self.email)

    @property
    def h(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}


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
