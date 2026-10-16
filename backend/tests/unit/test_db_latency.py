"""A database that is far away: readiness timeout, background warm-up and the lifespan hook."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import pytest
from pydantic import ValidationError

from app import db, main
from app.core.settings import Settings, settings


class SlowEngine:
    """Stands in for an engine whose connections take `delay` seconds to open."""

    def __init__(self, delay: float, *, fail: bool = False) -> None:
        self.delay = delay
        self.fail = fail
        self.connects = 0

    @asynccontextmanager
    async def connect(self) -> AsyncIterator[Any]:
        self.connects += 1
        await asyncio.sleep(self.delay)
        if self.fail:
            raise ConnectionError("down")

        class Conn:
            async def execute(self, *_: object) -> None:
                return None

        yield Conn()


def test_the_readiness_timeout_defaults_to_three_seconds() -> None:
    assert Settings().DB_CHECK_TIMEOUT_SECONDS == 3.0


def test_the_readiness_timeout_can_be_raised_for_a_distant_database() -> None:
    assert Settings(DB_CHECK_TIMEOUT_SECONDS=20).DB_CHECK_TIMEOUT_SECONDS == 20


@pytest.mark.parametrize("bad", [0, -1, 61])
def test_unreasonable_timeouts_are_rejected(bad: float) -> None:
    with pytest.raises(ValidationError):
        Settings(DB_CHECK_TIMEOUT_SECONDS=bad)


async def test_readiness_gives_up_after_the_configured_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(db, "get_engine", lambda: SlowEngine(delay=0.3))
    monkeypatch.setattr(settings, "DB_CHECK_TIMEOUT_SECONDS", 0.05)
    assert await db.check_database() is False


async def test_readiness_waits_as_long_as_it_is_told_to(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "get_engine", lambda: SlowEngine(delay=0.2))
    monkeypatch.setattr(settings, "DB_CHECK_TIMEOUT_SECONDS", 2.0)
    assert await db.check_database() is True


async def test_readiness_is_false_when_the_database_is_down(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(db, "get_engine", lambda: SlowEngine(delay=0, fail=True))
    assert await db.check_database() is False


async def test_the_warm_up_is_not_limited_by_the_short_readiness_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = SlowEngine(delay=0.2)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    monkeypatch.setattr(settings, "DB_CHECK_TIMEOUT_SECONDS", 0.05)
    assert await db.warm_database_pool() is True
    assert engine.connects == 1


async def test_the_warm_up_swallows_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "get_engine", lambda: SlowEngine(delay=0, fail=True))
    assert await db.warm_database_pool() is False


async def test_the_warm_up_has_its_own_ceiling(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "get_engine", lambda: SlowEngine(delay=5))
    monkeypatch.setattr(db, "WARM_UP_TIMEOUT_SECONDS", 0.05)
    assert await db.warm_database_pool() is False


async def test_startup_warms_the_pool_in_the_background_outside_tests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = asyncio.Event()

    async def fake_warm() -> bool:
        started.set()
        await asyncio.sleep(10)  # slower than the test: startup must not wait for it
        return True

    monkeypatch.setattr(settings, "APP_ENV", "local")
    monkeypatch.setattr(main, "warm_database_pool", fake_warm)

    async with main.lifespan(main.app):
        await asyncio.wait_for(started.wait(), timeout=1)  # it did start; we were not blocked


async def test_startup_leaves_the_database_alone_under_test(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = False

    async def fake_warm() -> bool:
        nonlocal called
        called = True
        return True

    monkeypatch.setattr(main, "warm_database_pool", fake_warm)  # settings.APP_ENV is "test"
    async with main.lifespan(main.app):
        await asyncio.sleep(0)
    assert called is False
