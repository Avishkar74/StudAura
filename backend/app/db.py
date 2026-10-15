"""Async SQLAlchemy engine and session factory (created lazily)."""

import asyncio
from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.settings import settings


@lru_cache
def get_engine() -> AsyncEngine:
    connect_args: dict[str, object] = {}
    # Supabase's transaction pooler (port 6543) does not support prepared statements.
    if ":6543/" in settings.DATABASE_URL:
        connect_args["statement_cache_size"] = 0
    return create_async_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


DB_CHECK_TIMEOUT_SECONDS = 3.0


async def check_database() -> bool:
    """Return True if `SELECT 1` succeeds within the readiness timeout."""
    try:
        async with asyncio.timeout(DB_CHECK_TIMEOUT_SECONDS):
            async with get_engine().connect() as conn:
                await conn.execute(text("SELECT 1"))
    except Exception:
        return False
    return True
