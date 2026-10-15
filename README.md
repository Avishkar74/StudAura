# StudAura

[![CI](https://github.com/Avishkar74/StudAura/actions/workflows/ci.yml/badge.svg)](https://github.com/Avishkar74/StudAura/actions/workflows/ci.yml)

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

## Supabase setup

1. Create a project and copy the URL and anon key into `.env` (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`).
2. Authentication > Providers > Email is enabled by default. With "Confirm email" on, new users
   get a confirmation link before they can sign in (Supabase's built-in mailer is rate limited;
   turn confirmation off for local development if you hit the limit).
3. The backend verifies tokens through the project's public JWKS, so no JWT secret is needed on
   projects using Supabase's asymmetric signing keys.

## Common commands

```bash
docker compose exec backend alembic upgrade head      # apply migrations
docker compose exec backend pytest                    # backend tests (DB tests use the compose db)
docker compose exec backend sh -c "ruff check . && ruff format --check . && mypy app alembic"
docker compose down -v                                # stop and wipe the local DB

cd frontend && nvm use        # Node 24 (see .nvmrc); npm refuses to install on other versions
npm install
npm run dev | test | lint | typecheck | build
```

## CI/CD

GitHub Actions runs lint, type checks and tests on every pull request, builds and smoke-tests
both images, and on `main` scans them with Trivy and publishes them to GHCR. See
[`docs/CICD.md`](docs/CICD.md) for the pipeline, the Trivy policy and the one-time repository setup.

## Environment variables

See [`.env.example`](.env.example). Secrets (`SUPABASE_JWT_SECRET`, `DATABASE_URL`,
`YOUTUBE_DATA_API_KEY`) are backend-only and must never reach the frontend bundle or Git.
