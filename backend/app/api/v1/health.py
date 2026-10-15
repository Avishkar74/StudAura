from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.metrics import db_readiness
from app.db import check_database

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness: the process is up. Deliberately does not touch the database."""
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> JSONResponse:
    """Readiness: the database must be reachable."""
    ok = await check_database()
    db_readiness.set(1 if ok else 0)
    if ok:
        return JSONResponse({"status": "ready"})
    return JSONResponse({"status": "unavailable"}, status_code=503)
