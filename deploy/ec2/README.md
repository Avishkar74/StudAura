# Deploying StudAura to a single EC2 instance (Docker Compose)

A small, cheap deployment that needs only one virtual machine. Supabase stays the database and
authentication provider, so the instance runs just the application:

```
Internet ── :80 ──> web (nginx: static frontend, proxies /api /health /ready) ──> backend (FastAPI)
                                                                                    │
                                                         Supabase PostgreSQL + Auth ┘
migrate (one-shot: alembic upgrade head, once per deploy, never in the backend)
```

This is the practical option when the AWS account cannot create an EKS cluster (for example a
college account with an organisation-level policy). The Kubernetes path (Terraform + EKS + Helm)
lives in `deploy/terraform` and `deploy/helm`.

## What the instance needs

| | Minimum | Notes |
|---|---|---|
| Size | 1 GB RAM, 2 vCPU (t3.micro) | The backend and nginx use about 300 MB. Add 1 GB of swap. |
| Disk | 8 GB | Images take roughly 1 GB. A 6.7 GB root volume works but is tight; 16 GB is comfortable. |
| OS | Ubuntu 24.04 or newer | Needs `docker.io` and `docker-compose-v2`. |
| Region | Same region as the Supabase project | Every request makes several database round trips. In a different region (Sydney to Mumbai measured 260 ms per round trip) a new connection takes 1.5-5 s and pages feel slow. Find the region in the DATABASE_URL host (`aws-0-<region>.pooler.supabase.com`). |
| Security group | inbound **80** from anywhere, **22** from your IP | Without port 80 the site is unreachable. |

One-time setup on a new instance:

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu
```

## Deploy

1. `cp deploy/ec2/.env.example deploy/ec2/.env` and fill it in. It is git-ignored: it holds the
   database password and the YouTube API key.
2. From the repository root (Git Bash on Windows):

   ```bash
   HOST=<public-ip> KEY=<path-to-key.pem> deploy/ec2/deploy.sh
   ```

   The script builds both images on your machine (the instance is too small to build the
   frontend), streams them to the server, copies the config with mode 600, runs the migration,
   starts the stack and smoke-tests `/health`, `/ready` and `/`.

Images are tagged with the git commit, and older ones are removed so the small disk does not fill.

## Supabase settings for a deployed site

In the Supabase dashboard, **Authentication → URL Configuration**: set **Site URL** to the
deployed origin (for example `http://<public-ip>`) and add it to **Redirect URLs**. Otherwise the
confirmation link in the sign-up email points somewhere else.

## Operating it

```bash
ssh -i <key.pem> ubuntu@<ip>
cd ~/studaura
sudo docker compose ps
sudo docker compose logs -f backend      # request logs carry no note text, emails or IDs
sudo docker compose restart backend
sudo docker compose down                 # stop (data lives in Supabase, not here)
```

## Limits, stated plainly

- **HTTP only.** There is no certificate, so traffic is not encrypted. Put a domain in front
  (Caddy or an AWS load balancer with ACM) before real use; the Supabase session tokens travel in
  the clear on plain HTTP.
- **One instance, no autoscaling.** `/metrics` is deliberately not exposed to the internet.
- The public IP changes if the instance is stopped and started, unless an Elastic IP is attached.
