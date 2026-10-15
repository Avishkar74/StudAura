import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser, DbSession, resolve_timezone
from app.core.errors import ApiError
from app.core.metrics import revision_events_total
from app.models import RevisionItem, Video
from app.repositories import progress as progress_repo
from app.repositories import revisions as revisions_repo
from app.repositories import videos as videos_repo
from app.schemas.learning_path import PathRef, PathVideoMeta
from app.schemas.revisions import (
    RevisionItemRead,
    RevisionQueue,
    RevisionRead,
    RevisionUpdate,
)
from app.services import goals as goal_rules
from app.services import progress as progress_rules
from app.services import revisions as revision_rules

router = APIRouter(prefix="/api/v1", tags=["revisions"])


async def _require_video(db: DbSession, user: CurrentUser, video_id: uuid.UUID) -> Video:
    # Same 404 for a video that is missing and one the caller has no relationship with.
    video = await progress_repo.get_accessible_video(db, user.id, video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


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


async def _state(
    db: DbSession,
    user: CurrentUser,
    video_id: uuid.UUID,
    item: RevisionItem | None,
    today: date,
) -> RevisionRead:
    progress = await progress_repo.get_progress(db, user.id, video_id)
    return RevisionRead(
        video_id=video_id,
        learning_status=progress.learning_status if progress else "NOT_STARTED",
        active=item is not None,
        due_at=item.due_at if item else None,
        flagged_at=item.flagged_at if item else None,
        revised_at=await revisions_repo.last_revised_at(db, user.id, video_id),
        due_state=revision_rules.due_state(item.due_at, today) if item else None,
        today=today,
    )


@router.get("/revisions", response_model=RevisionQueue)
async def list_revisions(
    user: CurrentUser,
    db: DbSession,
    timezone: Annotated[str | None, Query(max_length=64)] = None,
) -> RevisionQueue:
    """The active revision queue, most urgent first (earliest due, then most recently flagged)."""
    tz_name, tz = await resolve_timezone(db, user, timezone)
    today = goal_rules.today_in(tz, datetime.now(UTC))
    rows, total = await revisions_repo.list_active(db, user.id)
    paths = await videos_repo.paths_for_videos(db, user.id, [v.id for _, v in rows])
    items = [
        RevisionItemRead(
            video_id=video.id,
            video=_meta(video),
            path=PathRef(id=paths[video.id][0], title=paths[video.id][1])
            if video.id in paths
            else None,
            due_at=item.due_at,
            flagged_at=item.flagged_at,
            due_state=revision_rules.due_state(item.due_at, today),
        )
        for item, video in rows
    ]
    return RevisionQueue(
        today=today,
        timezone=tz_name,
        total=total,
        due_count=sum(1 for i in items if i.due_state != "upcoming"),
        items=items,
    )


@router.get("/videos/{video_id}/revision", response_model=RevisionRead)
async def get_revision(
    video_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    timezone: Annotated[str | None, Query(max_length=64)] = None,
) -> RevisionRead:
    await _require_video(db, user, video_id)
    _, tz = await resolve_timezone(db, user, timezone)
    today = goal_rules.today_in(tz, datetime.now(UTC))
    item = await revisions_repo.get_active(db, user.id, video_id)
    return await _state(db, user, video_id, item, today)


@router.put("/videos/{video_id}/revision", response_model=RevisionRead)
async def flag_revision(
    video_id: uuid.UUID, body: RevisionUpdate, user: CurrentUser, db: DbSession
) -> RevisionRead:
    """Flag a video for revision, or reschedule it if it is already flagged. Idempotent.

    The video's status becomes NEEDS_REVISION; the completion history is kept. Without `due_at`
    the revision is due the next calendar day. Repeating the request changes nothing.
    """
    await _require_video(db, user, video_id)
    now = datetime.now(UTC)
    _, tz = await resolve_timezone(db, user, body.timezone)
    today = goal_rules.today_in(tz, now)

    if body.due_at is not None:
        problem = revision_rules.due_date_problem(body.due_at, today)
        if problem:
            raise ApiError(422, "INVALID_DUE_DATE", problem)
        item, existed = await revisions_repo.set_due(db, user.id, video_id, body.due_at)
    else:
        existing = await revisions_repo.get_active(db, user.id, video_id)
        due = existing.due_at if existing else revision_rules.default_due_date(tz, now)
        item = await revisions_repo.ensure_active(db, user.id, video_id, due)
        existed = existing is not None

    current = await progress_repo.get_progress(db, user.id, video_id)
    status, ever_completed_at = progress_rules.apply_manual_status(
        current.learning_status if current else "NOT_STARTED",
        current.ever_completed_at if current else None,
        "NEEDS_REVISION",
        now,
    )
    await progress_repo.upsert_progress(
        db,
        user.id,
        video_id,
        last_position_seconds=current.last_position_seconds if current else 0.0,
        learning_status=status,
        ever_completed_at=ever_completed_at,
        last_watched_at=current.last_watched_at if current else None,
    )
    await db.commit()
    if not existed:
        revision_events_total.labels(event="flagged").inc()
    elif body.due_at is not None:
        revision_events_total.labels(event="rescheduled").inc()
    return await _state(db, user, video_id, item, today)


@router.post("/videos/{video_id}/revision/complete", response_model=RevisionRead)
async def complete_revision(
    video_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    timezone: Annotated[str | None, Query(max_length=64)] = None,
) -> RevisionRead:
    """Mark the video revised: it leaves the queue (and stays in the history).

    A video that had been completed goes back to Completed; one that never was becomes In
    Progress. The completion history is never touched.
    """
    await _require_video(db, user, video_id)
    _, tz = await resolve_timezone(db, user, timezone)
    today = goal_rules.today_in(tz, datetime.now(UTC))
    done = await revisions_repo.complete(db, user.id, video_id)
    if done is None:
        raise ApiError(404, "NO_ACTIVE_REVISION", "This video isn't in your revision queue.")

    current = await progress_repo.get_progress(db, user.id, video_id)
    ever_completed_at = current.ever_completed_at if current else None
    await progress_repo.upsert_progress(
        db,
        user.id,
        video_id,
        last_position_seconds=current.last_position_seconds if current else 0.0,
        learning_status=revision_rules.status_after_revised(ever_completed_at),
        ever_completed_at=ever_completed_at,
        last_watched_at=current.last_watched_at if current else None,
    )
    await db.commit()
    revision_events_total.labels(event="revised").inc()
    return await _state(db, user, video_id, None, today)
