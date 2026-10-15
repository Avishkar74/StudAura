"""Personal video comments. Every function filters by `user_id` (CLAUDE.md rule 1)."""

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VideoComment

MAX_COMMENTS_RETURNED = 500


async def list_comments(
    db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID
) -> list[VideoComment]:
    """Newest first."""
    query = (
        select(VideoComment)
        .where(VideoComment.user_id == user_id, VideoComment.video_id == video_id)
        .order_by(VideoComment.created_at.desc(), VideoComment.id)
        .limit(MAX_COMMENTS_RETURNED)
    )
    return list((await db.execute(query)).scalars())


async def add_comment(
    db: AsyncSession,
    user_id: uuid.UUID,
    video_id: uuid.UUID,
    body: str,
    timestamp_seconds: int | None,
) -> VideoComment:
    comment = VideoComment(
        user_id=user_id,
        video_id=video_id,
        body=body,
        timestamp_seconds=timestamp_seconds,
        # Real insertion time, so comments added in quick succession still sort correctly.
        created_at=func.clock_timestamp(),
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return comment


async def delete_comment(db: AsyncSession, user_id: uuid.UUID, comment_id: uuid.UUID) -> bool:
    """True when one of the caller's comments was deleted; False for a missing or foreign id."""
    result = await db.execute(
        delete(VideoComment)
        .where(VideoComment.id == comment_id, VideoComment.user_id == user_id)
        .returning(VideoComment.id)
    )
    return result.first() is not None
