# Submission guide

Where to find the evidence for each graded module. Screenshots are in
[`docs/screenshots`](screenshots), raw command output in [`docs/evidence`](evidence).

| Module | What to look at |
|---|---|
| **M1** Application | `backend/app`, `backend/alembic/versions` (3 migrations), `frontend/`, `backend/requirements.txt`, `docker-compose.yml`. Running app: [localhost:3000](screenshots/app-localhost-3000.png), [through the Ingress](screenshots/app-login-via-ingress.png), [on a phone](screenshots/app-signup-mobile.png). |
| **M2** Testing | `backend/tests`, `backend/pytest.ini`, `backend/tests/conftest.py`. Output of `pytest -v`: [656 passed](evidence/pytest-v.txt). Tests run against a throwaway PostgreSQL database and a fake YouTube adapter. |
| **M3** Git and GitHub | Public repository, 30 commits written as `type(scope): what changed and why`, one pull request per milestone ([history](evidence/commit-history.txt)). `.gitignore` excludes `.env`, `*.pem`, `*.tfvars`, `__pycache__`, `node_modules`, `.venv`. |
| **M4** Docker | `backend/Dockerfile` and `frontend/Dockerfile` (multi-stage; Node build then unprivileged nginx; both run as non-root). `docker compose up --build` starts db, migrate, backend and frontend: [output](evidence/docker-compose.txt). |
| **M5** CI/CD | `.github/workflows/ci.yml` (runs on every pull request and every push to `main`; pytest, frontend build, both images, push to GHCR). Images carry the commit SHA only: [tag list](evidence/ghcr-tags.txt). Run history: <https://github.com/Avishkar74/StudAura/actions>. |
| **M6** Trivy | The `publish` job scans both images and fails on a fixable HIGH or CRITICAL; the `helm` and `terraform` jobs scan manifests. Result: [clean](evidence/trivy.txt). |
| **M7** Terraform | `deploy/terraform` (VPC with 2 public and 2 private subnets, NAT gateway, EKS, managed node group), `terraform.tfvars.example`. `apply` created [41 resources](evidence/terraform.txt) in `ap-southeast-2`. Plan tests run in CI. |
| **M8** Kubernetes and Helm | `k8s/namespace.yaml`, `helm/studaura`. 2+2 pods Running, ClusterIP Services, one Ingress (`/` to the frontend, `/api` to the backend): [kubectl and helm output](evidence/kubernetes.txt). |
| **GitOps** | `argocd/application.yaml`; the application is [Synced and Healthy](evidence/argocd.txt) and runs the image tag of the latest `main` commit. |
| **M9** Observability | `monitoring/`. [`/metrics`](screenshots/backend-metrics.png), Prometheus [targets (2/2 UP)](screenshots/prometheus-targets.png), a [query on live request metrics](screenshots/prometheus-http-requests.png), and the [cluster-side output](evidence/observability.txt). Grafana dashboard JSON: `helm/studaura/dashboards/studaura.json`. |
| **M10** Documentation | `README.md`, `demo/StudAura-presentation.pptx` (12 slides), `docs/DEMO.md` (script for the recorded walkthrough). |

## What Trivy checked, in three sentences

Trivy scanned the operating-system packages and the language dependencies inside the backend
(Debian 13 plus the Python virtualenv) and frontend (Alpine plus nginx) images that CI had just
built, and the gate fails the pipeline on any HIGH or CRITICAL finding that has a fix available.
Both images came back with zero such findings, which is the result of upgrading Starlette to
1.3.1 after the first run of the stricter gate caught two HIGH CVEs (CVE-2026-48818 and
CVE-2026-54283) in the version we had pinned. A clean result means no known, fixable HIGH or
CRITICAL vulnerability was present at scan time, not that none can appear later, which is why the
scan runs on every push.

## Not captured in this repository

* The presentation video (`demo/StudAura-demo.mp4`).
* Screenshots that need a login or an AWS account session: the Grafana dashboard, the ArgoCD UI
  and the AWS Console (VPC and EKS).
* The `terraform plan` and `terraform destroy` screenshots. Take them after the demo, then run the
  plan once more: it will be non-empty again.
* GHCR still lists a legacy `latest` tag that was pushed before images became SHA-only. Delete
  that version on the package page (Package settings, Manage versions); CI no longer pushes it.
