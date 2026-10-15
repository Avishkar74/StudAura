from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.progress import ProgressUpdate
from app.services.progress import apply_completion_event, reached_the_end

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)
EARLIER = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)


@pytest.mark.parametrize("status", ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"])
def test_a_clean_ending_completes_the_video(status: str) -> None:
    assert apply_completion_event(status, None, False, NOW) == ("COMPLETED", NOW, "completed")


def test_completing_again_keeps_the_first_completion_date() -> None:
    assert apply_completion_event("COMPLETED", EARLIER, False, NOW) == (
        "COMPLETED",
        EARLIER,
        "completed",
    )


@pytest.mark.parametrize("status", ["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVISION"])
def test_a_seeked_session_changes_nothing(status: str) -> None:
    assert apply_completion_event(status, None, True, NOW) == (status, None, "seeked")


def test_a_video_in_revision_stays_in_revision_and_keeps_its_history() -> None:
    assert apply_completion_event("NEEDS_REVISION", EARLIER, False, NOW) == (
        "NEEDS_REVISION",
        EARLIER,
        "kept_revision",
    )


@pytest.mark.parametrize(
    ("position", "duration", "expected"),
    [(600, 600, True), (595, 600, True), (500, 600, False), (0, 600, False), (3, None, True)],
)
def test_the_ended_position_must_be_at_the_end(
    position: float, duration: int | None, expected: bool
) -> None:
    assert reached_the_end(position, duration) is expected


def test_playback_ended_needs_a_position_and_the_seek_flag() -> None:
    ProgressUpdate(last_position_seconds=600, playback_ended=True, session_seeked=False)
    with pytest.raises(ValidationError):
        ProgressUpdate(playback_ended=True, session_seeked=False)
    with pytest.raises(ValidationError):
        ProgressUpdate(last_position_seconds=600, playback_ended=True)


def test_playback_ended_cannot_carry_a_manual_status() -> None:
    with pytest.raises(ValidationError):
        ProgressUpdate(
            last_position_seconds=600,
            playback_ended=True,
            session_seeked=False,
            learning_status="NEEDS_REVISION",
        )
