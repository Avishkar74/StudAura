from app.core.settings import Settings


def test_plain_postgres_url_is_rewritten_to_asyncpg() -> None:
    s = Settings(DATABASE_URL="postgresql://u:p%40ss@host:5432/postgres")
    assert s.DATABASE_URL == "postgresql+asyncpg://u:p%40ss@host:5432/postgres"


def test_postgres_scheme_alias_is_rewritten() -> None:
    s = Settings(DATABASE_URL="postgres://u:p@host/db")
    assert s.DATABASE_URL.startswith("postgresql+asyncpg://")


def test_asyncpg_url_is_left_alone() -> None:
    url = "postgresql+asyncpg://u:p@host/db"
    assert Settings(DATABASE_URL=url).DATABASE_URL == url


def test_cors_origins_are_split_and_trimmed() -> None:
    s = Settings(CORS_ORIGINS="http://a.test, http://b.test ,")
    assert s.cors_origins_list == ["http://a.test", "http://b.test"]
