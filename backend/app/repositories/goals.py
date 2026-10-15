"""Daily goals and viewing sessions. Every function filters by `user_id` (CLAUDE.md rule 1)."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, and_, cast, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    LearningGoal,
    LearningPath,
    LearningPathVideo,
    Video,
    VideoProgress,
    ViewingSession,
)


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


async def daily_totals(
    db: AsyncSession, user_id: uuid.UUID, tz_name: str, start: datetime, end: datetime
) -> dict[date, int]:
    """Watched seconds per local day (in `tz_name`) for sessions started in [start, end)."""
    local_day = cast(func.timezone(tz_name, ViewingSession.started_at), Date)
    rows = await db.execute(
        select(local_day, func.sum(ViewingSession.watched_seconds))
        .where(
            ViewingSession.user_id == user_id,
            ViewingSession.started_at >= start,
            ViewingSession.started_at < end,
        )
        .group_by(local_day)
    )
    return {day: int(total) for day, total in rows}


async def path_deadlines(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[uuid.UUID, str, date, int, int, int]]:
    """For each of the user's paths with a target date: id, title, date, and what is left.

    "Left" is every video the student has never completed, so a rewatch or a flag for revision
    does not add work. Returns (path id, title, target date, remaining videos, remaining known
    seconds, remaining videos of unknown length).
    """
    not_done = VideoProgress.ever_completed_at.is_(None)
    rows = await db.execute(
        select(
            LearningPath.id,
            LearningPath.title,
            LearningPath.target_date,
            func.count(LearningPathVideo.id).filter(not_done),
            func.coalesce(func.sum(Video.duration_seconds).filter(not_done), 0),
            func.count(LearningPathVideo.id).filter(
                and_(not_done, Video.duration_seconds.is_(None))
            ),
        )
        .select_from(LearningPath)
        .join(LearningPathVideo, LearningPathVideo.learning_path_id == LearningPath.id)
        .join(Video, Video.id == LearningPathVideo.video_id)
        .outerjoin(
            VideoProgress,
            and_(VideoProgress.video_id == Video.id, VideoProgress.user_id == user_id),
        )
        .where(LearningPath.user_id == user_id, LearningPath.target_date.is_not(None))
        .group_by(LearningPath.id, LearningPath.title, LearningPath.target_date)
        .order_by(LearningPath.target_date.asc(), LearningPath.id)
    )
    out: list[tuple[uuid.UUID, str, date, int, int, int]] = []
    for path_id, title, target, remaining, seconds, unknown in rows:
        assert target is not None  # filtered on in the query
        out.append((path_id, title, target, int(remaining), int(seconds or 0), int(unknown)))
    return out
