from datetime import UTC, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.core.errors import ApiError
from app.repositories import goals as goals_repo
from app.schemas.goals import GoalRead, GoalUpdate
from app.services import goals as goal_rules

router = APIRouter(prefix="/api/v1/goals", tags=["goals"])


def _timezone_or_422(name: str) -> ZoneInfo:
    tz = goal_rules.load_timezone(name)
    if tz is None:
        raise ApiError(422, "INVALID_TIMEZONE", "That isn't a timezone we recognise.")
    return tz


async def _summary(
    db: DbSession, user: CurrentUser, target: int | None, tz_name: str, tz: ZoneInfo
) -> GoalRead:
    now = datetime.now(UTC)
    today = goal_rules.today_in(tz, now)
    start, end = goal_rules.local_day_bounds(tz, today)
    watched = await goals_repo.watched_seconds_between(db, user.id, start, end)
    return GoalRead(
        daily_target_minutes=target,
        timezone=tz_name,
        today=today,
        today_watched_seconds=watched,
        goal_achieved=goal_rules.goal_achieved(target, watched),
    )


@router.get("", response_model=GoalRead)
async def get_goal(
    user: CurrentUser,
    db: DbSession,
    timezone: Annotated[str | None, Query(max_length=64)] = None,
) -> GoalRead:
    """The daily goal and today's tracked viewing time.

    Today is a day in the goal's timezone. Before a goal exists, `timezone` (the browser's) says
    which day to count; it defaults to UTC.
    """
    goal = await goals_repo.get_goal(db, user.id)
    if goal is not None:
        tz_name = goal.timezone
        tz = goal_rules.load_timezone(tz_name) or ZoneInfo("UTC")
        return await _summary(db, user, goal.daily_target_minutes, tz_name, tz)
    tz_name = timezone or "UTC"
    return await _summary(db, user, None, tz_name, _timezone_or_422(tz_name))


@router.put("", response_model=GoalRead)
async def put_goal(body: GoalUpdate, user: CurrentUser, db: DbSession) -> GoalRead:
    """Create or change the daily goal. Idempotent."""
    tz = _timezone_or_422(body.timezone)
    goal = await goals_repo.upsert_goal(db, user.id, body.daily_target_minutes, body.timezone)
    summary = await _summary(db, user, goal.daily_target_minutes, goal.timezone, tz)
    await db.commit()
    return summary
