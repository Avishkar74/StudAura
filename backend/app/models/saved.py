import uuid
from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, now_column


class SavedVideo(Base):
    """Explicit bookmark, independent of path membership and learning status."""

    __tablename__ = "saved_videos"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    video_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("videos.id"), primary_key=True)
    saved_at: Mapped[datetime] = now_column()
