import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.models import Video, VideoProgress
from app.repositories import progress as progress_repo
from app.repositories import videos as videos_repo
from app.schemas.dashboard import DashboardLearning, LearningItem
from app.schemas.learning_path import PathRef, PathVideoMeta
from app.services import progress as progress_rules

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


def _item(
    progress: VideoProgress,
    video: Video,
    paths: dict[uuid.UUID, tuple[uuid.UUID, str]],
) -> LearningItem:
    assert progress.last_watched_at is not None  # the queries only return watched videos
    path = paths.get(video.id)
    return LearningItem(
        video_id=video.id,
        video=PathVideoMeta(
            id=video.id,
            youtube_video_id=video.youtube_video_id,
            title=video.title,
            channel_title=video.channel_title,
            thumbnail_url=video.thumbnail_url,
            duration_seconds=video.duration_seconds,
            availability_state=video.availability_state,
        ),
        path=PathRef(id=path[0], title=path[1]) if path else None,
        learning_status=progress.learning_status,
        last_position_seconds=progress.last_position_seconds,
        playback_pct=progress_rules.playback_pct(
            progress.last_position_seconds, video.duration_seconds
        ),
        last_watched_at=progress.last_watched_at,
    )


@router.get("/dashboard", response_model=DashboardLearning)
async def get_dashboard(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=20)] = 6,
) -> DashboardLearning:
    """What to pick up next: the video to continue, and the latest videos watched."""
    continuing = await progress_repo.recently_watched(db, user.id, 1, unfinished_only=True)
    recent = await progress_repo.recently_watched(db, user.id, limit)
    ids = list({video.id for _, video in [*continuing, *recent]})
    paths = await videos_repo.paths_for_videos(db, user.id, ids)
    return DashboardLearning(
        continue_learning=_item(*continuing[0], paths) if continuing else None,
        recently_watched=[_item(p, v, paths) for p, v in recent],
    )
