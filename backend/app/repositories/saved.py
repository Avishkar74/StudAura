"""Bookmarks. Every function filters by `user_id` (CLAUDE.md rule 1)."""

import uuid
from datetime import datetime
from typing import Literal

from sqlalchemy import UnaryExpression, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SavedVideo, Video, VideoProgress

SavedSort = Literal["saved", "watched"]


async def get_saved_at(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID
) -> datetime | None:
    return (
        await db.execute(
            select(SavedVideo.saved_at).where(
                SavedVideo.user_id == user_id, SavedVideo.video_id == video_id
            )
        )
    ).scalar_one_or_none()


async def save(db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID) -> datetime:
    """Bookmark the video. Repeating it keeps the original time."""
    await db.execute(
        insert(SavedVideo)
        .values(user_id=user_id, video_id=video_id, saved_at=func.clock_timestamp())
        .on_conflict_do_nothing(index_elements=[SavedVideo.user_id, SavedVideo.video_id])
    )
    saved_at = await get_saved_at(db, user_id, video_id)
    assert saved_at is not None
    return saved_at


async def unsave(db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID) -> None:
    """Remove the bookmark only; notes, progress and path membership are untouched."""
    await db.execute(
        delete(SavedVideo).where(SavedVideo.user_id == user_id, SavedVideo.video_id == video_id)
    )


async def list_saved(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    status: str | None,
    sort: SavedSort,
    limit: int,
    offset: int,
) -> tuple[list[tuple[SavedVideo, Video, VideoProgress | None]], int]:
    """The user's bookmarks with their progress, optionally for one learning status.

    A video with no progress row is NOT_STARTED. `sort`: `saved` is newest bookmark first,
    `watched` is most recently watched first (never-watched last).
    """
    status_column = func.coalesce(VideoProgress.learning_status, "NOT_STARTED")
    query = (
        select(SavedVideo, Video, VideoProgress)
        .join(Video, Video.id == SavedVideo.video_id)
        .outerjoin(
            VideoProgress,
            (VideoProgress.video_id == SavedVideo.video_id) & (VideoProgress.user_id == user_id),
        )
        .where(SavedVideo.user_id == user_id)
    )
    if status is not None:
        query = query.where(status_column == status)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()

    order: list[UnaryExpression[datetime] | UnaryExpression[datetime | None]]
    if sort == "watched":
        order = [VideoProgress.last_watched_at.desc().nulls_last(), SavedVideo.saved_at.desc()]
    else:
        order = [SavedVideo.saved_at.desc()]
    rows = (
        await db.execute(query.order_by(*order, SavedVideo.video_id).limit(limit).offset(offset))
    ).all()
    return [(s, v, p) for s, v, p in rows], int(total)
