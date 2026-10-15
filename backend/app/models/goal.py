import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, now_column


class LearningGoal(Base):
    """One daily goal per user. `timezone` defines the day boundary for goal accounting."""

    __tablename__ = "learning_goals"
    __table_args__ = (CheckConstraint("daily_target_minutes > 0", name="daily_target_positive"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    daily_target_minutes: Mapped[int] = mapped_column(Integer)
    timezone: Mapped[str] = mapped_column(Text, server_default="UTC")
    updated_at: Mapped[datetime] = now_column(onupdate=True)
