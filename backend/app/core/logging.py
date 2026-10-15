"""Logging setup.

Never log note content, emails, video IDs or user IDs at INFO or above
(see CLAUDE.md rule 8). Log request metadata only.
"""

import logging
import sys

from app.core.settings import settings


def configure_logging() -> None:
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        stream=sys.stdout,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        force=True,
    )
    # Uvicorn access logs include full URLs; the instrumentator already covers request metrics.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
