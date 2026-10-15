import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services.goals import (
    CLOCK_SLACK_SECONDS,
    credited_seconds,
    daily_watched_seconds,
    goal_achieved,
    load_timezone,
    local_day_bounds,
    session_key,
    start_is_plausible,
    today_in,
)

NOW = datetime(2026, 10, 15, 12, 0, 0, tzinfo=UTC)
KOLKATA = ZoneInfo("Asia/Kolkata")
USER = uuid.UUID(int=1)
VIDEO = uuid.UUID(int=2)


def test_session_key_is_the_same_within_a_minute_and_differs_across_minutes() -> None:
    a = session_key(USER, VIDEO, NOW.replace(second=5))
    b = session_key(USER, VIDEO, NOW.replace(second=58, microsecond=999))
    c = session_key(USER, VIDEO, NOW + timedelta(minutes=1))
    assert a == b
    assert a != c


def test_session_key_depends_on_user_and_video() -> None:
    base = session_key(USER, VIDEO, NOW)
    assert session_key(uuid.UUID(int=3), VIDEO, NOW) != base
    assert session_key(USER, uuid.UUID(int=3), NOW) != base


def test_session_key_ignores_the_offset_the_client_used() -> None:
    local = NOW.astimezone(KOLKATA)
    assert session_key(USER, VIDEO, local) == session_key(USER, VIDEO, NOW)


@pytest.mark.parametrize(
    ("offset", "ok"),
    [
        (timedelta(0), True),
        (timedelta(hours=-3), True),
        (timedelta(minutes=4), True),  # a little clock drift
        (timedelta(minutes=10), False),  # starts in the future
        (timedelta(days=-6), True),
        (timedelta(days=-8), False),  # far too old
    ],
)
def test_start_plausibility(offset: timedelta, ok: bool) -> None:
    assert start_is_plausible(NOW + offset, NOW) is ok


class TestCreditedSeconds:
    start = NOW - timedelta(minutes=10)

    def test_takes_the_reported_total(self) -> None:
        assert credited_seconds(300, 0, self.start, NOW) == 300

    def test_repeating_a_ping_changes_nothing(self) -> None:
        assert credited_seconds(300, 300, self.start, NOW) == 300

    def test_a_late_lower_ping_never_lowers_the_total(self) -> None:
        assert credited_seconds(120, 300, self.start, NOW) == 300

    def test_cannot_exceed_the_time_since_the_session_began(self) -> None:
        assert credited_seconds(99999, 0, self.start, NOW) == 600 + CLOCK_SLACK_SECONDS

    def test_a_session_that_just_began_credits_almost_nothing(self) -> None:
        assert credited_seconds(500, 0, NOW, NOW) == CLOCK_SLACK_SECONDS

    def test_negative_reports_credit_nothing(self) -> None:
        assert credited_seconds(-50, 0, self.start, NOW) == 0

    def test_a_start_slightly_in_the_future_is_not_negative(self) -> None:
        assert credited_seconds(100, 0, NOW + timedelta(minutes=1), NOW) == CLOCK_SLACK_SECONDS


def test_local_day_bounds_in_utc() -> None:
    start, end = local_day_bounds(ZoneInfo("UTC"), date(2026, 10, 15))
    assert (start, end) == (
        datetime(2026, 10, 15, tzinfo=UTC),
        datetime(2026, 10, 16, tzinfo=UTC),
    )


def test_local_day_bounds_follow_the_timezone() -> None:
    start, end = local_day_bounds(KOLKATA, date(2026, 10, 15))
    assert start == datetime(2026, 10, 14, 18, 30, tzinfo=UTC)
    assert end == datetime(2026, 10, 15, 18, 30, tzinfo=UTC)


def test_a_dst_day_is_not_always_24_hours() -> None:
    ny = ZoneInfo("America/New_York")
    start, end = local_day_bounds(ny, date(2026, 11, 1))  # clocks go back
    assert end - start == timedelta(hours=25)


def test_today_depends_on_the_timezone() -> None:
    late = datetime(2026, 10, 15, 20, 0, tzinfo=UTC)  # already the 16th in Kolkata
    assert today_in(ZoneInfo("UTC"), late) == date(2026, 10, 15)
    assert today_in(KOLKATA, late) == date(2026, 10, 16)


def test_daily_total_counts_only_sessions_that_started_that_local_day() -> None:
    sessions = [
        (datetime(2026, 10, 15, 18, 29, tzinfo=UTC), 100),  # 23:59 on the 15th in Kolkata
        (datetime(2026, 10, 15, 18, 31, tzinfo=UTC), 40),  # 00:01 on the 16th in Kolkata
        (datetime(2026, 10, 14, 20, 0, tzinfo=UTC), 7),  # 01:30 on the 15th in Kolkata
    ]
    assert daily_watched_seconds(sessions, KOLKATA, date(2026, 10, 15)) == 107
    assert daily_watched_seconds(sessions, KOLKATA, date(2026, 10, 16)) == 40
    assert daily_watched_seconds(sessions, ZoneInfo("UTC"), date(2026, 10, 15)) == 140
    assert daily_watched_seconds([], KOLKATA, date(2026, 10, 15)) == 0


@pytest.mark.parametrize(
    ("target", "watched", "expected"),
    [(None, 9999, False), (60, 3599, False), (60, 3600, True), (60, 7200, True), (1, 0, False)],
)
def test_goal_achieved(target: int | None, watched: int, expected: bool) -> None:
    assert goal_achieved(target, watched) is expected


@pytest.mark.parametrize("name", ["UTC", "Asia/Kolkata", "America/New_York"])
def test_valid_timezones_load(name: str) -> None:
    assert load_timezone(name) is not None


@pytest.mark.parametrize("name", ["", "Mars/Olympus", "../etc/passwd", "not a zone", "x" * 80])
def test_invalid_timezones_are_none(name: str) -> None:
    assert load_timezone(name) is None
