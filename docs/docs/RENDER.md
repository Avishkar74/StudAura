# Proposed free backend hosting: Render + Vercel + Supabase

Status: prepared for review, not deployed. Creating a Blueprint performs an initial deploy,
even with automatic deploys disabled. Do not create it until the migration is approved.

## What changes

- Vercel continues serving `frontend/`.
- Render Free runs the FastAPI production Docker image from `backend/`.
- The existing Supabase project continues providing PostgreSQL and Auth. No new database.
- Browser API requests go directly to the actual Render HTTPS origin. The frontend already
  supports this through `VITE_API_BASE_URL`. The AWS EC2 rewrite is removed from
  `frontend/vercel.json`; the SPA fallback still excludes `/api/` so a missing API is not HTML.
- AWS EKS/Terraform, Helm, ArgoCD and EC2 files remain intact as optional hosting paths
  and capstone evidence. Switching back must not require rewriting the application.
  The legacy GitOps CI job is now off unless `AWS_GITOPS_ENABLED` is explicitly `true`.
  CI tests, scans and image publishing otherwise stay unchanged.

No account, service, paid resource, deployment, credential change or AWS deletion is part of
these prepared changes. Repository changes do not prove AWS is no longer billing.

## Free-tier limits and cost guardrails

Reviewed against the official docs on 2026-11-13:

- Render Free sleeps after 15 minutes without inbound traffic; the next request can take
  about a minute to wake it. The frontend currently has no special cold-start screen.
- Each Render workspace shares 750 free instance hours per calendar month across services.
  Check whether other apps already use that allowance before deploying another service.
- Outbound bandwidth and build minutes also have workspace limits. Without a payment
  method, exhausted limits suspend services or disable builds instead of buying overages.
  An existing payment method can allow extra charges. Stop and review account billing before
  deployment if one is attached. Do not add a card, upgrade a plan, or enable paid resources.
- Filesystem changes do not persist. Keep all user data in Supabase, never local SQLite/files.
- Free Render databases expire after 30 days: this plan deliberately does not create one.
- Supabase Free may pause low-activity projects after a seven-day period. Confirm the
  existing project is active; this repository change does not restore it or fix RLS warnings.
- Free hosting is a demo/hobby setup, not an uptime guarantee. Vercel and Supabase retain
  their own plan limits, which must be checked in their dashboards before deployment.

## Environment variables

Set backend values in Render, never in Git or a frontend variable. `sync: false` in
`render.yaml` prompts for values when first creating the Blueprint.

| Variable | Where | Value |
|---|---|---|
| `APP_ENV` | Render | `production` (Blueprint default) |
| `LOG_LEVEL` | Render | `INFO` |
| `CORS_ORIGINS` | Render | `https://stud-aura.vercel.app`; comma-separated exact origins if more are approved. No wildcard and no trailing slash. |
| `SUPABASE_URL` | Render | Existing project HTTPS URL |
| `DATABASE_URL` | Render | Existing Supabase **session pooler**, port 5432; URL-encode password characters. Prefer this IPv4-compatible connection string over the direct database host. |
| `YOUTUBE_DATA_API_KEY` | Render | Existing server-side YouTube Data API key |
| `SUPABASE_JWT_SECRET` | Render, only if needed | Only the legacy HS256 JWT signing secret, not a service-role key or `sb_secret_...` API key. Asymmetric JWT projects use public JWKS and do not need it. |
| `PORT` | Render | Supplied by Render. Production Docker CMD binds `0.0.0.0:${PORT:-8000}`. |
| `VITE_API_BASE_URL` | Vercel | **Actual** Render HTTPS origin after service creation, without a trailing `/api` or `/api/v1`. Rebuild the frontend after setting it. Do not guess a hostname from the service name. |
| `VITE_SUPABASE_URL` | Vercel | Existing Supabase project URL; unchanged |
| `VITE_SUPABASE_ANON_KEY` | Vercel | Existing public browser anon/publishable key; unchanged |

Only the exact production frontend origin is allowed by default. Preview domains will not
work until explicitly approved and added to CORS. Backend API auth is still Supabase JWT;
CORS is not a substitute for authorization.

## Approval and deployment checklist

1. Review this diff, repository visibility, and the intended Render/Vercel/Supabase accounts.
   Confirm all selected plans are free and account overages cannot create an unapproved bill.
   Check current Render workspace hours and bandwidth shared with other services.
2. Merge only after approval. Keep `AWS_GITOPS_ENABLED` unset or `false` so a main push
   cannot update the old AWS deployment branch. Keep historical capstone files intact.
3. Confirm Supabase is active and its auth/data work. Review outstanding RLS/security
   warnings separately. Never put a service-role key into the browser.
4. Compare database Alembic revision with repository head. If already current, no migration
   is needed. Do not automatically migrate in every API startup or Blueprint deploy.
   If a migration is required, review its SQL and take a verified database export first.
   From a trusted local machine, the existing production image supports a one-shot command:

   ```bash
   docker build --target runtime -t studaura-backend:review ./backend
   # /absolute/private/backend.env is outside the repo and contains backend-only values.
   docker run --rm --env-file /absolute/private/backend.env studaura-backend:review alembic current
   # Only after a separate review of pending migrations and a verified export:
   # docker run --rm --env-file /absolute/private/backend.env studaura-backend:review alembic upgrade head
   ```

   Render Free has no dashboard shell or one-off job support. Do not add a paid worker or
   pre-deploy command to work around that. Never paste connection passwords into commands
   or chat. Delete the temporary env file securely when no longer needed.
5. Once approved, connect the existing GitHub repo to Render and review `render.yaml`.
   Choose Free, Singapore (nearer the recorded Mumbai Supabase project than Sydney), Docker
   build context `backend`, Dockerfile `backend/Dockerfile`. The default final stage is
   production, not dev. Set required backend values before the first deployment.
   No service is created merely by storing `render.yaml` in Git.
6. Record the actual service URL returned by Render. Confirm `/health` returns 200 and
   `/ready` returns 200 with the real database. Blueprint health checks use `/health`
   deliberately: `/ready` independently checks database availability, without making a
   paused external database cause restart loops. Confirm API endpoints reject missing JWTs.
7. Test CORS from the exact Vercel origin. Set `VITE_API_BASE_URL` to the actual API origin
   in Vercel Production, then rebuild/deploy the frontend. These operations are coordinated:
   removing the EC2 rewrite without setting the API origin breaks API calls.
8. Test sign-in, learning paths, notes/autosave, progress and YouTube metadata through the
   Vercel app. Keep the Supabase Auth site/redirect URLs on the Vercel frontend, not Render.
   Test the first request after an idle period and explain the expected cold-start wait.
9. Only after the new route is verified, audit remaining AWS resources with separate approval:
   EC2, EBS volumes/snapshots, Elastic IPs, load balancers, NAT gateways, EKS/node groups,
   and any Terraform state storage. Never run a blind `terraform destroy`: verify account,
   region and state first. A stopped instance or removed frontend rewrite is not proof of $0.

## Switching back to AWS later

The backend remains standard FastAPI in the same multi-stage Dockerfile, with no Render
SDK or provider-specific application code. `--target runtime` still builds the same non-root
production image for AWS; its port defaults to 8000 when AWS does not set `PORT`.
The local Compose dev target is unchanged. PostgreSQL/Auth stay in Supabase, so a host
switch needs no data export/import just to move the API process.

1. Get approval for AWS costs before provisioning. Choose either the existing
   [EC2 Compose path](../deploy/ec2/README.md) or [Terraform EKS path](../deploy/terraform/README.md).
   All Terraform, Helm and ArgoCD definitions are retained, not replaced by Render files.
2. Verify AWS account/region/state and refresh the plan. Do not reuse a previously destroyed
   EC2 IP. Deploy the `runtime` image with the same backend variables and database.
3. Verify the new backend's `/health`, `/ready`, JWT auth and database schema before cutover.
   Prefer an HTTPS API origin with `VITE_API_BASE_URL` pointing to that origin and the Vercel
   origin in `CORS_ORIGINS`. Alternatively, the EC2 path already includes its own nginx frontend
   and same-origin API proxy. To keep Vercel while using a proxy, explicitly configure a fresh
   `/api/:path*` rewrite to the verified AWS destination and rebuild with an empty API base.
   Never restore the old hardcoded IP without checking its ownership and reachability.
4. For EKS GitOps only, set the repository variable `AWS_GITOPS_ENABLED=true` deliberately
   after checking ArgoCD/account state. This re-enables the existing CI deploy-branch update.
   Leave it off for EC2 and Render. CI testing and GHCR publishing remain available either way.
5. Update and rebuild Vercel, test the user flows, then disable the unused Render service
   after approval. Do not leave two hosting paths active accidentally.

## Rollback

- Keep the previous Vercel deployment available. Restore it only if its old backend route is
  independently confirmed available and approved to use; it may point to a retired EC2 host.
- Otherwise keep the frontend on a known compatible version while fixing the Render service.
  Do not silently recreate AWS resources or upgrade to paid Render instances.
- Automatic Render deploys are off; future releases need a deliberate manual deploy.
- App rollback does not roll back schema changes. No automatic Alembic downgrade.

## Sources

- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://render.com/docs/docker
- https://render.com/docs/health-checks
- https://render.com/docs/regions
- https://supabase.com/docs/guides/platform/going-into-prod
- https://supabase.com/docs/guides/database/connecting-to-postgres
