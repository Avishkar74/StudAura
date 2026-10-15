from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services.revisions import (
    MAX_DAYS_AHEAD,
    default_due_date,
    due_date_problem,
    due_state,
    status_after_revised,
)

TODAY = date(2026, 10, 15)
KOLKATA = ZoneInfo("Asia/Kolkata")


def test_default_due_date_is_the_next_day_in_the_students_timezone() -> None:
    now = datetime(2026, 10, 15, 20, 0, tzinfo=UTC)  # already the 16th in Kolkata
    assert default_due_date(ZoneInfo("UTC"), now) == date(2026, 10, 16)
    assert default_due_date(KOLKATA, now) == date(2026, 10, 17)


def test_default_due_date_crosses_month_and_year() -> None:
    assert default_due_date(ZoneInfo("UTC"), datetime(2026, 12, 31, 12, tzinfo=UTC)) == date(
        2027, 1, 1
    )


@pytest.mark.parametrize(
    ("due", "expected"),
    [
        (date(2026, 10, 1), "overdue"),
        (date(2026, 10, 14), "overdue"),
        (TODAY, "due_today"),
        (date(2026, 10, 16), "upcoming"),
        (date(2027, 1, 1), "upcoming"),
    ],
)
def test_due_state(due: date, expected: str) -> None:
    assert due_state(due, TODAY) == expected


@pytest.mark.parametrize(
    ("due", "problem"),
    [
        (TODAY, False),
        (TODAY + timedelta(days=1), False),
        (TODAY + timedelta(days=MAX_DAYS_AHEAD), False),
        (TODAY - timedelta(days=1), True),
        (TODAY + timedelta(days=MAX_DAYS_AHEAD + 1), True),
    ],
)
def test_due_date_problem(due: date, problem: bool) -> None:
    assert (due_date_problem(due, TODAY) is not None) is problem


def test_revised_video_goes_back_to_completed_only_if_it_ever_was() -> None:
    assert status_after_revised(datetime(2026, 10, 1, tzinfo=UTC)) == "COMPLETED"
    assert status_after_revised(None) == "IN_PROGRESS"
