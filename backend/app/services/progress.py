"""Pure progress rules (no HTTP, no database)."""

from datetime import datetime
from typing import Literal

LearningStatus = Literal["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "NEEDS_REVISION"]


def completion_pct(completed: int, total: int) -> float:
    """Learning-path completion: distinct videos ever completed / total videos, one decimal.

    "Completed" means `ever_completed_at IS NOT NULL`, so a video later flagged NEEDS_REVISION
    still counts (PRD 7.4). Rewatching never pushes this above 100.
    """
    if total <= 0:
        return 0.0
    return round(min(completed, total) / total * 100, 1)


def playback_pct(position_seconds: float, duration_seconds: int | None) -> float | None:
    """Playback percentage, only when the duration is known; clamped to 0-100."""
    if not duration_seconds or duration_seconds <= 0:
        return None
    return round(max(0.0, min(position_seconds / duration_seconds * 100, 100.0)), 1)


def clamp_position(position: float, duration_seconds: int | None) -> float:
    """Keep a saved position within [0, duration] when the duration is known (TRD 6.3)."""
    position = max(0.0, position)
    if duration_seconds and duration_seconds > 0:
        position = min(position, float(duration_seconds))
    return position


def status_after_position_update(current: str, position: float) -> str:
    """Watching a not-yet-started video starts it. Any other status is left alone: playback
    alone must never complete a video or take it out of revision (PRD 7.3)."""
    if current == "NOT_STARTED" and position > 0:
        return "IN_PROGRESS"
    return current


def apply_manual_status(
    current: str,
    ever_completed_at: datetime | None,
    new_status: LearningStatus,
    now: datetime,
) -> tuple[str, datetime | None]:
    """A student-chosen status. Completing records `ever_completed_at` the first time; no choice
    ever clears it, so NEEDS_REVISION keeps the completion history (PRD 7.3, TRD 9.1)."""
    if new_status == "COMPLETED" and ever_completed_at is None:
        ever_completed_at = now
    return new_status, ever_completed_at


# How close to the end the player must report being for an ENDED event to count.
ENDED_TOLERANCE_SECONDS = 10.0


def reached_the_end(position: float, duration_seconds: int | None) -> bool:
    """An ENDED event only makes sense at the end of the video. When the duration is unknown
    there is nothing to check against, so the player's word is accepted."""
    if not duration_seconds or duration_seconds <= 0:
        return True
    return position >= duration_seconds - ENDED_TOLERANCE_SECONDS


def apply_completion_event(
    current: str,
    ever_completed_at: datetime | None,
    session_was_seeked: bool,
    now: datetime,
) -> tuple[str, datetime | None, str]:
    """The player reported ENDED. Returns (status, ever_completed_at, outcome).

    Only a clean session auto-completes: a seek proves nothing about the skipped content, so a
    seeked session changes nothing (PRD 7.3, TRD 9.1). A video in revision stays in revision
    (the student is re-studying it) but the playback does not clear its completion history.
    """
    if session_was_seeked:
        return current, ever_completed_at, "seeked"
    if current == "NEEDS_REVISION":
        return current, ever_completed_at, "kept_revision"
    return "COMPLETED", ever_completed_at or now, "completed"
