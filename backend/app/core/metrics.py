"""Business metrics. Labels are low-cardinality and never contain user/video IDs (rule 8)."""

from prometheus_client import Counter, Gauge

import_attempts_total = Counter(
    "app_import_attempts_total", "Video/playlist import attempts", ["result"]
)
note_save_failures_total = Counter(
    "app_note_save_failures_total", "Failed note autosaves", ["failure_type"]
)
progress_updates_total = Counter(
    "app_progress_updates_total", "Playback progress updates", ["outcome"]
)
completion_events_total = Counter(
    "app_completion_events_total", "Player ENDED events by outcome", ["outcome"]
)
viewing_session_pings_total = Counter(
    "app_viewing_session_pings_total", "Viewing-time pings by outcome", ["outcome"]
)
db_readiness = Gauge("db_readiness", "1 if the database is reachable, else 0")
