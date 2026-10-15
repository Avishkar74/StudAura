import uuid

from fastapi import APIRouter, HTTPException, Response

from app.api.deps import CurrentUser, DbSession
from app.core.errors import ApiError
from app.models import VideoComment
from app.repositories import comments as comments_repo
from app.repositories import progress as progress_repo
from app.schemas.comments import CommentCreate, CommentRead

router = APIRouter(prefix="/api/v1", tags=["comments"])


def _read(comment: VideoComment) -> CommentRead:
    return CommentRead(
        id=comment.id,
        video_id=comment.video_id,
        body=comment.body,
        timestamp_seconds=comment.timestamp_seconds,
        created_at=comment.created_at,
    )


@router.get("/videos/{video_id}/comments", response_model=list[CommentRead])
async def list_comments(video_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[CommentRead]:
    """The caller's own comments on a video, newest first."""
    if await progress_repo.get_accessible_video(db, user.id, video_id) is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return [_read(c) for c in await comments_repo.list_comments(db, user.id, video_id)]


@router.post("/videos/{video_id}/comments", response_model=CommentRead, status_code=201)
async def add_comment(
    video_id: uuid.UUID, body: CommentCreate, user: CurrentUser, db: DbSession
) -> CommentRead:
    video = await progress_repo.get_accessible_video(db, user.id, video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")

    at = body.timestamp_seconds
    if at is not None and video.duration_seconds and at > video.duration_seconds:
        raise ApiError(
            422,
            "COMMENT_TIMESTAMP_OUT_OF_RANGE",
            "That timestamp is after the end of the video.",
        )

    comment = await comments_repo.add_comment(db, user.id, video_id, body.body, at)
    await db.commit()
    return _read(comment)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(comment_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    # Someone else's comment looks exactly like a missing one.
    if not await comments_repo.delete_comment(db, user.id, comment_id):
        raise HTTPException(status_code=404, detail="Comment not found")
    await db.commit()
    return Response(status_code=204)
