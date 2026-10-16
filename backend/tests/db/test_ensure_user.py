"""ensure_user runs on every authenticated request; the common case must not write."""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.repositories import users as users_repo


@pytest.fixture
def commits(session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """Counts commits made through the session."""
    seen: list[int] = []
    original = session.commit

    async def spy() -> None:
        seen.append(1)
        await original()

    monkeypatch.setattr(session, "commit", spy)
    return seen


async def user_count(session: AsyncSession, user_id: uuid.UUID) -> int:
    return (
        await session.execute(select(func.count()).select_from(User).where(User.id == user_id))
    ).scalar_one()


async def test_the_first_request_creates_the_user(
    session: AsyncSession, commits: list[int]
) -> None:
    uid = uuid.uuid4()
    user = await users_repo.ensure_user(session, uid, "new@example.test", "New")
    assert (user.id, user.email, user.display_name) == (uid, "new@example.test", "New")
    assert await user_count(session, uid) == 1
    assert len(commits) == 1


async def test_a_returning_user_costs_no_write_and_no_commit(
    session: AsyncSession, commits: list[int]
) -> None:
    uid = uuid.uuid4()
    await users_repo.ensure_user(session, uid, "ada@example.test", "Ada")
    commits.clear()

    again = await users_repo.ensure_user(session, uid, "ada@example.test", "Different name")

    assert again.display_name == "Ada"  # an existing row keeps its display name
    assert commits == []
    assert await user_count(session, uid) == 1


async def test_a_changed_email_is_followed_and_committed(
    session: AsyncSession, commits: list[int]
) -> None:
    uid = uuid.uuid4()
    await users_repo.ensure_user(session, uid, "old@example.test", None)
    commits.clear()

    user = await users_repo.ensure_user(session, uid, "new@example.test", None)

    assert user.email == "new@example.test"
    assert len(commits) == 1
    assert (await session.get(User, uid)).email == "new@example.test"  # type: ignore[union-attr]


async def test_many_repeat_requests_never_duplicate_or_commit(
    session: AsyncSession, commits: list[int]
) -> None:
    uid = uuid.uuid4()
    await users_repo.ensure_user(session, uid, "x@example.test", None)
    commits.clear()
    for _ in range(5):
        await users_repo.ensure_user(session, uid, "x@example.test", None)
    assert commits == []
    assert await user_count(session, uid) == 1
