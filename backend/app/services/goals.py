"""Pure goal and viewing-time rules (no HTTP, no database)."""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# A viewing session can't have watched more than the time that has passed since it started,
# give or take clock drift between the browser and the server.
CLOCK_SLACK_SECONDS = 5
MAX_SESSION_AGE = timedelta(days=7)
MAX_CLOCK_AHEAD = timedelta(minutes=5)


def load_timezone(name: str) -> ZoneInfo | None:
    """The IANA zone called `name`, or None when it isn't one."""
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return None


def session_key(user_id: uuid.UUID, video_id: uuid.UUID, started_at: datetime) -> str:
    """Idempotency key: user, video and the start truncated to the minute (TRD 5, PRD 7.5)."""
    minute = started_at.astimezone(UTC).replace(second=0, microsecond=0)
    return f"{user_id}:{video_id}:{minute.strftime('%Y-%m-%dT%H:%MZ')}"


def start_is_plausible(started_at: datetime, now: datetime) -> bool:
    """A session starts in the past (allowing for clock drift) and not too long ago."""
    return now - MAX_SESSION_AGE <= started_at <= now + MAX_CLOCK_AHEAD


def credited_seconds(reported: int, stored: int, started_at: datetime, now: datetime) -> int:
    """Watched seconds to keep for a session after a ping reporting `reported` in total.

    The client reports the running total of observed playing time, so repeating or reordering
    pings can't add time twice: the stored value only ever goes up to the largest report. It is
    capped by the wall-clock time since the session began, because nobody watches for longer
    than that.
    """
    ceiling = max(0, int((now - started_at).total_seconds())) + CLOCK_SLACK_SECONDS
    return max(stored, min(max(reported, 0), ceiling))


def local_day_bounds(tz: ZoneInfo, day: date) -> tuple[datetime, datetime]:
    """The UTC instants that start and end the calendar `day` in `tz` (end is exclusive)."""
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
    return start.astimezone(UTC), end.astimezone(UTC)


def today_in(tz: ZoneInfo, now: datetime) -> date:
    return now.astimezone(tz).date()


def daily_watched_seconds(sessions: list[tuple[datetime, int]], tz: ZoneInfo, day: date) -> int:
    """Total watched seconds of the (started_at, watched_seconds) sessions that began on `day`."""
    return sum(seconds for started, seconds in sessions if started.astimezone(tz).date() == day)


def goal_achieved(target_minutes: int | None, watched_seconds: int) -> bool:
    return target_minutes is not None and watched_seconds >= target_minutes * 60
