"""Video metadata and path-membership queries."""

import uuid
from collections.abc import Sequence

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


async def get_by_youtube_ids(
    db: AsyncSession, youtube_video_ids: Sequence[str]
) -> dict[str, Video]:
    if not youtube_video_ids:
        return {}
    rows = (
        await db.execute(select(Video).where(Video.youtube_video_id.in_(list(youtube_video_ids))))
    ).scalars()
    return {v.youtube_video_id: v for v in rows}


async def upsert_videos(db: AsyncSession, metas: Sequence[VideoMetadata]) -> dict[str, Video]:
    """Bulk insert-or-refresh of shared metadata rows, keyed by YouTube video id."""
    if not metas:
        return {}
    insert_stmt = insert(Video).values(
        [
            {
                "youtube_video_id": m.youtube_video_id,
                "title": m.title,
                "channel_title": m.channel_title,
                "thumbnail_url": m.thumbnail_url,
                "duration_seconds": m.duration_seconds,
                "availability_state": m.availability_state,
                "metadata_fetched_at": func.now(),
            }
            for m in metas
        ]
    )
    stmt = insert_stmt.on_conflict_do_update(
        index_elements=[Video.youtube_video_id],
        set_={
            "title": insert_stmt.excluded.title,
            "channel_title": insert_stmt.excluded.channel_title,
            "thumbnail_url": insert_stmt.excluded.thumbnail_url,
            "duration_seconds": insert_stmt.excluded.duration_seconds,
            "availability_state": insert_stmt.excluded.availability_state,
            "metadata_fetched_at": insert_stmt.excluded.metadata_fetched_at,
        },
    ).returning(Video)
    result = await db.execute(stmt, execution_options={"populate_existing": True})
    videos: list[Video] = list(result.scalars())
    return {v.youtube_video_id: v for v in videos}


async def memberships_in_path(
    db: AsyncSession, path_id: uuid.UUID, video_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Which of these videos are already in the path, mapped to their position."""
    if not video_ids:
        return {}
    rows = await db.execute(
        select(LearningPathVideo.video_id, LearningPathVideo.position).where(
            LearningPathVideo.learning_path_id == path_id,
            LearningPathVideo.video_id.in_(list(video_ids)),
        )
    )
    return {video_id: position for video_id, position in rows}
