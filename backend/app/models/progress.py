import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, now_column, uuid_pk

LEARNING_STATUSES = ("NOT_STARTED", "IN_PROGRESS", "COMPLETED", "NEEDS_REVISION")


class VideoProgress(Base):
    """Per-user progress. Playback position and learning status are deliberately separate."""

    __tablename__ = "video_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "video_id"),
        CheckConstraint(
            "learning_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVISION')",
            name="learning_status",
        ),
        CheckConstraint("last_position_seconds >= 0", name="position_non_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    video_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("videos.id"))
    last_position_seconds: Mapped[float] = mapped_column(Float, server_default="0")
    learning_status: Mapped[str] = mapped_column(Text, server_default="NOT_STARTED")
    # Set on first completion and never cleared, even when status moves to NEEDS_REVISION.
    ever_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_watched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = now_column(onupdate=True)


class ViewingSession(Base):
    """Observed active-playback interval used for daily goal accounting."""

    __tablename__ = "viewing_sessions"
    __table_args__ = (
        Index("ix_viewing_sessions_user_started", "user_id", "started_at"),
        CheckConstraint("watched_seconds >= 0", name="watched_non_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    video_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("videos.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    watched_seconds: Mapped[int] = mapped_column(Integer, server_default="0")
    # (user, video, started_at truncated to the minute): makes repeated pings idempotent.
    idempotency_key: Mapped[str] = mapped_column(Text, unique=True)
