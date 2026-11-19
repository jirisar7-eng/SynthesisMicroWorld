#!/usr/bin/env bash
# MW-012 MUTATING. Only the MW-012 preview compose project and a user-only backup.
set -euo pipefail
if [[ "${1:-}" != "--apply" ]]; then
  echo 'Usage: MW011_APPROVED_SHA=<40char sha> bash deploy/vps/mw011/apply.sh --apply'
  exit 2
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"
SHA="$(git rev-parse HEAD)"
if [[ -z "${MW011_APPROVED_SHA:-}" || "$MW011_APPROVED_SHA" != "$SHA" ]]; then
  echo 'BLOCKED: exact SHA approval missing or mismatch.' >&2;exit 2
fi
bash deploy/vps/mw011/preflight.sh
if docker info >/dev/null 2>&1; then
  D=(docker)
else
  D=(sudo -n docker)
fi
export MW011_RELEASE="${SHA:0:12}"
export MW011_HOST_PORT=18585
COMPOSE=( "${D[@]}" compose -f deploy/vps/mw011/compose.yaml )
web_id="$("${COMPOSE[@]}" ps -q web 2>/dev/null || true)"
sim_id="$("${COMPOSE[@]}" ps -q sim 2>/dev/null || true)"
old_web=none;old_sim=none
if [[ -n "$web_id" ]]; then
  old_web="$("${D[@]}" inspect -f '{{.Config.Image}}' "$web_id")"
fi
if [[ -n "$sim_id" ]]; then
  old_sim="$("${D[@]}" inspect -f '{{.Config.Image}}' "$sim_id")"
fi
BACKUP_DIR="$HOME/.local/state/mw011/backups"
umask 077
mkdir -p "$BACKUP_DIR"
if [[ -n "$sim_id" ]]; then
  backup="$BACKUP_DIR/world-before-${MW011_RELEASE}-$(date -u +%Y%m%dT%H%M%S).json"
  if ! "${D[@]}" cp "$sim_id:/app/state/world.json" "$backup"; then
    echo 'BLOCKED: existing world has no retrievable safe backup.' >&2
    rm -f -- "$backup"
    exit 2
  fi
  chmod 600 "$backup"
  echo "MW012_EXISTING_WORLD_BACKUP path=$backup"
fi
caddy_before=''
if [[ -e /var/www/server/Caddyfile ]]; then
  caddy_before="$(sha256sum /var/www/server/Caddyfile | cut -d' ' -f1)"
fi
echo "MW012_DEPLOY_BEGIN sha=$SHA project=microworld011_preview"
"${COMPOSE[@]}" build sim web
# Never issue 'down', '-v', 'prune' or touch microworld_private.
"${COMPOSE[@]}" up -d --no-deps sim
for i in $(seq 1 25); do
  if [[ "$("${COMPOSE[@]}" ps --format json 2>/dev/null |
      grep -c '"Health":"healthy"' || true)" -gt 0 ]]; then break;fi
  sleep 2
done
"${COMPOSE[@]}" up -d --no-deps web
for i in $(seq 1 25); do
  if curl -fsS --max-time 4 http://127.0.0.1:18585/healthz | grep -Fxq ok; then break; fi
  sleep 2
done
curl -fsS --max-time 7 http://127.0.0.1:18585/healthz | grep -Fxq ok
for route in svet prehled lide; do
  curl -fsS --max-time 7 -o /dev/null "http://127.0.0.1:18585/$route/"
done
curl -fsS --max-time 15 http://127.0.0.1:18585/api/world |
  python3 -c '
import json,sys
world=json.load(sys.stdin)
assert world["version"]==1
assert len(world["state"]["agents"])>=6
assert len(world["state"]["islands"]["predators"])==3
print("world_snapshot=PASS")
'
first="$(curl -fsS --max-time 8 http://127.0.0.1:18585/api/status)"
sleep 2
second="$(curl -fsS --max-time 8 http://127.0.0.1:18585/api/status)"
python3 - "$first" "$second" <<'PY'
import json,sys
a,b=map(json.loads,sys.argv[1:])
assert b['seconds']>a['seconds'], 'simulation clock stopped'
assert b['population']['living']>0, 'no living population'
print('world_clock=PASS living=', b['population']['living'])
PY
if [[ -n "$caddy_before" ]]; then
  caddy_after="$(sha256sum /var/www/server/Caddyfile | cut -d' ' -f1)"
  if [[ "$caddy_before" != "$caddy_after" ]]; then
    echo 'BLOCKED: Caddyfile changed unexpectedly; inspect unrelated activity.' >&2
    exit 1
  fi
fi
"${COMPOSE[@]}" ps
echo "MW012_DEPLOY_PASS sha=$SHA web=http://127.0.0.1:18585/svet/ api=local-only data=preserved"
echo "Old preview images: web=$old_web sim=$old_sim"
echo "Only this new preview is running; no public Caddy route was added."
