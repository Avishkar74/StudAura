"""Pure revision-queue rules (no HTTP, no database)."""

from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

DueState = Literal["overdue", "due_today", "upcoming"]

# A revision can be pushed this far ahead and no further.
MAX_DAYS_AHEAD = 365


def default_due_date(tz: ZoneInfo, now: datetime) -> date:
    """The next calendar day in the student's timezone (TRD 9.5)."""
    return now.astimezone(tz).date() + timedelta(days=1)


def due_state(due_at: date, today: date) -> DueState:
    if due_at < today:
        return "overdue"
    return "due_today" if due_at == today else "upcoming"


def due_date_problem(due_at: date, today: date) -> str | None:
    """Why `due_at` can't be used for a new schedule, or None when it is fine.

    The past is refused: scheduling a revision "yesterday" is a mistake, and an overdue item
    is the result of time passing, not of the student asking for it.
    """
    if due_at < today:
        return "A revision can't be scheduled in the past."
    if due_at > today + timedelta(days=MAX_DAYS_AHEAD):
        return "That's too far ahead. Pick a date within a year."
    return None


def status_after_revised(ever_completed_at: datetime | None) -> str:
    """The learning status once a revision is done.

    A video that was completed before goes back to COMPLETED. One that never was completed but
    was flagged for revision and revisited is IN_PROGRESS: the student is not done with it, and
    revising it does not make it complete (PRD 7.3, 7.6).
    """
    return "COMPLETED" if ever_completed_at is not None else "IN_PROGRESS"
