# CI/CD

One workflow, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It implements TRD 13.

```
pull request ──► backend ─┐
                 frontend ├─► (all must pass to merge)
                 images ──┘
push to main ──► backend ─┐
                 frontend ├─► publish ──► Trivy scan ──► push to GHCR
                 images ──┘            (CRITICAL blocks)
```

## Jobs

| Job | Runs on | What it does |
|---|---|---|
| `backend` | PR, main | `ruff check`, `ruff format --check`, `mypy .`, `pytest` against a real PostgreSQL 16 service. That includes the Alembic migration test (upgrade from an empty database). The job **fails if any test is skipped**, because a skip would mean the database was not reached. |
| `frontend` | PR, main | `npm ci`, `eslint`, `prettier --check`, `tsc`, `vitest`, `vite build`. |
| `images` (backend, frontend) | PR, main | Builds the production image (backend `runtime` stage, frontend `prod` stage), checks it runs as a non-root user, starts it and smoke-tests it: backend `GET /health`, `/metrics`, and `/ready` answering 503 with no database; frontend `/healthz`, `/` and a deep link falling back to the SPA. |
| `publish` (backend, frontend) | main only, after the three above | Builds, scans with Trivy, then pushes `ghcr.io/<owner>/studaura-backend` and `studaura-frontend`, tagged with the commit SHA and `latest`. |

Third-party actions are pinned to commit SHAs (the version is in a comment). Jobs get read-only
`contents` access; only `publish` gets `packages: write`, and pull requests never reach it.
`.github/dependabot.yml` opens weekly PRs for actions, Python and npm dependencies and base images.

## Trivy policy

| Severity | Behaviour |
|---|---|
| CRITICAL with a fix available | **Blocks publishing.** The `publish` job fails before anything is pushed. |
| HIGH | Reported in the artifacts; reviewed, does not block. |
| MEDIUM and below | In the JSON report only. |
| Unfixed vulnerabilities | Ignored by the gate (nothing can be done yet) but present in the JSON report. |

Each image gets two reports, kept for 30 days as the `trivy-backend` and `trivy-frontend`
artifacts: `trivy-<image>.json` (machine-readable, every severity) and `trivy-<image>.txt`
(readable, HIGH and CRITICAL).

If a CRITICAL has no practical fix, add an entry with a reason and an expiry date to a
`.trivyignore` file and pass it to the Trivy steps with `trivyignores:`. Do not widen the policy
to get a build through.

## One-time repository setup

1. **Settings → Actions → General → Workflow permissions**: "Read repository contents and
   packages permissions" (the workflow asks for more only where it needs it).
2. **Settings → Secrets and variables → Actions → Variables** (these are public values baked
   into the browser bundle, so they are variables, not secrets):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE_URL` (optional, defaults to `/api`, which is right behind the Ingress)
3. After the first publish, the packages appear under your profile → **Packages**. Link them to
   the repository if they are not already, and set the visibility you want. The EKS cluster needs
   either public packages or an image pull secret.
4. **Settings → Branches → protect `main`**: require a pull request and require the status checks
   `Backend (ruff, mypy, pytest)`, `Frontend (eslint, tsc, vitest, build)` and the two `Image`
   checks. The checks appear in the list only after they have run once.

No secrets are needed: pushing to GHCR uses the workflow's own `GITHUB_TOKEN`. Deploying to AWS
(M16 and later) will use GitHub OIDC, not stored keys.

## Running the same checks locally

```bash
# backend (needs PostgreSQL; the compose db works)
cd backend
ruff check . && ruff format --check . && mypy . && pytest

# frontend
cd frontend
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build

# images
docker build --target runtime -t studaura-backend:local backend
docker build --target prod -t studaura-frontend:local frontend
docker run --rm -p 8000:8000 -e APP_ENV=test studaura-backend:local   # then GET /health
docker run --rm -p 8080:8080 studaura-frontend:local                   # then GET /healthz
```

## Not here yet

- E2E tests with Playwright on main (TRD 17): added with the accessibility and E2E pass (M19).
- `terraform fmt` / `terraform validate` (M16) and the Helm deploy and post-deploy smoke test
  (M17) will extend this workflow.
