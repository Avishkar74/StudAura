import time
import uuid
from datetime import UTC, datetime

import pytest

from app.core import user_cache
from app.core.settings import Settings
from app.models import User


@pytest.fixture(autouse=True)
def _enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(user_cache, "ttl_seconds", lambda: 60.0)
    user_cache.clear()


def make_user(email: str = "ada@example.test", name: str | None = "Ada") -> User:
    return User(
        id=uuid.uuid4(), email=email, display_name=name, created_at=datetime(2026, 1, 1, tzinfo=UTC)
    )


def test_a_stored_user_comes_back_detached_and_equal() -> None:
    user = make_user()
    user_cache.put(user)
    hit = user_cache.get(user.id, user.email)
    assert hit is not None
    assert (hit.id, hit.email, hit.display_name, hit.created_at) == (
        user.id,
        user.email,
        user.display_name,
        user.created_at,
    )


def test_an_unknown_user_is_a_miss() -> None:
    assert user_cache.get(uuid.uuid4(), "nobody@example.test") is None


def test_a_different_email_is_a_miss() -> None:
    user = make_user()
    user_cache.put(user)
    assert user_cache.get(user.id, "other@example.test") is None


def test_entries_expire(monkeypatch: pytest.MonkeyPatch) -> None:
    user = make_user()
    now = [1000.0]
    monkeypatch.setattr(time, "monotonic", lambda: now[0])
    user_cache.put(user)
    assert user_cache.get(user.id, user.email) is not None
    now[0] += 61
    assert user_cache.get(user.id, user.email) is None


def test_forget_removes_one_entry() -> None:
    a, b = make_user("a@x.test"), make_user("b@x.test")
    user_cache.put(a)
    user_cache.put(b)
    user_cache.forget(a.id)
    assert user_cache.get(a.id, a.email) is None
    assert user_cache.get(b.id, b.email) is not None


def test_a_zero_ttl_disables_the_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(user_cache, "ttl_seconds", lambda: 0.0)
    user = make_user()
    user_cache.put(user)
    assert user_cache.get(user.id, user.email) is None


def test_the_cache_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(user_cache, "MAX_ENTRIES", 3)
    users = [make_user(f"u{i}@x.test") for i in range(5)]
    for u in users:
        user_cache.put(u)
    assert len(user_cache._entries) <= 3
    assert user_cache.get(users[-1].id, users[-1].email) is not None


def test_the_cache_is_off_under_test_and_configurable() -> None:
    assert Settings().USER_CACHE_SECONDS == 60.0
    assert Settings(USER_CACHE_SECONDS=0).USER_CACHE_SECONDS == 0
    with pytest.raises(ValueError):
        Settings(USER_CACHE_SECONDS=-1)
