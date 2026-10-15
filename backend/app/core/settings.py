"""Application settings, read from environment variables (and an optional .env file)."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # `../.env` lets `uvicorn` run from backend/ against the repo-root .env.
    # The root file also holds VITE_* keys, hence extra="ignore".
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "local"  # local | test | production
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "http://localhost:5173"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/studaura"
    SUPABASE_JWT_SECRET: str = ""
    YOUTUBE_DATA_API_KEY: str = ""

    @field_validator("DATABASE_URL")
    @classmethod
    def _use_asyncpg_driver(cls, value: str) -> str:
        """Accept the plain Supabase connection string and force the asyncpg driver."""
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+asyncpg://" + value[len(prefix) :]
        return value

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_test(self) -> bool:
        return self.APP_ENV == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
