import base64
import json
import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import auth as auth_module
from app.core.jwks import JWKSCache
from app.core.settings import settings
from app.models import User
from tests.api.conftest import EcKey
from tests.api.helpers import TokenFactory


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def user_count(session: AsyncSession) -> int:
    return (await session.execute(select(func.count()).select_from(User))).scalar_one()


# --- Rejections -----------------------------------------------------------------------------


async def test_missing_header_is_401_with_error_envelope(auth_client: httpx.AsyncClient) -> None:
    resp = await auth_client.get("/api/v1/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"
    assert resp.headers["www-authenticate"] == "Bearer"


async def test_garbage_token_is_401(auth_client: httpx.AsyncClient) -> None:
    resp = await auth_client.get("/api/v1/me", headers=bearer("not.a.jwt"))
    assert resp.status_code == 401


async def test_expired_token_is_401(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    resp = await auth_client.get("/api/v1/me", headers=bearer(make_token(expires_in=-60)))
    assert resp.status_code == 401


async def test_wrong_audience_is_401(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    resp = await auth_client.get("/api/v1/me", headers=bearer(make_token(audience="anon")))
    assert resp.status_code == 401


async def test_wrong_issuer_is_401(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    token = make_token(issuer="https://evil.example/auth/v1")
    assert (await auth_client.get("/api/v1/me", headers=bearer(token))).status_code == 401


async def test_token_signed_by_unknown_key_is_401(
    auth_client: httpx.AsyncClient, make_token: TokenFactory, other_ec_key: EcKey
) -> None:
    """Same kid as a trusted key but a different private key: the signature must not verify."""
    token = make_token(key=other_ec_key)
    assert (await auth_client.get("/api/v1/me", headers=bearer(token))).status_code == 401


async def test_unknown_kid_is_401(auth_client: httpx.AsyncClient, make_token: TokenFactory) -> None:
    token = make_token(kid="not-in-jwks")
    assert (await auth_client.get("/api/v1/me", headers=bearer(token))).status_code == 401


async def test_missing_kid_is_401(auth_client: httpx.AsyncClient, make_token: TokenFactory) -> None:
    assert (
        await auth_client.get("/api/v1/me", headers=bearer(make_token(kid=None)))
    ).status_code == 401


async def test_alg_none_token_is_401(auth_client: httpx.AsyncClient) -> None:
    def b64(obj: dict[str, object]) -> str:
        raw = json.dumps(obj).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    forged = f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64({'sub': str(uuid.uuid4())})}."
    assert (await auth_client.get("/api/v1/me", headers=bearer(forged))).status_code == 401


async def test_missing_or_invalid_subject_is_401(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    for token in (make_token(omit_sub=True), make_token(sub="not-a-uuid")):
        assert (await auth_client.get("/api/v1/me", headers=bearer(token))).status_code == 401


async def test_token_without_email_is_401(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    assert (
        await auth_client.get("/api/v1/me", headers=bearer(make_token(email=None)))
    ).status_code == 401


async def test_rejected_requests_create_no_user(
    auth_client: httpx.AsyncClient, make_token: TokenFactory, session: AsyncSession
) -> None:
    before = await user_count(session)
    await auth_client.get("/api/v1/me", headers=bearer(make_token(expires_in=-60)))
    assert await user_count(session) == before


async def test_jwks_outage_is_503_not_401(
    auth_client: httpx.AsyncClient, make_token: TokenFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom() -> list[dict[str, object]]:
        raise ConnectionError("down")

    monkeypatch.setattr(auth_module, "get_jwks_cache", lambda: JWKSCache(boom))
    resp = await auth_client.get("/api/v1/me", headers=bearer(make_token()))
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


# --- Legacy HS256 ---------------------------------------------------------------------------


async def test_legacy_hs256_token_is_accepted(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    resp = await auth_client.get(
        "/api/v1/me", headers=bearer(make_token(algorithm="HS256", kid=None))
    )
    assert resp.status_code == 200


async def test_hs256_is_rejected_when_no_secret_is_configured(
    auth_client: httpx.AsyncClient, make_token: TokenFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "")
    token = make_token(algorithm="HS256", kid=None)
    assert (await auth_client.get("/api/v1/me", headers=bearer(token))).status_code == 401


# --- Success --------------------------------------------------------------------------------


async def test_valid_token_returns_profile_and_creates_user(
    auth_client: httpx.AsyncClient, make_token: TokenFactory, session: AsyncSession
) -> None:
    uid = uuid.uuid4()
    token = make_token(sub=uid, email="ada@example.test", display_name="Ada")
    resp = await auth_client.get("/api/v1/me", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(uid)
    assert body["email"] == "ada@example.test"
    assert body["display_name"] == "Ada"
    assert "created_at" in body
    assert (await session.get(User, uid)) is not None


async def test_repeat_requests_reuse_the_same_row(
    auth_client: httpx.AsyncClient, make_token: TokenFactory, session: AsyncSession
) -> None:
    uid = uuid.uuid4()
    before = await user_count(session)
    for _ in range(3):
        resp = await auth_client.get("/api/v1/me", headers=bearer(make_token(sub=uid)))
        assert resp.status_code == 200
    assert await user_count(session) == before + 1


async def test_email_change_in_supabase_is_synced(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    uid = uuid.uuid4()
    await auth_client.get("/api/v1/me", headers=bearer(make_token(sub=uid, email="old@x.test")))
    resp = await auth_client.get(
        "/api/v1/me", headers=bearer(make_token(sub=uid, email="new@x.test"))
    )
    assert resp.json()["email"] == "new@x.test"


async def test_existing_display_name_is_not_overwritten_by_the_token(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    uid = uuid.uuid4()
    await auth_client.get("/api/v1/me", headers=bearer(make_token(sub=uid, display_name="First")))
    resp = await auth_client.get(
        "/api/v1/me", headers=bearer(make_token(sub=uid, display_name="Second"))
    )
    assert resp.json()["display_name"] == "First"


async def test_two_users_only_ever_see_themselves(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    ra = await auth_client.get("/api/v1/me", headers=bearer(make_token(sub=a, email="a@x.test")))
    rb = await auth_client.get("/api/v1/me", headers=bearer(make_token(sub=b, email="b@x.test")))
    assert (ra.json()["id"], rb.json()["id"]) == (str(a), str(b))
    assert ra.json()["email"] == "a@x.test" and rb.json()["email"] == "b@x.test"


async def test_user_id_in_query_is_ignored(
    auth_client: httpx.AsyncClient, make_token: TokenFactory
) -> None:
    me, other = uuid.uuid4(), uuid.uuid4()
    resp = await auth_client.get(f"/api/v1/me?user_id={other}", headers=bearer(make_token(sub=me)))
    assert resp.json()["id"] == str(me)
