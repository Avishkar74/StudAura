"""Per-user video access and progress. Every function filters by `user_id` (CLAUDE.md rule 1)."""

import uuid
from datetime import datetime

from sqlalchemy import exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    LearningPath,
    LearningPathVideo,
    SavedVideo,
    Video,
    VideoComment,
    VideoNote,
    VideoProgress,
)


async def get_accessible_video(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID
) -> Video | None:
    """The video, but only if this user has a relationship with it.

    Video rows are shared across users, so knowing a UUID is not enough: the video must be in one
    of the user's paths, be bookmarked, or already carry the user's progress, notes or comments
    (so a note stays reachable after its video leaves every path).
    """
    in_a_path = exists().where(
        LearningPathVideo.video_id == video_id,
        LearningPathVideo.learning_path_id == LearningPath.id,
        LearningPath.user_id == user_id,
    )
    saved = exists().where(SavedVideo.video_id == video_id, SavedVideo.user_id == user_id)
    has_progress = exists().where(
        VideoProgress.video_id == video_id, VideoProgress.user_id == user_id
    )
    has_note = exists().where(VideoNote.video_id == video_id, VideoNote.user_id == user_id)
    has_comment = exists().where(VideoComment.video_id == video_id, VideoComment.user_id == user_id)
    query = select(Video).where(
        Video.id == video_id,
        or_(in_a_path, saved, has_progress, has_note, has_comment),
    )
    return (await db.execute(query)).scalar_one_or_none()


async def get_progress(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID
) -> VideoProgress | None:
    return (
        await db.execute(
            select(VideoProgress).where(
                VideoProgress.user_id == user_id, VideoProgress.video_id == video_id
            )
        )
    ).scalar_one_or_none()


async def upsert_progress(
    db: AsyncSession,
    user_id: uuid.UUID,
    video_id: uuid.UUID,
    *,
    last_position_seconds: float,
    learning_status: str,
    ever_completed_at: datetime | None,
    last_watched_at: datetime | None,
) -> VideoProgress:
    """Create or update the single progress row for (user, video). Safe to repeat."""
    values = {
        "last_position_seconds": last_position_seconds,
        "learning_status": learning_status,
        "ever_completed_at": ever_completed_at,
        "last_watched_at": last_watched_at,
    }
    stmt = (
        insert(VideoProgress)
        .values(user_id=user_id, video_id=video_id, **values)
        .on_conflict_do_update(
            index_elements=[VideoProgress.user_id, VideoProgress.video_id],
            set_={**values, "updated_at": func.now()},
        )
        .returning(VideoProgress)
    )
    result = await db.execute(stmt, execution_options={"populate_existing": True})
    return result.scalar_one()


async def recently_watched(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int,
    *,
    unfinished_only: bool = False,
) -> list[tuple[VideoProgress, Video]]:
    """The user's videos by when they last watched them, newest first.

    `unfinished_only` keeps videos that are In Progress and can still be played here, for
    "Continue learning": a finished, flagged or unplayable video is not somewhere to resume.
    """
    query = (
        select(VideoProgress, Video)
        .join(Video, Video.id == VideoProgress.video_id)
        .where(VideoProgress.user_id == user_id, VideoProgress.last_watched_at.is_not(None))
    )
    if unfinished_only:
        query = query.where(
            VideoProgress.learning_status == "IN_PROGRESS",
            Video.availability_state == "available",
        )
    rows = (
        await db.execute(
            query.order_by(VideoProgress.last_watched_at.desc(), VideoProgress.id).limit(limit)
        )
    ).all()
    return [(progress, video) for progress, video in rows]
