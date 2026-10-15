"""Video notes. Every function filters by `user_id` (CLAUDE.md rule 1)."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import VideoNote


async def get_note(db: AsyncSession, user_id: uuid.UUID, video_id: uuid.UUID) -> VideoNote | None:
    return (
        await db.execute(
            select(VideoNote).where(VideoNote.user_id == user_id, VideoNote.video_id == video_id)
        )
    ).scalar_one_or_none()


async def save_note(
    db: AsyncSession,
    user_id: uuid.UUID,
    video_id: uuid.UUID,
    body: str,
    base_revision: int | None,
) -> VideoNote | None:
    """Create or update the note. Returns None when `base_revision` is stale (a conflict).

    - base_revision None: unconditional overwrite (an explicit "keep my version").
    - base_revision 0: the client saw no note, so only create one if none exists.
    - base_revision N: only update if the stored revision is still N (atomic compare-and-set).
    """
    values = {"user_id": user_id, "video_id": video_id, "body": body}
    options = {"populate_existing": True}
    note: VideoNote | None
    if base_revision is None:
        upsert = insert(VideoNote).values(**values, revision=1)
        upsert = upsert.on_conflict_do_update(
            index_elements=[VideoNote.user_id, VideoNote.video_id],
            set_={
                "body": upsert.excluded.body,
                "revision": VideoNote.revision + 1,
                "updated_at": func.clock_timestamp(),
            },
        )
        note = (
            await db.execute(upsert.returning(VideoNote), execution_options=options)
        ).scalar_one_or_none()
    elif base_revision == 0:
        create = (
            insert(VideoNote)
            .values(**values, revision=1)
            .on_conflict_do_nothing(index_elements=[VideoNote.user_id, VideoNote.video_id])
        )
        note = (
            await db.execute(create.returning(VideoNote), execution_options=options)
        ).scalar_one_or_none()
    else:
        change = (
            update(VideoNote)
            .where(
                VideoNote.user_id == user_id,
                VideoNote.video_id == video_id,
                VideoNote.revision == base_revision,
            )
            .values(body=body, revision=VideoNote.revision + 1, updated_at=func.clock_timestamp())
        )
        note = (
            await db.execute(change.returning(VideoNote), execution_options=options)
        ).scalar_one_or_none()
    return note
