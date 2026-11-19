#!/usr/bin/env bash
# MW-007 / MUTATING: only upgrades the isolated MicroWorld Docker service.
# Keeps existing microworld.tatovacesta.cz Caddyfile, DNS, mail and other containers unchanged.
set -euo pipefail
if [[ "${1:-}" != "--apply" ]]; then
  echo 'Usage: bash deploy/vps/update-world.sh --apply'
  echo 'Please inspect the branch SHA and GitHub CI before applying.'
  exit 2
fi
if [[ "$(hostname -s)" != "tatovacesta" || "$(id -un)" != "uadmin" ]]; then
  echo 'BLOCKED: must run as uadmin on tatovacesta.' >&2; exit 2
fi
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
if [[ "$(git branch --show-current)" != "feature/mw-007-real-space" ]]; then
  echo 'BLOCKED: expected reviewed feature/mw-007-real-space branch.' >&2; exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'BLOCKED: local source tree has uncommitted changes.' >&2; exit 2
fi
if [[ ! -f deploy/vps/compose.https.yaml ]]; then
  echo 'BLOCKED: missing HTTPS edge overlay.' >&2; exit 2
fi
if [[ ! -f /var/www/server/Caddyfile ]] ||
  ! grep -Fq 'microworld.tatovacesta.cz' /var/www/server/Caddyfile; then
  echo 'BLOCKED: current protected Caddy origin not configured; do not change shared proxy.' >&2; exit 2
fi
if [[ "$(docker network inspect -f '{{.Name}}' synthesis-edge-net 2>/dev/null)" != synthesis-edge-net ]]; then
  echo 'BLOCKED: shared edge network missing.' >&2; exit 2
fi
if [[ "$(docker inspect -f '{{.State.Running}}' microworld_private-web-1)" != true ]]; then
  echo 'BLOCKED: original private web is not running.' >&2; exit 2
fi
PREVIOUS="$(docker inspect -f '{{.Config.Image}}' microworld_private-web-1)"
case "$PREVIOUS" in local/microworld:*) ;; *)
  echo 'BLOCKED: existing image is not from MicroWorld.' >&2; exit 2;;
esac
SHA="$(git rev-parse HEAD)"
export MICROWORLD_RELEASE="${SHA:0:12}"
export MICROWORLD_PORT=18583
STACK=(docker compose --project-name microworld_private
  -f deploy/vps/compose.yaml -f deploy/vps/compose.https.yaml)
"${STACK[@]}" config -q
if [[ "$(curl -fsS --max-time 4 http://127.0.0.1:18583/healthz)" != ok ]]; then
  echo 'BLOCKED: original local HTTP baseline is not healthy.' >&2; exit 2
fi
echo "MW007_UPGRADE_BEGIN sha=$SHA previous=$PREVIOUS"
# Build a new immutable local image while the previous container keeps serving traffic.
"${STACK[@]}" build web
upgraded=0
rollback(){
  local status=$?
  if (( status != 0 )) && (( upgraded != 0 )); then
    echo "MW007_UPGRADE_FAIL; attempting local image rollback to $PREVIOUS" >&2
    export MICROWORLD_RELEASE="${PREVIOUS#local/microworld:}"
    "${STACK[@]}" up --no-build --no-deps -d web || true
    echo 'Rollback was attempted: verify HTTP, edge and actual browser access.' >&2
  fi
}
trap rollback EXIT
# Only our web container is recreated. Existing Caddy process/config are untouched.
upgraded=1
"${STACK[@]}" up --no-build --no-deps -d web
ready=0
for attempt in $(seq 1 25); do
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:18583/healthz || true)" == 200 ]]; then
    ready=1;break
  fi
  sleep 2
done
if (( ! ready )); then echo 'FAIL: game health endpoint not ready' >&2; exit 1; fi
for route in svet prehled lide; do
  curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:18583/${route}/"
done
# The edge proxy must still be able to reach the same container by DNS alias.
docker exec caddy_proxy sh -c 'wget -q -O - http://microworld-web:8080/healthz' | grep -Fxq ok ||
  { echo 'FAIL: Caddy edge cannot reach the updated game.' >&2; exit 1; }
# Never allow an unprotected public origin to be mistaken for a passing update.
status="$(curl -k -sS --max-time 8 -o /dev/null -w '%{http_code}' \
  --resolve microworld.tatovacesta.cz:443:127.0.0.1 \
  https://microworld.tatovacesta.cz/svet/ 2>/dev/null || true)"
if [[ "$status" != 401 ]]; then
  echo "FAIL: unauthenticated Caddy HTTPS expected 401, got ${status:-NONE}" >&2
  exit 1
fi
"${STACK[@]}" ps
echo "MW007_UPGRADE_PASS sha=$SHA routes=3 game=200 protected=https-401"
echo 'Check physical pathfinding and object grounding in the actual Android browser.'
