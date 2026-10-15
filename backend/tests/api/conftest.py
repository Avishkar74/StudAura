"""Fixtures that mint Supabase-style JWTs so auth can be tested without Supabase."""

import time
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from jose import jwk, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import auth as auth_module
from app.core.jwks import JWKSCache
from app.core.settings import settings
from app.db import get_db
from app.main import app

SUPABASE_URL = "https://proj.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
HS_SECRET = "test-legacy-hs256-secret-0123456789abcdef"
KID = "test-key-1"

TokenFactory = Callable[..., str]


class EcKey:
    def __init__(self, kid: str) -> None:
        self.kid = kid
        private = ec.generate_private_key(ec.SECP256R1())
        self.private_pem = private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        public_pem = private.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        self.jwk: dict[str, Any] = {
            **jwk.construct(public_pem, "ES256").to_dict(),
            "kid": kid,
            "alg": "ES256",
            "use": "sig",
        }


@pytest.fixture(scope="session")
def ec_key() -> EcKey:
    return EcKey(KID)


@pytest.fixture(scope="session")
def other_ec_key() -> EcKey:
    """A key that is NOT in the JWKS, for forged-signature tests."""
    return EcKey(KID)


@pytest.fixture
def auth_config(monkeypatch: pytest.MonkeyPatch, ec_key: EcKey) -> None:
    monkeypatch.setattr(settings, "SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", HS_SECRET)

    async def fetch() -> list[dict[str, Any]]:
        return [ec_key.jwk]

    monkeypatch.setattr(auth_module, "get_jwks_cache", lambda: JWKSCache(fetch))


@pytest.fixture
def make_token(ec_key: EcKey) -> TokenFactory:
    def make(
        *,
        sub: str | uuid.UUID | None = None,
        email: str | None = "student@example.test",
        key: EcKey | None = None,
        algorithm: str = "ES256",
        kid: str | None = KID,
        expires_in: int = 3600,
        audience: str = "authenticated",
        issuer: str = ISSUER,
        display_name: str | None = None,
        omit_sub: bool = False,
    ) -> str:
        claims: dict[str, Any] = {
            "aud": audience,
            "iss": issuer,
            "exp": int(time.time()) + expires_in,
            "iat": int(time.time()),
            "role": "authenticated",
        }
        if not omit_sub:
            claims["sub"] = str(sub or uuid.uuid4())
        if email is not None:
            claims["email"] = email
        if display_name is not None:
            claims["user_metadata"] = {"display_name": display_name}
        headers = {"kid": kid} if kid else {}
        if algorithm == "HS256":
            return str(jwt.encode(claims, HS_SECRET, algorithm="HS256", headers=headers))
        signer = key or ec_key
        return str(jwt.encode(claims, signer.private_pem, algorithm=algorithm, headers=headers))

    return make


@pytest.fixture
async def auth_client(session: AsyncSession, auth_config: None) -> AsyncIterator[httpx.AsyncClient]:
    """API client wired to the rolled-back test session (needs PostgreSQL)."""

    async def override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_db] = override
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)
