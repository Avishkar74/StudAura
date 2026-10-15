import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Index, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, now_column, uuid_pk


class LearningPath(Base):
    __tablename__ = "learning_paths"
    __table_args__ = (Index("ix_learning_paths_user_id", "user_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    target_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = now_column()
    updated_at: Mapped[datetime] = now_column(onupdate=True)


class LearningPathVideo(Base):
    """Ordered membership of a video in a path.

    Deleting a path removes only these rows; notes and progress belong to the user/video pair
    and survive (TRD 6.3).
    """

    __tablename__ = "learning_path_videos"
    __table_args__ = (
        UniqueConstraint("learning_path_id", "video_id"),
        Index("ix_learning_path_videos_path_position", "learning_path_id", "position"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    learning_path_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("learning_paths.id", ondelete="CASCADE")
    )
    video_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("videos.id"))
    position: Mapped[int] = mapped_column(Integer)
    added_at: Mapped[datetime] = now_column()
