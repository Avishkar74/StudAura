"""Daily goals and viewing sessions. Every function filters by `user_id` (CLAUDE.md rule 1)."""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningGoal, ViewingSession


async def get_goal(db: AsyncSession, user_id: uuid.UUID) -> LearningGoal | None:
    return (
        await db.execute(select(LearningGoal).where(LearningGoal.user_id == user_id))
    ).scalar_one_or_none()


async def upsert_goal(
    db: AsyncSession, user_id: uuid.UUID, daily_target_minutes: int, timezone: str
) -> LearningGoal:
    values = {"daily_target_minutes": daily_target_minutes, "timezone": timezone}
    stmt = (
        insert(LearningGoal)
        .values(user_id=user_id, **values)
        .on_conflict_do_update(
            index_elements=[LearningGoal.user_id], set_={**values, "updated_at": func.now()}
        )
        .returning(LearningGoal)
    )
    result = await db.execute(stmt, execution_options={"populate_existing": True})
    return result.scalar_one()


async def watched_seconds_between(
    db: AsyncSession, user_id: uuid.UUID, start: datetime, end: datetime
) -> int:
    """Total watched seconds of the user's sessions that started in [start, end)."""
    total = await db.execute(
        select(func.coalesce(func.sum(ViewingSession.watched_seconds), 0)).where(
            ViewingSession.user_id == user_id,
            ViewingSession.started_at >= start,
            ViewingSession.started_at < end,
        )
    )
    return int(total.scalar_one())


async def get_session(db: AsyncSession, user_id: uuid.UUID, key: str) -> ViewingSession | None:
    return (
        await db.execute(
            select(ViewingSession).where(
                ViewingSession.user_id == user_id, ViewingSession.idempotency_key == key
            )
        )
    ).scalar_one_or_none()


async def record_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    video_id: uuid.UUID,
    *,
    key: str,
    started_at: datetime,
    now: datetime,
    watched_seconds: int,
) -> int:
    """Create the session or raise its watched total (never lower it); returns the stored total.

    `watched_seconds` is already the final value to keep. GREATEST makes a concurrent or
    out-of-order ping unable to lower what another one stored.
    """
    insert_stmt = insert(ViewingSession).values(
        user_id=user_id,
        video_id=video_id,
        started_at=started_at,
        ended_at=now,
        watched_seconds=watched_seconds,
        idempotency_key=key,
    )
    stmt = insert_stmt.on_conflict_do_update(
        index_elements=[ViewingSession.idempotency_key],
        set_={
            "watched_seconds": func.greatest(
                ViewingSession.watched_seconds, insert_stmt.excluded.watched_seconds
            ),
            "ended_at": func.greatest(ViewingSession.ended_at, insert_stmt.excluded.ended_at),
        },
        where=ViewingSession.user_id == user_id,
    ).returning(ViewingSession.watched_seconds)
    return int((await db.execute(stmt)).scalar_one())
