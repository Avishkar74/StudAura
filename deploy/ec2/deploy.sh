#!/usr/bin/env bash
# Build the images here, load them on the EC2 instance, migrate, start, and smoke-test.
#
#   HOST=3.26.233.92 KEY=Timeless.pem deploy/ec2/deploy.sh
#
# Needs: docker, ssh, scp, git. Run from anywhere inside the repository (Git Bash on Windows).
# Configuration comes from deploy/ec2/.env (see .env.example); secrets are copied to the server
# with mode 600 and never printed.
set -euo pipefail

HOST="${HOST:?set HOST to the public IP or DNS name of the instance}"
KEY="${KEY:?set KEY to the path of the SSH private key}"
SSH_USER="${SSH_USER:-ubuntu}"
REMOTE_DIR="${REMOTE_DIR:-studaura}"

ROOT="$(git rev-parse --show-toplevel)"
DIR="$ROOT/deploy/ec2"
ENV_FILE="$DIR/.env"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy .env.example and fill it in)" >&2; exit 1; }

TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SSH_USER@$HOST")

# Read one KEY=value from the env file without sourcing it (values may contain shell characters).
env_value() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r'; }

echo "==> Building images for $TAG"
docker build -q --target runtime -t "studaura-backend:$TAG" "$ROOT/backend" >/dev/null
docker build -q --target prod \
  --build-arg "VITE_SUPABASE_URL=$(env_value VITE_SUPABASE_URL)" \
  --build-arg "VITE_SUPABASE_ANON_KEY=$(env_value VITE_SUPABASE_ANON_KEY)" \
  --build-arg "VITE_API_BASE_URL=" \
  -t "studaura-frontend:$TAG" "$ROOT/frontend" >/dev/null

echo "==> Copying files"
"${SSH[@]}" "mkdir -p ~/$REMOTE_DIR"
scp -q -i "$KEY" -o BatchMode=yes "$DIR/compose.yaml" "$DIR/edge.conf" "$SSH_USER@$HOST:$REMOTE_DIR/"
(umask 077 && scp -q -i "$KEY" -o BatchMode=yes "$ENV_FILE" "$SSH_USER@$HOST:$REMOTE_DIR/.env")
"${SSH[@]}" "chmod 600 ~/$REMOTE_DIR/.env"

echo "==> Loading images on the server (compressed)"
docker save "studaura-backend:$TAG" "studaura-frontend:$TAG" | gzip -1 \
  | "${SSH[@]}" "gunzip | sudo docker load" | sed 's/^/    /'

echo "==> Starting"
"${SSH[@]}" "cd ~/$REMOTE_DIR && sudo TAG=$TAG docker compose up -d --remove-orphans"

# The old images are no longer needed and the disk is small.
"${SSH[@]}" "sudo docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E '^studaura-(backend|frontend):' | grep -v ':$TAG\$' | xargs -r sudo docker rmi >/dev/null 2>&1 || true"

echo "==> Smoke test http://$HOST"
for i in $(seq 1 30); do
  if curl -fsS -m 5 "http://$HOST/ready" >/dev/null 2>&1; then
    echo "    /health : $(curl -fsS -m 5 "http://$HOST/health")"
    echo "    /ready  : $(curl -fsS -m 5 "http://$HOST/ready")"
    echo "    site    : HTTP $(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://$HOST/")"
    echo "Deployed $TAG to http://$HOST"
    exit 0
  fi
  sleep 3
done
echo "Not reachable from here after 90 s." >&2
echo "Checking from inside the instance (if this passes, inbound port 80 is closed in the" >&2
echo "instance's security group):" >&2
"${SSH[@]}" "curl -s -m 20 -w ' (HTTP %{http_code})
' http://127.0.0.1/ready" >&2 || true
"${SSH[@]}" "cd ~/$REMOTE_DIR && sudo TAG=$TAG docker compose ps && sudo TAG=$TAG docker compose logs --tail=30" >&2 || true
exit 1
