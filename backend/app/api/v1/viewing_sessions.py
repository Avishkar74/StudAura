from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from app.api.deps import CurrentUser, DbSession
from app.core.errors import ApiError
from app.core.metrics import viewing_session_pings_total
from app.repositories import goals as goals_repo
from app.repositories import progress as progress_repo
from app.schemas.goals import ViewingSessionRead, ViewingSessionUpdate
from app.services import goals as goal_rules

router = APIRouter(prefix="/api/v1/viewing-sessions", tags=["goals"])


@router.post("", response_model=ViewingSessionRead)
async def record_viewing_session(
    body: ViewingSessionUpdate, user: CurrentUser, db: DbSession
) -> ViewingSessionRead:
    """Record the observed playing time of one viewing. Idempotent.

    The player sends the running total for the viewing (time it was actually playing, not paused,
    seeking or merely open). A repeated or late ping can't add time twice or lower the total, and
    the total can't exceed the real time since the viewing began.
    """
    if await progress_repo.get_accessible_video(db, user.id, body.video_id) is None:
        raise HTTPException(status_code=404, detail="Video not found")

    now = datetime.now(UTC)
    if not goal_rules.start_is_plausible(body.started_at, now):
        viewing_session_pings_total.labels(outcome="rejected").inc()
        raise ApiError(
            422, "INVALID_SESSION_START", "That viewing session didn't start at a believable time."
        )

    key = goal_rules.session_key(user.id, body.video_id, body.started_at)
    existing = await goals_repo.get_session(db, user.id, key)
    stored = existing.watched_seconds if existing else 0
    start = existing.started_at if existing else body.started_at
    keep = goal_rules.credited_seconds(body.watched_seconds, stored, start, now)

    total = await goals_repo.record_session(
        db,
        user.id,
        body.video_id,
        key=key,
        started_at=body.started_at,
        now=now,
        watched_seconds=keep,
    )
    await db.commit()
    viewing_session_pings_total.labels(outcome="updated" if existing else "created").inc()
    return ViewingSessionRead(watched_seconds=total)
