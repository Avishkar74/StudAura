"""FastAPI dependencies shared by routers."""

from functools import lru_cache
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import user_cache
from app.core.auth import unauthorized, verify_supabase_token
from app.core.errors import ApiError
from app.core.settings import settings
from app.db import get_db
from app.integrations.youtube.client import HttpYouTubeClient
from app.integrations.youtube.fake import FakeYouTubeClient
from app.integrations.youtube.models import YouTubeClient
from app.models import User
from app.repositories import goals as goals_repo
from app.repositories import users as users_repo
from app.services import goals as goal_rules

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
    cached = user_cache.get(claims.user_id, claims.email)
    if cached is not None:
        return cached
    try:
        user = await users_repo.ensure_user(db, claims.user_id, claims.email, claims.display_name)
    except IntegrityError:
        # Same email already belongs to a different user id (e.g. a recreated Supabase account).
        await db.rollback()
        raise HTTPException(status_code=409, detail="Account conflict") from None
    user_cache.put(user)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def resolve_timezone(
    db: AsyncSession, user: User, requested: str | None
) -> tuple[str, ZoneInfo]:
    """The zone that decides what "today" is: the saved goal's, else the browser's, else UTC."""
    goal = await goals_repo.get_goal(db, user.id)
    if goal is not None:
        return goal.timezone, goal_rules.load_timezone(goal.timezone) or ZoneInfo("UTC")
    name = requested or "UTC"
    tz = goal_rules.load_timezone(name)
    if tz is None:
        raise ApiError(422, "INVALID_TIMEZONE", "That isn't a timezone we recognise.")
    return name, tz


@lru_cache
def _fake_youtube_client() -> FakeYouTubeClient:
    return FakeYouTubeClient()


def get_youtube_client() -> YouTubeClient:
    """The fixture-backed fake under APP_ENV=test (CI never hits YouTube), else the real API."""
    if settings.is_test:
        return _fake_youtube_client()
    return HttpYouTubeClient(settings.YOUTUBE_DATA_API_KEY)


YouTube = Annotated[YouTubeClient, Depends(get_youtube_client)]
