import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response

from app.api.deps import CurrentUser, DbSession, YouTube
from app.api.youtube_errors import to_api_error
from app.core.errors import ApiError
from app.core.metrics import progress_updates_total
from app.integrations.youtube.errors import YouTubeError
from app.models import Video, VideoProgress
from app.repositories import progress as progress_repo
from app.schemas.learning_path import PathVideoMeta
from app.schemas.progress import ProgressRead, ProgressUpdate, VideoDetail
from app.schemas.video import VideoImportRequest, VideoImportResponse
from app.services import progress as progress_rules
from app.services import video_import
from app.services.youtube_urls import SUPPORTED_VIDEO_URL_EXAMPLES, parse_video_id

router = APIRouter(prefix="/api/v1/videos", tags=["videos"])


@router.post(
    "/import",
    response_model=VideoImportResponse,
    responses={200: {"description": "Already in the path; nothing changed"}},
    status_code=201,
)
async def import_video(
    body: VideoImportRequest,
    response: Response,
    user: CurrentUser,
    db: DbSession,
    youtube: YouTube,
) -> VideoImportResponse:
    """Resolve a YouTube video URL and add it to one of the caller's learning paths.

    201 when added; 200 with `status: "skipped"` when the path already contains it.
    """
    youtube_video_id = parse_video_id(body.youtube_url)
    if youtube_video_id is None:
        raise ApiError(
            422,
            "INVALID_YOUTUBE_URL",
            "That doesn't look like a YouTube video link. Paste a link like "
            "https://www.youtube.com/watch?v=… or https://youtu.be/….",
            details=[{"supported_formats": list(SUPPORTED_VIDEO_URL_EXAMPLES)}],
        )

    try:
        result = await video_import.import_video(
            db,
            youtube,
            user_id=user.id,
            path_id=body.learning_path_id,
            youtube_video_id=youtube_video_id,
        )
    except video_import.PathNotFoundError:
        raise HTTPException(status_code=404, detail="Learning path not found") from None
    except YouTubeError as exc:
        # Nothing was written before the failure; the session rolls back when it closes.
        raise to_api_error(exc) from None

    await db.commit()
    if result.status == "skipped":
        response.status_code = 200
    v = result.video
    return VideoImportResponse(
        status=result.status,
        reason=result.reason,
        position=result.position,
        video=PathVideoMeta(
            id=v.id,
            youtube_video_id=v.youtube_video_id,
            title=v.title,
            channel_title=v.channel_title,
            thumbnail_url=v.thumbnail_url,
            duration_seconds=v.duration_seconds,
            availability_state=v.availability_state,
        ),
    )


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


def _progress_fields(video: Video, progress: VideoProgress | None) -> dict[str, object]:
    position = progress.last_position_seconds if progress else 0.0
    return {
        "learning_status": progress.learning_status if progress else "NOT_STARTED",
        "last_position_seconds": position,
        "playback_pct": progress_rules.playback_pct(position, video.duration_seconds),
        "ever_completed_at": progress.ever_completed_at if progress else None,
        "last_watched_at": progress.last_watched_at if progress else None,
    }


def _video_not_found() -> HTTPException:
    # Same answer for a video that doesn't exist and one the caller has no relationship with.
    return HTTPException(status_code=404, detail="Video not found")


@router.get("/{video_id}", response_model=VideoDetail)
async def get_video(video_id: uuid.UUID, user: CurrentUser, db: DbSession) -> VideoDetail:
    """A video the caller can open (it is in one of their paths, saved, or has their notes)."""
    video = await progress_repo.get_accessible_video(db, user.id, video_id)
    if video is None:
        raise _video_not_found()
    progress = await progress_repo.get_progress(db, user.id, video_id)
    return VideoDetail(video=_meta(video), **_progress_fields(video, progress))


@router.get("/{video_id}/progress", response_model=ProgressRead)
async def get_progress(video_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ProgressRead:
    video = await progress_repo.get_accessible_video(db, user.id, video_id)
    if video is None:
        raise _video_not_found()
    progress = await progress_repo.get_progress(db, user.id, video_id)
    return ProgressRead(video_id=video.id, **_progress_fields(video, progress))


@router.put("/{video_id}/progress", response_model=ProgressRead)
async def put_progress(
    video_id: uuid.UUID, body: ProgressUpdate, user: CurrentUser, db: DbSession
) -> ProgressRead:
    """Save playback position and/or a manual learning status. Idempotent upsert.

    The position is clamped to the video's duration when known. Playback alone starts a
    not-started video but never completes it or changes a revision flag. `ever_completed_at`
    is set the first time a student marks a video completed and is never cleared.
    """
    video = await progress_repo.get_accessible_video(db, user.id, video_id)
    if video is None:
        raise _video_not_found()

    current = await progress_repo.get_progress(db, user.id, video_id)
    status = current.learning_status if current else "NOT_STARTED"
    position = current.last_position_seconds if current else 0.0
    ever_completed_at = current.ever_completed_at if current else None
    last_watched_at = current.last_watched_at if current else None
    now = datetime.now(UTC)

    clamped = False
    if body.last_position_seconds is not None:
        position = progress_rules.clamp_position(body.last_position_seconds, video.duration_seconds)
        clamped = position != body.last_position_seconds
        status = progress_rules.status_after_position_update(status, position)
        last_watched_at = now
    if body.learning_status is not None:
        status, ever_completed_at = progress_rules.apply_manual_status(
            status, ever_completed_at, body.learning_status, now
        )

    saved = await progress_repo.upsert_progress(
        db,
        user.id,
        video_id,
        last_position_seconds=position,
        learning_status=status,
        ever_completed_at=ever_completed_at,
        last_watched_at=last_watched_at,
    )
    await db.commit()
    progress_updates_total.labels(outcome="clamped" if clamped else "updated").inc()
    return ProgressRead(video_id=video.id, **_progress_fields(video, saved))
