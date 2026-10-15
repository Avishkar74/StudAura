from fastapi import APIRouter, HTTPException

from app.api.deps import CurrentUser, DbSession, YouTube
from app.api.youtube_errors import to_api_error
from app.core.errors import ApiError
from app.integrations.youtube.errors import YouTubeError
from app.schemas.playlist import PlaylistImportItem, PlaylistImportRequest, PlaylistImportResponse
from app.services import playlist_import, video_import
from app.services.youtube_urls import SUPPORTED_PLAYLIST_URL_EXAMPLES, parse_playlist_id

router = APIRouter(prefix="/api/v1/playlists", tags=["playlists"])


@router.post("/import", response_model=PlaylistImportResponse)
async def import_playlist(
    body: PlaylistImportRequest,
    user: CurrentUser,
    db: DbSession,
    youtube: YouTube,
) -> PlaylistImportResponse:
    """Import one page (up to 50 videos) of a YouTube playlist into a learning path.

    Videos are appended in playlist order. Unavailable videos are reported per item and do not
    stop the rest. If `next_page_token` is set, call again with it to continue; calling again
    for the same playlist is safe because videos already in the path are skipped.
    """
    playlist_id = parse_playlist_id(body.youtube_url)
    if playlist_id is None:
        raise ApiError(
            422,
            "INVALID_YOUTUBE_PLAYLIST_URL",
            "That doesn't look like a YouTube playlist link. Paste a link like "
            "https://www.youtube.com/playlist?list=….",
            details=[{"supported_formats": list(SUPPORTED_PLAYLIST_URL_EXAMPLES)}],
        )

    try:
        result = await playlist_import.import_playlist_page(
            db,
            youtube,
            user_id=user.id,
            path_id=body.learning_path_id,
            playlist_id=playlist_id,
            page_token=body.page_token,
        )
    except video_import.PathNotFoundError:
        raise HTTPException(status_code=404, detail="Learning path not found") from None
    except YouTubeError as exc:
        # Nothing was written before the failure; the session rolls back when it closes.
        raise to_api_error(exc) from None

    await db.commit()
    return PlaylistImportResponse(
        added=result.count("added"),
        skipped=result.count("skipped"),
        failed=result.count("failed"),
        total_in_playlist=result.total_in_playlist,
        next_page_token=result.next_page_token,
        items=[
            PlaylistImportItem(
                youtube_video_id=i.youtube_video_id,
                status=i.status,
                title=i.title,
                position=i.position,
                reason=i.reason,
                video_id=i.video.id if i.video else None,
                availability_state=i.video.availability_state if i.video else None,
            )
            for i in result.items
        ],
    )
