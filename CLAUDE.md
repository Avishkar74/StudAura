# CLAUDE.md — LearnFlow

LearnFlow is a dark-only YouTube-inspired personal learning workspace. Students organise YouTube
videos and playlists into learning paths, watch embedded videos, take typed notes, track playback
progress, set daily goals, and manage revision queues. It is also a college DevOps capstone; the
full delivery pipeline (Docker, CI, EKS, Helm, Prometheus, Grafana) is a first-class requirement.

Full spec: [`docs/PRD.md`](docs/PRD.md) and [`docs/TRD.md`](docs/TRD.md).

---

## Commands

```bash
# Local development
docker compose up --build          # start frontend + backend + db
docker compose exec backend alembic upgrade head   # run migrations
docker compose exec backend pytest                 # run all backend tests
docker compose exec backend pytest -k "test_name" # run one test
docker compose logs -f backend                     # tail backend logs
docker compose down                                # stop (keeps DB volume)
docker compose down -v                             # stop + wipe DB volume

# Backend (outside Docker)
cd backend
pip install -e ".[dev]"
alembic upgrade head
pytest
uvicorn app.main:app --reload

# Frontend (outside Docker)
cd frontend
npm install
npm run dev
npm test
npm run build
npm run lint
npm run typecheck
```

---

## Auth — Supabase

Authentication is handled entirely by **Supabase Auth**. Do not invent a custom auth system.

- The React frontend uses `@supabase/supabase-js` to sign up, sign in, and manage sessions.
- JWTs are issued by Supabase and sent as `Authorization: Bearer <token>` on every API request.
- The FastAPI backend verifies JWTs using the **Supabase JWT secret** (`SUPABASE_JWT_SECRET`). Use
  the `python-jose` library. Never trust `user_id` from the request body; always extract it from
  the verified JWT payload (`sub` claim = user UUID).
- User rows in the database use the same UUID as the Supabase Auth user. Do not maintain a
  separate password table.
- Session refresh is handled by the Supabase client SDK. The backend is stateless.
- Environment variables required: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (frontend),
  `SUPABASE_JWT_SECRET` (backend only — never expose to frontend).

---

## Database — Supabase PostgreSQL

The app uses **Supabase's managed PostgreSQL** instance, accessed via a standard `DATABASE_URL`
connection string (postgresql+asyncpg or psycopg2).

- Use **SQLAlchemy 2.x** with async support where practical.
- Use **Alembic** for every schema change. Never alter the schema manually.
- Run migrations as a one-shot step before starting the app; do not run them in every replica.
- For local development, Docker Compose runs a local PostgreSQL container. The same migration
  scripts apply to both local and Supabase.
- Supabase Row Level Security (RLS) is **not relied on** for authorisation — the FastAPI backend
  enforces ownership on every query. RLS may be enabled as an extra safety net but is not the
  primary control.

---

## Non-negotiable rules

These apply to every file Claude Code writes. Do not deviate.

1. **Ownership on every query.** Every database query that touches user-owned data must filter by
   the `user_id` extracted from the verified JWT. Never accept `user_id` from the client body.

2. **Never expose secrets to the frontend.** `SUPABASE_JWT_SECRET`, `YOUTUBE_DATA_API_KEY`,
   `DATABASE_URL`, and AWS credentials must never appear in the frontend bundle or be committed
   to Git. Use `.env.example` for documentation.

3. **Alembic for all schema changes.** Never use `Base.metadata.create_all()` in production or
   test setup. Generate an Alembic revision for every model change.

4. **YouTube API server-side only.** The YouTube Data API key lives in the backend. The frontend
   never calls the YouTube Data API directly. The YouTube IFrame Player API (client-side embed)
   is the only YouTube API the frontend uses.

5. **No video downloads or scraping.** LearnFlow never downloads, transcodes, proxies, or
   rehouses YouTube video bytes. It stores video identifiers and permitted metadata only.

6. **Separate playback progress from learning status.** `last_position_seconds` and
   `learning_status` are different fields. A seek to 90% does not automatically set status to
   COMPLETED. See TRD §9 for the exact rules.

7. **Viewing time from observed intervals only.** Daily goal progress counts active playback
   intervals, not wall-clock time or page-open duration. Pauses and seeks must not be counted as
   watched time. Repeated progress writes must be idempotent.

8. **No sensitive data in logs or metrics.** Do not log note content, email addresses, video
   IDs, or user IDs at INFO level or above. Do not use user IDs or video IDs as Prometheus
   metric labels.

9. **Notes must not be silently lost.** The notes editor must show saving/saved/error state.
   On a failed autosave, keep the text in memory and offer retry. Never discard editor content
   without explicit user action.

10. **Tests use a fake YouTube adapter.** CI never calls the real YouTube API. Use fixtures
    under `backend/tests/fixtures/youtube/` for video and playlist metadata. The fake adapter
    includes: one normal video, one private/deleted video, one embedding-disabled video, and one
    playlist with a mix of available and unavailable items.

---

## Architecture snapshot

```
Browser
├── React + Vite + TypeScript SPA
│   ├── Supabase JS client (auth + session)
│   ├── YouTube IFrame Player API (playback only)
│   └── REST calls → /api/v1/...
│
└── FastAPI (Python)
    ├── JWT verification via SUPABASE_JWT_SECRET
    ├── Domain routers: paths, videos, notes, comments,
    │   progress, goals, revisions, library
    ├── YouTube Data API adapter (server-side, mocked in tests)
    ├── SQLAlchemy 2.x + Alembic → Supabase PostgreSQL
    ├── GET /health  (liveness)
    ├── GET /ready   (readiness — checks DB)
    └── GET /metrics (Prometheus)

Delivery:
  GitHub → GitHub Actions → pytest + vitest + lint
         → docker build (frontend + backend)
         → Trivy scan
         → push commit-SHA tags to GHCR
         → Terraform (AWS VPC + EKS)
         → Helm deploy (Deployment, Service, Ingress, HPA)
         → Prometheus scrape → Grafana dashboard
```

---

## Repository structure

```
learnflow/
├── CLAUDE.md                    ← this file
├── docs/
│   ├── PRD.md
│   ├── TRD.md
│   └── features/                ← one file per P0 feature (source of truth for acceptance criteria)
├── frontend/
│   ├── src/
│   │   ├── app/                 # router, providers, Supabase client init, app shell
│   │   ├── components/          # shared UI (Button, Badge, Modal, Tabs, Drawer…)
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── learning-paths/
│   │   │   ├── player/
│   │   │   ├── notes/
│   │   │   ├── goals/
│   │   │   ├── revisions/
│   │   │   └── library/
│   │   ├── api/                 # typed REST client (axios/fetch wrappers)
│   │   ├── hooks/
│   │   └── styles/              # design tokens (tokens.css)
│   ├── Dockerfile
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/                # settings, JWT verification, error shapes, logging
│   │   ├── api/                 # routers + FastAPI dependencies
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/            # business logic (progress, goals, revisions, completion)
│   │   ├── repositories/        # DB query functions
│   │   └── integrations/
│   │       └── youtube/         # YouTube Data API adapter (real + fake)
│   ├── alembic/
│   ├── tests/
│   │   ├── fixtures/youtube/    # recorded API responses for fake adapter
│   │   ├── unit/
│   │   └── api/
│   ├── Dockerfile
│   └── pyproject.toml
├── deploy/
│   ├── helm/learnflow/
│   ├── terraform/
│   ├── prometheus/
│   └── grafana/
├── compose.yaml
├── .env.example
├── .github/workflows/
└── README.md
```

---

## Design tokens (dark-only)

These are the only colours. Do not use hex values outside `tokens.css`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0F1113` | App background |
| `--surface-1` | `#17191C` | Sidebar, cards, panels |
| `--surface-2` | `#202327` | Inputs, hover states |
| `--surface-3` | `#292D32` | Menus, dialogs |
| `--border` | `#30343A` | Separators |
| `--text-primary` | `#F5F5F5` | Headings, body |
| `--text-secondary` | `#B8BEC7` | Metadata |
| `--text-muted` | `#8B929C` | Timestamps |
| `--accent` | `#F21D3D` | Primary buttons, active nav, progress fill |
| `--accent-hover` | `#D91532` | Hover on primary |
| `--success` | `#34D399` | Saved, completed |
| `--warning` | `#FBBF24` | Due soon |
| `--revision` | `#FB923C` | Needs Revision |
| `--info` | `#60A5FA` | In Progress |
| `--focus` | `#93C5FD` | Keyboard focus ring |

**Contrast note:** white text on `--accent` (#F21D3D) is ~4.2:1, which fails WCAG AA for normal
text. Use `font-weight: 600` or `font-size ≥ 18px` on accent-coloured buttons so they pass the
large-text threshold (3:1), or use `--accent-hover` (#D91532, ~5.1:1) as the rendered colour.

---

## Key resolved decisions

| Topic | Decision |
|---|---|
| Auth | Supabase Auth, JWT verified server-side with `python-jose` |
| Database | Supabase PostgreSQL via SQLAlchemy 2.x + Alembic |
| `{id}` in `/videos/{id}` | Internal UUID. YouTube IDs accepted only in import endpoints. |
| Seek-only detection | A completion event is trusted only if the player's `currentTime` advanced by ≤ 2 s from the last persisted position without a detected seek event. The IFrame API `onStateChange` ENDED event combined with a clean interval log is the trigger; a jump > 2 s in a single interval marks the session as seeked and blocks auto-completion. |
| Viewing time tracking | Use `ViewingSession` rows. Each row records `started_at`, `ended_at`, `watched_seconds`. Idempotency key = `(user_id, video_id, started_at rounded to minute)`. Daily total = `SUM(watched_seconds)` for sessions where `started_at::date = today` in user timezone. Repeated frontend pings update the latest open session's `ended_at` rather than creating new rows. |
| Standalone saved-video route | `/learn/saved/:videoId` — opens a lightweight workspace without path context. |
| Playlist import | Synchronous for ≤ 50 items. Return `{added, skipped, failed, items[]}` always. For > 50 items, process in batches with per-item results. |
| Autosave | Debounce 1.5 s. `PUT /api/v1/videos/{id}/notes` is idempotent. Show Saving → Saved → error with retry. |
| Frontend tests | Vitest + React Testing Library. Playwright for E2E on main branch only. |
| Metrics library | `prometheus-fastapi-instrumentator` for HTTP metrics; custom counters for business metrics. |

---

## Milestones (work one at a time, open a PR per milestone)

- [ ] **M1** — Repo skeleton, Docker Compose, health + readiness endpoints, empty Alembic config
- [ ] **M2** — All SQLAlchemy models, first Alembic migration, migration test from empty DB
- [ ] **M3** — Supabase Auth wired: signup/login UI, JWT middleware on backend, `/api/v1/me`
- [ ] **M4** — Learning path CRUD + unit/API tests
- [ ] **M5** — Individual video import (fake YouTube adapter in tests), path video list
- [ ] **M6** — Frontend shell: dark tokens, header, sidebar, routing, dashboard skeleton
- [ ] **M7** — Playlist import with partial failure handling
- [ ] **M8** — YouTube IFrame embed, playback position persistence, resume prompt
- [ ] **M9** — Notes autosave (debounce, save state, retry on failure)
- [ ] **M10** — Comments, learning status controls, completion rules, seek detection
- [ ] **M11** — Daily goals and viewing-time tracking (`ViewingSession`)
- [ ] **M12** — Revision queue (flag, reschedule, mark revised)
- [ ] **M13** — Dashboard (Continue Learning, goal widget, revision preview, path cards)
- [ ] **M14** — All Paths, Daily Goals, Needs Revision, My Notes, Saved Videos pages
- [ ] **M15** — CI: lint + tests + build + Trivy + GHCR publish on push to main
- [ ] **M16** — Terraform: VPC + EKS provisioning
- [ ] **M17** — Helm: Deployment, Service, Ingress, HPA, probes, resource limits
- [ ] **M18** — Prometheus scrape + Grafana dashboard provisioning
- [ ] **M19** — Accessibility pass, responsive fixes, E2E tests, README, demo script

**Deadline rule:** if time is short, protect M15–M18 (DevOps rubric) before adding product
features beyond M10.
