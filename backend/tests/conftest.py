import os

# Must be set before `app` is imported so settings pick up the test environment.
os.environ["APP_ENV"] = "test"
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from collections.abc import AsyncIterator  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
