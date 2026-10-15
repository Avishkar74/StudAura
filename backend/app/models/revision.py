import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, now_column, uuid_pk


class RevisionItem(Base):
    """Revision queue entry. Completed items are kept (active=false) as history."""

    __tablename__ = "revision_items"
    __table_args__ = (
        Index("ix_revision_items_user_active_due", "user_id", "active", "due_at"),
        # At most one *active* revision per user/video, but any number of past ones.
        # The TRD's UNIQUE (user_id, video_id, active) would cap history at one inactive row.
        Index(
            "uq_revision_items_active_user_video",
            "user_id",
            "video_id",
            unique=True,
            postgresql_where=text("active"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    video_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("videos.id"))
    due_at: Mapped[date] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    flagged_at: Mapped[datetime] = now_column()
    revised_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
