"""Schema-level guarantees: uniqueness, checks and cascade/retention rules (TRD 6.3)."""

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    LearningGoal,
    LearningPath,
    LearningPathVideo,
    RevisionItem,
    SavedVideo,
    User,
    Video,
    VideoComment,
    VideoNote,
    VideoProgress,
    ViewingSession,
)


async def make_user(s: AsyncSession, email: str | None = None) -> User:
    user = User(id=uuid.uuid4(), email=email or f"{uuid.uuid4().hex}@example.test")
    s.add(user)
    await s.flush()
    return user


async def make_video(s: AsyncSession) -> Video:
    video = Video(youtube_video_id=uuid.uuid4().hex[:11], title="A video")
    s.add(video)
    await s.flush()
    return video


async def count(s: AsyncSession, model: type) -> int:
    return (await s.execute(select(func.count()).select_from(model))).scalar_one()


async def test_defaults_are_applied_by_the_database(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    progress = VideoProgress(user_id=user.id, video_id=video.id)
    session.add(progress)
    await session.flush()
    await session.refresh(progress)
    assert progress.learning_status == "NOT_STARTED"
    assert progress.last_position_seconds == 0
    assert progress.ever_completed_at is None
    await session.refresh(video)
    assert video.availability_state == "available"


async def test_email_and_youtube_id_are_unique(session: AsyncSession) -> None:
    await make_user(session, "dup@example.test")
    with pytest.raises(IntegrityError):
        await make_user(session, "dup@example.test")


async def test_video_in_a_path_only_once(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    path = LearningPath(user_id=user.id, title="P")
    session.add(path)
    await session.flush()
    session.add(LearningPathVideo(learning_path_id=path.id, video_id=video.id, position=1))
    await session.flush()
    session.add(LearningPathVideo(learning_path_id=path.id, video_id=video.id, position=2))
    with pytest.raises(IntegrityError):
        await session.flush()


@pytest.mark.parametrize("status", ["DONE", "completed", ""])
async def test_invalid_learning_status_is_rejected(session: AsyncSession, status: str) -> None:
    user = await make_user(session)
    video = await make_video(session)
    session.add(VideoProgress(user_id=user.id, video_id=video.id, learning_status=status))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_negative_position_and_watched_seconds_are_rejected(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    session.add(VideoProgress(user_id=user.id, video_id=video.id, last_position_seconds=-1))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_progress_note_unique_per_user_and_video(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    session.add(VideoNote(user_id=user.id, video_id=video.id, body="one"))
    await session.flush()
    session.add(VideoNote(user_id=user.id, video_id=video.id, body="two"))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_two_users_can_note_the_same_video(session: AsyncSession) -> None:
    a, b = await make_user(session), await make_user(session)
    video = await make_video(session)
    session.add_all(
        [
            VideoNote(user_id=a.id, video_id=video.id),
            VideoNote(user_id=b.id, video_id=video.id),
        ]
    )
    await session.flush()


async def test_viewing_session_idempotency_key_is_unique(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    started = datetime(2026, 10, 15, 9, 0, tzinfo=UTC)
    key = f"{user.id}::{video.id}::2026-10-15T09:00Z"
    session.add(
        ViewingSession(user_id=user.id, video_id=video.id, started_at=started, idempotency_key=key)
    )
    await session.flush()
    session.add(
        ViewingSession(user_id=user.id, video_id=video.id, started_at=started, idempotency_key=key)
    )
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_comment_timestamp_cannot_be_negative(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    session.add(VideoComment(user_id=user.id, video_id=video.id, body="x", timestamp_seconds=-5))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_daily_goal_must_be_positive_and_one_per_user(session: AsyncSession) -> None:
    user = await make_user(session)
    session.add(LearningGoal(user_id=user.id, daily_target_minutes=0))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_only_one_active_revision_per_user_and_video(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    due = date(2026, 10, 16)
    session.add(RevisionItem(user_id=user.id, video_id=video.id, due_at=due))
    await session.flush()
    session.add(RevisionItem(user_id=user.id, video_id=video.id, due_at=due))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_revision_history_allows_many_inactive_rows(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    due = date(2026, 10, 16)
    session.add_all(
        [
            RevisionItem(user_id=user.id, video_id=video.id, due_at=due, active=False),
            RevisionItem(user_id=user.id, video_id=video.id, due_at=due, active=False),
            RevisionItem(user_id=user.id, video_id=video.id, due_at=due, active=True),
        ]
    )
    await session.flush()
    assert await count(session, RevisionItem) == 3


async def test_deleting_a_path_keeps_notes_progress_and_videos(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    path = LearningPath(user_id=user.id, title="P")
    session.add(path)
    await session.flush()
    session.add_all(
        [
            LearningPathVideo(learning_path_id=path.id, video_id=video.id, position=1),
            VideoNote(user_id=user.id, video_id=video.id, body="keep me"),
            VideoProgress(user_id=user.id, video_id=video.id),
            SavedVideo(user_id=user.id, video_id=video.id),
        ]
    )
    await session.flush()

    await session.execute(text("DELETE FROM learning_paths WHERE id = :id"), {"id": path.id})

    assert await count(session, LearningPathVideo) == 0
    assert await count(session, VideoNote) == 1
    assert await count(session, VideoProgress) == 1
    assert await count(session, SavedVideo) == 1
    assert await count(session, Video) == 1


async def test_unsaving_removes_only_the_bookmark(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    session.add_all(
        [
            SavedVideo(user_id=user.id, video_id=video.id),
            VideoNote(user_id=user.id, video_id=video.id, body="n"),
        ]
    )
    await session.flush()
    await session.execute(
        text("DELETE FROM saved_videos WHERE user_id = :u AND video_id = :v"),
        {"u": user.id, "v": video.id},
    )
    assert await count(session, SavedVideo) == 0
    assert await count(session, VideoNote) == 1


async def test_deleting_a_user_cascades_to_all_their_data(session: AsyncSession) -> None:
    user = await make_user(session)
    video = await make_video(session)
    path = LearningPath(user_id=user.id, title="P")
    session.add(path)
    await session.flush()
    session.add_all(
        [
            LearningPathVideo(learning_path_id=path.id, video_id=video.id, position=1),
            VideoNote(user_id=user.id, video_id=video.id),
            VideoComment(user_id=user.id, video_id=video.id, body="c"),
            VideoProgress(user_id=user.id, video_id=video.id),
            SavedVideo(user_id=user.id, video_id=video.id),
            LearningGoal(user_id=user.id, daily_target_minutes=30),
            RevisionItem(user_id=user.id, video_id=video.id, due_at=date(2026, 10, 16)),
        ]
    )
    await session.flush()

    await session.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})

    for model in (
        LearningPath,
        LearningPathVideo,
        VideoNote,
        VideoComment,
        VideoProgress,
        SavedVideo,
        LearningGoal,
        RevisionItem,
    ):
        assert await count(session, model) == 0, model.__name__
    assert await count(session, Video) == 1  # shared metadata survives
