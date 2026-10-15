import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, now_column, uuid_pk


class VideoNote(Base):
    """One primary note per user and video."""

    __tablename__ = "video_notes"
    __table_args__ = (
        UniqueConstraint("user_id", "video_id"),
        CheckConstraint("revision >= 1", name="revision_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    video_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("videos.id"))
    body: Mapped[str] = mapped_column(Text, server_default="")
    # Bumped on every save. Lets autosave detect that the note changed in another tab or
    # device instead of silently overwriting it.
    revision: Mapped[int] = mapped_column(Integer, server_default="1")
    updated_at: Mapped[datetime] = now_column(onupdate=True)


class VideoComment(Base):
    __tablename__ = "video_comments"
    __table_args__ = (
        Index("ix_video_comments_user_video_created", "user_id", "video_id", "created_at"),
        CheckConstraint("timestamp_seconds IS NULL OR timestamp_seconds >= 0", name="timestamp"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    video_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("videos.id"))
    body: Mapped[str] = mapped_column(Text)
    timestamp_seconds: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = now_column()
