"""Migration 0003 queues the videos that were already marked Needs Revision."""

import asyncio
import uuid
from collections.abc import Iterator

import asyncpg
import pytest

from tests.dbutil import ADMIN_URL, admin_exec, asyncpg_dsn, run_alembic, with_database


@pytest.fixture
def database_at_0002() -> Iterator[str]:
    name = f"studaura_test_{uuid.uuid4().hex[:12]}"
    try:
        asyncio.run(admin_exec(f'CREATE DATABASE "{name}"'))
    except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
        pytest.skip(f"PostgreSQL not reachable for DB tests: {type(exc).__name__}")
    url = with_database(ADMIN_URL, name)
    try:
        assert run_alembic(url, "upgrade", "0002").returncode == 0
        yield url
    finally:
        asyncio.run(admin_exec(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))


async def _seed(url: str) -> None:
    conn = await asyncpg.connect(asyncpg_dsn(url))
    try:
        user = uuid.uuid4()
        await conn.execute("INSERT INTO users (id, email) VALUES ($1, $2)", user, "a@example.test")
        videos = {}
        for key in ("flagged", "already_queued", "completed"):
            videos[key] = uuid.uuid4()
            await conn.execute(
                "INSERT INTO videos (id, youtube_video_id, title) VALUES ($1, $2, $3)",
                videos[key],
                videos[key].hex[:11],
                key,
            )
        for key, status in (
            ("flagged", "NEEDS_REVISION"),
            ("already_queued", "NEEDS_REVISION"),
            ("completed", "COMPLETED"),
        ):
            await conn.execute(
                "INSERT INTO video_progress (id, user_id, video_id, learning_status)"
                " VALUES (gen_random_uuid(), $1, $2, $3)",
                user,
                videos[key],
                status,
            )
        await conn.execute(
            "INSERT INTO revision_items (id, user_id, video_id, due_at, active)"
            " VALUES (gen_random_uuid(), $1, $2, current_date + 5, true)",
            user,
            videos["already_queued"],
        )
    finally:
        await conn.close()


async def _items(url: str) -> list[asyncpg.Record]:
    conn = await asyncpg.connect(asyncpg_dsn(url))
    try:
        return list(
            await conn.fetch(
                "SELECT v.title, r.active, r.due_at, (r.due_at - current_date) AS days"
                " FROM revision_items r JOIN videos v ON v.id = r.video_id ORDER BY v.title"
            )
        )
    finally:
        await conn.close()


def test_videos_marked_needs_revision_get_a_queue_entry(database_at_0002: str) -> None:
    asyncio.run(_seed(database_at_0002))
    assert run_alembic(database_at_0002, "upgrade", "head").returncode == 0

    rows = {r["title"]: r for r in asyncio.run(_items(database_at_0002))}
    # The flagged video is queued, the one already queued keeps its date, and a completed video
    # is left alone.
    assert set(rows) == {"flagged", "already_queued"}
    assert rows["flagged"]["active"] is True
    assert rows["flagged"]["days"] in (0, 1, 2)  # tomorrow in UTC, allowing for the clock edge
    assert rows["already_queued"]["days"] == 5


def test_running_it_again_adds_nothing(database_at_0002: str) -> None:
    asyncio.run(_seed(database_at_0002))
    assert run_alembic(database_at_0002, "upgrade", "head").returncode == 0
    first = asyncio.run(_items(database_at_0002))
    assert run_alembic(database_at_0002, "downgrade", "0002").returncode == 0
    assert run_alembic(database_at_0002, "upgrade", "head").returncode == 0
    assert len(asyncio.run(_items(database_at_0002))) == len(first)
