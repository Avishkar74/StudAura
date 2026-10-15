import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def ensure_user(
    db: AsyncSession, user_id: uuid.UUID, email: str, display_name: str | None
) -> User:
    """Return the user row for a verified Supabase identity, creating it on first sight.

    Safe under concurrent first requests (ON CONFLICT DO NOTHING). An existing row keeps its
    display name, but its email follows Supabase if the user changed it there.
    """
    await db.execute(
        insert(User)
        .values(id=user_id, email=email, display_name=display_name)
        .on_conflict_do_nothing(index_elements=[User.id])
    )
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
    if user.email != email:
        user.email = email
    await db.commit()
    return user
