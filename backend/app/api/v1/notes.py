import uuid

from fastapi import APIRouter, HTTPException

from app.api.deps import CurrentUser, DbSession
from app.core.errors import ApiError
from app.core.metrics import note_save_failures_total
from app.models import VideoNote
from app.repositories import notes as notes_repo
from app.repositories import progress as progress_repo
from app.schemas.notes import NoteRead, NoteUpdate
from app.services.notes import MAX_NOTE_BYTES, is_too_large, sanitize_note_html

router = APIRouter(prefix="/api/v1/videos", tags=["notes"])


def _read(video_id: uuid.UUID, note: VideoNote | None) -> NoteRead:
    if note is None:
        return NoteRead(video_id=video_id, body="", revision=0, updated_at=None)
    return NoteRead(
        video_id=video_id, body=note.body, revision=note.revision, updated_at=note.updated_at
    )


async def _require_video(db: DbSession, user: CurrentUser, video_id: uuid.UUID) -> None:
    # Same 404 for a video that is missing and one the caller has no relationship with.
    if await progress_repo.get_accessible_video(db, user.id, video_id) is None:
        raise HTTPException(status_code=404, detail="Video not found")


@router.get("/{video_id}/notes", response_model=NoteRead)
async def get_note(video_id: uuid.UUID, user: CurrentUser, db: DbSession) -> NoteRead:
    await _require_video(db, user, video_id)
    return _read(video_id, await notes_repo.get_note(db, user.id, video_id))


@router.put("/{video_id}/notes", response_model=NoteRead)
async def put_note(
    video_id: uuid.UUID, body: NoteUpdate, user: CurrentUser, db: DbSession
) -> NoteRead:
    """Autosave target: create or update the caller's single note for this video.

    Safe to repeat. When `base_revision` is given and the stored note has moved on (another tab or
    device saved in between), nothing is written and the response is 409 with the current note,
    so the client can ask the student what to keep instead of silently overwriting.
    """
    await _require_video(db, user, video_id)

    if is_too_large(body.body):
        note_save_failures_total.labels(failure_type="too_large").inc()
        raise ApiError(
            422,
            "NOTE_TOO_LARGE",
            f"This note is too long to save (the limit is {MAX_NOTE_BYTES // 1024} KB).",
        )

    clean = sanitize_note_html(body.body)
    saved = await notes_repo.save_note(db, user.id, video_id, clean, body.base_revision)
    if saved is None:
        # Nothing was written (the compare-and-set matched no row), so there is nothing to undo.
        current_note = await notes_repo.get_note(db, user.id, video_id)
        if current_note is not None and current_note.body == clean:
            # A retry of a save that already went through (the response was lost): same content,
            # so report success instead of a spurious conflict.
            return _read(video_id, current_note)
        note_save_failures_total.labels(failure_type="conflict").inc()
        current = _read(video_id, current_note)
        raise ApiError(
            409,
            "NOTE_CONFLICT",
            "This note was changed in another tab or on another device.",
            details=[{"current": current.model_dump(mode="json")}],
        )

    await db.commit()
    return _read(video_id, saved)
