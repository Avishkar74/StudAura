"""Import one page (up to 50 entries) of a YouTube playlist into a learning path.

The API imports a page per request and hands back the next page token, so a long playlist is a
series of short, bounded requests. Every page commits its own work, which is what makes a
failure part-way through harmless: earlier pages stay imported, and re-running skips them.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import import_attempts_total
from app.integrations.youtube.errors import YouTubeError
from app.integrations.youtube.models import YouTubeClient
from app.models import Video
from app.repositories import learning_paths as paths_repo
from app.repositories import videos as videos_repo
from app.services.video_import import METADATA_TTL, PathNotFoundError

ItemStatus = Literal["added", "skipped", "failed"]


@dataclass(frozen=True)
class ItemResult:
    youtube_video_id: str
    status: ItemStatus
    title: str | None
    position: int | None = None
    reason: str | None = None
    video: Video | None = None


@dataclass(frozen=True)
class PageResult:
    items: list[ItemResult]
    total_in_playlist: int | None
    next_page_token: str | None

    def count(self, status: ItemStatus) -> int:
        return sum(1 for i in self.items if i.status == status)


def _is_fresh(video: Video, now: datetime) -> bool:
    fetched = video.metadata_fetched_at
    return fetched is not None and now - fetched < METADATA_TTL


async def import_playlist_page(
    db: AsyncSession,
    client: YouTubeClient,
    *,
    user_id: uuid.UUID,
    path_id: uuid.UUID,
    playlist_id: str,
    page_token: str | None,
) -> PageResult:
    """Fetch one playlist page and add its available videos to the path in playlist order.

    Ownership is checked before any YouTube call. Videos YouTube will not describe (private or
    deleted) are reported as failed and never stored; the rest of the page still imports.
    The caller commits nothing: this function commits once, after the page is complete.
    """
    if await paths_repo.get_path(db, user_id, path_id) is None:
        raise PathNotFoundError

    try:
        page = await client.get_playlist_page(playlist_id, page_token)

        # Keep first occurrences only; a video listed twice is imported once.
        entries = list({e.youtube_video_id: e for e in page.entries}.values())
        ids = [e.youtube_video_id for e in entries]
        known = await videos_repo.get_by_youtube_ids(db, ids)
        now = datetime.now(UTC)
        need_fetch = [i for i in ids if i not in known or not _is_fresh(known[i], now)]
        fetched = await client.get_videos(need_fetch) if need_fetch else {}
    except YouTubeError:
        import_attempts_total.labels(result="failed").inc()
        raise

    videos = {**{i: v for i, v in known.items() if i not in need_fetch}}
    videos.update(await videos_repo.upsert_videos(db, list(fetched.values())))

    # Serialise position assignment with other imports into the same path.
    if await paths_repo.get_path(db, user_id, path_id, for_update=True) is None:
        raise PathNotFoundError
    present = await videos_repo.memberships_in_path(db, path_id, [v.id for v in videos.values()])
    position = await videos_repo.next_position(db, path_id)

    results: list[ItemResult] = []
    for entry in entries:
        video = videos.get(entry.youtube_video_id)
        if video is None:
            results.append(
                ItemResult(entry.youtube_video_id, "failed", entry.title, reason="unavailable")
            )
        elif video.id in present:
            results.append(
                ItemResult(
                    entry.youtube_video_id,
                    "skipped",
                    video.title,
                    position=present[video.id],
                    reason="already_in_path",
                    video=video,
                )
            )
        else:
            await videos_repo.add_to_path(db, path_id, video.id, position)
            results.append(
                ItemResult(
                    entry.youtube_video_id, "added", video.title, position=position, video=video
                )
            )
            position += 1

    result = PageResult(results, page.total_results, page.next_page_token)
    import_attempts_total.labels(result="partial" if result.count("failed") else "success").inc()
    return result
