import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response

from app.api.deps import CurrentUser, DbSession
from app.models import Video, VideoProgress
from app.repositories import notes as notes_repo
from app.repositories import progress as progress_repo
from app.repositories import saved as saved_repo
from app.repositories import videos as videos_repo
from app.schemas.common import Page
from app.schemas.learning_path import PathRef, PathVideoMeta
from app.schemas.library import NoteListItem, SavedItem, SavedState
from app.services import notes as note_rules
from app.services import progress as progress_rules
from app.services.progress import LearningStatus

router = APIRouter(prefix="/api/v1", tags=["library"])

Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


def _meta(v: Video) -> PathVideoMeta:
    return PathVideoMeta(
        id=v.id,
        youtube_video_id=v.youtube_video_id,
        title=v.title,
        channel_title=v.channel_title,
        thumbnail_url=v.thumbnail_url,
        duration_seconds=v.duration_seconds,
        availability_state=v.availability_state,
    )


def _path(paths: dict[uuid.UUID, tuple[uuid.UUID, str]], video_id: uuid.UUID) -> PathRef | None:
    found = paths.get(video_id)
    return PathRef(id=found[0], title=found[1]) if found else None


async def _require_video(db: DbSession, user: CurrentUser, video_id: uuid.UUID) -> None:
    # Same 404 for a video that is missing and one the caller has no relationship with.
    if await progress_repo.get_accessible_video(db, user.id, video_id) is None:
        raise HTTPException(status_code=404, detail="Video not found")


# --- Notes across paths -------------------------------------------------------


@router.get("/notes", response_model=Page[NoteListItem])
async def list_notes(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    path_id: uuid.UUID | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[NoteListItem]:
    """The caller's notes that have text, most recently edited first.

    `q` searches the note's text; `path_id` keeps notes on videos in one of the caller's paths.
    A note stays listed after its video is removed from every path or becomes unavailable.
    """
    rows, total = await notes_repo.search_notes(
        db,
        user.id,
        q=q.strip() if q and q.strip() else None,
        path_id=path_id,
        limit=limit,
        offset=offset,
    )
    paths = await videos_repo.paths_for_videos(db, user.id, [v.id for _, v in rows])
    items = [
        NoteListItem(
            video_id=video.id,
            video=_meta(video),
            path=_path(paths, video.id),
            title=note_rules.note_title(note.body),
            snippet=note_rules.note_snippet(note.body),
            updated_at=note.updated_at,
            revision=note.revision,
        )
        for note, video in rows
    ]
    return Page(total=total, limit=limit, offset=offset, items=items)


# --- Saved videos -------------------------------------------------------------


@router.get("/saved-videos", response_model=Page[SavedItem])
async def list_saved_videos(
    user: CurrentUser,
    db: DbSession,
    status: LearningStatus | None = None,
    sort: saved_repo.SavedSort = "saved",
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[SavedItem]:
    """The caller's bookmarks with progress. `status` filters by learning status; `sort` is
    `saved` (newest bookmark first, the default) or `watched` (most recently watched first)."""
    rows, total = await saved_repo.list_saved(
        db, user.id, status=status, sort=sort, limit=limit, offset=offset
    )
    paths = await videos_repo.paths_for_videos(db, user.id, [v.id for _, v, _ in rows])

    def item(saved_at: datetime, video: Video, progress: VideoProgress | None) -> SavedItem:
        position = progress.last_position_seconds if progress else 0.0
        return SavedItem(
            video_id=video.id,
            video=_meta(video),
            path=_path(paths, video.id),
            learning_status=progress.learning_status if progress else "NOT_STARTED",
            last_position_seconds=position,
            playback_pct=progress_rules.playback_pct(position, video.duration_seconds),
            last_watched_at=progress.last_watched_at if progress else None,
            saved_at=saved_at,
        )

    items = [item(s.saved_at, v, p) for s, v, p in rows]
    return Page(total=total, limit=limit, offset=offset, items=items)


@router.get("/videos/{video_id}/saved", response_model=SavedState)
async def get_saved(video_id: uuid.UUID, user: CurrentUser, db: DbSession) -> SavedState:
    await _require_video(db, user, video_id)
    saved_at = await saved_repo.get_saved_at(db, user.id, video_id)
    return SavedState(video_id=video_id, saved=saved_at is not None, saved_at=saved_at)


@router.put("/videos/{video_id}/saved", response_model=SavedState)
async def save_video(video_id: uuid.UUID, user: CurrentUser, db: DbSession) -> SavedState:
    """Bookmark a video the caller can open. Idempotent."""
    await _require_video(db, user, video_id)
    saved_at = await saved_repo.save(db, user.id, video_id)
    await db.commit()
    return SavedState(video_id=video_id, saved=True, saved_at=saved_at)


@router.delete("/videos/{video_id}/saved", status_code=204)
async def unsave_video(video_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    """Remove the bookmark only. Idempotent: removing one that isn't there is fine."""
    await saved_repo.unsave(db, user.id, video_id)
    await db.commit()
    return Response(status_code=204)
