"""Import one YouTube video into one of a user's learning paths."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import import_attempts_total
from app.integrations.youtube.errors import YouTubeError
from app.integrations.youtube.models import YouTubeClient
from app.models import Video
from app.repositories import learning_paths as paths_repo
from app.repositories import videos as videos_repo

# Shared metadata younger than this is reused, which saves YouTube API quota.
METADATA_TTL = timedelta(days=7)


class PathNotFoundError(Exception):
    """The path doesn't exist or isn't the caller's."""


@dataclass(frozen=True)
class ImportResult:
    status: Literal["added", "skipped"]
    reason: str | None
    position: int
    video: Video


def _is_fresh(video: Video, now: datetime) -> bool:
    fetched = video.metadata_fetched_at
    return fetched is not None and now - fetched < METADATA_TTL


async def import_video(
    db: AsyncSession,
    client: YouTubeClient,
    *,
    user_id: uuid.UUID,
    path_id: uuid.UUID,
    youtube_video_id: str,
) -> ImportResult:
    """Add the video to the path, or report that it is already there.

    Order matters: ownership is checked before any YouTube call so other people's paths never
    cost quota, and the slow external call happens before the path row is locked.
    The caller commits.
    """
    if await paths_repo.get_path(db, user_id, path_id) is None:
        raise PathNotFoundError

    video = await videos_repo.get_by_youtube_id(db, youtube_video_id)
    if video is None or not _is_fresh(video, datetime.now(UTC)):
        try:
            meta = await client.get_video(youtube_video_id)
        except YouTubeError:
            import_attempts_total.labels(result="failed").inc()
            raise
        video = await videos_repo.upsert_video(db, meta)

    # Lock the path so concurrent imports get distinct positions.
    if await paths_repo.get_path(db, user_id, path_id, for_update=True) is None:
        raise PathNotFoundError

    import_attempts_total.labels(result="success").inc()
    existing, position = await videos_repo.membership_and_next_position(db, path_id, video.id)
    if existing is not None:
        return ImportResult("skipped", "already_in_path", existing, video)

    await videos_repo.add_to_path(db, path_id, video.id, position)
    return ImportResult("added", None, position, video)
