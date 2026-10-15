"""The revision queue. Every function filters by `user_id` (CLAUDE.md rule 1)."""

import uuid
from datetime import date, datetime

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningPath, LearningPathVideo, RevisionItem, Video

MAX_QUEUE_ITEMS = 500


async def get_active(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID
) -> RevisionItem | None:
    return (
        await db.execute(
            select(RevisionItem).where(
                RevisionItem.user_id == user_id,
                RevisionItem.video_id == video_id,
                RevisionItem.active.is_(True),
            )
        )
    ).scalar_one_or_none()


async def last_revised_at(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID
) -> datetime | None:
    return (
        await db.execute(
            select(func.max(RevisionItem.revised_at)).where(
                RevisionItem.user_id == user_id, RevisionItem.video_id == video_id
            )
        )
    ).scalar_one_or_none()


async def ensure_active(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID, due_at: date
) -> RevisionItem:
    """Put the video in the queue. An item already there keeps its due date."""
    await db.execute(
        insert(RevisionItem)
        # clock_timestamp(): the real moment of flagging, so items flagged in quick succession
        # (even within one transaction) keep their order.
        .values(
            user_id=user_id,
            video_id=video_id,
            due_at=due_at,
            active=True,
            flagged_at=func.clock_timestamp(),
        )
        .on_conflict_do_nothing(
            index_elements=[RevisionItem.user_id, RevisionItem.video_id],
            # Must read exactly like the partial index's predicate (`WHERE active`).
            index_where=text("active"),
        )
    )
    item = await get_active(db, user_id, video_id)
    assert item is not None  # either just inserted, or the active one that blocked the insert
    return item


async def set_due(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID, due_at: date
) -> tuple[RevisionItem, bool]:
    """Put the video in the queue due on `due_at`, or move its existing due date.

    Returns the item and whether it already existed (a reschedule rather than a new flag).
    """
    existing = await get_active(db, user_id, video_id)
    if existing is None:
        return await ensure_active(db, user_id, video_id, due_at), False
    existing.due_at = due_at
    await db.flush()
    return existing, True


async def complete(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID
) -> RevisionItem | None:
    """Mark the active item revised: it leaves the queue and stays as history."""
    result = await db.execute(
        update(RevisionItem)
        .where(
            RevisionItem.user_id == user_id,
            RevisionItem.video_id == video_id,
            RevisionItem.active.is_(True),
        )
        .values(active=False, revised_at=func.now())
        .returning(RevisionItem),
        execution_options={"populate_existing": True},
    )
    return result.scalar_one_or_none()


async def list_active(
    db: AsyncSession, user_id: uuid.UUID
) -> tuple[list[tuple[RevisionItem, Video]], int]:
    """The queue, most urgent first: earliest due date, then most recently flagged."""
    total = (
        await db.execute(
            select(func.count()).where(
                RevisionItem.user_id == user_id, RevisionItem.active.is_(True)
            )
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(RevisionItem, Video)
            .join(Video, Video.id == RevisionItem.video_id)
            .where(RevisionItem.user_id == user_id, RevisionItem.active.is_(True))
            .order_by(RevisionItem.due_at.asc(), RevisionItem.flagged_at.desc(), RevisionItem.id)
            .limit(MAX_QUEUE_ITEMS)
        )
    ).all()
    return [(item, video) for item, video in rows], int(total)


async def paths_for_videos(
    db: AsyncSession, user_id: uuid.UUID, video_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[uuid.UUID, str]]:
    """For each video, one of the user's own paths that contains it (the oldest path)."""
    if not video_ids:
        return {}
    rows = (
        await db.execute(
            select(LearningPathVideo.video_id, LearningPath.id, LearningPath.title)
            .join(LearningPath, LearningPath.id == LearningPathVideo.learning_path_id)
            .where(LearningPath.user_id == user_id, LearningPathVideo.video_id.in_(video_ids))
            .order_by(LearningPath.created_at.desc(), LearningPath.id.desc())
        )
    ).all()
    # Later rows overwrite earlier ones, so the oldest path wins.
    return {video_id: (path_id, title) for video_id, path_id, title in rows}
