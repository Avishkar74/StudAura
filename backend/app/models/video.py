import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk

AVAILABILITY_STATES = ("available", "unavailable", "embed_disabled")


class Video(Base):
    """Shared YouTube metadata: one row per YouTube video ID, referenced by many users."""

    __tablename__ = "videos"
    __table_args__ = (
        CheckConstraint(
            "availability_state IN ('available', 'unavailable', 'embed_disabled')",
            name="availability_state",
        ),
        CheckConstraint("duration_seconds IS NULL OR duration_seconds >= 0", name="duration"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    youtube_video_id: Mapped[str] = mapped_column(Text, unique=True)
    title: Mapped[str] = mapped_column(Text)
    channel_title: Mapped[str | None] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)  # metadata may be missing
    availability_state: Mapped[str] = mapped_column(Text, server_default="available")
    metadata_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
