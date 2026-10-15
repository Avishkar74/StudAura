import httpx
import pytest

from app.api.v1 import health


async def test_health_is_ok_without_database(client: httpx.AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_ready_returns_200_when_db_reachable(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def ok() -> bool:
        return True

    monkeypatch.setattr(health, "check_database", ok)
    resp = await client.get("/ready")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ready"}


async def test_ready_returns_503_when_db_down(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def down() -> bool:
        return False

    monkeypatch.setattr(health, "check_database", down)
    resp = await client.get("/ready")
    assert resp.status_code == 503
    assert resp.json() == {"status": "unavailable"}


async def test_metrics_exposes_db_readiness_and_business_counters(
    client: httpx.AsyncClient,
) -> None:
    await client.get("/health")
    resp = await client.get("/metrics")
    assert resp.status_code == 200
    assert "db_readiness" in resp.text
    assert "http_request" in resp.text


async def test_unknown_route_uses_standard_error_shape(client: httpx.AsyncClient) -> None:
    resp = await client.get("/nope")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["details"] == []
