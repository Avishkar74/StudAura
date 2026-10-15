"""Alembic: upgrade from an empty database, match the models, and downgrade cleanly."""

import asyncio

import asyncpg

from app.models import Base
from tests.db.conftest import _asyncpg_dsn, run_alembic

EXPECTED_TABLES = {
    "users",
    "videos",
    "learning_paths",
    "learning_path_videos",
    "video_progress",
    "viewing_sessions",
    "video_notes",
    "video_comments",
    "learning_goals",
    "revision_items",
    "saved_videos",
}


async def _tables(url: str) -> set[str]:
    conn = await asyncpg.connect(_asyncpg_dsn(url))
    try:
        rows = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    finally:
        await conn.close()
    return {r["tablename"] for r in rows}


def test_models_cover_every_expected_table() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_upgrade_from_empty_creates_all_tables(migrated_database_url: str) -> None:
    tables = asyncio.run(_tables(migrated_database_url))
    assert EXPECTED_TABLES <= tables
    assert "alembic_version" in tables


def test_models_and_migration_are_in_sync(migrated_database_url: str) -> None:
    """`alembic check` fails if the models changed without a new revision (CLAUDE.md rule 3)."""
    result = run_alembic(migrated_database_url, "check")
    assert result.returncode == 0, result.stdout + result.stderr


def test_downgrade_to_base_removes_everything(empty_database_url: str) -> None:
    assert run_alembic(empty_database_url, "upgrade", "head").returncode == 0
    assert run_alembic(empty_database_url, "downgrade", "base").returncode == 0
    assert asyncio.run(_tables(empty_database_url)) == {"alembic_version"}
    # Leave it migrated for any later test in this module.
    assert run_alembic(empty_database_url, "upgrade", "head").returncode == 0
