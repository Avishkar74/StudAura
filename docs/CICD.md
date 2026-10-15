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
| `frontend` | PR, main | Node from `frontend/.nvmrc`, then `npm ci`, `eslint`, `prettier --check`, `tsc`, `vitest`, `vite build`. |
| `terraform` | PR, main | `terraform fmt -check`, `init -backend=false -lockfile=readonly` and `validate` for the infrastructure and the state-bucket bootstrap, `terraform test` (plan tests with the AWS provider mocked, so no credentials), and a Trivy misconfiguration scan that fails on HIGH or CRITICAL. No AWS account is involved. |
| `images` (backend, frontend) | PR, main | Builds the production image (backend `runtime` stage, frontend `prod` stage), checks it runs as a non-root user, starts it and smoke-tests it: backend `GET /health`, `/metrics`, and `/ready` answering 503 with no database; frontend `/healthz`, `/`, a deep link falling back to the SPA, and the security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) on the page. |
| `publish` (backend, frontend) | main only, after the three above | Builds, scans with Trivy, then pushes `ghcr.io/<owner>/studaura-backend` and `studaura-frontend`, tagged with the commit SHA and `latest`. |

Third-party actions are pinned to commit SHAs (the version is in a comment). Jobs get read-only
`contents` access; only `publish` gets `packages: write`, and pull requests never reach it.
`.github/dependabot.yml` opens weekly PRs for actions, Python and npm dependencies and base images.

## Node version

The frontend needs **Node 24.15 or newer on the 24 line** (or 26+). That comes from the locked
dependencies, not a preference: `jsdom` needs `^22.22.2 || ^24.15.0 || >=26`, `undici` needs
`>=22.19`, `vitest` needs `^22.12 || ^24 || >=26`, and `@supabase/*` and
`@testing-library/jest-dom` need 22 or newer. On Node 20 Vitest starts zero tests and its workers
crash with `Cannot read properties of undefined (reading 'bind')` inside undici.

The version lives in three places that must move together:

| Where | Setting |
|---|---|
| `frontend/.nvmrc` | `24` (read by `actions/setup-node` and `nvm`) |
| `frontend/package.json` | `"engines": { "node": "^24.15.0 \|\| >=26.0.0" }` |
| `frontend/Dockerfile` | `FROM node:24-alpine` |

`frontend/.npmrc` sets `engine-strict=true`, so `npm ci` fails immediately, naming the package,
when Node is too old, instead of failing later in the test runner. `@types/node` stays on the
same major as the runtime.

## Dependency updates

Dependabot (`.github/dependabot.yml`) groups packages that must move together into a single pull
request: `react` / `react-dom` / `@types/react` / `@types/react-dom`, all `@tiptap/*`, Tailwind,
ESLint and its plugins, and Vitest with jsdom and Testing Library.

The app is on **React 18**. Major updates of the four React packages are ignored on purpose: React
19 is a migration of all four together, not a bot bump. When you decide to migrate, delete the
four `ignore` entries for them, take the single `react` group pull request, and fix any type or
API errors in that same PR. FastAPI is likewise held below 0.136 until
`prometheus-fastapi-instrumentator` supports newer releases.

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

When the gate fails, the usual cause is an out-of-date base image, not our code. Check the table in the
failed step: a CRITICAL in an OS package (`libssl3`, `zlib`, …) with a "Fixed Version" means the base
image needs a newer tag. Keep base images on maintained lines (`node:24-alpine`,
`nginx-unprivileged:1.30-alpine`, `python:3.12-slim`), because Alpine and Debian fixes only reach images
that are rebuilt on a current tag. Dependabot proposes base image bumps weekly. You can scan an image
locally the same way CI does:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
  image --severity CRITICAL --ignore-unfixed studaura-frontend:local
```

Terraform is scanned by the same tool (`trivy config`) with the same bar: HIGH and CRITICAL
misconfigurations fail the job. A risk that is accepted on purpose is annotated in the code with
`#trivy:ignore:<id>` and a comment saying why (the public Kubernetes API endpoint in
`deploy/terraform/eks.tf` is the one example).

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
   `Backend (ruff, mypy, pytest)`, `Frontend (eslint, tsc, vitest, build)`, `Terraform (fmt,
   validate, test, Trivy)` and the two `Image` checks. The checks appear in the list only after they have run once.

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
- The Helm deploy and the post-deploy smoke test (M17) will extend this workflow. They will assume
  the role from `deploy/terraform` through GitHub OIDC, with no stored AWS keys.
