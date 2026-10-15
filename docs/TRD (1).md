# LearnFlow — Technical Requirements Document

| Field | Value |
|---|---|
| Version | 1.1 — Supabase baseline |
| Date | 15 October 2026 |
| Product | LearnFlow |
| Related | `docs/PRD.md` |
| Stack | React + Vite + TypeScript, FastAPI, Supabase (Auth + PostgreSQL), SQLAlchemy 2.x, Alembic |
| Delivery | Docker Compose locally; Kubernetes/Helm on AWS EKS (capstone) |

**Build the smallest reliable product that demonstrates the complete DevOps lifecycle.**

---

## 1. Purpose and Scope

This document defines implementation architecture, data model, API contracts, security rules,
testing requirements, and operational requirements for LearnFlow. The PRD defines what users need;
this TRD defines how to build it.

### 1.1 In Scope

- React + Vite + TypeScript SPA and FastAPI REST backend.
- Supabase Auth (JWTs) + Supabase PostgreSQL via SQLAlchemy 2.x + Alembic.
- YouTube IFrame Player API (playback) and YouTube Data API (metadata, import).
- Notes, comments, playback progress, learning status, paths, goals, revision queue, saved bookmarks.
- Docker Compose, GitHub Actions, Trivy, GHCR, Terraform, AWS EKS, Kubernetes/Helm, Ingress, HPA, Prometheus, Grafana.

### 1.2 Out of Scope

- AI note generation, transcription, handwriting, file uploads, PDF/image processing.
- Video downloading, rehosting, transcoding, scraping.
- Social features, collaborative paths, public comments, spaced repetition.
- Light theme, native mobile apps.
- Microservices: use a modular monolith.

---

## 2. Architecture Principles

1. **Modular monolith**: one FastAPI app, one PostgreSQL database, organised by domain module.
2. **Frontend and backend are separately containerised** to demonstrate independent image builds and deployment.
3. **Configuration is externalised** via environment variables, Kubernetes ConfigMaps, and Secrets.
4. **Secrets never in the frontend bundle or Git**: `SUPABASE_JWT_SECRET`, `YOUTUBE_DATA_API_KEY`, `DATABASE_URL`, AWS credentials.
5. **Business rules are pure functions/services**, testable without HTTP or DB.
6. **YouTube is an external dependency** that can fail; the rest of LearnFlow must remain usable.
7. **No sensitive data in metrics**: no user IDs, email addresses, note content, or video IDs as Prometheus labels.
8. **Local-first**: Docker Compose works before any AWS infrastructure is provisioned.

---

## 3. System Context

```
Browser
└── React + Vite + TypeScript SPA
    ├── @supabase/supabase-js  (auth, session management)
    ├── YouTube IFrame Player API  (embedded playback only)
    └── REST  ──────────────────────────────────────────────────►
                                                        FastAPI
                                                        ├── JWT middleware (python-jose, SUPABASE_JWT_SECRET)
                                                        ├── Domain routers (/api/v1/...)
                                                        ├── YouTube Data API adapter (server-side)
                                                        ├── SQLAlchemy 2.x repositories
                                                        └── Supabase PostgreSQL
                                                        ├── GET /health
                                                        ├── GET /ready
                                                        └── GET /metrics

Delivery:
  GitHub ──► GitHub Actions ──► pytest + vitest + lint
                             ──► docker build (frontend + backend)
                             ──► Trivy scan
                             ──► push commit-SHA tags to GHCR
                             ──► Terraform (AWS VPC + EKS)
                             ──► Helm deploy
                             ──► Prometheus scrape ──► Grafana
```

---

## 4. Repository Structure

```
learnflow/
├── CLAUDE.md
├── docs/
│   ├── PRD.md
│   └── TRD.md
├── frontend/
│   ├── src/
│   │   ├── app/              # router, providers, Supabase client, app shell
│   │   ├── components/       # shared UI components
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── learning-paths/
│   │   │   ├── player/
│   │   │   ├── notes/
│   │   │   ├── goals/
│   │   │   ├── revisions/
│   │   │   └── library/
│   │   ├── api/              # typed REST client (fetch wrappers)
│   │   ├── hooks/
│   │   └── styles/           # tokens.css (dark design tokens)
│   ├── Dockerfile
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── settings.py   # pydantic-settings, reads env vars
│   │   │   ├── auth.py       # JWT verification with python-jose
│   │   │   ├── errors.py     # global error shapes and handlers
│   │   │   └── logging.py    # structured logging (no sensitive data)
│   │   ├── api/
│   │   │   ├── deps.py       # FastAPI dependencies (db session, current_user)
│   │   │   └── v1/           # routers: paths, videos, notes, comments, progress,
│   │   │                     #          goals, revisions, library, health, metrics
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas (OpenAPI source)
│   │   ├── services/         # business logic (pure functions where possible)
│   │   ├── repositories/     # DB query functions (all filter by user_id)
│   │   └── integrations/
│   │       └── youtube/
│   │           ├── client.py     # real YouTube Data API adapter
│   │           └── fake.py       # fake adapter for tests (fixture-backed)
│   ├── alembic/
│   ├── tests/
│   │   ├── fixtures/youtube/ # recorded API responses (video, playlist, errors)
│   │   ├── unit/             # pure function tests
│   │   └── api/              # httpx TestClient tests
│   ├── Dockerfile
│   └── pyproject.toml
├── deploy/
│   ├── helm/learnflow/
│   ├── terraform/
│   ├── prometheus/
│   └── grafana/
├── compose.yaml
├── .env.example
└── .github/workflows/
```

---

## 5. Authentication — Supabase

### 5.1 Frontend

- Use `@supabase/supabase-js`. Initialise with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `supabase.auth.signUp()`, `signInWithPassword()`, `signOut()`, `onAuthStateChange()`.
- Store the session in memory (the SDK manages it). Never put `access_token` in `localStorage` manually.
- Attach the access token to every API request: `Authorization: Bearer <access_token>`.
- Handle token expiry: the SDK auto-refreshes; on 401 from the backend, call `supabase.auth.getSession()` and retry once.

### 5.2 Backend JWT Middleware

```python
# app/core/auth.py
from jose import jwt, JWTError
from app.core.settings import settings

ALGORITHM = "HS256"

def verify_supabase_token(token: str) -> dict:
    """Raises HTTPException 401 on invalid token."""
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=[ALGORITHM],
            options={"verify_aud": False},  # Supabase JWTs use "authenticated" audience
        )
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = verify_supabase_token(credentials.credentials)
    user_id: str = payload.get("sub")  # Supabase user UUID
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")
    # Upsert user row on first access
    user = await upsert_user(db, user_id, payload.get("email"))
    return user
```

- `sub` claim is the Supabase user UUID; use it as the application `user_id`.
- Never accept `user_id` from the request body.
- Required env var: `SUPABASE_JWT_SECRET` (backend only).

### 5.3 Environment Variables

```bash
# Frontend (prefix VITE_ so Vite exposes to the bundle)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # safe to expose; scoped by RLS + backend auth

# Backend (never expose to frontend)
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
DATABASE_URL=postgresql+asyncpg://postgres:password@db:5432/learnflow
YOUTUBE_DATA_API_KEY=...
CORS_ORIGINS=http://localhost:5173,https://yourdomain.com
APP_ENV=local
LOG_LEVEL=INFO
```

---

## 6. Database

### 6.1 Configuration

- Production/staging: Supabase managed PostgreSQL. `DATABASE_URL` from Supabase dashboard.
- Local development: PostgreSQL container in Docker Compose (same schema).
- Driver: `asyncpg` with SQLAlchemy 2.x async session.
- Migrations: Alembic. Every schema change = a new Alembic revision. `alembic upgrade head` runs as a one-shot step before app start; not in every replica.

### 6.2 Data Model

```sql
-- Users (mirrored from Supabase Auth)
CREATE TABLE users (
    id          UUID PRIMARY KEY,           -- = Supabase Auth sub
    email       TEXT UNIQUE NOT NULL,
    display_name TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Learning paths
CREATE TABLE learning_paths (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    target_date DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON learning_paths(user_id);

-- Shared video metadata (one row per YouTube video ID)
CREATE TABLE videos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_video_id    TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    channel_title       TEXT,
    thumbnail_url       TEXT,
    duration_seconds    INTEGER,             -- nullable; metadata may be missing
    availability_state  TEXT NOT NULL DEFAULT 'available',
    metadata_fetched_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX ON videos(youtube_video_id);

-- Many-to-many: path ↔ video, with ordering
CREATE TABLE learning_path_videos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    video_id         UUID NOT NULL REFERENCES videos(id),
    position         INTEGER NOT NULL,
    added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (learning_path_id, video_id)
);
CREATE INDEX ON learning_path_videos(learning_path_id, position);

-- Per-user video progress (status + playback position are separate)
CREATE TABLE video_progress (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id             UUID NOT NULL REFERENCES videos(id),
    last_position_seconds FLOAT NOT NULL DEFAULT 0,
    learning_status      TEXT NOT NULL DEFAULT 'NOT_STARTED',
                         -- CHECK IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','NEEDS_REVISION')
    ever_completed_at    TIMESTAMPTZ,        -- preserved when status moves to NEEDS_REVISION
    last_watched_at      TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, video_id)
);
CREATE INDEX ON video_progress(user_id, video_id);

-- Viewing sessions (for daily goal accounting)
CREATE TABLE viewing_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id        UUID NOT NULL REFERENCES videos(id),
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    watched_seconds INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT UNIQUE NOT NULL     -- (user_id::video_id::started_at truncated to minute)
);
CREATE INDEX ON viewing_sessions(user_id, started_at);

-- One primary note per user/video
CREATE TABLE video_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id   UUID NOT NULL REFERENCES videos(id),
    body       TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, video_id)
);

-- Personal comments per video
CREATE TABLE video_comments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id          UUID NOT NULL REFERENCES videos(id),
    body              TEXT NOT NULL,
    timestamp_seconds INTEGER,              -- nullable; must be ≤ video duration if known
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON video_comments(user_id, video_id, created_at);

-- One daily goal per user
CREATE TABLE learning_goals (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    daily_target_minutes INTEGER NOT NULL CHECK (daily_target_minutes > 0),
    timezone             TEXT NOT NULL DEFAULT 'UTC',
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Active revision queue
CREATE TABLE revision_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id   UUID NOT NULL REFERENCES videos(id),
    due_at     DATE NOT NULL,
    active     BOOLEAN NOT NULL DEFAULT true,
    flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revised_at TIMESTAMPTZ,
    UNIQUE (user_id, video_id, active)    -- at most one active revision per user/video
);
CREATE INDEX ON revision_items(user_id, active, due_at);

-- Saved/bookmarked videos
CREATE TABLE saved_videos (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id),
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, video_id)
);
```

### 6.3 Integrity Rules

- Deleting a learning path cascades to `learning_path_videos` only. Notes and progress are NOT deleted (the video may be in another path or bookmarked).
- Deleting a saved bookmark removes only the `saved_videos` row.
- `ever_completed_at` is set on first completion and never cleared, even when status changes to NEEDS_REVISION.
- `duration_seconds` is nullable — metadata may be unavailable. Clamp playback position to `[0, duration_seconds]` when duration is known.

---

## 7. API Contract

### 7.1 Conventions

- All endpoints prefixed `/api/v1/`.
- Request/response bodies: JSON. Timestamps: ISO-8601 UTC (`2026-10-15T09:00:00Z`).
- All user-scoped endpoints require `Authorization: Bearer <token>`.
- Consistent error shape:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable message",
      "details": []
    }
  }
  ```
- Pagination: `?limit=20&offset=0`. Response includes `total`, `limit`, `offset`, `items`.
- Ownership validated in the backend on every query — never trust client-supplied `user_id`.
- `PUT` and `PATCH` for progress and notes use upsert semantics (idempotent).

### 7.2 Endpoint Table

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/me` | Current user profile |
| GET | `/api/v1/learning-paths` | List user's paths |
| POST | `/api/v1/learning-paths` | Create path |
| GET | `/api/v1/learning-paths/{id}` | Path detail + progress summary |
| PATCH | `/api/v1/learning-paths/{id}` | Rename / update target date |
| DELETE | `/api/v1/learning-paths/{id}` | Delete path (confirmation required in UI) |
| GET | `/api/v1/learning-paths/{id}/videos` | Ordered path videos with status + progress |
| POST | `/api/v1/videos/import` | Resolve + add one YouTube video to a path |
| POST | `/api/v1/playlists/import` | Import playlist into a path |
| GET | `/api/v1/videos/{id}/progress` | Read user's progress for a video |
| PUT | `/api/v1/videos/{id}/progress` | Update position / status (idempotent) |
| GET | `/api/v1/videos/{id}/notes` | Get user's note for a video |
| PUT | `/api/v1/videos/{id}/notes` | Create/update note (idempotent autosave) |
| GET | `/api/v1/videos/{id}/comments` | List user's comments for a video |
| POST | `/api/v1/videos/{id}/comments` | Add comment |
| DELETE | `/api/v1/comments/{id}` | Delete own comment |
| GET | `/api/v1/goals` | Get user's daily goal + today's summary |
| PUT | `/api/v1/goals` | Create/update daily goal |
| POST | `/api/v1/viewing-sessions` | Record/update a viewing session |
| GET | `/api/v1/revisions` | List active revision queue |
| PUT | `/api/v1/videos/{id}/revision` | Flag / reschedule revision (idempotent) |
| POST | `/api/v1/videos/{id}/revision/complete` | Mark revised |
| GET | `/api/v1/notes` | Notes index across all paths |
| GET | `/api/v1/saved-videos` | List bookmarked videos |
| PUT | `/api/v1/videos/{id}/saved` | Bookmark video |
| DELETE | `/api/v1/videos/{id}/saved` | Remove bookmark |
| GET | `/health` | Liveness (no DB check) |
| GET | `/ready` | Readiness (DB connectivity required) |
| GET | `/metrics` | Prometheus exposition format |

**Note on `{id}` in `/videos/{id}`:** this is the internal UUID, not the YouTube video ID.
YouTube IDs are accepted only in `/api/v1/videos/import` and `/api/v1/playlists/import`.

### 7.3 Key Request/Response Shapes

```json
// POST /api/v1/videos/import
{ "youtube_url": "https://www.youtube.com/watch?v=abc123", "learning_path_id": "uuid" }

// POST /api/v1/playlists/import — response
{
  "added": 32,
  "skipped": 2,
  "failed": 1,
  "items": [
    { "youtube_video_id": "abc", "status": "added", "position": 1 },
    { "youtube_video_id": "xyz", "status": "skipped", "reason": "already_in_path" },
    { "youtube_video_id": "def", "status": "failed", "reason": "unavailable" }
  ]
}

// PUT /api/v1/videos/{id}/progress
{
  "last_position_seconds": 342.5,
  "learning_status": "IN_PROGRESS",   // optional; omit to update position only
  "session_key": "user::video::2026-10-15T09:00Z"  // idempotency key for viewing session
}

// GET /api/v1/goals
{
  "daily_target_minutes": 60,
  "timezone": "Asia/Kolkata",
  "today_watched_seconds": 2520,      // 42 min
  "goal_achieved": false
}
```

### 7.4 Frontend Error Handling

| Status | Action |
|---|---|
| 401 | Refresh token via Supabase SDK; retry once; else redirect to `/login`. |
| 403 / 404 | Show safe "not found" — never reveal whether another user owns the resource. |
| 422 | Show field-level validation errors. |
| 429 | Preserve form; show "Too many requests — try again shortly." |
| 5xx | Show recoverable error; preserve editor content. |
| Network fail | Retry notes save; show persistent retry affordance. |

---

## 8. Frontend Technical Requirements

### 8.1 Technology

- **React 18 + Vite + TypeScript** (strict mode).
- **React Router v6** for client-side routing.
- **@supabase/supabase-js** for auth.
- **Vitest + React Testing Library** for unit/component tests.
- **Playwright** for E2E tests (main branch CI only).
- No CSS framework required; use `tokens.css` with plain CSS modules or a minimal utility approach.
- Typed API client in `src/api/` — no scattered `fetch()` calls in components.
- Separate server state (paths, notes, progress) from transient UI state (drawer open, selected tab).

### 8.2 Routes

| Route | Screen |
|---|---|
| `/` | Home / Dashboard |
| `/learning-paths` | All Learning Paths |
| `/learning-paths/:pathId` | Path Overview |
| `/learn/:pathId/:videoId` | Learning Workspace |
| `/learn/saved/:videoId` | Standalone Video Workspace (saved, no path) |
| `/goals` | Daily Goals |
| `/revision` | Needs Revision |
| `/notes` | My Notes |
| `/library` | Saved Videos |
| `/settings` | Settings |
| `/login` | Sign In |
| `/signup` | Sign Up |

### 8.3 State Ownership

| State | Source | Persistence |
|---|---|---|
| Learning paths + videos | Backend/DB | Persistent |
| Notes / comments | Backend/DB | Persistent; autosave queue is transient |
| Playback position + status | Backend/DB | Persistent |
| Goals + revisions | Backend/DB | Persistent |
| Saved bookmarks | Backend/DB | Persistent |
| Sidebar collapsed | Frontend | `localStorage` |
| Selected right-panel tab | Frontend | Session storage |
| Playlist drawer open/closed | Transient UI | Not persisted |
| Unsaved note buffer | Editor state | Kept until save succeeds or user discards |

### 8.4 Playback Tracking (frontend responsibilities)

The YouTube IFrame Player API is loaded via the standard embed script.

```typescript
// Pseudo-code for playback tracking
player.addEventListener('onStateChange', (event) => {
  if (event.data === YT.PlayerState.PLAYING) {
    startInterval(); // ping backend every 15 s while playing
  }
  if (event.data === YT.PlayerState.PAUSED) {
    stopInterval();
    savePosition(player.getCurrentTime());
  }
  if (event.data === YT.PlayerState.ENDED) {
    stopInterval();
    savePosition(player.getCurrentTime());
    if (!sessionWasSeeked) {
      triggerCompletionCheck(); // backend evaluates completion rules
    }
  }
});

// Seek detection
let lastKnownTime = 0;
setInterval(() => {
  const current = player.getCurrentTime();
  if (Math.abs(current - lastKnownTime) > 2) {
    sessionWasSeeked = true;  // jump > 2 s = seek
  }
  lastKnownTime = current;
}, 1000);
```

- Ping interval: every 15 s while playing.
- On each ping: `PUT /api/v1/videos/{id}/progress` with `last_position_seconds` and an idempotency key.
- The backend updates the open `ViewingSession` row (incrementing `watched_seconds`).
- Never call the backend more than once per second.

---

## 9. Business Logic Contracts

All of the following must be implemented as pure functions in `backend/app/services/` and covered by unit tests.

### 9.1 Status Transitions

```python
def apply_completion_event(progress: VideoProgress, session_was_seeked: bool) -> VideoProgress:
    """
    Called when the player fires ENDED.
    Only auto-completes if the session was clean (not seeked).
    """
    if session_was_seeked:
        return progress  # no change
    if progress.learning_status == "NEEDS_REVISION":
        return progress  # preserve; student is in revision mode
    progress.learning_status = "COMPLETED"
    if progress.ever_completed_at is None:
        progress.ever_completed_at = datetime.utcnow()
    return progress

def set_needs_revision(progress: VideoProgress) -> VideoProgress:
    """NEEDS_REVISION must NOT clear ever_completed_at."""
    progress.learning_status = "NEEDS_REVISION"
    # ever_completed_at intentionally unchanged
    return progress
```

### 9.2 Path Completion Percentage

```python
def path_completion_pct(videos: list[VideoProgress]) -> float:
    """
    Counts videos with completion history (ever_completed_at IS NOT NULL).
    NEEDS_REVISION counts as completed only if ever_completed_at is set.
    """
    if not videos:
        return 0.0
    completed = sum(1 for v in videos if v.ever_completed_at is not None)
    return round(completed / len(videos) * 100, 1)
```

### 9.3 Daily Goal Progress

```python
def daily_watched_seconds(sessions: list[ViewingSession], user_tz: str, date: date) -> int:
    """Sum watched_seconds for sessions whose started_at falls on `date` in user_tz."""
    tz = ZoneInfo(user_tz)
    return sum(
        s.watched_seconds for s in sessions
        if s.started_at.astimezone(tz).date() == date
    )
```

### 9.4 Deadline Estimate

```python
def deadline_estimate_minutes_per_day(
    remaining_seconds: int | None,
    target_date: date,
    today: date,
) -> float | None:
    """Returns minutes/day needed, or None if estimate is impossible."""
    if remaining_seconds is None or target_date <= today:
        return None
    days_remaining = (target_date - today).days
    if days_remaining <= 0:
        return None
    return round((remaining_seconds / 60) / days_remaining, 1)
```

### 9.5 Revision Due Date

```python
def default_revision_due_date(user_tz: str) -> date:
    """Next calendar day in the user's timezone."""
    return (datetime.now(ZoneInfo(user_tz)) + timedelta(days=1)).date()
```

---

## 10. YouTube Integration

### 10.1 What is used

| API | Purpose | Who calls it |
|---|---|---|
| YouTube IFrame Player API | Embedded playback + player events | Frontend (browser) |
| YouTube Data API v3 | Video/playlist metadata + playlist entries | Backend only |

The YouTube Data API key lives in `YOUTUBE_DATA_API_KEY` (backend env var). It is never sent to the frontend.

### 10.2 Video URL Validation

Accept:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`

Extract `VIDEO_ID` (11 chars, `[A-Za-z0-9_-]`). Reject anything else with a validation error.

### 10.3 Playlist URL Validation

Accept:
- `https://www.youtube.com/playlist?list=PLAYLIST_ID`
- `https://www.youtube.com/watch?v=...&list=PLAYLIST_ID`

Extract `PLAYLIST_ID`. Reject anything else.

### 10.4 Import Failure Modes

| Condition | Backend response |
|---|---|
| Invalid URL | 422 with supported URL examples |
| Private/deleted video | Include in `failed` items with reason `unavailable`; continue import |
| Embedding disabled | Metadata stored; `availability_state = 'embed_disabled'`; player shows fallback |
| API quota exhausted | 429 with `Retry-After`; log metric without logging the key |
| Network timeout | Bounded timeout (5 s per request, 30 s total); return partial results |
| Duplicate in path | Include in `skipped` with reason `already_in_path` |

### 10.5 Test Fixture Requirements

The fake YouTube adapter (`backend/app/integrations/youtube/fake.py`) is used in all tests and CI. It reads from `backend/tests/fixtures/youtube/`:

- `video_normal.json` — standard available video
- `video_private.json` — private/deleted video (API returns 403/404)
- `video_embed_disabled.json` — video with embed restrictions
- `playlist_mixed.json` — playlist with 5 entries: 3 available, 1 private, 1 embed-disabled

CI never calls the real YouTube API. The fake adapter is activated by `APP_ENV=test`.

---

## 11. Security Requirements

### 11.1 Authentication and Authorisation

- Every request to a user-scoped endpoint must carry a valid Supabase JWT.
- `user_id` is always extracted from the verified JWT `sub` claim. Never from the request body.
- Backend must validate ownership on every query — a user must not be able to read or modify another user's paths, notes, progress, revision items, or bookmarks.
- 403 and 404 responses must not reveal whether another user owns the resource.

### 11.2 Secret Management

| Secret | Location |
|---|---|
| `SUPABASE_JWT_SECRET` | Backend env only; Kubernetes Secret in deploy |
| `YOUTUBE_DATA_API_KEY` | Backend env only; Kubernetes Secret in deploy |
| `DATABASE_URL` | Backend env only; Kubernetes Secret in deploy |
| `VITE_SUPABASE_ANON_KEY` | Frontend build env; safe to expose (scoped by Supabase) |
| AWS credentials | GitHub OIDC (short-lived); never committed |

Commit `.env.example` with placeholder values. Never commit real credentials.

### 11.3 Input Validation and XSS

- Validate and size-limit all note and comment bodies (suggested max: notes 100 KB, comments 2 KB).
- Sanitise any HTML in note bodies before rendering (use a library such as `DOMPurify`).
- Validate YouTube URL and playlist identifiers on the backend before calling the YouTube API.

### 11.4 CORS

Configure `CORS_ORIGINS` as an explicit allowlist. Do not use `*` in production.

### 11.5 Container Security

- Run containers as non-root users.
- Use minimal base images (e.g. `python:3.12-slim`, `node:20-alpine`).
- Use `.dockerignore` to exclude `node_modules`, `.env`, `.git`, test caches.
- Run Trivy on both images in CI. Define severity policy before first publish.

---

## 12. Docker and Local Development

### 12.1 Compose Services

| Service | Purpose |
|---|---|
| `frontend` | React + Vite dev server (or nginx for production build) |
| `backend` | FastAPI; waits for DB healthcheck before starting |
| `db` | PostgreSQL with named volume and healthcheck |
| `prometheus` *(optional)* | Scrape backend metrics; useful for local observability demo |
| `grafana` *(optional)* | Dashboard; provision via config file |

### 12.2 compose.yaml Requirements

- Services communicate by service DNS name (not `localhost`).
- `backend` depends on `db` with `condition: service_healthy`.
- Use `healthcheck` on `db` (`pg_isready`).
- `FRONTEND_API_BASE_URL` must be configurable without rebuild (use runtime env injection or a build arg).
- Migrations run as a one-shot command or an `init` container; not as part of the web server start.

### 12.3 Multi-Stage Dockerfiles

**Backend:**
```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[prod]"
COPY app/ app/
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Frontend:**
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

---

## 13. CI/CD Requirements

### 13.1 Pull Request Workflow

1. Checkout + configure runtimes.
2. Install frontend deps from lockfile (`npm ci`).
3. Install backend deps.
4. Frontend: lint + typecheck + `npm test`.
5. Backend: `ruff` lint + `mypy` typecheck + `pytest`.
6. Alembic migration test: upgrade from empty DB.
7. Docker build (both images) — catch packaging failures early.
8. Container smoke test: start image, hit `/health`.
9. Fail workflow if any step fails.

### 13.2 Main-Branch / Release Workflow

1. Repeat all PR gates.
2. Build frontend and backend images.
3. Tag images with `GITHUB_SHA`.
4. Trivy scan both images; save reports as artefacts.
5. Fail on Critical; review High per policy.
6. Push images to GHCR: `ghcr.io/<org>/learnflow-backend:<sha>` and `learnflow-frontend:<sha>`.
7. Optional: trigger Helm deployment job.
8. Post-deploy smoke: `GET /health`, `GET /ready`, one authenticated API call.

### 13.3 Workflow Security

- Least-privilege `GITHUB_TOKEN` permissions.
- Pin third-party Actions to commit SHAs.
- Use GitHub OIDC for AWS role assumption (no long-lived access keys).
- Separate PR validation jobs from privileged publish/deploy jobs.
- Never print secrets or pass them as positional CLI arguments.

---

## 14. Terraform and AWS

### 14.1 Resources to Provision

- VPC + subnets + Internet Gateway (as required by rubric).
- EKS cluster + node group.
- ECR or use GHCR (whichever the rubric prefers).
- IAM roles for EKS node group and OIDC trust for GitHub Actions.
- Any load balancer / ALB required by the Ingress controller.

### 14.2 Requirements

- Environment-specific variables in `terraform.tfvars` (not committed if containing secrets).
- Remote state with locking (S3 + DynamoDB recommended).
- Pin provider versions; commit `.terraform.lock.hcl`.
- Run `terraform fmt` and `terraform validate` in CI.
- Use the smallest cost-appropriate instance sizes for the demo.
- Document: region, estimated cost drivers, `terraform apply` steps, and **`terraform destroy` steps**.

---

## 15. Kubernetes and Helm

### 15.1 Chart Structure

```
deploy/helm/learnflow/
├── Chart.yaml
├── values.yaml          # non-secret defaults
├── values.prod.yaml     # overrides for production
└── templates/
    ├── frontend-deployment.yaml
    ├── frontend-service.yaml
    ├── backend-deployment.yaml
    ├── backend-service.yaml
    ├── configmap.yaml
    ├── ingress.yaml
    └── hpa.yaml
```

### 15.2 Deployment Requirements

- **Liveness probe**: `GET /health` — fast, no DB check.
- **Readiness probe**: `GET /ready` — checks DB connectivity.
- **Resource requests and limits** set on every container (required for HPA to function).
- **HPA**: CPU-based autoscaling on the backend deployment (requires `metrics-server`).
- **Rolling update strategy** with `maxUnavailable: 0` for zero-downtime demo.
- **Migrations**: run as a Kubernetes Job or `initContainer` before the backend Deployment rolls out. Do not run in every replica.
- **Secrets**: `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `YOUTUBE_DATA_API_KEY` from Kubernetes Secrets (not ConfigMaps). Never commit manifests containing real values.
- **Ingress**: expose frontend at `/`; route `/api` to backend service. Configure path rewriting if needed.
- **Namespace**: use a dedicated namespace (e.g. `learnflow`).

---

## 16. Observability

### 16.1 Health Endpoints

| Endpoint | Semantics |
|---|---|
| `GET /health` | Liveness — process running. Returns 200 + `{"status":"ok"}`. No downstream check. |
| `GET /ready` | Readiness — checks DB connectivity. Returns 200 if OK, 503 if DB is unavailable. |
| `GET /metrics` | Prometheus exposition format. No sensitive data in labels. |

### 16.2 Metrics

Use `prometheus-fastapi-instrumentator` for HTTP metrics. Add custom counters:

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route_template`, `status_code_class` | Request volume + error rate |
| `http_request_duration_seconds` | Histogram | `method`, `route_template` | Latency percentiles |
| `app_import_attempts_total` | Counter | `result` (success/partial/failed) | Import health |
| `app_note_save_failures_total` | Counter | `failure_type` | Autosave reliability |
| `app_progress_updates_total` | Counter | `outcome` | Playback tracking activity |
| `db_readiness` | Gauge | *(none)* | DB health signal |

Do not label metrics with `user_id`, `video_id`, note text, email, or path names.

### 16.3 Grafana Panels

Provision via `deploy/grafana/dashboards/learnflow.json`:

- Request rate by route group.
- 4xx / 5xx response rate.
- p50 / p95 request latency.
- Import success / failure rate.
- Note-save failure count.
- DB readiness gauge.
- Pod CPU / memory (from cluster metrics if available).
- HPA replica count.

### 16.4 Troubleshooting Runbook

| Symptom | First checks | Likely cause |
|---|---|---|
| Frontend loads, API 502/504 | Ingress path, backend Service, backend pod logs | Path rewrite, CORS, backend not ready |
| Backend `CrashLoopBackOff` | `kubectl logs`, env vars, secret refs | Missing config, DB connection error, startup exception |
| Readiness failing | `/ready` response, DB pod/service, migrations | DB unavailable, wrong `DATABASE_URL`, migration not applied |
| Playlist import fails | Backend logs, import metric, quota | Invalid URL, quota exhausted, network timeout |
| HPA does not scale | `kubectl get hpa`, metrics-server | Missing resource requests, metrics-server not installed |
| Prometheus has no targets | Prometheus targets page, Service annotations | Wrong scrape path/port, service labels |
| Notes not saving | Frontend save state, API response | Auth expired, validation, DB outage |

**Useful commands:**
```bash
kubectl get pods,svc,ingress,hpa -n learnflow
kubectl describe deployment learnflow-backend -n learnflow
kubectl logs deployment/learnflow-backend -n learnflow --tail=100
kubectl port-forward svc/learnflow-backend 8000:8000 -n learnflow
kubectl rollout status deployment/learnflow-backend -n learnflow
kubectl rollout undo deployment/learnflow-backend -n learnflow
terraform plan
terraform destroy   # only after confirming workspace and intended resources
```

---

## 17. Testing and Quality Gates

| Layer | Required | Gate |
|---|---|---|
| Backend unit | Progress math, status transitions, revision due date, goal accounting, URL validation | Must pass on PR |
| Backend API | CRUD, validation, auth/ownership, errors, pagination | Must pass on PR |
| DB / Alembic | Constraints, relationships, upgrade from empty schema | Must pass on PR |
| Frontend unit/component | Tabs, drawers, save states, empty states, status controls | Must pass on PR |
| Frontend integration | Path/video context switch, notes autosave, playlist drawer | Must pass on PR |
| E2E (Playwright) | Core student journey, mock YouTube | Runs on main |
| Container smoke | Start image, hit `/health` | Must pass before publish |
| Trivy scan | Both images, both human + machine output | Must run; Critical blocks publish |
| Deploy smoke | Ingress, health, readiness, one API call | Must pass post-deploy |

### 17.1 Core Regression Scenarios

These must be covered by automated tests or documented manual steps:

1. User A cannot read or modify User B's path, note, progress, revision, or bookmark.
2. Removing a video from one path does not delete notes/progress if the video is used elsewhere.
3. Switching videos does not attach the previous video's notes to the new video.
4. Failed note save preserves editor text and shows retry state.
5. Seek-to-end alone does not grant completion credit.
6. Repeated playback progress updates do not double-count daily viewing time.
7. NEEDS_REVISION does not erase `ever_completed_at`.
8. Unsaving removes only the bookmark.
9. Playlist import handles duplicates and partial unavailable items.
10. Logo and Home sidebar item both route to `/`.
11. Playlist drawer close restores the previously selected right-panel tab.
12. App is usable (no overflow, no broken layout) at 1440 px, 768 px, and 375 px widths.

---

## 18. Configuration Reference

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Backend | `postgresql+asyncpg://...`. Kubernetes Secret in deploy. |
| `SUPABASE_JWT_SECRET` | Backend | Never expose to frontend. Kubernetes Secret. |
| `YOUTUBE_DATA_API_KEY` | Backend | Server-side only. Kubernetes Secret. |
| `CORS_ORIGINS` | Backend | Comma-separated allowlist. |
| `APP_ENV` | Backend | `local` / `test` / `production`. Controls YouTube adapter (fake vs real). |
| `LOG_LEVEL` | Backend | `INFO` in production. No debug logs with sensitive data. |
| `VITE_SUPABASE_URL` | Frontend build | Public Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Frontend build | Public anon key. Safe to expose. |
| `VITE_API_BASE_URL` | Frontend build | `/api` for Ingress; `http://localhost:8000` for local. |

Commit `.env.example` with placeholder values and setup instructions. Never commit `.env`.

---

## 19. Build Order

| Order | Work item | Why |
|---|---|---|
| 1 | Repo skeleton + Compose + health endpoint | Proves full-stack wiring early |
| 2 | SQLAlchemy models + Alembic migrations + migration test | Stable schema before building on top |
| 3 | Supabase Auth: frontend sign-up/in, JWT middleware, `/api/v1/me` | Auth required for every other endpoint |
| 4 | Learning path CRUD + tests | Core domain |
| 5 | Individual video import (fake adapter in tests) | Establishes video model and path membership |
| 6 | Frontend shell: tokens, header, sidebar, routing | Visible progress; enables UI testing |
| 7 | Playlist import + partial failure handling | Isolates external API complexity |
| 8 | YouTube IFrame embed + playback position persistence | Core learning workspace |
| 9 | Notes autosave | Business-critical; test thoroughly |
| 10 | Comments + status controls + completion rules | Completes the learning workspace |
| 11 | Daily goals + ViewingSession accounting | Depends on stable progress tracking |
| 12 | Revision queue | Depends on status model |
| 13 | Dashboard + all secondary pages | Builds on stable domain services |
| 14 | CI + Trivy + GHCR | Do not leave this until the last day |
| 15 | Terraform + EKS + Helm + Ingress + HPA | Provision after local containers are stable |
| 16 | Prometheus + Grafana | Operational marks need a visible demo |
| 17 | Accessibility, E2E, README, demo script | Final polish and grading evidence |

**Deadline rule:** if time is constrained, protect steps 14–16 (DevOps rubric) before adding product features beyond step 10.

---

## 20. Definition of Technical Done

- Frontend and backend start with `docker compose up --build` and one `alembic upgrade head` command.
- Schema is fully reproducible from Alembic migrations against an empty database.
- Core business rules (progress, status, completion, goals, revisions) have unit tests.
- API validates inputs and enforces user ownership; cross-user access is tested.
- Notes and progress survive refresh and re-login. Failed saves do not silently lose content.
- Frontend handles loading, empty, error, and unavailable-video states for all routes.
- GitHub Actions runs tests and builds images on every PR; Trivy scans both images.
- Images are tagged with commit SHA and published to GHCR.
- Terraform provisions required AWS/EKS; teardown procedure is documented and tested.
- Helm deploys the app with Ingress, probes, resource requests/limits, and HPA.
- Prometheus scrapes `/metrics`; Grafana displays a useful operational dashboard.
- Team can demonstrate one troubleshooting scenario end-to-end.
- README covers: architecture, local setup, env vars, test commands, deploy steps, troubleshooting, teardown.
