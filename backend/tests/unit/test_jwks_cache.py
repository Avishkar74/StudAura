from typing import Any

import pytest

from app.core import jwks
from app.core.jwks import JWKSCache, JWKSUnavailableError


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    c = Clock()
    monkeypatch.setattr("app.core.jwks.time.monotonic", c)
    return c


class Source:
    def __init__(self, *kids: str) -> None:
        self.kids = list(kids)
        self.calls = 0
        self.fail = False

    async def __call__(self) -> list[dict[str, Any]]:
        self.calls += 1
        if self.fail:
            raise ConnectionError("down")
        return [{"kid": k, "kty": "EC"} for k in self.kids]


async def test_known_key_is_served_from_cache(clock: Clock) -> None:
    src = Source("a")
    cache = JWKSCache(src)
    assert await cache.get_key("a") is not None
    assert await cache.get_key("a") is not None
    assert src.calls == 1


async def test_cache_expires_after_ttl(clock: Clock) -> None:
    src = Source("a")
    cache = JWKSCache(src)
    await cache.get_key("a")
    clock.now += jwks.CACHE_TTL_SECONDS + 1
    await cache.get_key("a")
    assert src.calls == 2


async def test_unknown_kid_does_not_refetch_within_min_interval(clock: Clock) -> None:
    src = Source("a")
    cache = JWKSCache(src)
    await cache.get_key("a")
    clock.now += 1
    assert await cache.get_key("forged") is None
    assert await cache.get_key("forged") is None
    assert src.calls == 1


async def test_rotated_key_is_picked_up_after_min_interval(clock: Clock) -> None:
    src = Source("old")
    cache = JWKSCache(src)
    await cache.get_key("old")
    src.kids = ["old", "new"]
    clock.now += jwks.MIN_REFRESH_INTERVAL_SECONDS + 1
    assert await cache.get_key("new") is not None
    assert src.calls == 2


async def test_stale_keys_keep_working_when_refresh_fails(clock: Clock) -> None:
    src = Source("a")
    cache = JWKSCache(src)
    await cache.get_key("a")
    src.fail = True
    clock.now += jwks.CACHE_TTL_SECONDS + 1
    assert await cache.get_key("a") is not None


async def test_empty_cache_and_failed_fetch_raises(clock: Clock) -> None:
    src = Source("a")
    src.fail = True
    with pytest.raises(JWKSUnavailableError):
        await JWKSCache(src).get_key("a")
