"""Import every model so Base.metadata is complete for Alembic autogenerate."""

from app.models.base import Base
from app.models.goal import LearningGoal
from app.models.learning_path import LearningPath, LearningPathVideo
from app.models.notes import VideoComment, VideoNote
from app.models.progress import VideoProgress, ViewingSession
from app.models.revision import RevisionItem
from app.models.saved import SavedVideo
from app.models.user import User
from app.models.video import Video

__all__ = [
    "Base",
    "LearningGoal",
    "LearningPath",
    "LearningPathVideo",
    "RevisionItem",
    "SavedVideo",
    "User",
    "Video",
    "VideoComment",
    "VideoNote",
    "VideoProgress",
    "ViewingSession",
]
