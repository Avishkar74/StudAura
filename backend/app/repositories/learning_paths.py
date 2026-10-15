"""Learning-path queries. Every function filters by `user_id` (CLAUDE.md rule 1)."""

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from sqlalchemy import Select, and_, case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LearningPath, LearningPathVideo, Video, VideoProgress
from app.services.progress import completion_pct

SortKey = Literal["recent", "name", "progress", "target_date"]


@dataclass(frozen=True)
class PathWithStats:
    path: LearningPath
    total_videos: int
    completed_videos: int
    in_progress_videos: int
    needs_revision_videos: int
    last_activity_at: datetime | None

    @property
    def completion_pct(self) -> float:
        return completion_pct(self.completed_videos, self.total_videos)


def _stats_subquery(user_id: uuid.UUID):  # type: ignore[no-untyped-def]
    """Per-path video counts, using only this user's progress rows."""
    return (
        select(
            LearningPathVideo.learning_path_id.label("path_id"),
            func.count(LearningPathVideo.id).label("total"),
            func.count(VideoProgress.ever_completed_at).label("completed"),
            func.count(VideoProgress.id)
            .filter(VideoProgress.learning_status == "IN_PROGRESS")
            .label("in_progress"),
            func.count(VideoProgress.id)
            .filter(VideoProgress.learning_status == "NEEDS_REVISION")
            .label("needs_revision"),
            func.max(VideoProgress.last_watched_at).label("last_activity"),
        )
        .select_from(LearningPathVideo)
        .outerjoin(
            VideoProgress,
            and_(
                VideoProgress.video_id == LearningPathVideo.video_id,
                VideoProgress.user_id == user_id,
            ),
        )
        .group_by(LearningPathVideo.learning_path_id)
        .subquery()
    )


def _with_stats_query(user_id: uuid.UUID) -> tuple[Select, object]:  # type: ignore[type-arg]
    stats = _stats_subquery(user_id)
    query = select(
        LearningPath,
        func.coalesce(stats.c.total, 0),
        func.coalesce(stats.c.completed, 0),
        func.coalesce(stats.c.in_progress, 0),
        func.coalesce(stats.c.needs_revision, 0),
        stats.c.last_activity,
    ).outerjoin(stats, stats.c.path_id == LearningPath.id)
    return query.where(LearningPath.user_id == user_id), stats


def _row(r) -> PathWithStats:  # type: ignore[no-untyped-def]
    return PathWithStats(r[0], r[1], r[2], r[3], r[4], r[5])


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_paths(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    q: str | None,
    sort: SortKey,
    limit: int,
    offset: int,
) -> tuple[list[PathWithStats], int]:
    query, stats = _with_stats_query(user_id)
    count_query = (
        select(func.count()).select_from(LearningPath).where(LearningPath.user_id == user_id)
    )
    if q:
        pattern = f"%{_escape_like(q)}%"
        query = query.where(LearningPath.title.ilike(pattern, escape="\\"))
        count_query = count_query.where(LearningPath.title.ilike(pattern, escape="\\"))

    total_col = func.coalesce(stats.c.total, 0)  # type: ignore[attr-defined]
    completed_col = func.coalesce(stats.c.completed, 0)  # type: ignore[attr-defined]
    order_by = {
        "recent": [
            func.coalesce(stats.c.last_activity, LearningPath.created_at).desc()  # type: ignore[attr-defined]
        ],
        "name": [func.lower(LearningPath.title).asc()],
        "progress": [
            case(
                (total_col == 0, 0.0),
                else_=completed_col * 1.0 / func.nullif(total_col, 0),
            ).desc()
        ],
        "target_date": [LearningPath.target_date.asc().nulls_last()],
    }[sort]
    query = query.order_by(*order_by, LearningPath.created_at.desc(), LearningPath.id)

    rows = (await db.execute(query.limit(limit).offset(offset))).all()
    total = (await db.execute(count_query)).scalar_one()
    return [_row(r) for r in rows], total


async def get_path_with_stats(
    db: AsyncSession, user_id: uuid.UUID, path_id: uuid.UUID
) -> PathWithStats | None:
    query, _ = _with_stats_query(user_id)
    row = (await db.execute(query.where(LearningPath.id == path_id))).first()
    return _row(row) if row else None


async def get_path(db: AsyncSession, user_id: uuid.UUID, path_id: uuid.UUID) -> LearningPath | None:
    return (
        await db.execute(
            select(LearningPath).where(LearningPath.id == path_id, LearningPath.user_id == user_id)
        )
    ).scalar_one_or_none()


async def create_path(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    title: str,
    description: str | None,
    target_date: date | None,
) -> LearningPath:
    path = LearningPath(
        user_id=user_id, title=title, description=description, target_date=target_date
    )
    db.add(path)
    await db.flush()
    return path


async def delete_path(db: AsyncSession, user_id: uuid.UUID, path_id: uuid.UUID) -> bool:
    """Delete a path. Only its video memberships cascade; notes and progress are kept."""
    result = await db.execute(
        delete(LearningPath).where(LearningPath.id == path_id, LearningPath.user_id == user_id)
    )
    return (result.rowcount or 0) > 0  # type: ignore[attr-defined]


@dataclass(frozen=True)
class PathVideoRow:
    position: int
    video: Video
    progress: VideoProgress | None


async def list_path_videos(
    db: AsyncSession,
    user_id: uuid.UUID,
    path_id: uuid.UUID,
    *,
    limit: int,
    offset: int,
) -> tuple[list[PathVideoRow], int]:
    """Videos of one of the user's paths in order, with that user's progress (if any)."""
    base = (
        select(LearningPathVideo.position, Video, VideoProgress)
        .join(LearningPath, LearningPath.id == LearningPathVideo.learning_path_id)
        .join(Video, Video.id == LearningPathVideo.video_id)
        .outerjoin(
            VideoProgress,
            and_(VideoProgress.video_id == Video.id, VideoProgress.user_id == user_id),
        )
        .where(LearningPath.id == path_id, LearningPath.user_id == user_id)
    )
    rows = (
        await db.execute(base.order_by(LearningPathVideo.position).limit(limit).offset(offset))
    ).all()
    total = (
        await db.execute(
            select(func.count())
            .select_from(LearningPathVideo)
            .join(LearningPath, LearningPath.id == LearningPathVideo.learning_path_id)
            .where(LearningPath.id == path_id, LearningPath.user_id == user_id)
        )
    ).scalar_one()
    return [PathVideoRow(r[0], r[1], r[2]) for r in rows], total
