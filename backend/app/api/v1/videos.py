from fastapi import APIRouter, HTTPException, Response

from app.api.deps import CurrentUser, DbSession, YouTube
from app.api.youtube_errors import to_api_error
from app.core.errors import ApiError
from app.integrations.youtube.errors import YouTubeError
from app.schemas.learning_path import PathVideoMeta
from app.schemas.video import VideoImportRequest, VideoImportResponse
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
