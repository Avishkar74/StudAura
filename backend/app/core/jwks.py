"""Cached access to Supabase's public JSON Web Key Set.

Projects on Supabase's asymmetric signing keys sign user JWTs with ES256/RS256. The matching
public keys are served at `<project>/auth/v1/.well-known/jwks.json`; no shared secret needed.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

Fetcher = Callable[[], Awaitable[list[dict[str, Any]]]]

CACHE_TTL_SECONDS = 600.0
# Don't hammer Supabase when someone sends tokens with made-up key ids.
MIN_REFRESH_INTERVAL_SECONDS = 30.0


class JWKSUnavailableError(Exception):
    """The key set could not be fetched and nothing usable is cached."""


def make_http_fetcher(url: str) -> Fetcher:
    async def fetch() -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            keys = resp.json().get("keys", [])
            return [k for k in keys if isinstance(k, dict)]

    return fetch


class JWKSCache:
    def __init__(self, fetcher: Fetcher) -> None:
        self._fetcher = fetcher
        self._keys: dict[str, dict[str, Any]] = {}
        self._fetched_at = 0.0
        self._lock = asyncio.Lock()

    async def get_key(self, kid: str) -> dict[str, Any] | None:
        """Return the JWK for `kid`, refreshing the cache when it is stale or the kid is new."""
        now = time.monotonic()
        fresh = self._keys and now - self._fetched_at < CACHE_TTL_SECONDS
        if fresh and kid in self._keys:
            return self._keys[kid]
        if fresh and now - self._fetched_at < MIN_REFRESH_INTERVAL_SECONDS:
            return None  # unknown kid; we refreshed moments ago
        await self._refresh()
        return self._keys.get(kid)

    async def _refresh(self) -> None:
        async with self._lock:
            try:
                keys = await self._fetcher()
            except Exception as exc:
                logger.warning("JWKS fetch failed: %s", type(exc).__name__)
                if self._keys:
                    return  # keep serving the stale set
                raise JWKSUnavailableError from exc
            self._keys = {k["kid"]: k for k in keys if "kid" in k}
            self._fetched_at = time.monotonic()
