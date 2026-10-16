"""A short-lived, per-process cache of user rows.

Every authenticated request used to read the user row from the database just to learn
something the verified token already proves. With a database far from the API that read costs a
round trip per request, so a hit here skips it. The cache never decides who the caller is (that
is always the verified JWT, CLAUDE.md rule 1); it only avoids re-reading the profile fields.
"""

import time
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.core.settings import settings
from app.models import User

MAX_ENTRIES = 2000


@dataclass(frozen=True)
class _Entry:
    email: str
    display_name: str | None
    created_at: datetime
    expires_at: float


_entries: dict[uuid.UUID, _Entry] = {}


def ttl_seconds() -> float:
    # Tests share one database that is rolled back between tests; a cached row would outlive it.
    return 0.0 if settings.is_test else settings.USER_CACHE_SECONDS


def get(user_id: uuid.UUID, email: str) -> User | None:
    """A detached User for a recent, unchanged caller, or None (read the database)."""
    entry = _entries.get(user_id)
    if entry is None or entry.expires_at <= time.monotonic() or entry.email != email:
        return None
    return User(
        id=user_id, email=entry.email, display_name=entry.display_name, created_at=entry.created_at
    )


def put(user: User) -> None:
    ttl = ttl_seconds()
    if ttl <= 0:
        return
    if len(_entries) >= MAX_ENTRIES:
        _entries.clear()
    _entries[user.id] = _Entry(
        email=user.email,
        display_name=user.display_name,
        created_at=user.created_at,
        expires_at=time.monotonic() + ttl,
    )


def forget(user_id: uuid.UUID) -> None:
    _entries.pop(user_id, None)


def clear() -> None:
    _entries.clear()
