from pydantic import BaseModel


class Page[T](BaseModel):
    """Standard pagination envelope (TRD 7.1)."""

    total: int
    limit: int
    offset: int
    items: list[T]
