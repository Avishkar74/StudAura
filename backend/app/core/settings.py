"""Application settings, read from environment variables (and an optional .env file)."""

from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
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
    # Project URL, e.g. https://<ref>.supabase.co. Falls back to the frontend's variable so a
    # single .env works for both.
    SUPABASE_URL: str = Field(
        default="", validation_alias=AliasChoices("SUPABASE_URL", "VITE_SUPABASE_URL")
    )
    # Only needed for projects still on the legacy HS256 JWT secret. Projects on Supabase's
    # asymmetric signing keys (ES256/RS256) are verified through the public JWKS instead.
    SUPABASE_JWT_SECRET: str = ""
    YOUTUBE_DATA_API_KEY: str = ""

    # How long /ready waits for the database. The default suits a database in the same region;
    # raise it when the API and database are far apart (a new connection can take seconds).
    DB_CHECK_TIMEOUT_SECONDS: float = Field(default=3.0, gt=0, le=60)

    # How long a user's profile row is reused before it is read again (0 turns the cache off).
    USER_CACHE_SECONDS: float = Field(default=60.0, ge=0, le=3600)

    @field_validator("DATABASE_URL")
    @classmethod
    def _use_asyncpg_driver(cls, value: str) -> str:
        """Accept the plain Supabase connection string and force the asyncpg driver."""
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+asyncpg://" + value[len(prefix) :]
        return value

    @field_validator("SUPABASE_URL")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.strip().rstrip("/")

    @property
    def supabase_issuer(self) -> str:
        return f"{self.SUPABASE_URL}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_issuer}/.well-known/jwks.json"

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
