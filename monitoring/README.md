# Monitoring

Prometheus and Grafana run in the `monitoring` namespace from the `kube-prometheus-stack` Helm
chart. The StudAura chart adds what is specific to this app when `monitoring.enabled=true`:

- a `ServiceMonitor` that scrapes the backend's `/metrics` (HTTP request count, latency by route
  template, status class, plus the business counters in `backend/app/core/metrics.py`),
- a `PrometheusRule` with three alerts (backend down, 5xx ratio above 5%, database unreachable),
- a Grafana dashboard ConfigMap (`helm/studaura/dashboards/studaura.json`), picked up by Grafana's
  sidecar.

`/metrics` is not routed by the Ingress, so it is reachable only inside the cluster.

## Install

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
kubectl create namespace monitoring
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin --from-literal=admin-password='<choose one>'
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --version 92.9.0 -n monitoring -f monitoring/kube-prometheus-stack-values.yaml

# then enable scraping on the application release
helm upgrade --install studaura helm/studaura -n studaura \
  --set image.tag=<commit-sha> --set monitoring.enabled=true
```

## Look at it

```bash
# Grafana: http://<load-balancer>/grafana  (user admin, password from the secret)
kubectl -n monitoring get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d

# Prometheus targets page: http://localhost:9090/targets
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090

# Raw metrics of one backend pod
kubectl -n studaura port-forward deploy/studaura-backend 8000:8000   # then GET /metrics
```

Prometheus keeps 24 hours of data on an `emptyDir`; it is lost when the pod moves.
