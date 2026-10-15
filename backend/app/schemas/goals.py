import uuid
from datetime import date

from pydantic import AwareDatetime, BaseModel, Field

MAX_DAILY_TARGET_MINUTES = 1440


class GoalRead(BaseModel):
    """The daily goal and today's tracked time. `daily_target_minutes` is None until one is set."""

    daily_target_minutes: int | None
    timezone: str
    today: date
    today_watched_seconds: int
    goal_achieved: bool


class GoalUpdate(BaseModel):
    daily_target_minutes: int = Field(ge=1, le=MAX_DAILY_TARGET_MINUTES)
    timezone: str = Field(min_length=1, max_length=64)


class ViewingSessionUpdate(BaseModel):
    """A ping from the player: the running total of observed playing time in one viewing."""

    video_id: uuid.UUID
    started_at: AwareDatetime
    # Running total for the whole session, not an increment, so repeats are harmless.
    watched_seconds: int = Field(ge=0, le=24 * 3600)


class ViewingSessionRead(BaseModel):
    watched_seconds: int
