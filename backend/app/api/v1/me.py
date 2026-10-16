from fastapi import APIRouter
from sqlalchemy import update

from app.api.deps import CurrentUser, DbSession
from app.core import user_cache
from app.models import User
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/api/v1", tags=["me"])


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> UserRead:
    """The authenticated user's profile."""
    return UserRead.model_validate(user)


@router.patch("/me", response_model=UserRead)
async def update_me(body: UserUpdate, user: CurrentUser, db: DbSession) -> UserRead:
    """Change the caller's display name. The id always comes from the verified token."""
    row = (
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(display_name=body.display_name)
            .returning(User)
        )
    ).scalar_one()
    await db.commit()
    user_cache.forget(user.id)
    return UserRead.model_validate(row)
