# Demo script

About 10 minutes. Have these open before you start: the repository's Actions tab, a terminal with
`kubectl` pointed at the cluster, the site, Grafana (`/grafana`) and the Prometheus targets page
(`kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090`).

## 1. The product (2 min)

1. Open the site, sign in, show the dashboard.
2. Open a learning path, play a video, type a note and point at **Saving / Saved**.
3. Reload the page: the video resumes and the note is still there.

## 2. The live change (4 min)

1. Make a visible, harmless change, for example the tagline text on the sign-in page
   (`frontend/src/features/auth/LoginPage.tsx`, the `subtitle`).
2. Commit it on a branch, open a pull request, point at the checks (backend, frontend, Terraform,
   Helm, images). Merge it.
3. Open the run on `main`: show the **publish** job (Trivy scan, then the push to GHCR) and the
   image tag, which is the commit SHA.
4. Show **deploy**: `helm upgrade --install --atomic`.
5. In the terminal:

   ```bash
   kubectl -n studaura get pods -w          # old pods terminate, new pods become Ready
   kubectl -n studaura get deploy -o wide   # the image tag equals the commit SHA
   helm list -n studaura
   ```

6. Refresh the sign-in page: the new text is live.

## 3. Under the hood (3 min)

```bash
kubectl -n studaura get pods,svc,ingress,hpa
kubectl -n monitoring get pods
```

* Prometheus targets page: both backend pods are **UP**.
* Grafana, dashboard **StudAura**: request rate, 5xx ratio, p95 latency by route, business counters.
  Generate traffic first (reload the site a few times) so the panels have data.
* `kubectl -n studaura port-forward deploy/studaura-backend 8000:8000` and open
  `http://localhost:8000/metrics`.
* Mention the safety rails: Trivy gates the publish, the migration runs as a one-shot hook Job,
  `--atomic` rolls back a failed rollout, secrets live in the cluster and never in Git.

## 4. Tear down (after the evaluation)

Run `terraform destroy` if the cluster came from Terraform, or delete the node group, the cluster
and the load balancer in the console, and set the repository variable `DEPLOY_ENABLED` to `false`.
