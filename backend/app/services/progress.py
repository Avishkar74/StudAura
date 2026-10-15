"""Pure progress rules (no HTTP, no database)."""


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
