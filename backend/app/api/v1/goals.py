from datetime import UTC, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, resolve_timezone
from app.core.errors import ApiError
from app.repositories import goals as goals_repo
from app.schemas.goals import DayTotal, GoalRead, GoalUpdate, PathDeadline
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
    days = goal_rules.last_seven_days(today)
    week_start, _ = goal_rules.local_day_bounds(tz, days[0])
    totals = await goals_repo.daily_totals(db, user.id, tz_name, week_start, end)
    daily = [DayTotal(date=d, watched_seconds=totals.get(d, 0)) for d in days]
    return GoalRead(
        daily_target_minutes=target,
        timezone=tz_name,
        today=today,
        today_watched_seconds=watched,
        week_watched_seconds=sum(d.watched_seconds for d in daily),
        daily=daily,
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


@router.get("/deadlines", response_model=list[PathDeadline])
async def list_deadlines(
    user: CurrentUser,
    db: DbSession,
    timezone: Annotated[str | None, Query(max_length=64)] = None,
) -> list[PathDeadline]:
    """Paths with a target date that still have videos to complete, soonest first, with the
    minutes a day needed to finish in time. An estimate from known video lengths."""
    _, tz = await resolve_timezone(db, user, timezone)
    today = goal_rules.today_in(tz, datetime.now(UTC))
    out: list[PathDeadline] = []
    for path_id, title, target, remaining, seconds, unknown in await goals_repo.path_deadlines(
        db, user.id
    ):
        if remaining == 0:
            continue  # nothing left to plan
        out.append(
            PathDeadline(
                path_id=path_id,
                title=title,
                target_date=target,
                remaining_videos=remaining,
                remaining_seconds=seconds,
                videos_without_duration=unknown,
                days_remaining=(target - today).days,
                minutes_per_day=goal_rules.deadline_estimate_minutes_per_day(
                    seconds, target, today
                ),
            )
        )
    return out
