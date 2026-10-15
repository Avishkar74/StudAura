"""FastAPI dependencies shared by routers."""

from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import unauthorized, verify_supabase_token
from app.db import get_db
from app.models import User
from app.repositories import users as users_repo

# auto_error=False so a missing header gives our 401 envelope instead of FastAPI's 403.
_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """Authenticate the request and return the caller's user row.

    The identity comes only from the verified JWT. Every user-scoped query must filter by the
    returned `user.id` (CLAUDE.md rule 1).
    """
    if credentials is None:
        raise unauthorized("Not authenticated")
    claims = await verify_supabase_token(credentials.credentials)
    if not claims.email:
        raise unauthorized("Token missing email")
    try:
        return await users_repo.ensure_user(db, claims.user_id, claims.email, claims.display_name)
    except IntegrityError:
        # Same email already belongs to a different user id (e.g. a recreated Supabase account).
        await db.rollback()
        raise HTTPException(status_code=409, detail="Account conflict") from None


CurrentUser = Annotated[User, Depends(get_current_user)]
