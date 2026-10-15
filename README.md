# StudAura

A dark-only, YouTube-inspired personal learning workspace. Organise YouTube videos and playlists
into learning paths, watch them embedded, take notes, track progress, set daily goals and manage a
revision queue. **Watch. Capture. Track. Revise.**

Also a college DevOps capstone: Docker, GitHub Actions, Trivy, GHCR, Terraform, EKS, Helm,
Prometheus and Grafana. See [`docs/PRD.md`](docs/PRD.md), [`docs/TRD.md`](docs/TRD.md) and
[`CLAUDE.md`](CLAUDE.md). UI mockups live in [`docs/ui-reference`](docs/ui-reference).

## Stack

React + Vite + TypeScript + Tailwind CSS v4 · FastAPI · Supabase Auth · PostgreSQL (SQLAlchemy 2,
Alembic) · Docker Compose.

## Local setup

```bash
cp .env.example .env        # then fill in the Supabase and YouTube values
docker compose up --build   # db + migrations + backend + frontend
```

| URL | What |
|---|---|
| http://localhost:5173 | Frontend |
| http://localhost:8000/health | Liveness |
| http://localhost:8000/ready | Readiness (checks the DB) |
| http://localhost:8000/metrics | Prometheus metrics |
| http://localhost:8000/docs | OpenAPI docs |

Compose always uses its own local Postgres, regardless of `DATABASE_URL` in `.env`
(that value is for running against Supabase). Migrations run as a one-shot `migrate` service.

## Common commands

```bash
docker compose exec backend alembic upgrade head      # apply migrations
docker compose exec backend pytest                    # backend tests (DB tests use the compose db)
docker compose exec backend sh -c "ruff check . && ruff format --check . && mypy app alembic"
docker compose down -v                                # stop and wipe the local DB

cd frontend && npm install
npm run dev | test | lint | typecheck | build
```

## Environment variables

See [`.env.example`](.env.example). Secrets (`SUPABASE_JWT_SECRET`, `DATABASE_URL`,
`YOUTUBE_DATA_API_KEY`) are backend-only and must never reach the frontend bundle or Git.
