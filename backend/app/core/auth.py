"""Supabase JWT verification.

The user id always comes from the verified token's `sub` claim, never from the request.
Supports both Supabase signing schemes:

* asymmetric (ES256/RS256) - verified against the project's public JWKS (the current default);
* legacy HS256 - verified with SUPABASE_JWT_SECRET.

Token contents (email, subject) are never logged.
"""

import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from fastapi import HTTPException
from jose import JWTError, jwt

from app.core.jwks import JWKSCache, JWKSUnavailableError, make_http_fetcher
from app.core.settings import settings

ASYMMETRIC_ALGORITHMS = ("ES256", "RS256")
AUDIENCE = "authenticated"


@dataclass(frozen=True)
class TokenClaims:
    user_id: uuid.UUID
    email: str | None
    display_name: str | None


def unauthorized(message: str = "Invalid or expired token") -> HTTPException:
    return HTTPException(status_code=401, detail=message, headers={"WWW-Authenticate": "Bearer"})


@lru_cache
def get_jwks_cache() -> JWKSCache:
    return JWKSCache(make_http_fetcher(settings.supabase_jwks_url))


async def _signing_key(alg: str, kid: str | None) -> Any:
    if alg == "HS256":
        if not settings.SUPABASE_JWT_SECRET:
            raise unauthorized()  # legacy tokens can't be verified without the secret
        return settings.SUPABASE_JWT_SECRET
    if alg in ASYMMETRIC_ALGORITHMS:
        if not settings.SUPABASE_URL:
            raise HTTPException(status_code=503, detail="Authentication is not configured")
        if not kid:
            raise unauthorized()
        try:
            key = await get_jwks_cache().get_key(kid)
        except JWKSUnavailableError:
            raise HTTPException(
                status_code=503, detail="Authentication service unavailable"
            ) from None
        if key is None:
            raise unauthorized()
        return key
    raise unauthorized()  # includes "none" and anything we do not explicitly allow


async def verify_supabase_token(token: str) -> TokenClaims:
    """Validate signature, expiry, audience and issuer; return the claims we use."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise unauthorized() from None

    alg = header.get("alg", "")
    key = await _signing_key(alg, header.get("kid"))

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience=AUDIENCE,
            issuer=settings.supabase_issuer if settings.SUPABASE_URL else None,
            options={"verify_iss": bool(settings.SUPABASE_URL)},
        )
    except JWTError:
        raise unauthorized() from None

    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except ValueError:
        raise unauthorized("Token missing subject") from None

    meta = payload.get("user_metadata") or {}
    display_name = meta.get("display_name") or meta.get("full_name") or meta.get("name")
    return TokenClaims(
        user_id=user_id,
        email=payload.get("email") or None,
        display_name=display_name if isinstance(display_name, str) else None,
    )
