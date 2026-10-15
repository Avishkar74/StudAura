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
