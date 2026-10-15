"""Video metadata and path-membership queries."""

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.youtube.models import VideoMetadata
from app.models import LearningPath, LearningPathVideo, Video


async def get_by_youtube_id(db: AsyncSession, youtube_video_id: str) -> Video | None:
    return (
        await db.execute(select(Video).where(Video.youtube_video_id == youtube_video_id))
    ).scalar_one_or_none()


async def upsert_video(db: AsyncSession, meta: VideoMetadata) -> Video:
    """Insert or refresh the shared metadata row for a YouTube video."""
    values = {
        "title": meta.title,
        "channel_title": meta.channel_title,
        "thumbnail_url": meta.thumbnail_url,
        "duration_seconds": meta.duration_seconds,
        "availability_state": meta.availability_state,
        "metadata_fetched_at": func.now(),
    }
    stmt = (
        insert(Video)
        .values(youtube_video_id=meta.youtube_video_id, **values)
        .on_conflict_do_update(index_elements=[Video.youtube_video_id], set_=values)
        .returning(Video)
    )
    result = await db.execute(stmt, execution_options={"populate_existing": True})
    return result.scalar_one()


async def get_membership(
    db: AsyncSession, path_id: uuid.UUID, video_id: uuid.UUID
) -> LearningPathVideo | None:
    return (
        await db.execute(
            select(LearningPathVideo).where(
                LearningPathVideo.learning_path_id == path_id,
                LearningPathVideo.video_id == video_id,
            )
        )
    ).scalar_one_or_none()


async def next_position(db: AsyncSession, path_id: uuid.UUID) -> int:
    current = (
        await db.execute(
            select(func.max(LearningPathVideo.position)).where(
                LearningPathVideo.learning_path_id == path_id
            )
        )
    ).scalar_one()
    return (current or 0) + 1


async def add_to_path(
    db: AsyncSession, path_id: uuid.UUID, video_id: uuid.UUID, position: int
) -> LearningPathVideo:
    membership = LearningPathVideo(learning_path_id=path_id, video_id=video_id, position=position)
    db.add(membership)
    await db.flush()
    return membership


async def remove_from_path(
    db: AsyncSession, user_id: uuid.UUID, path_id: uuid.UUID, video_id: uuid.UUID
) -> bool:
    """Remove a video from one of the user's paths. Notes, progress and bookmarks are untouched."""
    owned = select(LearningPath.id).where(
        LearningPath.id == path_id, LearningPath.user_id == user_id
    )
    result = await db.execute(
        delete(LearningPathVideo).where(
            LearningPathVideo.learning_path_id.in_(owned),
            LearningPathVideo.video_id == video_id,
        )
    )
    return (result.rowcount or 0) > 0  # type: ignore[attr-defined]
