#!/usr/bin/env bash
# Deploy dashboard services onto the existing GIS stack (Ubuntu VM).
# Safe to re-run: never touches postgis/geoserver/nginx or their data volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Working directory: $ROOT"

# 1. Backup the active compose file
if [[ -f docker-compose.yml ]]; then
  cp docker-compose.yml "docker-compose.yml.backup-$(date +%Y%m%d-%H%M%S)"
  echo "==> Backed up docker-compose.yml"
fi

# 2. Reorganize (Cara A): if code sits in a nested project folder, lift it to root
NESTED="Dasboard_Geoserver_Services"
if [[ -d "$NESTED" ]]; then
  for dir in backend frontend; do
    if [[ -d "$NESTED/$dir" && ! -d "$dir" ]]; then
      mv "$NESTED/$dir" "./$dir"
      echo "==> Moved $NESTED/$dir -> ./$dir"
    fi
  done
  # Use the nested compose only if root has none
  if [[ ! -f docker-compose.yml && -f "$NESTED/docker-compose.yml" ]]; then
    mv "$NESTED/docker-compose.yml" ./docker-compose.yml
    echo "==> Moved compose file to root"
  fi
fi

# 3. Sanity checks
[[ -f docker-compose.yml ]] || { echo "ERROR: docker-compose.yml not found in $ROOT"; exit 1; }
[[ -d backend ]]  || { echo "ERROR: ./backend not found";  exit 1; }
[[ -d frontend ]] || { echo "ERROR: ./frontend not found"; exit 1; }

echo "==> Validating compose file"
docker compose config >/dev/null

# 4. Build & start ONLY the dashboard services (existing stack untouched)
echo "==> Building dashboard images"
docker compose build dashboard-backend dashboard-frontend

echo "==> Starting appdb + dashboard services"
docker compose up -d appdb dashboard-backend dashboard-frontend

# 5. Status
echo "==> Current status"
docker compose ps

echo
echo "Done. Dashboard:  http://10.10.175.112:3000"
echo "      API:        http://10.10.175.112:4000/api/health"
