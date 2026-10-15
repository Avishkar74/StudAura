from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.v1 import (
    comments,
    goals,
    health,
    learning_paths,
    me,
    notes,
    playlists,
    videos,
    viewing_sessions,
)
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.settings import settings


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="StudAura API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(learning_paths.router)
    app.include_router(videos.router)
    app.include_router(playlists.router)
    app.include_router(notes.router)
    app.include_router(comments.router)
    app.include_router(goals.router)
    app.include_router(viewing_sessions.router)

    # HTTP metrics labelled by route template and status class, never by raw path.
    Instrumentator(
        should_group_status_codes=True,
        excluded_handlers=["/metrics", "/health", "/ready"],
    ).instrument(app).expose(app, include_in_schema=False)

    return app


app = create_app()
