import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response

from app.api.deps import CurrentUser, DbSession
from app.repositories import learning_paths as repo
from app.repositories.learning_paths import PathWithStats, SortKey
from app.schemas.common import Page
from app.schemas.learning_path import (
    LearningPathCreate,
    LearningPathRead,
    LearningPathUpdate,
    PathVideoMeta,
    PathVideoRead,
)
from app.services.progress import playback_pct

router = APIRouter(prefix="/api/v1/learning-paths", tags=["learning-paths"])

Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


def _not_found() -> HTTPException:
    # Same response whether the path doesn't exist or belongs to someone else.
    return HTTPException(status_code=404, detail="Learning path not found")


def _read(item: PathWithStats) -> LearningPathRead:
    p = item.path
    return LearningPathRead(
        id=p.id,
        title=p.title,
        description=p.description,
        target_date=p.target_date,
        created_at=p.created_at,
        updated_at=p.updated_at,
        total_videos=item.total_videos,
        completed_videos=item.completed_videos,
        in_progress_videos=item.in_progress_videos,
        needs_revision_videos=item.needs_revision_videos,
        completion_pct=item.completion_pct,
        last_activity_at=item.last_activity_at,
    )


@router.get("", response_model=Page[LearningPathRead])
async def list_learning_paths(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: SortKey = "recent",
    limit: Limit = 20,
    offset: Offset = 0,
) -> Page[LearningPathRead]:
    """The caller's paths. `sort`: recent (default), name, progress or target_date."""
    items, total = await repo.list_paths(
        db, user.id, q=q.strip() if q else None, sort=sort, limit=limit, offset=offset
    )
    return Page(total=total, limit=limit, offset=offset, items=[_read(i) for i in items])


@router.post("", response_model=LearningPathRead, status_code=201)
async def create_learning_path(
    body: LearningPathCreate, user: CurrentUser, db: DbSession
) -> LearningPathRead:
    path = await repo.create_path(
        db,
        user.id,
        title=body.title,
        description=body.description,
        target_date=body.target_date,
    )
    await db.commit()
    item = await repo.get_path_with_stats(db, user.id, path.id)
    assert item is not None
    return _read(item)


@router.get("/{path_id}", response_model=LearningPathRead)
async def get_learning_path(
    path_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> LearningPathRead:
    item = await repo.get_path_with_stats(db, user.id, path_id)
    if item is None:
        raise _not_found()
    return _read(item)


@router.patch("/{path_id}", response_model=LearningPathRead)
async def update_learning_path(
    path_id: uuid.UUID, body: LearningPathUpdate, user: CurrentUser, db: DbSession
) -> LearningPathRead:
    path = await repo.get_path(db, user.id, path_id)
    if path is None:
        raise _not_found()
    for field in body.model_fields_set:
        setattr(path, field, getattr(body, field))
    await db.commit()
    item = await repo.get_path_with_stats(db, user.id, path_id)
    assert item is not None
    return _read(item)


@router.delete("/{path_id}", status_code=204)
async def delete_learning_path(path_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    if not await repo.delete_path(db, user.id, path_id):
        raise _not_found()
    await db.commit()
    return Response(status_code=204)


@router.get("/{path_id}/videos", response_model=Page[PathVideoRead])
async def list_learning_path_videos(
    path_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Offset = 0,
) -> Page[PathVideoRead]:
    """The path's videos in playlist order, each with the caller's status and progress."""
    if await repo.get_path(db, user.id, path_id) is None:
        raise _not_found()
    rows, total = await repo.list_path_videos(db, user.id, path_id, limit=limit, offset=offset)
    items = []
    for row in rows:
        progress = row.progress
        position = progress.last_position_seconds if progress else 0.0
        items.append(
            PathVideoRead(
                position=row.position,
                video=PathVideoMeta(
                    id=row.video.id,
                    youtube_video_id=row.video.youtube_video_id,
                    title=row.video.title,
                    channel_title=row.video.channel_title,
                    thumbnail_url=row.video.thumbnail_url,
                    duration_seconds=row.video.duration_seconds,
                    availability_state=row.video.availability_state,
                ),
                learning_status=progress.learning_status if progress else "NOT_STARTED",
                last_position_seconds=position,
                playback_pct=playback_pct(position, row.video.duration_seconds),
                ever_completed_at=progress.ever_completed_at if progress else None,
                last_watched_at=progress.last_watched_at if progress else None,
            )
        )
    return Page(total=total, limit=limit, offset=offset, items=items)
