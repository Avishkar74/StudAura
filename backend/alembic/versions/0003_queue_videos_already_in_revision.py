"""queue videos already marked Needs Revision

Before the revision queue existed, "Needs revision" only set a status. Give every video that is in
that state an active queue entry (due tomorrow, UTC), so the queue and the status agree from now
on. Data only: the schema does not change.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-15 17:30:00.000000
"""
from collections.abc import Sequence

from alembic import op


revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO revision_items (id, user_id, video_id, due_at, active, flagged_at)
        SELECT gen_random_uuid(), p.user_id, p.video_id, (now() AT TIME ZONE 'UTC')::date + 1,
               true, now()
        FROM video_progress p
        WHERE p.learning_status = 'NEEDS_REVISION'
          AND NOT EXISTS (
              SELECT 1 FROM revision_items r
              WHERE r.user_id = p.user_id AND r.video_id = p.video_id AND r.active
          )
        """
    )


def downgrade() -> None:
    # The entries it added cannot be told apart from ones the student made, so nothing is removed.
    pass
