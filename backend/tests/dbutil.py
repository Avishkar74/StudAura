"""Helpers for tests that need a real PostgreSQL server."""

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg

BACKEND_DIR = Path(__file__).resolve().parents[1]

# A server where the user may CREATE DATABASE. Defaults to the compose `db` service.
ADMIN_URL = os.environ.get(
    "TEST_DATABASE_ADMIN_URL", "postgresql://postgres:postgres@db:5432/postgres"
)


def with_database(url: str, name: str) -> str:
    return urlunsplit(urlsplit(url)._replace(path=f"/{name}"))


def asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def admin_exec(sql: str) -> None:
    conn = await asyncpg.connect(asyncpg_dsn(ADMIN_URL), timeout=5)
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
