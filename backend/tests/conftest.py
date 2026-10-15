import os

# Must be set before `app` is imported so settings pick up the test environment.
os.environ["APP_ENV"] = "test"
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

import asyncio  # noqa: E402
import uuid  # noqa: E402
from collections.abc import AsyncIterator, Iterator  # noqa: E402

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.main import app  # noqa: E402
from tests.dbutil import ADMIN_URL, admin_exec, run_alembic, with_database  # noqa: E402


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- Real-PostgreSQL fixtures -------------------------------------------------------------
# Tests that use these are skipped when no server is reachable; CI provides one.


@pytest.fixture(scope="module")
def empty_database_url() -> Iterator[str]:
    """A brand-new, empty database. Dropped afterwards."""
    name = f"studaura_test_{uuid.uuid4().hex[:12]}"
    try:
        asyncio.run(admin_exec(f'CREATE DATABASE "{name}"'))
    except (OSError, asyncpg.PostgresError, TimeoutError) as exc:
        pytest.skip(f"PostgreSQL not reachable for DB tests: {type(exc).__name__}")
    try:
        yield with_database(ADMIN_URL, name)
    finally:
        asyncio.run(admin_exec(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))


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
