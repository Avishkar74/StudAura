from datetime import UTC, datetime

import pytest

from app.schemas.progress import ProgressUpdate
from app.services.progress import (
    apply_manual_status,
    clamp_position,
    status_after_position_update,
)

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)
EARLIER = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("position", "duration", "expected"),
    [
        (0, 600, 0.0),
        (125.5, 600, 125.5),
        (600, 600, 600.0),
        (9999, 600, 600.0),  # past the end
        (-5, 600, 0.0),  # before the start
        (9999, None, 9999.0),  # unknown duration: nothing to clamp to
        (9999, 0, 9999.0),
        (-1, None, 0.0),
    ],
)
def test_clamp_position(position: float, duration: int | None, expected: float) -> None:
    assert clamp_position(position, duration) == expected


@pytest.mark.parametrize(
    ("current", "position", "expected"),
    [
        ("NOT_STARTED", 0, "NOT_STARTED"),  # opening a video is not watching it
        ("NOT_STARTED", 0.5, "IN_PROGRESS"),
        ("NOT_STARTED", 300, "IN_PROGRESS"),
        ("IN_PROGRESS", 300, "IN_PROGRESS"),
        ("COMPLETED", 10, "COMPLETED"),  # rewatching does not undo completion
        ("NEEDS_REVISION", 10, "NEEDS_REVISION"),  # nor take it out of revision
    ],
)
def test_status_after_position_update(current: str, position: float, expected: str) -> None:
    assert status_after_position_update(current, position) == expected


def test_completing_records_the_first_completion_time() -> None:
    assert apply_manual_status("IN_PROGRESS", None, "COMPLETED", NOW) == ("COMPLETED", NOW)


def test_completing_again_keeps_the_original_completion_time() -> None:
    assert apply_manual_status("COMPLETED", EARLIER, "COMPLETED", NOW) == ("COMPLETED", EARLIER)


@pytest.mark.parametrize("new_status", ["NEEDS_REVISION", "IN_PROGRESS", "NOT_STARTED"])
def test_no_manual_status_ever_clears_completion_history(new_status: str) -> None:
    status, completed = apply_manual_status("COMPLETED", EARLIER, new_status, NOW)  # type: ignore[arg-type]
    assert status == new_status
    assert completed == EARLIER


def test_needs_revision_without_history_does_not_invent_a_completion() -> None:
    assert apply_manual_status("IN_PROGRESS", None, "NEEDS_REVISION", NOW) == (
        "NEEDS_REVISION",
        None,
    )


def test_update_needs_a_position_or_a_status() -> None:
    with pytest.raises(ValueError, match="send last_position_seconds"):
        ProgressUpdate.model_validate({})
    assert ProgressUpdate.model_validate({"last_position_seconds": 0}).last_position_seconds == 0
    assert ProgressUpdate.model_validate({"learning_status": "COMPLETED"}).learning_status


@pytest.mark.parametrize("bad", [-1, float("nan"), float("inf"), "abc"])
def test_update_rejects_bad_positions(bad: object) -> None:
    with pytest.raises(ValueError):
        ProgressUpdate.model_validate({"last_position_seconds": bad})
