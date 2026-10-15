"""The compare-and-set that makes autosave safe, checked with two independent sessions."""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import User, Video
from app.repositories import notes as notes_repo


@pytest.fixture
async def sessions(migrated_database_url: str) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        migrated_database_url.replace("postgresql://", "postgresql+asyncpg://")
    )
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def seed(maker: async_sessionmaker[AsyncSession]) -> tuple[uuid.UUID, uuid.UUID]:
    user_id, video_id = uuid.uuid4(), uuid.uuid4()
    async with maker() as s:
        s.add(User(id=user_id, email=f"{user_id.hex}@example.test"))
        s.add(Video(id=video_id, youtube_video_id=video_id.hex[:11], title="V"))
        await s.commit()
    return user_id, video_id


async def test_only_one_of_two_saves_from_the_same_revision_wins(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user_id, video_id = await seed(sessions)
    async with sessions() as s:
        created = await notes_repo.save_note(s, user_id, video_id, "<p>v1</p>", 0)
        await s.commit()
    assert created is not None and created.revision == 1

    # Two tabs both loaded revision 1.
    async with sessions() as tab_a, sessions() as tab_b:
        won = await notes_repo.save_note(tab_a, user_id, video_id, "<p>from A</p>", 1)
        await tab_a.commit()
        lost = await notes_repo.save_note(tab_b, user_id, video_id, "<p>from B</p>", 1)
        await tab_b.rollback()

    assert won is not None and won.revision == 2
    assert lost is None
    async with sessions() as s:
        final = await notes_repo.get_note(s, user_id, video_id)
    assert final is not None and final.body == "<p>from A</p>"


async def test_two_first_saves_cannot_both_create_the_note(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user_id, video_id = await seed(sessions)
    async with sessions() as tab_a, sessions() as tab_b:
        first = await notes_repo.save_note(tab_a, user_id, video_id, "<p>A</p>", 0)
        await tab_a.commit()
        second = await notes_repo.save_note(tab_b, user_id, video_id, "<p>B</p>", 0)
        await tab_b.rollback()
    assert first is not None and second is None


async def test_an_unconditional_save_wins_over_any_revision(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    user_id, video_id = await seed(sessions)
    async with sessions() as s:
        await notes_repo.save_note(s, user_id, video_id, "<p>v1</p>", 0)
        forced = await notes_repo.save_note(s, user_id, video_id, "<p>forced</p>", None)
        await s.commit()
    assert forced is not None and forced.revision == 2 and forced.body == "<p>forced</p>"
