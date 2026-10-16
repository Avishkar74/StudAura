# Submission guide

Where to find the evidence for each graded module. Click any thumbnail to open the screenshot full
size. Screenshots are in [`docs/screenshots`](screenshots), raw command output in
[`docs/evidence`](evidence), and the narrative is in the [README](../README.md).

<table>
<tr><th align="left" width="13%">Module</th><th align="left" width="42%">What to look at</th><th align="left" width="45%">Screenshots</th></tr>
<tr><td valign="top"><b>M1 Application</b><br><sub>10 pts</sub></td><td valign="top"><code>backend/app</code>, <code>backend/alembic/versions</code> (3 migrations), <code>frontend/</code>, <code>backend/requirements.txt</code>, <code>docker-compose.yml</code>. Health, 11 REST routers, React UI, responsive layout.</td><td valign="top"><a href="screenshots/app-localhost-3000.png"><img src="screenshots/app-localhost-3000.png" alt="localhost:3000" title="localhost:3000" height="100"></a> <a href="screenshots/app-login-via-ingress.png"><img src="screenshots/app-login-via-ingress.png" alt="Through the Ingress" title="Through the Ingress" height="100"></a> <a href="screenshots/app-signup-mobile.png"><img src="screenshots/app-signup-mobile.png" alt="Phone size" title="Phone size" height="100"></a></td></tr>
<tr><td valign="top"><b>M2 Testing</b><br><sub>10 pts</sub></td><td valign="top"><code>backend/tests</code>, <code>backend/pytest.ini</code>, <code>backend/tests/conftest.py</code>. <b>656 tests</b> on a throwaway PostgreSQL database and a fake YouTube adapter. <a href="evidence/pytest-v.txt">pytest -v output</a>.</td><td valign="top"><a href="screenshots/terminal-pytest.png"><img src="screenshots/terminal-pytest.png" alt="pytest -v: 656 passed" title="pytest -v: 656 passed" height="100"></a></td></tr>
<tr><td valign="top"><b>M3 Git and GitHub</b><br><sub>5 pts</sub></td><td valign="top">Public repository, 30+ commits as <code>type(scope): what and why</code>, one pull request per milestone. <code>.gitignore</code> excludes <code>.env</code>, <code>*.pem</code>, <code>*.tfvars</code>, <code>__pycache__</code>, <code>node_modules</code>, <code>.venv</code>. <a href="evidence/commit-history.txt">History</a>.</td><td valign="top"><a href="screenshots/commit-history.png"><img src="screenshots/commit-history.png" alt="Commit history" title="Commit history" height="100"></a></td></tr>
<tr><td valign="top"><b>M4 Docker</b><br><sub>10 pts</sub></td><td valign="top"><code>backend/Dockerfile</code> and <code>frontend/Dockerfile</code>: multi-stage (Node build, unprivileged nginx), both non-root. <code>docker compose up --build</code> starts db, migrate, backend and frontend: <a href="evidence/docker-compose.txt">output</a>.</td><td valign="top"><a href="screenshots/terminal-compose-up.png"><img src="screenshots/terminal-compose-up.png" alt="docker compose up --build" title="docker compose up --build" height="100"></a> <a href="screenshots/app-localhost-3000.png"><img src="screenshots/app-localhost-3000.png" alt="localhost:3000" title="localhost:3000" height="100"></a></td></tr>
<tr><td valign="top"><b>M5 CI/CD</b><br><sub>15 pts</sub></td><td valign="top"><code>.github/workflows/ci.yml</code>: runs on every pull request and every push to <code>main</code>; pytest, frontend build, both images, push to GHCR with <b>commit-SHA tags only</b> (<a href="evidence/ghcr-tags.txt">tag list</a>). <a href="https://github.com/Avishkar74/StudAura/actions">Actions history</a>.</td><td valign="top"><a href="screenshots/github-actions-run.png"><img src="screenshots/github-actions-run.png" alt="Green run" title="Green run" height="100"></a> <a href="screenshots/github-actions-runs.png"><img src="screenshots/github-actions-runs.png" alt="Run list" title="Run list" height="100"></a> <a href="screenshots/ghcr-backend.png"><img src="screenshots/ghcr-backend.png" alt="GHCR backend" title="GHCR backend" height="100"></a> <a href="screenshots/ghcr-frontend.png"><img src="screenshots/ghcr-frontend.png" alt="GHCR frontend" title="GHCR frontend" height="100"></a></td></tr>
<tr><td valign="top"><b>M6 DevSecOps</b><br><sub>5 pts</sub></td><td valign="top">Trivy scans both images in the <code>publish</code> job and fails on a fixable HIGH or CRITICAL; the <code>helm</code> and <code>terraform</code> jobs scan manifests. Result: <a href="evidence/trivy.txt">clean</a>. Explanation below.</td><td valign="top"><a href="screenshots/github-trivy-gate.png"><img src="screenshots/github-trivy-gate.png" alt="Trivy step" title="Trivy step" height="100"></a> <a href="screenshots/github-trivy-run.png"><img src="screenshots/github-trivy-run.png" alt="Scan running" title="Scan running" height="100"></a> <a href="screenshots/trivy-report-backend.png"><img src="screenshots/trivy-report-backend.png" alt="Backend report" title="Backend report" height="100"></a> <a href="screenshots/trivy-report-frontend.png"><img src="screenshots/trivy-report-frontend.png" alt="Frontend report" title="Frontend report" height="100"></a></td></tr>
<tr><td valign="top"><b>M7 Terraform</b><br><sub>15 pts</sub></td><td valign="top"><code>deploy/terraform</code>: VPC with 2 public and 2 private subnets, NAT gateway, EKS, managed node group; <code>terraform.tfvars.example</code>. <b>35 resources</b> applied in <code>ap-southeast-2</code> and destroyed (<a href="evidence/terraform.txt">state</a>). Plan tests run in CI.</td><td valign="top"><a href="screenshots/terraform-plan.png"><img src="screenshots/terraform-plan.png" alt="terraform plan" title="terraform plan" height="100"></a> <a href="screenshots/terraform-destroy.png"><img src="screenshots/terraform-destroy.png" alt="terraform destroy" title="terraform destroy" height="100"></a> <a href="screenshots/aws-vpc.png"><img src="screenshots/aws-vpc.png" alt="VPC" title="VPC" height="100"></a> <a href="screenshots/aws-subnets.png"><img src="screenshots/aws-subnets.png" alt="Subnets" title="Subnets" height="100"></a> <a href="screenshots/aws-eks-cluster.png"><img src="screenshots/aws-eks-cluster.png" alt="EKS cluster" title="EKS cluster" height="100"></a> <a href="screenshots/aws-eks-nodegroup.png"><img src="screenshots/aws-eks-nodegroup.png" alt="Node group" title="Node group" height="100"></a></td></tr>
<tr><td valign="top"><b>M8 Kubernetes and Helm</b><br><sub>15 pts</sub></td><td valign="top"><code>k8s/namespace.yaml</code>, <code>helm/studaura</code>: 2 + 2 pods Running, ClusterIP Services, one Ingress (<code>/</code> to the frontend, <code>/api</code> to the backend), HPAs. <a href="evidence/kubernetes.txt">kubectl and helm output</a>.</td><td valign="top"><a href="screenshots/terminal-kubectl.png"><img src="screenshots/terminal-kubectl.png" alt="kubectl" title="kubectl" height="100"></a> <a href="screenshots/terminal-helm.png"><img src="screenshots/terminal-helm.png" alt="helm list" title="helm list" height="100"></a> <a href="screenshots/app-login-via-ingress.png"><img src="screenshots/app-login-via-ingress.png" alt="Through the Ingress" title="Through the Ingress" height="100"></a></td></tr>
<tr><td valign="top"><b>GitOps</b><br><sub>video item</sub></td><td valign="top"><code>argocd/application.yaml</code>: Synced and Healthy, syncing the <code>deploy</code> branch that CI updates. <a href="evidence/argocd.txt">output</a>.</td><td valign="top"><a href="screenshots/argocd-applications.png"><img src="screenshots/argocd-applications.png" alt="Applications" title="Applications" height="100"></a> <a href="screenshots/argocd-application.png"><img src="screenshots/argocd-application.png" alt="Resource tree" title="Resource tree" height="100"></a> <a href="screenshots/argocd-details.png"><img src="screenshots/argocd-details.png" alt="Source" title="Source" height="100"></a> <a href="screenshots/terminal-argocd-app.png"><img src="screenshots/terminal-argocd-app.png" alt="kubectl" title="kubectl" height="100"></a></td></tr>
<tr><td valign="top"><b>M9 Observability</b><br><sub>10 pts</sub></td><td valign="top"><code>monitoring/</code>; <code>/metrics</code> on the backend, Prometheus scraping 2 of 2 pods, Grafana dashboard <code>helm/studaura/dashboards/studaura.json</code>. <a href="evidence/observability.txt">output</a>.</td><td valign="top"><a href="screenshots/backend-metrics.png"><img src="screenshots/backend-metrics.png" alt="/metrics" title="/metrics" height="100"></a> <a href="screenshots/terminal-metrics.png"><img src="screenshots/terminal-metrics.png" alt="curl /metrics" title="curl /metrics" height="100"></a> <a href="screenshots/prometheus-targets.png"><img src="screenshots/prometheus-targets.png" alt="Targets UP" title="Targets UP" height="100"></a> <a href="screenshots/prometheus-http-requests.png"><img src="screenshots/prometheus-http-requests.png" alt="Request rate" title="Request rate" height="100"></a> <a href="screenshots/grafana-dashboard.png"><img src="screenshots/grafana-dashboard.png" alt="Grafana" title="Grafana" height="100"></a></td></tr>
<tr><td valign="top"><b>M10 Documentation</b><br><sub>5 pts</sub></td><td valign="top"><code>README.md</code>, slide deck <code>demo/StudAura-presentation.pptx</code> (14 slides with screenshots), demo script <a href="DEMO.md">DEMO.md</a>, presentation video in <code>demo/</code>.</td><td valign="top"></td></tr>
</table>

## Submission checklist

| | Item |
|---|---|
| ✅ | GitHub repository URL: <https://github.com/Avishkar74/StudAura> (public) |
| ✅ | Application runs with `docker compose up --build` (db, migrate, backend, frontend) |
| ✅ | 11 REST routers, GET, POST, PUT/PATCH and DELETE; Alembic migrations (3) |
| ✅ | `pytest` passes (656), well over 5 tests across many endpoints; throwaway test database |
| ✅ | Both Dockerfiles multi-stage and non-root |
| ✅ | GitHub Actions workflow on every pull request and every push to `main`; pytest, frontend build, images, GHCR |
| ✅ | Images tagged with the commit SHA only |
| ✅ | Trivy on both images, failing on fixable HIGH or CRITICAL; no secrets in Git |
| ✅ | `terraform plan` (35 to add), VPC and EKS in the AWS Console, `terraform destroy` (35 destroyed) |
| ✅ | `kubectl get pods`, `helm list`, application reachable through the Ingress |
| ✅ | `/metrics`, Prometheus targets UP, Grafana dashboard |
| ✅ | README with all technical sections and known limitations |
| ✅ | Slide deck committed in `demo/` |
| ⬜ | Presentation video in `demo/` (record it, then add it in a pull request) |

## What Trivy checked, in three sentences

Trivy scanned the operating-system packages and the language dependencies inside the backend
(Debian 13 plus the Python virtualenv) and frontend (Alpine plus nginx) images that CI had just
built, and the gate fails the pipeline on any HIGH or CRITICAL finding that has a fix available.
Both images came back with zero such findings, which is the result of upgrading Starlette to
1.3.1 after the first run of the stricter gate caught two HIGH CVEs (CVE-2026-48818 and
CVE-2026-54283) in the version we had pinned. A clean result means no known, fixable HIGH or
CRITICAL vulnerability was present at scan time, not that none can appear later, which is why the
scan runs on every push.

## Notes

* The cluster behind these screenshots was destroyed after capture to stop AWS charges. The
  Terraform code, Helm chart, ArgoCD application and monitoring values recreate it (see the
  README).
* The Grafana capture was taken before the final dashboard fix, so two panels (5xx ratio and
  business events) read "No data": no 5xx responses or signed-in activity had occurred. The fix,
  which draws a zero line instead, is in `helm/studaura/dashboards/studaura.json`.
* The Terraform state listing in `evidence/terraform.txt` counts 41 entries: 35 managed resources
  and 6 data sources.
