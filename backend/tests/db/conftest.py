"""Database fixtures: a throwaway database migrated from empty via Alembic.

Tests here need a reachable PostgreSQL. Point TEST_DATABASE_ADMIN_URL at a server where the
user may CREATE DATABASE (defaults to the compose `db` service). Without a server the tests
are skipped locally; CI provides one.
"""

import asyncio
import os
import subprocess
import sys
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

BACKEND_DIR = Path(__file__).resolve().parents[2]

ADMIN_URL = os.environ.get(
    "TEST_DATABASE_ADMIN_URL", "postgresql://postgres:postgres@db:5432/postgres"
)


def _with_database(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{name}"))


def _asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def _admin_exec(sql: str) -> None:
    conn = await asyncpg.connect(_asyncpg_dsn(ADMIN_URL), timeout=5)
    try:
        await conn.execute(sql)
    finally:
        await conn.close()


def run_alembic(database_url: str, *args: str) -> subprocess.CompletedProcess[str]:
    """Run the real `alembic` CLI against `database_url` in a clean subprocess."""
    env = {**os.environ, "DATABASE_URL": database_url, "APP_ENV": "test"}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture(scope="module")
def empty_database_url() -> Iterator[str]:
    """A brand-new, empty database. Dropped afterwards."""
    name = f"studaura_test_{uuid.uuid4().hex[:12]}"
    try:
        asyncio.run(_admin_exec(f'CREATE DATABASE "{name}"'))
    except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
        pytest.skip(f"PostgreSQL not reachable for DB tests: {type(exc).__name__}")
    try:
        yield _with_database(ADMIN_URL, name)
    finally:
        asyncio.run(_admin_exec(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))


@pytest.fixture(scope="module")
def migrated_database_url(empty_database_url: str) -> str:
    result = run_alembic(empty_database_url, "upgrade", "head")
    assert result.returncode == 0, result.stderr
    return empty_database_url


@pytest.fixture
async def session(migrated_database_url: str) -> AsyncIterator[AsyncSession]:
    """A session whose work is rolled back, so tests never see each other's rows."""
    url = migrated_database_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        trans = await conn.begin()
        maker = async_sessionmaker(conn, expire_on_commit=False)
        async with maker() as s:
            yield s
        if trans.is_active:
            await trans.rollback()
    await engine.dispose()
