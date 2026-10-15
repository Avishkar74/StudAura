import pytest

from app.schemas.learning_path import LearningPathCreate, LearningPathUpdate
from app.services.progress import completion_pct, playback_pct


@pytest.mark.parametrize(
    ("completed", "total", "expected"),
    [
        (0, 0, 0.0),  # empty path
        (0, 10, 0.0),
        (1, 3, 33.3),
        (2, 3, 66.7),
        (24, 60, 40.0),
        (60, 60, 100.0),
        (70, 60, 100.0),  # never above 100
        (5, -1, 0.0),
    ],
)
def test_completion_pct(completed: int, total: int, expected: float) -> None:
    assert completion_pct(completed, total) == expected


@pytest.mark.parametrize(
    ("position", "duration", "expected"),
    [
        (0, 100, 0.0),
        (32, 50, 64.0),
        (500, 100, 100.0),  # clamped
        (-5, 100, 0.0),  # clamped
        (10, None, None),  # unknown duration
        (10, 0, None),
    ],
)
def test_playback_pct(position: float, duration: int | None, expected: float | None) -> None:
    assert playback_pct(position, duration) == expected


def test_create_schema_trims_and_normalises() -> None:
    body = LearningPathCreate(title="  Hello  ", description="  ")
    assert body.title == "Hello"
    assert body.description is None


def test_update_schema_distinguishes_omitted_from_null() -> None:
    omitted = LearningPathUpdate.model_validate({})
    cleared = LearningPathUpdate.model_validate({"description": None})
    assert omitted.model_fields_set == set()
    assert cleared.model_fields_set == {"description"}


def test_update_schema_rejects_null_title() -> None:
    with pytest.raises(ValueError, match="title cannot be null"):
        LearningPathUpdate.model_validate({"title": None})
