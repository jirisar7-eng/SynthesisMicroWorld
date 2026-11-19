#!/usr/bin/env bash
# MUTATING: only starts/replaces the independent microworld_private web service.
set -euo pipefail
if [[ "${1:-}" != "--apply" ]]; then
  echo 'Usage: bash deploy/vps/deploy.sh --apply'
  echo 'First run: bash deploy/vps/preflight.sh (READ_ONLY) and review its output.'
  exit 2
fi
if [[ "$(hostname -s)" != "tatovacesta" || "$(id -un)" != "uadmin" ]]; then
  echo 'BLOCKED: must be uadmin on tatovacesta.' >&2; exit 2
fi
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
if [[ "$(git branch --show-current)" != "deploy/vps-mw-001" ]]; then
  echo 'BLOCKED: deploy only from the inspected VPS deployment branch.' >&2; exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'BLOCKED: uncommitted changes. Use an exact clean commit.' >&2; exit 2
fi
if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  echo 'BLOCKED: Docker permissions unavailable, do not treat as outage.' >&2; exit 2
fi
SHA="$(git rev-parse HEAD)"
export MICROWORLD_RELEASE="${SHA:0:12}"
export MICROWORLD_PORT="${MICROWORLD_PORT:-18583}"
COMPOSE=( "${DOCKER[@]}" compose --project-name microworld_private -f deploy/vps/compose.yaml )
# Avoid hijacking an unrelated listener on our allocated port.
existing="$("${COMPOSE[@]}" ps -q web 2>/dev/null || true)"
if [[ -z "$existing" ]] && command -v ss >/dev/null 2>&1 &&
    [[ -n "$(ss -ltnH "( sport = :${MICROWORLD_PORT} )" 2>/dev/null)" ]]; then
  echo "BLOCKED: host port ${MICROWORLD_PORT} already in use outside this Compose service." >&2
  exit 2
fi
if [[ -n "$existing" ]]; then
  prior="$("${DOCKER[@]}" inspect --format '{{.Config.Image}}' "$existing")"
else
  prior=none
fi
"${COMPOSE[@]}" config -q
echo "MW_DEPLOY_BEGIN sha=$SHA port=127.0.0.1:$MICROWORLD_PORT previous_image=$prior"
"${COMPOSE[@]}" build web
"${COMPOSE[@]}" up --no-deps -d web
ready=0
for i in $(seq 1 18); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${MICROWORLD_PORT}/healthz" >/dev/null 2>&1; then
    ready=1;break
  fi
  sleep 2
done
if [[ "$ready" != 1 ]]; then
  echo "DEPLOY_FAIL: local healthcheck failed; previous_image=$prior" >&2
  if [[ "$prior" == local/microworld:* ]]; then
    export MICROWORLD_RELEASE="${prior#local/microworld:}"
    "${COMPOSE[@]}" up -d --no-build --no-deps web || true
    echo "ROLLBACK_ATTEMPTED image=$prior (verify actual health)" >&2
  else
    "${COMPOSE[@]}" stop web || true
    echo 'New service stopped; no existing image to roll back.' >&2
  fi
  exit 1
fi
for route in svet prehled lide; do
  curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:${MICROWORLD_PORT}/${route}/"
done
"${COMPOSE[@]}" ps
echo "MW_DEPLOY_PASS sha=$SHA health=200 routes=3 port=127.0.0.1:$MICROWORLD_PORT"
echo 'Deployment is accessible ONLY via VPS loopback / SSH tunnel. No public Caddy or DNS changes.'
